import axios from "axios";
import { resolveAnimeIds } from "./anime-resolver";

const BASE_URL = "https://reanime.to";

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: BASE_URL,
  },
});

let cloudflareBlockedUntil = 0;
const CLOUDFLARE_COOLDOWN_MS = 5 * 1000; // 5 seconds cooldown when genuine Cloudflare challenge is encountered

export function isReanimeCloudflareBlocked(): boolean {
  return Date.now() < cloudflareBlockedUntil;
}

function isCloudflareChallengeBody(data: any): boolean {
  if (typeof data !== "string") return false;
  return (
    data.includes("Just a moment...") ||
    data.includes("challenge-platform") ||
    data.includes("cf-browser-verification") ||
    data.includes("Checking your browser") ||
    data.includes("Enable JavaScript and cookies to continue")
  );
}

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

function markReanimeCloudflareBlocked(context = "") {
  if (Date.now() >= cloudflareBlockedUntil) {
    console.warn(`[Reanime] Cloudflare challenge active on ${BASE_URL} (${context || "403"}). Cooldown enabled for 5s; falling back to alternative scrapers.`);
  }
  cloudflareBlockedUntil = Date.now() + CLOUDFLARE_COOLDOWN_MS;
}

async function fetchWithRetry(urlPath: string, options: any = {}, maxRetries = 2): Promise<any> {
  if (isReanimeCloudflareBlocked()) {
    return null;
  }

  const fullUrl = urlPath.startsWith("http")
    ? urlPath
    : `${BASE_URL}${urlPath.startsWith("/") ? "" : "/"}${urlPath}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // 1. Try with got-scraping first (mimics real browser TLS/HTTP2 to bypass Cloudflare WAF)
    try {
      const got = await getGotScraping();
      if (got) {
        const res = await got.get(fullUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            Accept: "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: BASE_URL,
            ...(options.headers || {}),
          },
          timeout: { request: 4500 },
        });
        if (res.body) {
          if (isCloudflareChallengeBody(res.body)) {
            markReanimeCloudflareBlocked(urlPath);
            return null;
          }
          try {
            return JSON.parse(res.body);
          } catch {
            return res.body;
          }
        }
      }
    } catch (gotErr: any) {
      if (isCloudflareChallengeBody(gotErr?.response?.body)) {
        markReanimeCloudflareBlocked(urlPath);
        return null;
      }
    }

    // 2. Try with axios (fast timeout 3500ms)
    try {
      const res = await client.get(urlPath, {
        ...options,
        timeout: 3500,
      });
      if (res.data) {
        if (isCloudflareChallengeBody(res.data)) {
          markReanimeCloudflareBlocked(urlPath);
          return null;
        }
        return res.data;
      }
    } catch (err: any) {
      if (isCloudflareChallengeBody(err?.response?.data)) {
        markReanimeCloudflareBlocked(urlPath);
        return null;
      }
      // 3. Fallback to native fetch (3500ms timeout)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const fetchRes = await fetch(fullUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            Accept: "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: BASE_URL,
            ...(options.headers || {}),
          },
        });
        clearTimeout(timeoutId);
        const text = await fetchRes.text();
        if (isCloudflareChallengeBody(text)) {
          markReanimeCloudflareBlocked(urlPath);
          return null;
        }
        if (fetchRes.ok && text) {
          try {
            return JSON.parse(text);
          } catch {
            return text;
          }
        }
      } catch {}
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, attempt * 150));
    }
  }

  return null;
}

// ---------- Stream Decryption Helpers ----------

async function sha256Hex(str: string): Promise<string> {
  const enc = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64ToUint8(b64: string): Buffer {
  return Buffer.from(b64, "base64");
}

export interface DecryptedStreamResult {
  accessId: string;
  version: number;
  hls: string;
  pk: string;
  playlist_preview?: string | null;
  subtitles: Array<{
    language?: string;
    lang?: string;
    label?: string;
    file?: string;
    url?: string;
    default?: boolean;
    format?: string;
  }>;
  thumbnail?: string | null;
  thumbnails_vtt?: string | null;
  title?: string | null;
  audio_type?: string | null;
}

import { isStreamTokenExpired } from "./token-utils";
export { isStreamTokenExpired };

export async function decryptFlixStream(
  accessId: string,
  version = 1
): Promise<DecryptedStreamResult> {
  if (!accessId || accessId === "undefined" || accessId === "null") {
    throw new Error(`Invalid Flixcloud accessId: "${accessId}"`);
  }
  const cleanAccessId = accessId.replace(/^\/e\//, "").split("?")[0];
  const embedUrl = `https://flixcloud.cc/e/${cleanAccessId}?v=${version}`;
  let html = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    // 1. Try with got-scraping first (bypasses Cloudflare on flixcloud.cc)
    try {
      const got = await getGotScraping();
      if (got) {
        const res = await got.get(embedUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            Referer: BASE_URL,
          },
          timeout: { request: 6000 },
        });
        if (res.body && typeof res.body === "string" && res.body.includes("data:")) {
          html = res.body;
          break;
        }
      }
    } catch {}

    // 2. Fallback to axios
    try {
      const res = await axios.get(embedUrl, {
        timeout: 6000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          Referer: BASE_URL,
        },
      });
      if (res.data && typeof res.data === "string" && res.data.includes("data:")) {
        html = res.data;
        break;
      }
    } catch {
      // 3. Fallback to fetch
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const fRes = await fetch(embedUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            Referer: BASE_URL,
          },
        });
        clearTimeout(timeoutId);
        if (fRes.ok) {
          const text = await fRes.text();
          if (text && text.includes("data:")) {
            html = text;
            break;
          }
        }
      } catch {}
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 200));
  }

  if (!html) {
    throw new Error(`Could not fetch player embed page for ${accessId}`);
  }

  const dataMatch = html.match(/data:\s*(\[[\s\S]*?\]),\s*form:/);
  if (!dataMatch) {
    throw new Error("Could not parse player payload from flixcloud embed page");
  }

  const fn = new Function("return " + dataMatch[1]);
  const dataArr = fn();
  const pageData = dataArr.find(
    (d: any) => d && d.data && d.data.obfuscated_crypto_data
  )?.data;

  if (!pageData) {
    throw new Error("Obfuscated crypto data not found in flixcloud embed");
  }

  const t = pageData.obfuscated_crypto_data;
  const e = pageData.obfuscation_seed;

  // Derive field mappings via SHA256 rounds
  let eHash = e;
  for (let s = 0; s < 3; s++) eHash = await sha256Hex(eHash + s.toString());
  let aHash = eHash;
  for (let s = 0; s < 3; s++) aHash = await sha256Hex(aHash + s.toString());

  const mapping = {
    keyField: "kf_" + eHash.substring(8, 16),
    ivField: "ivf_" + eHash.substring(16, 24),
    containerName: "cd_" + eHash.substring(24, 32),
    arrayName: "ad_" + eHash.substring(32, 40),
    objectName: "od_" + eHash.substring(40, 48),
    tokenField: eHash.substring(48, 64) + "_" + eHash.substring(56, 64),
    keyFrag2Field: aHash.substring(0, 16) + "_" + aHash.substring(16, 24),
  };

  const container = t[mapping.containerName];
  const arr = container[mapping.arrayName];
  const obj = arr[0][mapping.objectName];
  const frag1_b64 = obj[mapping.keyField];
  const iv_b64 = obj[mapping.ivField];
  const frag2_b64 = pageData[mapping.keyFrag2Field];
  const token = pageData[mapping.tokenField];

  if (!token) {
    throw new Error("Decryption token not found");
  }

  // Request playback token (with retry if network drops or flixcloud rate limits)
  let tokenRes: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    // 1. Try with got-scraping first
    try {
      const got = await getGotScraping();
      if (got) {
        const res = await got.get(`https://flixcloud.cc/api/m3u8/${token}`, {
          timeout: { request: 6000 },
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            Referer: embedUrl,
          },
        });
        if (res.body) {
          tokenRes = { data: JSON.parse(res.body) };
          break;
        }
      }
    } catch {}

    // 2. Fallback to axios
    try {
      tokenRes = await axios.get(`https://flixcloud.cc/api/m3u8/${token}`, {
        timeout: 6000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Referer: embedUrl,
        },
      });
      if (tokenRes?.data) break;
    } catch (err) {
      // 3. Fallback to fetch
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const fRes = await fetch(`https://flixcloud.cc/api/m3u8/${token}`, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            Referer: embedUrl,
          },
        });
        clearTimeout(timeoutId);
        if (fRes.ok) {
          tokenRes = { data: await fRes.json() };
          break;
        }
      } catch {}
      if (attempt === 3 && !tokenRes?.data) throw err;
      await new Promise((r) => setTimeout(r, attempt * 200));
    }
  }

  const S = tokenRes.data;
  const vidKey = (await sha256Hex(token + "vid")).substring(0, 10);
  const keyKey = (await sha256Hex(token + "key")).substring(0, 10);
  const T = S[vidKey];
  const y = S[keyKey];

  if (!T || !y) {
    throw new Error("Incomplete token response from m3u8 API");
  }

  // WebAssembly key generation
  const wPayloadBytes = base64ToUint8(pageData.w_payload);
  const wasmModule: any = await WebAssembly.instantiate(wPayloadBytes, {});
  const xExp: any = wasmModule.instance ? wasmModule.instance.exports : wasmModule.exports;
  const mem: any = xExp.memory;
  if (mem.buffer.byteLength === 0) mem.grow(1);

  const sMem = new Uint8Array(mem.buffer);
  const tBytes = base64ToUint8(frag1_b64);
  const eBytes = base64ToUint8(frag2_b64);
  const aBytes = base64ToUint8(y);

  const L = tBytes.length;
  const _ = 1000;
  const TPos = _ + L;
  const yPos = TPos + L;
  const RPos = yPos + L;

  sMem.set(tBytes, _);
  sMem.set(eBytes, TPos);
  sMem.set(aBytes, yPos);

  const seedNum = parseInt(e.substring(0, 8), 16);
  xExp._s(seedNum);
  xExp._r(_, TPos, yPos, RPos, L);

  const B = new Uint8Array(L);
  B.set(sMem.subarray(RPos, RPos + L));

  // Extract playlist decryption key pk from WebAssembly _c()
  const f = xExp._c();
  const pkBytes = new Uint8Array(xExp.memory.buffer).slice(f, f + 32);
  const pkB64 = Buffer.from(pkBytes).toString("base64");

  // Derive PBKDF2 bits and AES key
  const WKey = await crypto.subtle.importKey(
    "raw",
    B,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const K = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(e),
      iterations: 1000,
      hash: "SHA-256",
    },
    WKey,
    256
  );

  const et = new Uint8Array(K);
  for (let N = 0; N < 32; N++) {
    et[N] ^= e.charCodeAt(N % e.length);
  }

  const ot = await crypto.subtle.digest("SHA-256", et);
  const Yt = new Uint8Array(ot);

  const ivBytes = base64ToUint8(iv_b64);
  const cipherBytes = base64ToUint8(T);

  const aesKey = await crypto.subtle.importKey(
    "raw",
    Yt,
    { name: "AES-CBC" },
    false,
    ["decrypt"]
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv: new Uint8Array(ivBytes) },
    aesKey,
    new Uint8Array(cipherBytes)
  );

  const hlsUrl = new TextDecoder().decode(decrypted);

  return {
    accessId,
    version,
    hls: hlsUrl,
    pk: pkB64,
    playlist_preview: null,
    subtitles: pageData.subtitles || [],
    thumbnail: pageData.thumbnail || null,
    thumbnails_vtt: pageData.thumbnails_vtt || null,
    title: pageData.video_title || null,
    audio_type: pageData.audio_type || null,
  };
}

