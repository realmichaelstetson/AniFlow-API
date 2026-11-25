import axios from "axios";
import http from "http";
import https from "https";
import { getOutboundHttpAgent, getOutboundHttpsAgent, hasOutboundProxy, resilientFetch } from "./proxy-agent";
import { cleanAudioParam, normalizeLanguage, type NormalizedLanguage } from "./vidly-lang";
export { cleanAudioParam, normalizeLanguage, type NormalizedLanguage };

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 30, timeout: 15000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 30, timeout: 15000 });
const http4Agent = new http.Agent({ keepAlive: true, maxSockets: 30, timeout: 15000, family: 4 } as any);
const https4Agent = new https.Agent({ keepAlive: true, maxSockets: 30, timeout: 15000, family: 4 } as any);
const vidlyAxios = axios.create({ httpAgent, httpsAgent, timeout: 12000 });
const vidlyAxios4 = axios.create({ httpAgent: http4Agent, httpsAgent: https4Agent, timeout: 12000 });

const OUTBOUND_PROXY_URL =
  process.env.OUTBOUND_PROXY_URL ||
  process.env.PROXY_URL ||
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  "";

const VIDLY_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const VIDLY_SEC_CH_UA = '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"';

let gotScrapingFn: any = null;
let ipv4Unsupported = false;

async function getGotScraping() {
  if (!gotScrapingFn) {
    try {
      const mod: any = await import("got-scraping");
      gotScrapingFn = mod.gotScraping || mod.default?.gotScraping || mod.default || mod;
    } catch {}
  }
  return gotScrapingFn;
}

const TR_SECRET = "vY7#qL2!mZ9@wK4$";

export interface VidlyAudioTrack {
  id: string;
  name: string;
  label: string;
  lang: string;
  countryCode: string;
  flag: string;
  default?: boolean;
}

export interface VidlySubtitle {
  id: string;
  language: string;
  label: string;
  url: string;
  direct_url: string;
  countryCode: string;
  flag: string;
  default?: boolean;
}

export interface VidlyKatanaSource {
  id: string;
  server: string;
  name: string;
  serverName: string;
  type: "SUB" | "DUB";
  audio: "sub" | "dub";
  videoUrl: string;
  m3u8: string;
  directUrl: string;
  quality: string;
  isHls: boolean;
  isHevc?: boolean;
  audioTracks: VidlyAudioTrack[];
  subtitles: VidlySubtitle[];
  hasDub?: boolean;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  language?: string;
}

export interface VidlyMediaMeta {
  kind: "movie" | "tv";
  tmdbId: number;
  season?: number;
  episode?: number;
  title: string;
  subtitle?: string;
  year?: string;
  poster?: string | null;
  backdrop?: string | null;
  overview?: string;
  logo?: string;
  rating?: number;
  runtime?: number;
  certification?: string;
}

