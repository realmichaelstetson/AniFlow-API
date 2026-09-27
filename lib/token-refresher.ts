import axios from "axios";
import http from "http";
import https from "https";
import { decryptFlixStream, findAndStream } from "./reanime";
import {
  extractStreamToken,
  extractStreamVideoId,
  replaceStreamToken,
  isStreamTokenExpired,
} from "./token-utils";

// Persistent keep-alive agents for proxying
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 60,
  maxFreeSockets: 20,
  timeout: 30000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 60,
  maxFreeSockets: 20,
  timeout: 30000,
});

const defaultAxios = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 15000,
});

// Dynamic got-scraping loader for bypassing Cloudflare & datacenter TLS blocks
let gotScrapingModule: any = null;
async function getGotScraping() {
  if (!gotScrapingModule) {
    try {
      const mod: any = await import("got-scraping");
      gotScrapingModule = mod.gotScraping || mod.default?.gotScraping || mod.default || mod;
    } catch {}
  }
  return gotScrapingModule;
}

// ----------------------------------------------------
// 1. In-Memory Decryption Key Cache
// ----------------------------------------------------
// AES-128 HLS decryption keys are 16 bytes each and INVARIANT for the video stream.
// Once obtained, they can be served indefinitely without re-fetching from Flixcloud.
interface CachedKey {
  key: Buffer;
  timestamp: number;
}
const keyCache = new Map<string, CachedKey>();
const KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function normalizeKeyCacheKey(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    return `${u.pathname}`;
  } catch {
    return urlStr.split("?")[0];
  }
}

export function cacheDecryptionKey(targetUrl: string, keyBuf: Buffer, videoId?: string | null) {
  if (!keyBuf || keyBuf.length === 0) return;
  const now = Date.now();
  const entry: CachedKey = { key: keyBuf, timestamp: now };

  keyCache.set(targetUrl, entry);
  const normalized = normalizeKeyCacheKey(targetUrl);
  keyCache.set(normalized, entry);

  if (videoId) {
    keyCache.set(`vid:${videoId}`, entry);
  }
  const extractedVid = extractStreamVideoId(targetUrl);
  if (extractedVid) {
    keyCache.set(`vid:${extractedVid}`, entry);
  }
}

export function getCachedDecryptionKey(targetUrl: string, videoId?: string | null): Buffer | null {
  const check = (key: string): Buffer | null => {
    const entry = keyCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > KEY_CACHE_TTL_MS) {
      keyCache.delete(key);
      return null;
    }
    return entry.key;
  };

  const direct = check(targetUrl);
  if (direct) return direct;

  const normalized = check(normalizeKeyCacheKey(targetUrl));
  if (normalized) return normalized;

  if (videoId) {
    const byVid = check(`vid:${videoId}`);
    if (byVid) return byVid;
  }

  const extractedVid = extractStreamVideoId(targetUrl);
  if (extractedVid) {
    const byExtractedVid = check(`vid:${extractedVid}`);
    if (byExtractedVid) return byExtractedVid;
  }

  return null;
}

// ----------------------------------------------------
// 2. In-Memory Token Cache & In-Flight Deduplication
// ----------------------------------------------------
interface CachedToken {
  token: string;
  host: string;
  hls: string;
  pk?: string;
  exp: number;
  timestamp: number;
}

const tokenCache = new Map<string, CachedToken>();
const inFlightTokens = new Map<string, Promise<CachedToken | null>>();

function parseTokenExpiry(tokenStr: string): number {
  try {
    const parts = tokenStr.split(".");
    if (parts.length >= 2) {
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const jsonStr = Buffer.from(b64, "base64").toString("utf8");
      const payload = JSON.parse(jsonStr);
      if (payload.exp && typeof payload.exp === "number") {
        return payload.exp * 1000;
      }
    }
  } catch {}
  return Date.now() + 30 * 60 * 1000; // fallback 30 mins
}

export function storeStreamToken(
  identifiers: { aid?: string | null; videoId?: string | null; q?: string | null; ep?: number },
  tokenInfo: { token: string; host: string; hls: string; pk?: string }
) {
  const exp = parseTokenExpiry(tokenInfo.token);
  const entry: CachedToken = {
    ...tokenInfo,
    exp,
    timestamp: Date.now(),
  };

  if (identifiers.aid) tokenCache.set(`aid:${identifiers.aid}`, entry);
  if (identifiers.videoId) tokenCache.set(`vid:${identifiers.videoId}`, entry);
  if (identifiers.q && identifiers.ep) tokenCache.set(`q:${identifiers.q}_ep${identifiers.ep}`, entry);
}