// ---------- API Functions ----------

const reanimeServersCache = new Map<string, { data: any; timestamp: number }>();
const reanimeServersInFlight = new Map<string, Promise<any>>();
const SERVERS_CACHE_TTL_MS = 10 * 60 * 1000;

export async function searchReanime(query: string, limit = 20) {
  const data = await fetchWithRetry(`/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  return data || { results: [] };
}

export async function getReanimeEpisodes(target: string | number) {
  const resolved = await resolveAnimeSlug(String(target));
  const targetSlug = resolved?.slug || String(target);

  const data = await fetchWithRetry(`/api/v1/anime/${targetSlug}/episodes`);
  const list = data?.data || [];
  return {
    slug: targetSlug,
    total_episodes: list.length,
    episodes: list,
  };
}

export async function getReanimeServers(target: string | number, episode: number | string) {
  const targetStr = String(target).trim();
  const epNum = parseInt(String(episode), 10);
  const cacheKey = `${targetStr}-${epNum}`;
  const now = Date.now();

  const cached = reanimeServersCache.get(cacheKey);
  if (cached && now - cached.timestamp < SERVERS_CACHE_TTL_MS && cached.data?.servers?.length > 0) {
    return cached.data;
  }

  const existingInFlight = reanimeServersInFlight.get(cacheKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const fetchPromise = (async () => {
    let anilistId: number | null = null;
    let targetSlug: string | null = null;

    if (/^\d+$/.test(targetStr)) {
      anilistId = parseInt(targetStr, 10);
    }

    if (!anilistId) {
      const resolved = await resolveAnimeSlug(targetStr);
      if (resolved) {
        targetSlug = resolved.slug;
        anilistId = resolved.anilist_id;
      } else {
        targetSlug = targetStr;
      }
    }

    let tmdbId = null;
    let season = 1;

    if (targetSlug && !anilistId) {
      try {
        const animeInfo = await fetchWithRetry(`/api/v1/anime/${targetSlug}`);
        anilistId = animeInfo?.anilist_id;
        tmdbId = animeInfo?.themoviedb_id;
        season = animeInfo?.external_seasons?.tmdb || 1;
      } catch {}
    }

    let flixData: any = null;
    if (anilistId) {
      flixData = await fetchWithRetry(`/api/flix/${anilistId}/${epNum}`);
    }

    // Fallback: If direct anilist lookup yielded no servers, try resolving slug and using TMDB
    if ((!flixData || !flixData.servers || flixData.servers.length === 0) && !targetSlug && anilistId) {
      try {
        const resolved = await resolveAnimeSlug(targetStr, anilistId);
        if (resolved?.slug) {
          targetSlug = resolved.slug;
          const animeInfo = await fetchWithRetry(`/api/v1/anime/${targetSlug}`);
          tmdbId = animeInfo?.themoviedb_id;
          season = animeInfo?.external_seasons?.tmdb || 1;
        }
      } catch {}
    }

    if ((!flixData || !flixData.servers || flixData.servers.length === 0) && tmdbId) {
      flixData = await fetchWithRetry(`/api/flix/0/${epNum}?tmdb=${tmdbId}&season=${season}`);
    }

    const parsedServers = (flixData?.servers || []).map((s: any) => {
      let access_id = s.access_id || null;
      let version = s.version || 1;
      if (!access_id && s.dataLink) {
        const m = s.dataLink.match(/\/e\/([a-zA-Z0-9_-]+)/);
        if (m) access_id = m[1];
        const vMatch = s.dataLink.match(/[?&]v=(\d+)/);
        if (vMatch) {
          version = parseInt(vMatch[1], 10) || 1;
        }
      }
      if (!access_id && s.$id) {
        const parts = s.$id.split("-");
        if (parts.length >= 2) {
          access_id = parts[1];
        }
      }
      return {
        ...s,
        access_id,
        version,
      };
    });

    const result = {
      slug: targetSlug || (anilistId ? String(anilistId) : targetStr),
      episode: epNum,
      anilist_id: anilistId,
      servers: parsedServers,
    };

    if (parsedServers.length > 0) {
      reanimeServersCache.set(cacheKey, { data: result, timestamp: Date.now() });
      if (anilistId && cacheKey !== `${anilistId}-${epNum}`) {
        reanimeServersCache.set(`${anilistId}-${epNum}`, { data: result, timestamp: Date.now() });
      }
    }

    return result;
  })().finally(() => {
    reanimeServersInFlight.delete(cacheKey);
  });

  reanimeServersInFlight.set(cacheKey, fetchPromise);
  return fetchPromise;
}

export interface ReanimeEpisodeServers {
  hasSub: boolean;
  hasDub: boolean;
  subServers: string[];
  dubServers: string[];
}

export interface ReanimeEpisodeSourceItem {
  type: "SUB" | "DUB";
  language: string;
  videoUrl: string;
  quality: string;
  isHls: boolean;
  serverName: string;
  subtitles?: Array<{
    language: string;
    label: string;
    subtitleUrl: string;
    isDefault?: boolean;
  }>;
}

const reanimeEpisodeServersCache = new Map<string, { data: ReanimeEpisodeServers; timestamp: number }>();
const REANIME_CACHE_TTL_MS = 10 * 60 * 1000;

export async function getReanimeEpisodeServers(
  target: string | number,
  episode: number | string = 1
): Promise<ReanimeEpisodeServers> {
  if (!target) {
    return { hasSub: false, hasDub: false, subServers: [], dubServers: [] };
  }
  const cacheKey = `${target}-${episode}`;
  const cached = reanimeEpisodeServersCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < REANIME_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const srvData = await getReanimeServers(target, episode);
    const sList = srvData?.servers || [];

    const subServersSet = new Set<string>();
    const dubServersSet = new Set<string>();

    for (const s of sList) {
      const rawName = (s.serverName || "").toUpperCase().trim();
      const normName =
        rawName.includes("HD-2") || rawName === "HD2"
          ? "HD-2"
          : rawName.includes("HD-1") || rawName === "HD1"
          ? "HD-1"
          : s.serverName || "HD-1";

      if (s.dataType === "sub") {
        subServersSet.add(normName);
      } else if (s.dataType === "dub") {
        dubServersSet.add(normName);
      }
    }

    const sortServers = (arr: string[]) =>
      arr.sort((a, b) => {
        if (a === "HD-1" && b === "HD-2") return -1;
        if (a === "HD-2" && b === "HD-1") return 1;
        return a.localeCompare(b);
      });

    const subServers = sortServers(Array.from(subServersSet));
    const dubServers = sortServers(Array.from(dubServersSet));

    const result: ReanimeEpisodeServers = {
      hasSub: subServers.length > 0,
      hasDub: dubServers.length > 0,
      subServers,
      dubServers,
    };

    reanimeEpisodeServersCache.set(cacheKey, { data: result, timestamp: now });
    return result;
  } catch {
    return { hasSub: false, hasDub: false, subServers: [], dubServers: [] };
  }
}

export async function checkReanimeHasDub(
  target: string | number,
  episode: number | string = 1
): Promise<boolean> {
  const srvInfo = await getReanimeEpisodeServers(target, episode);
  return srvInfo.hasDub;
}

const reanimeSourcesCache = new Map<string, { data: ReanimeEpisodeSourceItem[]; timestamp: number }>();
const reanimeSourcesInFlight = new Map<string, Promise<ReanimeEpisodeSourceItem[]>>();
const SOURCES_CACHE_TTL_MS = 2 * 60 * 1000;

/**
 * Returns all ready-to-use M3U8 video sources for an episode from Re:ANIME.
 * If both HD-1 and HD-2 exist for DUB, returns two DUB sources:
 * "HD-1 (English Dub)" and "HD-2 (English Dub)", and likewise for SUB!
 */
export async function getReanimeEpisodeSources(
  target: string | number,
  episode: number | string = 1
): Promise<ReanimeEpisodeSourceItem[]> {
  const targetStr = String(target).trim();
  const epNum = parseInt(String(episode), 10);
  const cacheKey = `${targetStr}-${epNum}`;
  const now = Date.now();

  const cached = reanimeSourcesCache.get(cacheKey);
  if (cached && now - cached.timestamp < SOURCES_CACHE_TTL_MS && cached.data.length > 0) {
    // Verify that cached streams are not expired
    const allValid = cached.data.every((s) => !isStreamTokenExpired(s.videoUrl));
    if (allValid) {
      return cached.data;
    }
  }

  const existingInFlight = reanimeSourcesInFlight.get(cacheKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const fetchPromise = (async () => {
    try {
      const targetAnilistId = /^\d+$/.test(targetStr) ? parseInt(targetStr, 10) : null;
      const streamData = await findAndStream({
        anilistId: targetAnilistId,
        query: !targetAnilistId ? targetStr : undefined,
        episode: epNum,
        server: "all",
      });

      const validServers = (streamData.all_servers || []).filter((s) => s && s.hls);
      if (validServers.length === 0 && streamData.hls) {
        validServers.push({
          server: streamData.server || "HD-1",
          audio: (streamData.audio === "dub" ? "dub" : "sub") as "sub" | "dub",
          access_id: streamData.access_id,
          version: streamData.version || 1,
          hls: streamData.hls,
          pk: streamData.pk,
          subtitles: streamData.subtitles || [],
        });
      }

      if (validServers.length > 0) {
        const sources: ReanimeEpisodeSourceItem[] = [];
        for (const s of validServers) {
          const isDub = s.audio === "dub";
          const aidParam = s.access_id ? `&aid=${encodeURIComponent(s.access_id)}` : "";
          const vParam = s.version ? `&v=${s.version}` : "";
          const qParam = targetAnilistId ? `&q=${targetAnilistId}` : `&q=${encodeURIComponent(targetStr)}`;
          const epParam = `&ep=${epNum}`;
          const srvParam = `&server=${encodeURIComponent(s.server || "HD-1")}`;
          const proxyUrl = `/api/proxy/m3u8?url=${encodeURIComponent(s.hls || "")}&pk=${encodeURIComponent(s.pk || "")}&audio=${s.audio}${aidParam}${vParam}${qParam}${epParam}${srvParam}`;
          const rawSubs = s.subtitles || streamData.subtitles || [];
          const srvSubtitles = rawSubs.map((sub: any, idx: number) => {
            const rawUrl = sub.url || sub.file || "";
            const proxySubUrl = rawUrl
              ? (rawUrl.startsWith("/api/proxy") ? rawUrl : `/api/proxy/subtitles?url=${encodeURIComponent(rawUrl)}`)
              : "";
            return {
              language: sub.language || sub.lang || sub.label || "en",
              label: sub.label || sub.language || (idx === 0 ? "English" : `Subtitle ${idx + 1}`),
              subtitleUrl: proxySubUrl,
              isDefault: sub.default !== undefined ? sub.default : idx === 0,
            };
          });

          sources.push({
            type: isDub ? "DUB" : "SUB",
            language: isDub ? "English Dub" : "Japanese",
            videoUrl: proxyUrl,
            quality: "1080p",
            isHls: true,
            serverName: isDub ? `${s.server} (English Dub)` : `${s.server} (Sub)`,
            subtitles: srvSubtitles.length > 0 ? srvSubtitles : undefined,
          });
        }
        reanimeSourcesCache.set(cacheKey, { data: sources, timestamp: Date.now() });
        if (targetAnilistId && cacheKey !== `${targetAnilistId}-${epNum}`) {
          reanimeSourcesCache.set(`${targetAnilistId}-${epNum}`, { data: sources, timestamp: Date.now() });
        }
        return sources;
      }
    } catch (err: any) {
      console.warn("[getReanimeEpisodeSources] Notice:", err?.message || err);
    } finally {
      reanimeSourcesInFlight.delete(cacheKey);
    }

    // If real proxy streams could not be decrypted, return [] so verified direct streams (AnimeParadise, Consumet, etc.) are used cleanly
    return [];
  })();

  reanimeSourcesInFlight.set(cacheKey, fetchPromise);
  return fetchPromise;
}

export async function resolveAnimeSlug(query?: string | null, anilistId?: number | string | null) {
  let targetId = anilistId ? parseInt(String(anilistId), 10) : null;
  let textQuery = query;

  if (!targetId && textQuery && /^\d+$/.test(String(textQuery).trim())) {
    targetId = parseInt(String(textQuery).trim(), 10);
    textQuery = null;
  }

  // If textQuery looks like an existing Reanime slug (ends with -[a-z0-9]{6})
  if (textQuery && /-[a-z0-9]{6}$/.test(textQuery.trim())) {
    try {
      const checkRes = await fetchWithRetry(`/api/v1/anime/${textQuery.trim()}`);
      if (checkRes && (checkRes.anime_id || checkRes.anilist_id)) {
        return {
          slug: checkRes.anime_id || textQuery.trim(),
          title: checkRes.title,
          anilist_id: checkRes.anilist_id,
          cover_image: checkRes.cover_image,
        };
      }
    } catch {}
  }

  // If AniList ID provided:
  if (targetId) {
    let titleToSearch: string | null = null;

    // 1. Try AniList GraphQL
    if (!titleToSearch) {
      try {
        const gqlQuery = `{ Media(id: ${targetId}, type: ANIME) { id title { english romaji native } coverImage { large medium } } }`;
        const alRes = await axios.post(
          "https://graphql.anilist.co",
          { query: gqlQuery },
          { timeout: 3000 }
        );
        const media = alRes.data?.data?.Media;
        if (media) {
          titleToSearch =
            media.title?.english || media.title?.romaji || media.title?.native;
        }
      } catch {}
    }

    // 2. Fallback: ARM & Kitsu
    if (!titleToSearch) {
      try {
        const armRes = await axios.get(
          `https://arm.haglund.dev/api/v2/ids?source=anilist&id=${targetId}`,
          { timeout: 4000 }
        );
        if (armRes.data?.["anime-planet"]) {
          titleToSearch = armRes.data["anime-planet"].replace(/-/g, " ");
        } else if (armRes.data?.kitsu) {
          const kRes = await axios.get(
            `https://kitsu.io/api/edge/anime/${armRes.data.kitsu}`,
            { timeout: 4000 }
          );
          titleToSearch =
            kRes.data?.data?.attributes?.canonicalTitle ||
            kRes.data?.data?.attributes?.titles?.en;
        }
      } catch {}
    }

    if (titleToSearch) {
      try {
        const searchData = await searchReanime(titleToSearch, 20);
        const results = searchData.results || [];
        const match =
          results.find((a: any) => a.anilist_id === targetId) || results[0];
        if (match) {
          return {
            slug: match.anime_id,
            title: match.title,
            anilist_id: match.anilist_id || targetId,
            cover_image: match.cover_image,
          };
        }
      } catch {}
    }
  }

  // If text query provided (e.g. name of anime)
  if (textQuery) {
    let searchData = await searchReanime(textQuery, 20);
    let results = searchData.results || [];

    // Fallback: Try stripped/cleaned title if initial search was empty
    if (results.length === 0) {
      const cleanQ = textQuery
        .replace(/\s*\([^)]*\)/g, "")
        .replace(/\s*(?:Season\s*\d+|2nd\s*Season|3rd\s*Season|4th\s*Season|Part\s*\d+|cour\s*\d+).*$/i, "")
        .replace(/[:\-–—]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (cleanQ && cleanQ.toLowerCase() !== textQuery.toLowerCase()) {
        searchData = await searchReanime(cleanQ, 20);
        results = searchData.results || [];
      }
    }

    if (results.length > 0) {
      const qLower = textQuery.toLowerCase().trim();
      const qWords = qLower.split(/[\s:,-]+/).filter(Boolean);

      // 1. Exact match
      let best = results.find((a: any) => {
        const eng = (a.title?.english || "").toLowerCase();
        const rom = (a.title?.romaji || "").toLowerCase();
        const nat = (a.title?.native || "").toLowerCase();
        return eng === qLower || rom === qLower || nat === qLower;
      });

      // 2. Substring match
      if (!best) {
        best = results.find((a: any) => {
          const eng = (a.title?.english || "").toLowerCase();
          const rom = (a.title?.romaji || "").toLowerCase();
          const slg = (a.anime_id || "").toLowerCase();
          return (
            eng.includes(qLower) ||
            rom.includes(qLower) ||
            slg.includes(qLower.replace(/\s+/g, "-"))
          );
        });
      }

      // 3. All words match
      if (!best && qWords.length > 0) {
        best = results.find((a: any) => {
          const combined = `${a.title?.english || ""} ${a.title?.romaji || ""} ${a.anime_id || ""}`.toLowerCase();
          return qWords.every((w) => combined.includes(w));
        });
      }

      if (!best) best = results[0];

      return {
        slug: best.anime_id,
        title: best.title,
        anilist_id: best.anilist_id,
        cover_image: best.cover_image,
      };
    }
  }

  return null;
}