const vidlyCache = new Map<string, { data: VidlyKatanaSource[]; expiresAt: number }>();
const vidlyMediaCache = new Map<string, { sources: VidlyKatanaSource[]; meta: VidlyMediaMeta | null; expiresAt: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const PARTIAL_CACHE_TTL = 30 * 1000; // 30 seconds for single-source / degraded SSR-only responses

interface VidlyRequestSession {
  tokenObj: Record<string, unknown>;
  cookieJar: Map<string, string>;
}

function createVidlySession(): VidlyRequestSession {
  return { tokenObj: {}, cookieJar: new Map() };
}

function captureVidlyCookies(session: VidlyRequestSession | undefined, setCookieHeader: string | string[] | undefined) {
  if (!session || !setCookieHeader) return;
  const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const raw of list) {
    const semi = raw.indexOf(";");
    const pair = (semi >= 0 ? raw.slice(0, semi) : raw).trim();
    const eq = pair.indexOf("=");
    if (eq > 0) {
      session.cookieJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
}

function formatVidlyCookies(session?: VidlyRequestSession): string | undefined {
  if (!session || session.cookieJar.size === 0) return undefined;
  return Array.from(session.cookieJar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function buildVidlyHeaders(
  mode: "page" | "api" | "manifest",
  referer: string,
  cookieHeader?: string,
  includeOrigin = true
): Record<string, string> {
  if (mode === "page") {
    return {
      "User-Agent": VIDLY_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      Referer: referer,
      "Sec-CH-UA": VIDLY_SEC_CH_UA,
      "Sec-CH-UA-Mobile": "?0",
      "Sec-CH-UA-Platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };
  }
  if (mode === "api") {
    return {
      "User-Agent": VIDLY_USER_AGENT,
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      ...(includeOrigin ? { Origin: "https://vidly.pro" } : {}),
      Referer: referer,
      "Sec-CH-UA": VIDLY_SEC_CH_UA,
      "Sec-CH-UA-Mobile": "?0",
      "Sec-CH-UA-Platform": '"Windows"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };
  }
  return {
    "User-Agent": VIDLY_USER_AGENT,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    ...(includeOrigin ? { Origin: "https://vidly.pro" } : {}),
    Referer: referer,
  };
}

function isCloudflareChallengeHtml(body: string): boolean {
  if (!body) return false;
  return (
    body.includes("Just a moment...") ||
    body.includes("cf-browser-verification") ||
    body.includes("challenge-platform") ||
    body.includes("Attention Required! | Cloudflare")
  );
}

const stripNavHeadersHook = (reqOpts: any) => {
  if (reqOpts?.headers) {
    delete reqOpts.headers["upgrade-insecure-requests"];
    delete reqOpts.headers["sec-fetch-user"];
  }
};

/**
 * Resilient HTTP fetcher for Vidly SSR pages, sealed `/api/sources` JSON, and HLS manifests.
 * Follows `lib/reanime.ts`'s Cloudflare-bypass strategy first (`got-scraping` with `useHeaderGenerator: true`
 * and default IP family — avoiding crowded shared IPv4 NAT pools on datacenter hosts like Koyeb),
 * then rotates browser/IP profiles (Firefox TLS, IPv4, manual headers, axios, fetch) on 403/429/503.
 */
async function fetchVidlyHttp(opts: {
  url: string;
  mode: "page" | "api" | "manifest";
  referer?: string;
  session?: VidlyRequestSession;
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<{ status: number; body: string } | null> {
  const {
    url,
    mode,
    referer = "https://vidly.pro/",
    session,
    timeoutMs = mode === "manifest" ? 5000 : 11000,
    maxRetries = mode === "api" ? 3 : mode === "page" ? 2 : 1,
  } = opts;

  const gotScraping = await getGotScraping();
  let lastResult: { status: number; body: string } | null = null;
  let omitOriginOnRetry = false;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const cookieHeader = formatVidlyCookies(session);
    const manualHeaders = buildVidlyHeaders(mode, referer, cookieHeader, !omitOriginOnRetry);
    let currentRes: { status: number; body: string } | null = null;

    if (gotScraping) {
      // Strategy rotation across attempts:
      // 0: Chrome headerGenerator + default IP (IPv6 on dual-stack hosts like Koyeb, matching reanime.ts)
      // 1: Firefox headerGenerator + default IP (distinct TLS ciphers/sigalgs/HTTP2 header order)
      // 2: Chrome headerGenerator + IPv4 (dnsLookupIpVersion: 4 fallback)
      // 3+: Manual Chrome headers (useHeaderGenerator: false)
      const useFirefox = attempt === 1 && (mode === "api" || mode === "page");
      const forceIpv4 = attempt === 2 && !ipv4Unsupported;
      const useGen = attempt < 3 && (mode === "page" || mode === "api");

      const tryGot = async (preferIpv4: boolean) => {
        const reqOpts: any = {
          url,
          http2: true,
          useHeaderGenerator: useGen,
          throwHttpErrors: false,
          decompress: true,
          retry: { limit: 0 },
          timeout: { request: timeoutMs },
        };

        if (useGen) {
          reqOpts.headerGeneratorOptions = useFirefox
            ? {
                browsers: [{ name: "firefox", minVersion: 120 }],
                operatingSystems: ["windows"],
                devices: ["desktop"],
              }
            : {
                browsers: [{ name: "chrome", minVersion: 128 }],
                operatingSystems: ["windows"],
                devices: ["desktop"],
              };

          if (mode === "api") {
            reqOpts.headers = {
              accept: "*/*",
              origin: "https://vidly.pro",
              referer,
              "sec-fetch-dest": "empty",
              "sec-fetch-mode": "cors",
              "sec-fetch-site": "same-origin",
              ...(cookieHeader ? { cookie: cookieHeader } : {}),
            };
            reqOpts.hooks = { beforeRequest: [stripNavHeadersHook] };
          } else {
            reqOpts.headers = {
              referer,
              ...(cookieHeader ? { cookie: cookieHeader } : {}),
            };
          }

          if (!useFirefox && session?.tokenObj) {
            reqOpts.sessionToken = session.tokenObj;
          }
        } else {
          reqOpts.headers = manualHeaders;
          if (session?.tokenObj) {
            reqOpts.sessionToken = session.tokenObj;
          }
        }

        if (preferIpv4 && !ipv4Unsupported) {
          reqOpts.dnsLookupIpVersion = 4;
        }
        if (OUTBOUND_PROXY_URL) {
          reqOpts.proxyUrl = OUTBOUND_PROXY_URL;
        }

        return await gotScraping(reqOpts);
      };

      try {
        const res = await tryGot(forceIpv4);
        captureVidlyCookies(session, res.headers?.["set-cookie"]);
        const body = typeof res.body === "string" ? res.body : String(res.body ?? "");
        currentRes = { status: Number(res.statusCode || 200), body };
      } catch (err: any) {
        const code = err?.code || err?.cause?.code || "";
        if (forceIpv4 && (code === "ENETUNREACH" || code === "EHOSTUNREACH" || code === "EAI_NONAME")) {
          ipv4Unsupported = true;
          try {
            const res = await tryGot(false);
            captureVidlyCookies(session, res.headers?.["set-cookie"]);
            const body = typeof res.body === "string" ? res.body : String(res.body ?? "");
            currentRes = { status: Number(res.statusCode || 200), body };
          } catch {}
        }
      }
    }

    // Fallback to axios + native fetch if gotScraping errored out or returned non-success on final attempt
    const gotRejected =
      !currentRes ||
      (mode === "api" && !(currentRes.status >= 200 && currentRes.status < 300 && currentRes.body.startsWith("v1."))) ||
      (mode === "page" && (currentRes.status >= 400 || isCloudflareChallengeHtml(currentRes.body)));

    if (!currentRes || (gotRejected && attempt === maxRetries)) {
      try {
        const axiosClient = OUTBOUND_PROXY_URL
          ? axios.create({
              httpAgent: getOutboundHttpAgent(),
              httpsAgent: getOutboundHttpsAgent(),
              timeout: timeoutMs,
            })
          : vidlyAxios;
        const axRes = await axiosClient.get(url, {
          headers: manualHeaders,
          timeout: timeoutMs,
          responseType: "text",
          validateStatus: () => true,
        });
        captureVidlyCookies(session, axRes.headers?.["set-cookie"]);
        const axBody = typeof axRes.data === "string" ? axRes.data : JSON.stringify(axRes.data ?? "");
        const axOk =
          (mode === "api" && axRes.status < 400 && axBody.startsWith("v1.")) ||
          (mode === "page" && axRes.status < 400 && !isCloudflareChallengeHtml(axBody)) ||
          (mode === "manifest" && axRes.status < 400);
        if (!currentRes || axOk) {
          currentRes = { status: axRes.status, body: axBody };
        }
      } catch {}

      if (
        !currentRes ||
        (mode === "api" && !currentRes.body.startsWith("v1.")) ||
        (mode === "page" && (currentRes.status >= 400 || isCloudflareChallengeHtml(currentRes.body)))
      ) {
        try {
          const fRes = await fetch(url, {
            headers: manualHeaders,
            signal: AbortSignal.timeout(timeoutMs),
          });
          const fBody = await fRes.text();
          const fOk =
            (mode === "api" && fRes.ok && fBody.startsWith("v1.")) ||
            (mode === "page" && fRes.ok && !isCloudflareChallengeHtml(fBody)) ||
            (mode === "manifest" && fRes.ok);
          if (!currentRes || fOk) {
            currentRes = { status: fRes.status, body: fBody };
          }
        } catch {}
      }
    }

    if (currentRes) {
      lastResult = currentRes;

      if (mode === "api") {
        if (currentRes.status >= 200 && currentRes.status < 300 && currentRes.body.startsWith("v1.")) {
          return currentRes;
        }
      } else if (mode === "page") {
        if (currentRes.status >= 200 && currentRes.status < 400 && !isCloudflareChallengeHtml(currentRes.body)) {
          return currentRes;
        }
      } else {
        if (currentRes.status >= 200 && currentRes.status < 400) {
          return currentRes;
        }
        if (currentRes.status === 404 || currentRes.status === 410 || currentRes.status === 451) {
          return currentRes;
        }
        if (currentRes.status === 403 && !omitOriginOnRetry) {
          omitOriginOnRetry = true;
        }
      }
    }

    if (attempt < maxRetries) {
      const retryableStatus =
        !currentRes ||
        currentRes.status === 429 ||
        currentRes.status === 503 ||
        currentRes.status === 502 ||
        currentRes.status === 504 ||
        currentRes.status === 403 ||
        (mode === "api" && currentRes.status >= 400);
      if (!retryableStatus) break;
      const baseDelay = mode === "manifest" ? 300 : 450 * (attempt + 1);
      const jitter = Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, baseDelay + jitter));
    }
  }

  // Optional final fallback via configured ScraperAPI / FlareSolverr if page or api remained blocked
  if ((mode === "page" || mode === "api") && hasOutboundProxy() && (!lastResult || lastResult.status >= 400 || isCloudflareChallengeHtml(lastResult.body))) {
    try {
      const cookieHeader = formatVidlyCookies(session);
      const res = await resilientFetch(url, {
        headers: buildVidlyHeaders(mode, referer, cookieHeader, true),
        timeout: timeoutMs,
      });
      if (res?.data && !isCloudflareChallengeHtml(res.data)) {
        return { status: 200, body: res.data };
      }
    } catch {}
  }

  if (mode === "api" && (!lastResult || lastResult.status >= 400 || !lastResult.body.startsWith("v1."))) {
    const snippet = (lastResult?.body || "").replace(/\s+/g, " ").slice(0, 120);
    console.warn(`[vidly] /api/sources failed (${lastResult?.status ?? "no-response"}) for ${url}: ${snippet}`);
  }

  return lastResult;
}

export async function fetchVidlyManifestText(
  directUrl: string,
  timeoutMs = 5000
): Promise<{ status: number; body: string } | null> {
  return fetchVidlyHttp({
    url: directUrl,
    mode: "manifest",
    referer: "https://vidly.pro/",
    timeoutMs,
    maxRetries: 1,
  });
}

function extractVidlyPageData(html: string): { token: string; initialData: any } {
  const tokenMatch = html.match(/\\"token\\":\\"([^"\\]+)\\"/) || html.match(/"token":"([^"]+)"/);
  const token = tokenMatch ? tokenMatch[1] : "";

  let initialData: any = null;
  const v1Matches = [...html.matchAll(/v1\.[a-zA-Z0-9_-]+/g)];
  for (const m of v1Matches) {
    try {
      const parsed = unsealVidlyPayload(m[0]);
      if (parsed.streams && parsed.streams.length > 0 && !parsed.error) {
        initialData = parsed;
        break;
      }
    } catch {}
  }

  return { token, initialData };
}

function parseVidlySealedApiResponse(body: string): any | null {
  if (!body || !body.startsWith("v1.")) return null;
  try {
    const unsealed = unsealVidlyPayload(body);
    if (unsealed.streams && Array.isArray(unsealed.streams) && unsealed.streams.length > 0 && !unsealed.error) {
      return unsealed;
    }
  } catch {}
  return null;
}

async function inspectVidlyManifest(
  directUrl: string,
  timeoutMs: number
): Promise<{
  dead: boolean;
  audioTracks: VidlyAudioTrack[];
  subtitles: Array<{ url: string; language: string; label: string; default?: boolean }>;
  isHevc: boolean;
}> {
  let audioTracks: VidlyAudioTrack[] = [];
  let subtitles: Array<{ url: string; language: string; label: string; default?: boolean }> = [];
  let isHevc = /[_-]h265[_-]|[_-]hevc[_-]/i.test(directUrl);
  let dead = false;

  const m3u8Res = await fetchVidlyManifestText(directUrl, timeoutMs);
  if (!m3u8Res) {
    return { dead: false, audioTracks, subtitles, isHevc };
  }

  const cleanData = (m3u8Res.body || "").replace(/^\uFEFF/, "");
  const trimmed = cleanData.trimStart();
  const lowerHead = trimmed.slice(0, 200).toLowerCase();

  if (m3u8Res.status === 404 || m3u8Res.status === 410 || m3u8Res.status === 451 || m3u8Res.status === 400) {
    return { dead: true, audioTracks, subtitles, isHevc };
  }

  if (m3u8Res.status < 400 && trimmed.startsWith("#EXTM3U")) {
    audioTracks = parseAudioTracksFromM3u8(cleanData);
    subtitles = parseSubtitlesFromM3u8(cleanData, directUrl);
    if (/CODECS="[^"]*(hvc1|hev1)/i.test(cleanData)) isHevc = true;
    return { dead: false, audioTracks, subtitles, isHevc };
  }

  const isTransientOrChallenge =
    m3u8Res.status === 429 ||
    m3u8Res.status === 503 ||
    isCloudflareChallengeHtml(cleanData) ||
    lowerHead.includes("too many requests");

  if (!isTransientOrChallenge) {
    const hasDeadText =
      lowerHead.includes("upstream manifest") ||
      lowerHead.includes("not found") ||
      lowerHead.includes("no such") ||
      lowerHead.includes("expired") ||
      (lowerHead.startsWith("{") && lowerHead.includes("error")) ||
      (m3u8Res.status >= 500 && (lowerHead.startsWith("<") || lowerHead.includes("error")));

    if (hasDeadText || (m3u8Res.status < 400 && (lowerHead.startsWith("<") || lowerHead.startsWith("{")))) {
      dead = true;
    }
  }

  return { dead, audioTracks, subtitles, isHevc };
}

export function unsealVidlyPayload(payload: string): any {
  if (!payload || !payload.startsWith("v1.")) {
    throw new Error("Invalid Vidly payload format");
  }

  const base64 = payload.slice(3).replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = Buffer.from(padded, "base64");
  const t = new Uint8Array(raw);
  const s = t.subarray(0, 12);
  const n = t.slice(12);

  (function (bytes: Uint8Array, keyBytes: Uint8Array) {
    let [sVal, nVal, lVal, aVal] = (function (kb: Uint8Array) {
      const arr: number[] = [];
      for (let i = 0; i < 4; i++) {
        let h = (0x811c9dc5 ^ (0x9e3779b9 * i)) >>> 0;
        for (let j = 0; j < TR_SECRET.length; j++) {
          h = Math.imul(h ^ TR_SECRET.charCodeAt(j), 0x1000193) >>> 0;
        }
        for (let j = 0; j < kb.length; j++) {
          h = Math.imul(h ^ kb[j], 0x1000193) >>> 0;
        }
        arr.push(h);
      }
      return arr;
    })(keyBytes);

    let r = 0;
    for (let i = 0; i < bytes.length; i++) {
      if ((3 & i) === 0) {
        lVal >>>= 0;
        aVal >>>= 0;
        let tmp = ((sVal >>>= 0) + (nVal >>>= 0)) | 0;
        sVal = nVal ^ (nVal >>> 9);
        nVal = (lVal + (lVal << 3)) | 0;
        lVal = ((lVal = (lVal << 21) | (lVal >>> 11)) + (tmp = (tmp + (aVal = (aVal + 1) | 0)) | 0)) | 0;
        r = tmp >>> 0;
      }
      bytes[i] ^= (r >>> ((3 & i) * 8)) & 255;
    }
  })(n, s);

  return JSON.parse(new TextDecoder().decode(n));
}

export function deduplicateSubtitles(subtitles: any[]): VidlySubtitle[] {
  const seenLanguages = new Map<string, VidlySubtitle>();

  // Prioritize cleaner, shorter labels
  const sorted = [...subtitles].sort((a, b) => (a.label || "").length - (b.label || "").length);

  for (const sub of sorted) {
    const rawUrl = sub.url || sub.file || sub.direct_url || "";
    if (!rawUrl) continue;

    const norm = normalizeLanguage(sub.lang || sub.language, sub.label);
    if (!seenLanguages.has(norm.code)) {
      const proxyUrl = rawUrl.startsWith("/api/proxy")
        ? rawUrl
        : `/api/proxy/subtitles?url=${encodeURIComponent(rawUrl)}`;

      seenLanguages.set(norm.code, {
        id: `sub-${norm.code}`,
        language: norm.code,
        label: norm.name,
        countryCode: norm.countryCode,
        flag: norm.flag,
        url: proxyUrl,
        direct_url: rawUrl,
        default: norm.code === "en",
      });
    }
  }

  return Array.from(seenLanguages.values());
}

export function parseAudioTracksFromM3u8(m3u8Content: string): VidlyAudioTrack[] {
  const tracks: VidlyAudioTrack[] = [];
  const lines = m3u8Content.split("\n");
  const seenCodes = new Set<string>();

  for (const line of lines) {
    if (line.startsWith("#EXT-X-MEDIA:") && line.includes("TYPE=AUDIO")) {
      const nameMatch = line.match(/NAME="([^"]+)"/);
      const langMatch = line.match(/LANGUAGE="([^"]+)"/);
      const defaultMatch = line.match(/DEFAULT=(YES|NO)/i);
      const name = nameMatch ? nameMatch[1] : "Audio";
      const lang = langMatch ? langMatch[1] : name.toLowerCase();
      const isDefault = defaultMatch ? defaultMatch[1].toUpperCase() === "YES" : false;
      const norm = normalizeLanguage(lang, name);
      if (!norm.known) continue;

      if (!seenCodes.has(norm.code)) {
        seenCodes.add(norm.code);
        tracks.push({
          id: norm.code,
          name: norm.name,
          label: norm.name,
          lang: norm.code,
          countryCode: norm.countryCode,
          flag: norm.flag,
          default: isDefault,
        });
      }
    }
  }

  return tracks;
}

export function parseSubtitlesFromM3u8(m3u8Content: string, masterUrl: string): Array<{ url: string; language: string; label: string; default?: boolean }> {
  const subs: Array<{ url: string; language: string; label: string; default?: boolean }> = [];
  const lines = m3u8Content.split("\n");

  for (const line of lines) {
    if (line.startsWith("#EXT-X-MEDIA:") && line.includes("TYPE=SUBTITLES")) {
      const nameMatch = line.match(/NAME="([^"]+)"/);
      const langMatch = line.match(/LANGUAGE="([^"]+)"/);
      const uriMatch = line.match(/URI="([^"]+)"/);
      const defaultMatch = line.match(/DEFAULT=(YES|NO)/i);
      if (!uriMatch || !uriMatch[1]) continue;

      let absUri = uriMatch[1];
      try {
        absUri = new URL(uriMatch[1], masterUrl).href;
      } catch {}

      const name = nameMatch ? nameMatch[1] : langMatch ? langMatch[1] : "Subtitle";
      const lang = langMatch ? langMatch[1] : name.toLowerCase();
      const isDefault = defaultMatch ? defaultMatch[1].toUpperCase() === "YES" : false;

      subs.push({
        url: absUri,
        language: lang,
        label: name,
        default: isDefault,
      });
    }
  }

  return subs;
}