export async function getFreshStreamToken(options: {
  aid?: string | null;
  v?: number;
  q?: string | null;
  ep?: number;
  server?: string;
  audio?: string;
  videoId?: string | null;
  forceFresh?: boolean;
}): Promise<CachedToken | null> {
  const { aid, v = 2, q, ep = 1, server = "HD-1", audio = "sub", videoId, forceFresh = false } = options;

  // 1. Check cache if not forcing fresh
  if (!forceFresh) {
    const checkToken = (key: string): CachedToken | null => {
      const cached = tokenCache.get(key);
      if (!cached) return null;
      if (cached.exp - Date.now() < 60000) {
        tokenCache.delete(key);
        return null;
      }
      return cached;
    };

    if (aid) {
      const c = checkToken(`aid:${aid}`);
      if (c) return c;
    }
    if (videoId) {
      const c = checkToken(`vid:${videoId}`);
      if (c) return c;
    }
    if (q && ep) {
      const c = checkToken(`q:${q}_ep${ep}`);
      if (c) return c;
    }
  }

  // 2. Deduplicate concurrent refreshes using in-flight map
  const dedupKey = aid ? `aid:${aid}` : q && ep ? `q:${q}_ep${ep}_${server}` : videoId ? `vid:${videoId}` : "";
  if (!dedupKey) return null;

  let existingPromise = inFlightTokens.get(dedupKey);
  if (existingPromise) {
    return existingPromise;
  }

  const refreshPromise = (async (): Promise<CachedToken | null> => {
    try {
      console.log(`[TokenRefresher] Proactively refreshing stream token for ${dedupKey}...`);

      // Strategy A: decryptFlixStream with aid
      if (aid) {
        try {
          const fresh = await decryptFlixStream(aid, v);
          if (fresh?.hls) {
            const parsed = new URL(fresh.hls);
            const token = parsed.searchParams.get("token");
            if (token) {
              const res: CachedToken = {
                token,
                host: parsed.host,
                hls: fresh.hls,
                pk: fresh.pk,
                exp: parseTokenExpiry(token),
                timestamp: Date.now(),
              };
              storeStreamToken({ aid, videoId, q, ep }, res);
              return res;
            }
          }
        } catch (err: any) {
          console.warn(`[TokenRefresher] decryptFlixStream failed for aid ${aid}:`, err?.message || err);
        }
      }

      // Strategy B: findAndStream with q (anilistId or title) and episode
      if (q) {
        try {
          const targetAnilistId = /^\d+$/.test(q) ? parseInt(q, 10) : undefined;
          const freshData = await findAndStream({
            anilistId: targetAnilistId,
            query: !targetAnilistId ? q : undefined,
            episode: ep,
            server: server,
          });

          const matching = (freshData.all_servers || []).find((s: any) => s.audio === audio) || freshData;
          if (matching?.hls) {
            const parsed = new URL(matching.hls);
            const token = parsed.searchParams.get("token");
            if (token) {
              const res: CachedToken = {
                token,
                host: parsed.host,
                hls: matching.hls,
                pk: matching.pk,
                exp: parseTokenExpiry(token),
                timestamp: Date.now(),
              };
              storeStreamToken({ aid: matching.access_id || aid, videoId, q, ep }, res);
              return res;
            }
          }
        } catch (err: any) {
          console.warn(`[TokenRefresher] findAndStream failed for ${q} ep ${ep}:`, err?.message || err);
        }
      }

      return null;
    } finally {
      inFlightTokens.delete(dedupKey);
    }
  })();

  inFlightTokens.set(dedupKey, refreshPromise);
  return refreshPromise;
}

// ----------------------------------------------------
// 3. Resilient Binary Fetcher (got-scraping + fallback)
// ----------------------------------------------------
export async function fetchBufferWithBypass(
  url: string,
  options: {
    referer?: string;
    origin?: string;
    userAgent?: string;
    timeoutMs?: number;
  } = {}
): Promise<{ buffer: Buffer; statusCode: number } | null> {
  const {
    referer = "https://flixcloud.cc/",
    origin = "https://flixcloud.cc",
    userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    timeoutMs = 12000,
  } = options;

  // 1. Try got-scraping first (bypasses Cloudflare & datacenter TLS blocks)
  try {
    const got = await getGotScraping();
    if (got) {
      const res = await got(url, {
        responseType: "buffer",
        headers: {
          "User-Agent": userAgent,
          Referer: referer,
          Origin: origin,
          Accept: "*/*",
        },
        timeout: { request: timeoutMs },
        retry: { limit: 1 },
      });

      if (res && res.rawBody && res.rawBody.length > 0) {
        return { buffer: res.rawBody, statusCode: res.statusCode || 200 };
      }
    }
  } catch (err: any) {
    const status = err?.response?.statusCode || err?.response?.status;
    if (status === 401 || status === 403 || status === 410) {
      return { buffer: Buffer.alloc(0), statusCode: status };
    }
  }

  // 2. Fallback to axios with keep-alive
  try {
    const res = await defaultAxios.get(url, {
      responseType: "arraybuffer",
      timeout: timeoutMs,
      headers: {
        "User-Agent": userAgent,
        Referer: referer,
        Origin: origin,
        Accept: "*/*",
      },
    });

    if (res.data) {
      return { buffer: Buffer.from(res.data), statusCode: res.status };
    }
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 401 || status === 403 || status === 410) {
      return { buffer: Buffer.alloc(0), statusCode: status };
    }
  }

  // 3. Native fetch fallback
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const fRes = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent,
        Referer: referer,
        Origin: origin,
        Accept: "*/*",
      },
    });
    clearTimeout(timer);

    if (fRes.ok) {
      const ab = await fRes.arrayBuffer();
      return { buffer: Buffer.from(ab), statusCode: fRes.status };
    }
    return { buffer: Buffer.alloc(0), statusCode: fRes.status };
  } catch {}

  return null;
}