export interface ReanimeServerInfo {
  server: string;
  audio: "sub" | "dub";
  access_id: string;
  version: number;
  hls?: string;
  pk?: string;
  m3u8?: string;
  m3u8_sub?: string;
  m3u8_dub?: string;
  embed_player?: string | null;
  subtitles?: Array<{
    language: string;
    label?: string;
    url: string;
    format: string;
    default: boolean;
  }>;
}

export interface FindAndStreamResult {
  anime: {
    title: any;
    slug: string;
    anilist_id?: number | null;
    cover_image?: string | null;
  };
  episode: {
    number: number;
    title: string;
    title_romanji?: string;
    thumbnail?: string | null;
    duration?: number;
    aired?: string | null;
  };
  search_mode: string;
  requested_audio: string;
  audio: string;
  audio_fallback: boolean;
  has_dub: boolean;
  has_sub: boolean;
  server: string;
  access_id: string;
  version: number;
  hls: string;
  pk: string;
  subtitles: any[];
  all_servers: ReanimeServerInfo[] | null;
  available_servers: Array<{
    server: string;
    audio: string;
    access_id: string;
    version: number;
  }>;
}

export async function findAndStream({
  query,
  anilistId,
  searchMode = null,
  episode = 1,
  dub = false,
  type = "sub",
  server = null,
}: {
  query?: string | null;
  anilistId?: number | string | null;
  searchMode?: string | null;
  episode?: number | string;
  dub?: boolean | string;
  type?: string;
  server?: string | null;
}): Promise<FindAndStreamResult> {
  let targetAnilistId = anilistId;
  let targetQuery = query;

  if (searchMode === "anilist") {
    targetAnilistId = targetAnilistId || targetQuery;
    if (!targetQuery || /^\d+$/.test(String(targetQuery).trim())) {
      targetQuery = null;
    }
  } else if (searchMode === "name") {
    targetQuery = targetQuery || (targetAnilistId ? String(targetAnilistId) : null);
    targetAnilistId = null;
  }

  // Auto-resolve AniList ID if only query was provided (improves search accuracy 10x)
  if (!targetAnilistId && targetQuery) {
    try {
      const { anilistId: resolvedId } = await resolveAnimeIds(String(targetQuery));
      if (resolvedId) targetAnilistId = resolvedId;
    } catch {}
  }

  let targetEpNum = 1;
  const epStr = String(episode).trim();
  if (/^\d+$/.test(epStr)) {
    targetEpNum = parseInt(epStr, 10);
  }

  let srvData: any = null;
  let anime: any = null;
  let epInfo: any = null;

  // 1. Direct AniList ID fast-path (uses /api/flix/{anilistId}/{episode} directly)
  if (targetAnilistId) {
    try {
      srvData = await getReanimeServers(targetAnilistId, targetEpNum);
    } catch {}
  }

  // 2. Fallback to slug/name resolution if AniList ID didn't return servers
  if (!srvData || !srvData.servers || srvData.servers.length === 0) {
    anime = await resolveAnimeSlug(targetQuery, targetAnilistId);
    if (!anime && !targetAnilistId) {
      throw new Error(`Anime not found for search query "${targetQuery || targetAnilistId}"`);
    }
    if (anime) {
      try {
        const epData = await getReanimeEpisodes(anime.slug);
        const epList = epData.episodes || [];
        if (!/^\d+$/.test(epStr)) {
          const qEp = epStr.toLowerCase();
          epInfo =
            epList.find(
              (e: any) =>
                (e.title && e.title.toLowerCase().includes(qEp)) ||
                (e.title_romanji && e.title_romanji.toLowerCase().includes(qEp))
            ) || null;
          if (epInfo) targetEpNum = epInfo.episode_number;
        } else {
          epInfo = epList.find((e: any) => e.episode_number === targetEpNum) || null;
        }
      } catch {}
      srvData = await getReanimeServers(anime.slug, targetEpNum);
    }
  }

  if (!srvData || !srvData.servers || srvData.servers.length === 0) {
    throw new Error(
      `No streaming servers found for ${targetAnilistId ? `AniList ${targetAnilistId}` : (anime?.title?.english || anime?.slug || targetQuery)} episode ${targetEpNum}`
    );
  }

  // If server === 'all', decrypt all servers in parallel!
  const isAllServers = server && server.toLowerCase() === "all";
  let allDecrypted: any[] = [];

  if (isAllServers) {
    // Deduplicate decryption calls by unique `${access_id}-v${version}`
    const uniqueDecryptions = new Map<string, { access_id: string; version: number }>();
    for (const s of srvData.servers) {
      if (s.access_id) {
        const key = `${s.access_id}-v${s.version || 1}`;
        if (!uniqueDecryptions.has(key)) {
          uniqueDecryptions.set(key, { access_id: s.access_id, version: s.version || 1 });
        }
      }
    }

    const decResults = new Map<string, DecryptedStreamResult>();
    await Promise.allSettled(
      Array.from(uniqueDecryptions.entries()).map(async ([key, item]) => {
        try {
          const dec = await decryptFlixStream(item.access_id, item.version);
          if (dec && dec.hls) {
            decResults.set(key, dec);
          }
        } catch {}
      })
    );

    const seenServerAudio = new Set<string>();
    const deduplicatedDecrypted: any[] = [];
    for (const s of srvData.servers) {
      const key = `${s.access_id}-v${s.version || 1}`;
      const dec = decResults.get(key);
      if (dec && dec.hls) {
        const saKey = `${s.serverName}-${s.dataType}`;
        if (!seenServerAudio.has(saKey)) {
          seenServerAudio.add(saKey);
          deduplicatedDecrypted.push({
            ...dec,
            server: s.serverName,
            audio: s.dataType,
            access_id: s.access_id,
            version: s.version || 1,
          });
        }
      }
    }
    allDecrypted = deduplicatedDecrypted;
  }

  const desiredType =
    dub === true || dub === "true" || dub === "1" || type === "dub"
      ? "dub"
      : "sub";

  const hasDubServers = srvData.servers.some((s: any) => s.dataType === "dub");
  const hasSubServers = srvData.servers.some((s: any) => s.dataType === "sub");

  // Find servers matching desired language for primary selection
  let matching = srvData.servers.filter((s: any) => s.dataType === desiredType);
  let audioFallback = false;

  if (matching.length === 0) {
    matching = srvData.servers;
    audioFallback = true;
  }

  // Select primary server (prioritize HD-1 because HD-1 has fast reliable delivery)
  let chosen: any = null;
  if (server && !isAllServers) {
    const srvNorm = server.toLowerCase().replace(/[\s-_]+/g, "");
    chosen = matching.find(
      (s: any) =>
        s.serverName?.toLowerCase() === server.toLowerCase() ||
        (s.serverName || "").toLowerCase().replace(/[\s-_]+/g, "") === srvNorm
    );
  }
  if (!chosen) {
    chosen =
      matching.find((s: any) => s.serverName === "HD-1") ||
      matching.find((s: any) => s.serverName === "HD-2") ||
      matching[0];
  }

  if (!chosen || !chosen.access_id) {
    throw new Error("Could not find a valid streaming source");
  }

  let streamInfo: any = null;
  if (isAllServers && allDecrypted.length > 0) {
    const existing =
      allDecrypted.find(
        (s) => s.server === chosen.serverName && s.audio === chosen.dataType
      ) || allDecrypted[0];
    streamInfo = existing;
  }
  if (!streamInfo || !streamInfo.hls) {
    const srvNorm = (chosen.serverName || "").toLowerCase().replace(/[\s-_]+/g, "");
    const sameServerCandidates = matching.filter(
      (s: any) =>
        s.serverName?.toLowerCase() === chosen.serverName?.toLowerCase() ||
        (s.serverName || "").toLowerCase().replace(/[\s-_]+/g, "") === srvNorm
    );
    let lastErr: any = null;
    for (const cand of sameServerCandidates) {
      try {
        streamInfo = await decryptFlixStream(cand.access_id, cand.version || 1);
        if (streamInfo && streamInfo.hls) {
          chosen = cand;
          break;
        }
      } catch (e: any) {
        lastErr = e;
      }
    }
    if (!streamInfo || !streamInfo.hls) {
      // Fallback 1: Try ANY other server in the matching audio type
      for (const alt of matching) {
        if (sameServerCandidates.includes(alt)) continue;
        try {
          const altStream = await decryptFlixStream(alt.access_id, alt.version || 1);
          if (altStream && altStream.hls) {
            chosen = alt;
            streamInfo = altStream;
            break;
          }
        } catch (e: any) {
          lastErr = e;
        }
      }
    }

    if (!streamInfo || !streamInfo.hls) {
      // Fallback 2: Try ANY other server across all audio types
      for (const alt of srvData.servers) {
        if (matching.includes(alt) || sameServerCandidates.includes(alt)) continue;
        try {
          const altStream = await decryptFlixStream(alt.access_id, alt.version || 1);
          if (altStream && altStream.hls) {
            chosen = alt;
            streamInfo = altStream;
            audioFallback = true;
            break;
          }
        } catch (e: any) {
          lastErr = e;
        }
      }
    }

    if (!streamInfo || !streamInfo.hls) {
      if (allDecrypted.length > 0) {
        streamInfo = allDecrypted[0];
      } else {
        throw new Error(
          `Failed to decrypt stream for ${chosen.serverName}: ${lastErr?.message || "No stream available"}`
        );
      }
    }
  }

  return {
    anime: {
      title: anime?.title || (targetAnilistId ? `AniList ${targetAnilistId}` : "Anime"),
      slug: anime?.slug || String(targetAnilistId || ""),
      anilist_id: targetAnilistId || anime?.anilist_id || null,
      cover_image: anime?.cover_image || null,
    },
    episode: {
      number: targetEpNum,
      title: epInfo?.title || `Episode ${targetEpNum}`,
      title_romanji: epInfo?.title_romanji || "",
      thumbnail: epInfo?.thumbnail || anime?.cover_image || null,
      duration: epInfo?.duration || 24,
      aired: epInfo?.aired || null,
    },
    search_mode: targetAnilistId ? "anilist" : "name",
    requested_audio: desiredType,
    audio: chosen.dataType,
    audio_fallback: audioFallback,
    has_dub: hasDubServers,
    has_sub: hasSubServers,
    server: chosen.serverName,
    access_id: chosen.access_id,
    version: chosen.version || 2,
    hls: streamInfo.hls,
    pk: streamInfo.pk,
    subtitles: streamInfo.subtitles || [],
    all_servers: isAllServers ? allDecrypted : null,
    available_servers: srvData.servers.map((s: any) => ({
      server: s.serverName,
      audio: s.dataType,
      access_id: s.access_id,
      version: s.version,
    })),
  };
}