export async function fetchVidlyKatanaSource(
  anilistId: number,
  episode: number,
  audio: "sub" | "dub"
): Promise<VidlyKatanaSource | null> {
  const res = await getVidlyKatanaSources(anilistId, episode);
  if (audio === "dub") {
    const dubMatch =
      res.sources.find((s) => s.type === "DUB") ||
      res.sources.find((s) => s.audioTracks?.some((a) => a.id === "en"));
    if (!dubMatch) return null;
    if (!dubMatch.videoUrl.includes("audio=dub") && !dubMatch.videoUrl.includes("audio=en")) {
      const updatedUrl = dubMatch.videoUrl.replace(/([?&])audio=[^&]*/i, "$1audio=en");
      return { ...dubMatch, videoUrl: updatedUrl, m3u8: updatedUrl };
    }
    return dubMatch;
  }
  return res.sources.find((s) => s.id === "katana-sub") || res.sources.find((s) => s.type === "SUB") || res.sources[0] || null;
}

export async function getVidlyKatanaSources(
  anilistId: number,
  episode: number
): Promise<{ sources: VidlyKatanaSource[]; hasDub: boolean }> {
  const cacheKey = `katana_${anilistId}_ep${episode}`;
  const cached = vidlyCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    const hasDub = cached.data.some((s) => s.type === "DUB" || s.hasDub);
    return { sources: cached.data, hasDub };
  }

  const subTargetUrl = `https://vidly.pro/anime/${anilistId}/${episode}/sub`;
  const dubTargetUrl = `https://vidly.pro/anime/${anilistId}/${episode}/dub`;
  const session = createVidlySession();

  try {
    // Fetch both /sub and /dub SSR pages in parallel:
    // - /sub SSR directly embeds `katana-sub` and mints `token` + Cloudflare session cookies.
    // - /dub SSR directly embeds `katana-dub` whenever Dub exists, bypassing `/api/sources` flakiness on datacenter IPs.
    const [subPageRes, dubPageRes] = await Promise.all([
      fetchVidlyHttp({ url: subTargetUrl, mode: "page", referer: "https://vidly.pro/", session }),
      fetchVidlyHttp({ url: dubTargetUrl, mode: "page", referer: "https://vidly.pro/", session }),
    ]);

    const subHtml = subPageRes?.body || "";
    const dubHtml = dubPageRes?.body || "";
    if (!subHtml && !dubHtml) {
      return { sources: [], hasDub: false };
    }

    const subParsed = subHtml ? extractVidlyPageData(subHtml) : { token: "", initialData: null };
    const dubParsed = dubHtml ? extractVidlyPageData(dubHtml) : { token: "", initialData: null };
    const token = subParsed.token || dubParsed.token;
    const subReferer = subParsed.token ? subTargetUrl : dubTargetUrl;

    const ssrByProvider = new Map<string, any>();
    if (subParsed.initialData && (subParsed.initialData.provider?.id === "katana-sub" || !subParsed.initialData.provider?.id)) {
      ssrByProvider.set("katana-sub", subParsed.initialData);
    }
    if (dubParsed.initialData?.provider?.id === "katana-dub") {
      ssrByProvider.set("katana-dub", dubParsed.initialData);
    }

    const providersToFetch = ["katana-sub", "katana-dub", "katana-multi"];

    const streamResults = await Promise.all(
      providersToFetch.map(async (prov, idx): Promise<VidlyKatanaSource | null> => {
        let streamData: any = ssrByProvider.get(prov) || null;
        if (!streamData && token) {
          if (idx > 0) await new Promise((r) => setTimeout(r, idx * 45));
          const apiUrl = `https://vidly.pro/api/sources?kind=anime&provider=${prov}&t=${encodeURIComponent(token)}&anilist=${anilistId}&e=${episode}&audio=sub`;
          const apiRes = await fetchVidlyHttp({
            url: apiUrl,
            mode: "api",
            referer: subReferer,
            session,
            timeoutMs: 10000,
            maxRetries: 3,
          });
          if (apiRes?.body) {
            streamData = parseVidlySealedApiResponse(apiRes.body);
          }
        }

        if (!streamData?.streams?.[0]) return null;
        const stream = streamData.streams[0];
        const directUrl = stream.url;
        if (!directUrl) return null;

        const isDub = prov === "katana-dub";
        const isMulti = prov === "katana-multi";
        const serverName = isMulti ? "Katana Multi" : isDub ? "Katana Dub" : "Katana Sub";
        const audioType: "sub" | "dub" = isDub ? "dub" : "sub";
        const proxyM3u8 = `/api/proxy/m3u8?url=${encodeURIComponent(directUrl)}&audio=${isDub ? "en" : "ja"}`;

        let audioTracks: VidlyAudioTrack[] = [];
        try {
          const m3u8Res = await fetchVidlyManifestText(directUrl, 6500);
          if (m3u8Res && m3u8Res.status < 400 && m3u8Res.body) {
            audioTracks = parseAudioTracksFromM3u8(m3u8Res.body);
          }
        } catch {}

        if (audioTracks.length === 0) {
          audioTracks = isDub
            ? [{ id: "en", name: "English", label: "English", lang: "en", countryCode: "gb", flag: "🇬🇧", default: true }]
            : isMulti
            ? [
                { id: "en", name: "English", label: "English", lang: "en", countryCode: "gb", flag: "🇬🇧", default: true },
                { id: "ja", name: "Japanese", label: "Japanese", lang: "ja", countryCode: "jp", flag: "🇯🇵", default: false },
              ]
            : [{ id: "ja", name: "Japanese", label: "Japanese", lang: "ja", countryCode: "jp", flag: "🇯🇵", default: true }];
        }

        const dedupedSubs = deduplicateSubtitles(stream.subtitles || []);

        return {
          id: prov,
          server: serverName,
          name: serverName,
          serverName,
          type: isDub ? "DUB" : "SUB",
          audio: audioType,
          videoUrl: proxyM3u8,
          m3u8: proxyM3u8,
          directUrl,
          quality: stream.quality || "1080p",
          isHls: true,
          audioTracks,
          subtitles: dedupedSubs,
          hasDub: isDub || audioTracks.some((a) => a.id !== "ja"),
        };
      })
    );

    const sources: VidlyKatanaSource[] = streamResults.filter((s): s is VidlyKatanaSource => s !== null);
    const hasDub = sources.some((s) => s.type === "DUB" || s.hasDub);

    if (sources.length > 0) {
      const ttl = sources.length >= 2 || hasDub ? CACHE_TTL : PARTIAL_CACHE_TTL * 3;
      vidlyCache.set(cacheKey, { data: sources, expiresAt: Date.now() + ttl });
    }

    return { sources, hasDub };
  } catch (err: any) {
    console.warn(`[vidly] Failed to fetch Katana sources for anilist ${anilistId} ep ${episode}:`, err?.message || err);
    return { sources: [], hasDub: false };
  }
}