// ----------------------------------------------------
// 4. Intelligent On-The-Fly Decryption Key Resolver
// ----------------------------------------------------
export async function getOrRefreshDecryptionKey(options: {
  targetUrl: string;
  aid?: string | null;
  v?: number;
  q?: string | null;
  ep?: number;
  server?: string;
  audio?: string;
  referer?: string;
  origin?: string;
}): Promise<Buffer | null> {
  let { targetUrl, aid, v = 2, q, ep = 1, server = "HD-1", audio = "sub", referer, origin } = options;

  const videoId = extractStreamVideoId(targetUrl);

  // Step 1: Check memory cache (instant 0ms response)
  const cached = getCachedDecryptionKey(targetUrl, videoId);
  if (cached) {
    return cached;
  }

  // Step 2: Proactive check: if token in targetUrl is already expired, refresh BEFORE network call
  if (isStreamTokenExpired(targetUrl)) {
    console.log(`[TokenRefresher] Key URL token is expired, refreshing before fetch...`);
    const freshToken = await getFreshStreamToken({
      aid,
      v,
      q,
      ep,
      server,
      audio,
      videoId,
      forceFresh: true,
    });
    if (freshToken) {
      targetUrl = replaceStreamToken(targetUrl, freshToken.token, freshToken.host);
    }
  }

  // Helper to try fetching across flixcloud CDN mirror domains (fetch9, fetch8, fetch7)
  const tryFetchKey = async (urlToFetch: string): Promise<Buffer | null> => {
    const urlsToTry = [urlToFetch];
    if (urlToFetch.includes("fetch9.flixcloud.cc")) {
      urlsToTry.push(urlToFetch.replace("fetch9.flixcloud.cc", "fetch8.flixcloud.cc"));
      urlsToTry.push(urlToFetch.replace("fetch9.flixcloud.cc", "fetch7.flixcloud.cc"));
    } else if (urlToFetch.includes("fetch8.flixcloud.cc")) {
      urlsToTry.push(urlToFetch.replace("fetch8.flixcloud.cc", "fetch9.flixcloud.cc"));
      urlsToTry.push(urlToFetch.replace("fetch8.flixcloud.cc", "fetch7.flixcloud.cc"));
    }

    for (const u of urlsToTry) {
      const res = await fetchBufferWithBypass(u, { referer, origin });
      if (res && res.statusCode === 200 && res.buffer.length > 0) {
        return res.buffer;
      }
    }
    return null;
  };

  // Step 3: Attempt initial fetch
  let keyBuf = await tryFetchKey(targetUrl);
  if (keyBuf) {
    cacheDecryptionKey(targetUrl, keyBuf, videoId);
    return keyBuf;
  }

  // Step 4: Upstream returned 401, 403, or 410 -> Force On-The-Fly Refresh
  console.log(`[TokenRefresher] Decryption key fetch failed or expired for ${targetUrl.split("?")[0]}. Refreshing on the fly...`);
  const freshToken = await getFreshStreamToken({
    aid,
    v,
    q,
    ep,
    server,
    audio,
    videoId,
    forceFresh: true,
  });

  if (freshToken) {
    const freshKeyUrl = replaceStreamToken(targetUrl, freshToken.token, freshToken.host);
    keyBuf = await tryFetchKey(freshKeyUrl);
    if (keyBuf) {
      console.log(`[TokenRefresher] Decryption key successfully retrieved after token refresh!`);
      cacheDecryptionKey(targetUrl, keyBuf, videoId);
      cacheDecryptionKey(freshKeyUrl, keyBuf, videoId);
      return keyBuf;
    }
  }

  return null;
}