// ---------- Import & AniList ID Extraction Helpers ----------

export function extractReanimeSlug(target: string | number): string {
  if (!target) return "";
  const str = String(target).trim();
  const urlMatch = str.match(/reanime\.to\/anime\/([a-zA-Z0-9_-]+)/i);
  if (urlMatch) return urlMatch[1];
  return str;
}

export function extractAnilistIdFromCover(coverUrl?: string | null): number | null {
  if (!coverUrl || typeof coverUrl !== "string") return null;
  const match = coverUrl.match(/(?:bx|nx|medium\/|large\/)(\d+)(?:-|\.|\/|$)/);
  return match ? parseInt(match[1], 10) : null;
}

export interface ReanimeImportItem {
  id: string;
  anilistId?: number;
  malId?: number;
  slug: string;
  title: string;
  romajiTitle?: string | null;
  nativeTitle?: string | null;
  description: string;
  coverImage?: string | null;
  bannerImage?: string | null;
  format: string;
  status: string;
  episodesCount: number;
  duration?: number;
  genres: string[];
  averageScore?: number | null;
  seasonYear?: number | null;
  season?: string | null;
  anilistUrl?: string | null;
}

export function resolveReanimeStatusAndEpisodes(item: any) {
  const rawStatus = String(item.status || "").trim().toLowerCase();
  const format = String(item.format || "TV").toUpperCase();
  const isMovie = format === "MOVIE";
  const isSingleEp = isMovie || format === "OVA" || format === "SPECIAL" || format === "MUSIC";
  const subbed = typeof item.subbed === "number" ? item.subbed : 0;
  const lastEp = typeof item.last_episode === "number" ? item.last_episode : 0;
  const availableStreams = Math.max(subbed, lastEp);

  const currentYear = new Date().getFullYear();
  const itemYear = item.season_year || (item.start_date?.year ? Number(item.start_date.year) : null);
  const isPastRelease = Boolean(itemYear && itemYear < currentYear);

  const isFinished = rawStatus === "finished" || (isPastRelease && isSingleEp);
  const isExplicitUpcoming =
    rawStatus.includes("not yet") ||
    rawStatus.includes("upcoming") ||
    rawStatus.includes("not_yet") ||
    rawStatus === "unreleased";

  const hasZeroStreams = availableStreams === 0;
  const isUpcoming = !isPastRelease && (isExplicitUpcoming || (!isFinished && hasZeroStreams && item.can_watch === false));

  const status = isFinished ? "FINISHED" : isUpcoming ? "NOT_YET_RELEASED" : "RELEASING";
  const totalPlanned = item.episodes || item.episodes_total || (isSingleEp ? 1 : null);

  let airedEpisodes = 0;
  if (isFinished) {
    airedEpisodes = totalPlanned || availableStreams || (isSingleEp ? 1 : 0);
  } else if (!isUpcoming) {
    airedEpisodes = availableStreams > 0 ? availableStreams : (isSingleEp ? 1 : 0);
  }

  const episodesCount = airedEpisodes;

  return {
    status,
    isUpcoming,
    isFinished,
    airedEpisodes,
    episodesCount,
    totalPlanned,
  };
}