export function extractVidlyMeta(
  html: string,
  kind: "movie" | "tv",
  tmdbId: number,
  season?: number,
  episode?: number
): VidlyMediaMeta {
  let title = "";
  let year = "";
  let poster = "";
  let backdrop = "";
  let overview = "";
  let subtitle = "";

  const titleTagMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleTagMatch) {
    const raw = titleTagMatch[1].replace(/·\s*Vidly/i, "").trim();
    const ym = raw.match(/^(.*?)(?:\s*\((19\d\d|20\d\d)\))?$/);
    if (ym) {
      title = ym[1].trim();
      if (ym[2]) year = ym[2];
    } else {
      title = raw;
    }
  }

  const mediaMetaMatch = html.match(/\\?"media\\?":\s*\{[^}]*},\s*\\?"meta\\?":\s*\{([^}]+)\}/);
  if (mediaMetaMatch) {
    const body = mediaMetaMatch[1];
    const getField = (f: string) => {
      const m = body.match(new RegExp(`\\\\?"${f}\\\\?":\\\\?"([^"\\\\]+)\\\\?"`));
      return m ? m[1] : "";
    };
    if (getField("title")) title = getField("title");
    if (getField("year")) year = getField("year");
    if (getField("poster")) poster = getField("poster");
    if (getField("backdrop")) backdrop = getField("backdrop");
    if (getField("overview")) overview = getField("overview");
    if (getField("subtitle")) subtitle = getField("subtitle");
  }

  if (!title) {
    title = kind === "movie" ? `Movie ${tmdbId}` : `TV Show ${tmdbId}`;
  }

  return {
    kind,
    tmdbId,
    season,
    episode,
    title,
    subtitle: subtitle || (season && episode ? `S${season} · E${episode}` : undefined),
    year: year || undefined,
    poster: poster || null,
    backdrop: backdrop || null,
    overview: overview || undefined,
  };
}