export async function searchReanimeForImport(
  query: string,
  page = 1,
  limit = 20
): Promise<ReanimeImportItem[]> {
  const cleanTarget = extractReanimeSlug(query);
  const offset = (Math.max(page, 1) - 1) * limit;

  // Direct slug lookup if target ends with Reanime slug suffix (-[a-z0-9]{6})
  if (/-[a-z0-9]{6}$/.test(cleanTarget)) {
    try {
      const { data } = await client.get(`/api/v1/anime/${cleanTarget}`);
      if (data && (data.anime_id || data.anilist_id)) {
        const cover = data.cover_image?.extra_large || data.cover_image?.large || data.cover_image?.medium || null;
        const anilistId = data.anilist_id || extractAnilistIdFromCover(cover) || undefined;
        const statusInfo = resolveReanimeStatusAndEpisodes(data);
        return [
          {
            id: String(anilistId || data.anime_id || cleanTarget),
            anilistId,
            malId: data.mal_id || data.myanimelist_id || undefined,
            slug: data.anime_id || cleanTarget,
            title: data.title?.english || data.title?.user_preferred || data.title?.romaji || cleanTarget,
            romajiTitle: data.title?.romaji || null,
            nativeTitle: data.title?.native || null,
            description: data.description ? data.description.replace(/<[^>]*>?/gm, "").trim() : "",
            coverImage: cover,
            bannerImage: data.banner_image || cover,
            format: (data.format || "TV").toUpperCase(),
            status: statusInfo.status,
            episodesCount: statusInfo.episodesCount,
            duration: data.duration ? parseInt(data.duration, 10) : 24,
            genres: (data.genres || []).map((g: any) => (typeof g === "string" ? g : g.name)),
            averageScore: data.average_score || null,
            seasonYear: data.season_year || data.start_date?.year || null,
            season: data.season || null,
            anilistUrl: anilistId ? `https://anilist.co/anime/${anilistId}` : null,
          },
        ];
      }
    } catch {}
  }

  const { data } = await client.get("/api/v1/search", {
    params: { q: cleanTarget, limit, offset },
  });

  const items = data?.results || (Array.isArray(data) ? data : []);

  return items.map((item: any) => {
    const rawCover =
      item.cover_image?.extra_large ||
      item.cover_image?.large ||
      item.cover_image?.medium ||
      (typeof item.cover_image === "string" ? item.cover_image : null);

    const anilistId = item.anilist_id || extractAnilistIdFromCover(rawCover) || undefined;
    const statusInfo = resolveReanimeStatusAndEpisodes(item);

    return {
      id: String(anilistId || item.anime_id),
      anilistId,
      malId: item.mal_id || undefined,
      slug: item.anime_id,
      title: item.title?.english || item.title?.user_preferred || item.title?.romaji || "Unknown Title",
      romajiTitle: item.title?.romaji || null,
      nativeTitle: item.title?.native || null,
      description: item.description ? item.description.replace(/<[^>]*>?/gm, "").trim() : "",
      coverImage: rawCover,
      bannerImage: item.banner_image || rawCover,
      format: (item.format || "TV").toUpperCase(),
      status: statusInfo.status,
      episodesCount: statusInfo.episodesCount,
      duration: item.duration ? parseInt(item.duration, 10) : 24,
      genres: Array.isArray(item.genres)
        ? item.genres
        : typeof item.genres === "string"
        ? item.genres.split(",")
        : [],
      averageScore: item.average_score || null,
      seasonYear: item.season_year || null,
      season: item.season || null,
      anilistUrl: anilistId ? `https://anilist.co/anime/${anilistId}` : null,
    };
  });
}