function finalizeVidlyMediaSources(
  rawSources: VidlyKatanaSource[],
  normPref: { code: string; name: string } | null,
  primaryServerId: string
): VidlyKatanaSource[] {
  const bestFallbackSubs =
    rawSources.find((s) => s.subtitles && s.subtitles.length > 0)?.subtitles || [];

  const cloned = rawSources.map((s) => {
    const hasPref = Boolean(normPref && s.audioTracks.some((t) => t.id === normPref.code));
    const audioCode = hasPref
      ? normPref!.code
      : s.audioTracks.find((t) => t.default)?.id || s.audioTracks[0]?.id || "en";
    const proxyM3u8 = `/api/proxy/m3u8?url=${encodeURIComponent(s.directUrl)}&audio=${encodeURIComponent(audioCode)}`;
    const subs = s.subtitles && s.subtitles.length > 0 ? s.subtitles : bestFallbackSubs;
    return {
      ...s,
      videoUrl: proxyM3u8,
      m3u8: proxyM3u8,
      subtitles: subs,
    };
  });

  cloned.sort((a, b) => {
    if (normPref) {
      const aHas = a.audioTracks.some((t) => t.id === normPref.code);
      const bHas = b.audioTracks.some((t) => t.id === normPref.code);
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
    }
    const aHevc = a.isHevc ? 1 : 0;
    const bHevc = b.isHevc ? 1 : 0;
    if (aHevc !== bHevc) return aHevc - bHevc;
    if (a.id === primaryServerId && b.id !== primaryServerId) return -1;
    if (b.id === primaryServerId && a.id !== primaryServerId) return 1;
    return 0;
  });

  return cloned;
}

async function buildVidlyMediaStreamSource(
  srv: { id: string; label: string; tag?: string },
  st: any,
  idx: number,
  totalStreams: number,
  unsealedSubtitles: any[],
  normPref: { code: string; name: string } | null
): Promise<VidlyKatanaSource | null> {
  const directUrl = st?.url;
  if (!directUrl) return null;

  const parsedLang = st.language ? normalizeLanguage(st.language, st.label) : null;
  const langObj = parsedLang && parsedLang.known ? parsedLang : null;

  const manifest = await inspectVidlyManifest(directUrl, totalStreams === 1 ? 6000 : 4500);
  if (manifest.dead) {
    return null;
  }

  const audioTracks: VidlyAudioTrack[] =
    manifest.audioTracks.length > 0
      ? manifest.audioTracks
      : langObj
      ? [
          {
            id: langObj.code,
            name: langObj.name,
            label: langObj.name,
            lang: langObj.code,
            countryCode: langObj.countryCode,
            flag: langObj.flag,
            default: true,
          },
        ]
      : [{ id: "en", name: "English", label: "English", lang: "en", countryCode: "gb", flag: "🇬🇧", default: true }];

  const srvName = `${srv.label}${totalStreams > 1 ? ` #${idx + 1}` : ""}${langObj ? ` (${langObj.name})` : ""}`;
  const srvId = `${srv.id}${totalStreams > 1 ? `-${idx + 1}` : ""}`;
  const hasPref = Boolean(normPref && audioTracks.some((a) => a.id === normPref.code));
  const targetAudioCode = hasPref ? normPref!.code : audioTracks[0]?.id || "en";
  const proxyM3u8 = `/api/proxy/m3u8?url=${encodeURIComponent(directUrl)}&audio=${encodeURIComponent(targetAudioCode)}`;

  const dedupedSubs = deduplicateSubtitles([
    ...(st.subtitles || []),
    ...(unsealedSubtitles || []),
    ...manifest.subtitles,
  ]);

  const primaryCode = audioTracks[0]?.id || "en";
  return {
    id: srvId,
    server: srv.label,
    name: srvName,
    serverName: srvName,
    type: primaryCode === "ja" ? "SUB" : "DUB",
    audio: primaryCode === "ja" ? "sub" : "dub",
    videoUrl: proxyM3u8,
    m3u8: proxyM3u8,
    directUrl,
    quality: st.quality || "1080p",
    isHls: true,
    isHevc: manifest.isHevc,
    audioTracks,
    subtitles: dedupedSubs,
    hasDub: audioTracks.some((a) => a.id !== "ja"),
    language: langObj?.name || audioTracks[0]?.name,
  };
}