export async function getReanimeAnimeDetailsForImport(target: string | number): Promise<{
  primary: ReanimeImportItem;
  seasons: Array<{
    id: string;
    relationType: string;
    title: string;
    romajiTitle?: string | null;
    format: string;
    status?: string;
    episodesCount: number;
    coverImage?: string | null;
    bannerImage?: string | null;
    description?: string | null;
    seasonYear?: number | null;
    averageScore?: number | null;
    genres?: string[];
    seasonNumber: number;
    malId?: number;
    anilistId?: number;
    slug?: string;
  }>;
} | null> {
  const cleanTarget = extractReanimeSlug(target);
  let resolvedSlug = cleanTarget;

  if (/^\d+$/.test(cleanTarget)) {
    const resolved = await resolveAnimeSlug(null, parseInt(cleanTarget, 10));
    if (resolved?.slug) resolvedSlug = resolved.slug;
  } else if (!/-[a-z0-9]{6}$/.test(cleanTarget)) {
    const resolved = await resolveAnimeSlug(cleanTarget);
    if (resolved?.slug) resolvedSlug = resolved.slug;
  }

  const data = await fetchWithRetry(`/api/v1/anime/${resolvedSlug}`);
  if (!data) return null;

  const primaryCover = data.cover_image?.extra_large || data.cover_image?.large || data.cover_image?.medium || null;
  const primaryBanner = data.banner_image || primaryCover;
  const primaryTitle = data.title?.english || data.title?.user_preferred || data.title?.romaji || "Unknown Title";
  const primaryAnilistId = data.anilist_id || extractAnilistIdFromCover(primaryCover) || undefined;
  const primaryMalId = data.mal_id || data.myanimelist_id || undefined;
  const primaryStatusInfo = resolveReanimeStatusAndEpisodes(data);
  const primaryEpisodes = primaryStatusInfo.episodesCount;
  const primaryFormat = (data.format || "TV").toUpperCase();
  const primaryDesc = data.description ? data.description.replace(/<[^>]*>?/gm, "").trim() : "";
  const primaryGenres = (data.genres || []).map((g: any) => (typeof g === "string" ? g : g.name));

  const primaryItem: ReanimeImportItem = {
    id: String(primaryAnilistId || data.anime_id || resolvedSlug),
    anilistId: primaryAnilistId,
    malId: primaryMalId,
    slug: data.anime_id || resolvedSlug,
    title: primaryTitle,
    romajiTitle: data.title?.romaji || null,
    nativeTitle: data.title?.native || null,
    description: primaryDesc,
    coverImage: primaryCover,
    bannerImage: primaryBanner,
    format: primaryFormat,
    status: primaryStatusInfo.status,
    episodesCount: primaryEpisodes,
    duration: data.duration ? parseInt(data.duration, 10) : 24,
    genres: primaryGenres,
    averageScore: data.average_score || null,
    seasonYear: data.season_year || data.start_date?.year || null,
    season: data.season || null,
    anilistUrl: primaryAnilistId ? `https://anilist.co/anime/${primaryAnilistId}` : null,
  };

  const seasonsList = [
    {
      id: primaryItem.id,
      relationType: "Main Season (Season 1)",
      title: primaryTitle,
      romajiTitle: primaryItem.romajiTitle,
      format: primaryFormat,
      status: primaryStatusInfo.status,
      episodesCount: primaryEpisodes,
      coverImage: primaryCover,
      bannerImage: primaryBanner,
      description: primaryDesc,
      seasonYear: primaryItem.seasonYear,
      averageScore: primaryItem.averageScore,
      genres: primaryGenres,
      seasonNumber: 1,
      malId: primaryMalId,
      anilistId: primaryAnilistId,
      slug: data.anime_id || resolvedSlug,
    },
  ];

  const validFormats = ["TV", "MOVIE", "OVA", "ONA", "SPECIAL"];
  const rawRelations = data.relations || [];

  // Pre-filter valid relations
  const validRelations = rawRelations.filter((rel: any) => {
    const relFormat = (rel.format || "TV").toUpperCase();
    return validFormats.includes(relFormat);
  });

  // Resolve missing details/anilist_id for relations asynchronously
  const resolvedRelations = await Promise.all(
    validRelations.map(async (rel: any) => {
      let relFormat = (rel.format || "TV").toUpperCase();
      const relCover = rel.cover_image?.extra_large || rel.cover_image?.large || rel.cover_image?.medium || null;
      let relBanner = rel.banner_image || rel.bannerImage || null;
      let relAnilistId = rel.anilist_id || extractAnilistIdFromCover(relCover) || undefined;
      let relMalId = rel.mal_id || rel.myanimelist_id || undefined;
      let relTitle = rel.title?.english || rel.title?.user_preferred || rel.title?.romaji;
      let relDesc = rel.description || null;
      let relYear = rel.season_year || null;
      let relStatus = rel.status || undefined;
      let relSubbed = typeof rel.subbed === "number" ? rel.subbed : undefined;
      let relLastEp = typeof rel.last_episode === "number" ? rel.last_episode : undefined;
      let relEpisodes = typeof rel.episodes === "number" ? rel.episodes : undefined;
      let relScore = typeof rel.average_score === "number" ? rel.average_score : undefined;
      let relGenres = rel.genres || undefined;

      // Always fetch Re:ANIME anime endpoint to obtain accurate status, stream counts, and episode counts
      let targetAnimeId = rel.anime_id;
      if (!targetAnimeId && relAnilistId) {
        try {
          const resolved = await resolveAnimeSlug(null, relAnilistId);
          if (resolved?.slug) targetAnimeId = resolved.slug;
        } catch {}
      }

      if (targetAnimeId) {
        try {
          const { data: relDetail } = await client.get(`/api/v1/anime/${targetAnimeId}`);
          if (relDetail) {
            const detailCover =
              relDetail.cover_image?.extra_large ||
              relDetail.cover_image?.large ||
              relDetail.cover_image?.medium ||
              null;
            relAnilistId = relDetail.anilist_id || extractAnilistIdFromCover(detailCover) || relAnilistId;
            relMalId = relDetail.mal_id || relDetail.myanimelist_id || relMalId;
            if (relDetail.format) relFormat = (relDetail.format || relFormat).toUpperCase();
            if (relDetail.banner_image || relDetail.bannerImage) {
              relBanner = relDetail.banner_image || relDetail.bannerImage;
            }
            if (relDetail.title) {
              relTitle =
                relDetail.title?.english ||
                relDetail.title?.user_preferred ||
                relDetail.title?.romaji ||
                relTitle;
            }
            if (relDetail.description && !relDesc) {
              relDesc = relDetail.description.replace(/<[^>]*>?/gm, "").trim();
            }
            if (relDetail.season_year && !relYear) {
              relYear = relDetail.season_year;
            }
            if (relDetail.status) relStatus = relDetail.status;
            if (typeof relDetail.subbed === "number") relSubbed = relDetail.subbed;
            if (typeof relDetail.last_episode === "number") relLastEp = relDetail.last_episode;
            if (typeof relDetail.episodes === "number") relEpisodes = relDetail.episodes;
            if (typeof relDetail.average_score === "number") relScore = relDetail.average_score;
            if (relDetail.genres && relDetail.genres.length > 0) {
              relGenres = relDetail.genres.map((g: any) => (typeof g === "string" ? g : g.name));
            }
          }
        } catch {}
      }

      // Secondary fallback resolution: Query AniList by title
      if (!relAnilistId && relTitle) {
        try {
          const aniMatch = await resolveAnimeIds(relTitle, null, relMalId);
          if (aniMatch?.anilistId) {
            relAnilistId = aniMatch.anilistId;
            if (aniMatch.malId && !relMalId) relMalId = aniMatch.malId;
          }
        } catch {}
      }

      return {
        ...rel,
        format: relFormat,
        anilist_id: relAnilistId,
        mal_id: relMalId,
        resolved_title: relTitle,
        description: relDesc,
        season_year: relYear,
        banner_image: relBanner,
        cover_image: rel.cover_image,
        status: relStatus,
        subbed: relSubbed,
        last_episode: relLastEp,
        episodes: relEpisodes,
        average_score: relScore,
        genres: relGenres,
      };
    })
  );

  let seasonCounter = 2;
  for (const rel of resolvedRelations) {
    const relFormat = rel.format;
    const relCover = rel.cover_image?.extra_large || rel.cover_image?.large || rel.cover_image?.medium || null;
    let relAnilistId = rel.anilist_id;

    // Do NOT inherit primaryAnilistId if this is a separate movie/special/OVA
    if (primaryAnilistId && relAnilistId === primaryAnilistId && relFormat !== primaryFormat) {
      relAnilistId = undefined;
    }

    // Skip self-reference to primary anime
    if (
      (primaryAnilistId && relAnilistId === primaryAnilistId) ||
      (rel.anime_id && rel.anime_id === (data.anime_id || resolvedSlug)) ||
      (rel.id && String(rel.id) === String(primaryItem.id))
    ) {
      continue;
    }

    const relId = String(relAnilistId || rel.anime_id || rel.id);
    if (!relId || seasonsList.some((s) => s.id === relId || (relAnilistId && s.anilistId === relAnilistId))) {
      continue;
    }

    const relStatusInfo = resolveReanimeStatusAndEpisodes(rel);

    const relationLabel =
      rel.relation_type === "SEQUEL"
        ? `Season ${seasonCounter} (Sequel)`
        : rel.relation_type === "PREQUEL"
        ? "Prequel"
        : rel.relation_type === "SUMMARY" || relFormat === "MOVIE"
        ? "Movie"
        : rel.relation_type === "SPIN_OFF"
        ? "Spin-off"
        : `Season ${seasonCounter}`;

    let relTitle = rel.resolved_title || rel.title?.english || rel.title?.user_preferred || rel.title?.romaji;
    if (!relTitle || relTitle.trim().toLowerCase() === primaryTitle.trim().toLowerCase()) {
      relTitle = `${primaryTitle} (${relationLabel})`;
    }

    const seasonBanner = rel.banner_image || relCover || primaryBanner;

    seasonsList.push({
      id: relId,
      relationType: relationLabel,
      title: relTitle,
      romajiTitle: rel.title?.romaji || null,
      format: relFormat,
      status: relStatusInfo.status,
      episodesCount: relStatusInfo.episodesCount,
      coverImage: relCover || primaryCover,
      bannerImage: seasonBanner,
      description: rel.description || primaryDesc,
      seasonYear: rel.season_year || null,
      averageScore: rel.average_score || data.average_score || null,
      genres: rel.genres || primaryGenres,
      seasonNumber: rel.relation_type === "SEQUEL" ? seasonCounter++ : seasonCounter,
      malId: rel.mal_id || undefined,
      anilistId: relAnilistId,
      slug: rel.anime_id,
    });
  }

  return {
    primary: primaryItem,
    seasons: seasonsList,
  };
}