async function fetchVidlyMediaSourcesShared(opts: {
  kind: "movie" | "tv";
  tmdbId: number;
  season?: number;
  episode?: number;
  preferredAudio?: string;
  forceRefresh?: boolean;
}): Promise<{ sources: VidlyKatanaSource[]; meta: VidlyMediaMeta | null }> {
  const { kind, tmdbId, season, episode, preferredAudio, forceRefresh } = opts;
  const primaryServerId = kind === "movie" ? "singularity" : "evion";
  const normPref = preferredAudio ? cleanAudioParam(preferredAudio) : null;
  const cacheKey = kind === "movie" ? `movie_${tmdbId}` : `tv_${tmdbId}_s${season}_e${episode}`;
  const cached = !forceRefresh ? vidlyMediaCache.get(cacheKey) : undefined;
  if (cached && Date.now() < cached.expiresAt && cached.sources.length > 0) {
    return {
      sources: finalizeVidlyMediaSources(cached.sources, normPref, primaryServerId),
      meta: cached.meta,
    };
  }

  let meta: VidlyMediaMeta | null = null;
  const targetUrl =
    kind === "movie" ? `https://vidly.pro/movie/${tmdbId}` : `https://vidly.pro/tv/${tmdbId}/${season}/${episode}`;
  const session = createVidlySession();

  try {
    const pageRes = await fetchVidlyHttp({
      url: targetUrl,
      mode: "page",
      referer: "https://vidly.pro/",
      session,
    });
    const html = pageRes?.body;
    if (!html || typeof html !== "string") {
      return { sources: [], meta: null };
    }

    meta = extractVidlyMeta(html, kind, tmdbId, season, episode);
    const { token, initialData } = extractVidlyPageData(html);

    const serverList: Array<{ id: string; label: string; tag?: string }> = initialData?.servers || [
      { id: primaryServerId, label: "Edge", tag: "HD" },
      { id: "prism", label: "Prism", tag: "MULTI" },
      { id: "flux", label: "Flux", tag: "HD" },
      { id: "nimbus", label: "Nimbus", tag: "HD" },
      { id: "comet", label: "Comet", tag: "HD" },
      { id: "citadel", label: "Citadel", tag: "MULTI" },
    ];

    const sources: VidlyKatanaSource[] = [];

    // 1. Process initial stream if available (usually Edge)
    if (initialData?.streams?.[0]) {
      const stream = initialData.streams[0];
      const directUrl = stream.url;
      const srvName = initialData.provider?.label || "Edge";
      const srvId = initialData.provider?.id || primaryServerId;
      const proxyM3u8 = `/api/proxy/m3u8?url=${encodeURIComponent(directUrl)}&audio=${encodeURIComponent(
        normPref ? normPref.code : "en"
      )}`;

      const manifest = await inspectVidlyManifest(directUrl, 6000);
      if (!manifest.dead) {
        const audioTracks: VidlyAudioTrack[] =
          manifest.audioTracks.length > 0
            ? manifest.audioTracks
            : [{ id: "en", name: "English", label: "English", lang: "en", countryCode: "gb", flag: "🇬🇧", default: true }];

        const dedupedSubs = deduplicateSubtitles([
          ...(stream.subtitles || []),
          ...(initialData.subtitles || []),
          ...manifest.subtitles,
        ]);

        sources.push({
          id: srvId,
          server: srvName,
          name: srvName,
          serverName: srvName,
          type: "SUB",
          audio: "sub",
          videoUrl: proxyM3u8,
          m3u8: proxyM3u8,
          directUrl,
          quality: stream.quality || "1080p",
          isHls: true,
          isHevc: manifest.isHevc,
          audioTracks,
          subtitles: dedupedSubs,
          hasDub: audioTracks.some((a) => a.id !== "ja"),
        });
      }
    }

    // 2. Query remaining providers with gentle stagger to avoid Redis burst rate limits
    const remainingServers = serverList.filter((srv) => srv.id !== initialData?.provider?.id);
    const queryPromises = remainingServers.map(async (srv, idx) => {
      if (!token) return [];
      if (idx > 0) await new Promise((r) => setTimeout(r, idx * 120));

      try {
        const apiUrl =
          kind === "movie"
            ? `https://vidly.pro/api/sources?kind=movie&provider=${srv.id}&t=${encodeURIComponent(token)}&tmdb=${tmdbId}`
            : `https://vidly.pro/api/sources?kind=tv&provider=${srv.id}&t=${encodeURIComponent(
                token
              )}&tmdb=${tmdbId}&s=${season}&e=${episode}`;

        const apiRes = await fetchVidlyHttp({
          url: apiUrl,
          mode: "api",
          referer: targetUrl,
          session,
          timeoutMs: 10000,
          maxRetries: 3,
        });

        const unsealed = apiRes?.body ? parseVidlySealedApiResponse(apiRes.body) : null;
        if (unsealed?.streams) {
          const built = await Promise.all(
            unsealed.streams.map((st: any, stIdx: number) =>
              buildVidlyMediaStreamSource(
                srv,
                st,
                stIdx,
                unsealed.streams.length,
                unsealed.subtitles || [],
                normPref
              )
            )
          );
          return built.filter((s): s is VidlyKatanaSource => s !== null);
        }
      } catch {}
      return [];
    });

    const otherSourcesNested = await Promise.all(queryPromises);
    for (const nested of otherSourcesNested) {
      sources.push(...nested);
    }

    if (sources.length > 0) {
      const ttl = sources.length > 1 ? CACHE_TTL : PARTIAL_CACHE_TTL;
      vidlyMediaCache.set(cacheKey, { sources, meta, expiresAt: Date.now() + ttl });
    }

    return {
      sources: finalizeVidlyMediaSources(sources, normPref, primaryServerId),
      meta,
    };
  } catch (err: any) {
    const label = kind === "movie" ? `tmdb ${tmdbId}` : `tmdb ${tmdbId} s${season} e${episode}`;
    console.warn(`[vidly] Failed to fetch ${kind} sources for ${label}:`, err?.message || err);
    return { sources: [], meta };
  }
}

export async function getVidlyMovieSources(
  tmdbId: number,
  preferredAudio?: string,
  options?: { forceRefresh?: boolean }
): Promise<{ sources: VidlyKatanaSource[]; meta: VidlyMediaMeta | null }> {
  return fetchVidlyMediaSourcesShared({
    kind: "movie",
    tmdbId,
    preferredAudio,
    forceRefresh: options?.forceRefresh,
  });
}

export async function getVidlyTvSources(
  tmdbId: number,
  season: number,
  episode: number,
  preferredAudio?: string,
  options?: { forceRefresh?: boolean }
): Promise<{ sources: VidlyKatanaSource[]; meta: VidlyMediaMeta | null }> {
  return fetchVidlyMediaSourcesShared({
    kind: "tv",
    tmdbId,
    season,
    episode,
    preferredAudio,
    forceRefresh: options?.forceRefresh,
  });
}