// ---------- Home & Backdrop Fetching ----------

export interface ReanimeHomeData {
  trending: Array<{
    anime_id: string;
    title: {
      english?: string;
      romaji?: string;
      native?: string;
      user_preferred?: string;
    };
    description?: string;
    cover_image?: {
      extra_large?: string;
      large?: string;
      medium?: string;
      color?: string;
    };
    banner_image?: string;
    clearart?: string;
    format?: string;
    status?: string;
    episodes?: number;
    subbed?: number;
    dubbed?: number;
    average_score?: number;
    season_year?: number;
    season?: string;
    genres?: string[];
  }>;
  latest_aired?: any[];
  new_on_site?: any[];
  upcoming?: any[];
}

let homeCache: { data: ReanimeHomeData; timestamp: number } | null = null;
const HOME_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function getReanimeHome(): Promise<ReanimeHomeData | null> {
  const now = Date.now();
  if (homeCache && now - homeCache.timestamp < HOME_CACHE_TTL) {
    return homeCache.data;
  }

  if (isReanimeCloudflareBlocked()) {
    return homeCache ? homeCache.data : null;
  }

  try {
    const data = await fetchWithRetry("/api/v1/home", { timeout: 8000 });
    if (data && data.trending) {
      homeCache = { data, timestamp: now };
      return data;
    }
  } catch {}

  return homeCache ? homeCache.data : null;
}

export async function getReanimeTrending(): Promise<ReanimeHomeData["trending"]> {
  const home = await getReanimeHome();
  return home?.trending || [];
}

const reanimeBackdropCache = new Map<string, { url: string | null; timestamp: number }>();

export async function getReanimeBackdrop(target: string | number): Promise<string | null> {
  if (!target) return null;
  const key = String(target).toLowerCase().trim();
  const cached = reanimeBackdropCache.get(key);
  if (cached && Date.now() - cached.timestamp < HOME_CACHE_TTL) {
    return cached.url;
  }

  if (isReanimeCloudflareBlocked()) {
    return null;
  }

  try {
    // 1. Check if it's already in the cached trending list
    const trending = await getReanimeTrending();
    const foundInTrending = trending.find((t) => {
      const eng = (t.title?.english || "").toLowerCase();
      const rom = (t.title?.romaji || "").toLowerCase();
      const usr = (t.title?.user_preferred || "").toLowerCase();
      return eng === key || rom === key || usr === key || t.anime_id.toLowerCase().includes(key);
    });

    if (foundInTrending?.banner_image) {
      let banner = foundInTrending.banner_image;
      if (banner.includes("/w1280/")) {
        banner = banner.replace("/w1280/", "/original/");
      }
      reanimeBackdropCache.set(key, { url: banner, timestamp: Date.now() });
      return banner;
    }

    // 2. Search Reanime
    const searchRes = await fetchWithRetry(`/api/v1/search?q=${encodeURIComponent(String(target))}&limit=5`, {
      timeout: 6000,
    });
    const results = searchRes?.results || [];
    if (results.length > 0) {
      const best = results[0];
      if (best.banner_image) {
        let banner = best.banner_image;
        if (banner.includes("/w1280/")) {
          banner = banner.replace("/w1280/", "/original/");
        }
        reanimeBackdropCache.set(key, { url: banner, timestamp: Date.now() });
        return banner;
      }
      if (best.anime_id) {
        const aRes = await fetchWithRetry(`/api/v1/anime/${best.anime_id}`, { timeout: 6000 });
        const banner = aRes?.banner_image || null;
        if (banner) {
          const finalBanner = banner.includes("/w1280/")
            ? banner.replace("/w1280/", "/original/")
            : banner;
          reanimeBackdropCache.set(key, { url: finalBanner, timestamp: Date.now() });
          return finalBanner;
        }
      }
    }
  } catch {}

  reanimeBackdropCache.set(key, { url: null, timestamp: Date.now() });
  return null;
}

