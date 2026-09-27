import axios from "axios";
import { isStreamTokenExpired } from "./token-utils";
import { resolveFromAniListId } from "./anime-resolver";

const BASE_URL = "https://reanime.to";

export const REANIME_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://reanime.to/",
  Origin: "https://reanime.to",
  "Sec-Ch-Ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

export const FLIXCLOUD_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Ch-Ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
};

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: REANIME_HEADERS,
});

let cloudflareBlockedUntil = 0;
const CLOUDFLARE_COOLDOWN_MS = 5 * 1000;

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

function markReanimeCloudflareBlocked(context = "") {
  if (Date.now() >= cloudflareBlockedUntil) {
    console.warn(`[Reanime] Cloudflare challenge active on ${BASE_URL} (${context || "403"}).`);
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
    try {
      const res = await client.get(urlPath, {
        ...options,
        timeout: 8000,
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
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const fetchRes = await fetch(fullUrl, {
          signal: controller.signal,
          headers: {
            ...REANIME_HEADERS,
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
      await new Promise((r) => setTimeout(r, attempt * 250));
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
    try {
      const res = await axios.get(embedUrl, {
        timeout: 12000,
        headers: {
          ...FLIXCLOUD_HEADERS,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Referer: BASE_URL,
          "Sec-Fetch-Dest": "iframe",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "cross-site",
        },
      });
      if (res.data && typeof res.data === "string") {
        html = res.data;
        break;
      }
    } catch {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        const fRes = await fetch(embedUrl, {
          signal: controller.signal,
          headers: {
            ...FLIXCLOUD_HEADERS,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            Referer: BASE_URL,
            "Sec-Fetch-Dest": "iframe",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "cross-site",
          },
        });
        clearTimeout(timeoutId);
        if (fRes.ok) {
          html = await fRes.text();
          if (html) break;
        }
      } catch {}
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 300));
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

  let tokenRes: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      tokenRes = await axios.get(`https://flixcloud.cc/api/m3u8/${token}`, {
        timeout: 10000,
        headers: {
          ...FLIXCLOUD_HEADERS,
          Accept: "application/json, text/plain, */*",
          Referer: embedUrl,
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
        },
      });
      if (tokenRes.data) break;
    } catch (err) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const fRes = await fetch(`https://flixcloud.cc/api/m3u8/${token}`, {
          signal: controller.signal,
          headers: {
            ...FLIXCLOUD_HEADERS,
            Accept: "application/json, text/plain, */*",
            Referer: embedUrl,
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
          },
        });
        clearTimeout(timeoutId);
        if (fRes.ok) {
          tokenRes = { data: await fRes.json() };
          break;
        }
      } catch {}
      if (attempt === 3 && !tokenRes?.data) throw err;
      await new Promise((r) => setTimeout(r, attempt * 350));
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
  id?: string;
  type: "SUB" | "DUB";
  language: string;
  videoUrl: string;
  quality: string;
  isHls: boolean;
  serverName: string;
  subtitles?: Array<{
    id?: string;
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
              id: `${(s.server || "HD-1").toLowerCase()}-${s.audio}-${idx}`,
              language: sub.language || sub.lang || sub.label || "en",
              label: sub.label || sub.language || (idx === 0 ? "English" : `Subtitle ${idx + 1}`),
              subtitleUrl: proxySubUrl,
              isDefault: sub.default !== undefined ? sub.default : idx === 0,
            };
          });

          const isFlow2 =
            (s.server || "").toUpperCase().includes("HD-2") ||
            (s.server || "").toUpperCase().includes("2");
          const flowLabel = isFlow2 ? "Flow 2" : "Flow 1";
          const flowId = isFlow2 ? "flow-2" : "flow-1";

          sources.push({
            id: `reanime-${flowId}-${s.audio}`,
            type: isDub ? "DUB" : "SUB",
            language: isDub ? "English Dub" : "Japanese",
            videoUrl: proxyUrl,
            quality: "1080p",
            isHls: true,
            serverName: isDub ? `${flowLabel} (English Dub)` : `${flowLabel} (Sub)`,
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

  if (targetId) {
    let titleToSearch: string | null = null;
    const mapping = await resolveFromAniListId(targetId);
    if (mapping?.title) {
      titleToSearch = mapping.title;
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

  if (textQuery) {
    let searchData = await searchReanime(textQuery, 20);
    let results = searchData.results || [];

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

      let best = results.find((a: any) => {
        const eng = (a.title?.english || "").toLowerCase();
        const rom = (a.title?.romaji || "").toLowerCase();
        const nat = (a.title?.native || "").toLowerCase();
        return eng === qLower || rom === qLower || nat === qLower;
      });

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

  let targetEpNum = 1;
  const epStr = String(episode).trim();
  if (/^\d+$/.test(epStr)) {
    targetEpNum = parseInt(epStr, 10);
  }

  let srvData: any = null;
  let anime: any = null;
  let epInfo: any = null;

  if (targetAnilistId) {
    try {
      srvData = await getReanimeServers(targetAnilistId, targetEpNum);
    } catch {}
  }

  if (!srvData || !srvData.servers || srvData.servers.length === 0) {
    anime = await resolveAnimeSlug(targetQuery, targetAnilistId);
    if (!anime && !targetAnilistId) {
      throw new Error(`Anime not found for search query "${targetQuery || targetAnilistId}"`);
    }
    if (anime) {
      try {
        const epData = await getReanimeEpisodes(anime.slug);
        const epList = epData.episodes || [];
        epInfo = epList.find((e: any) => e.episode_number === targetEpNum) || null;
      } catch {}
      srvData = await getReanimeServers(anime.slug, targetEpNum);
    }
  }

  if (!srvData || !srvData.servers || srvData.servers.length === 0) {
    throw new Error(
      `No streaming servers found for ${targetAnilistId ? `AniList ${targetAnilistId}` : (anime?.title?.english || anime?.slug || targetQuery)} episode ${targetEpNum}`
    );
  }

  const isAllServers = server && server.toLowerCase() === "all";
  let allDecrypted: any[] = [];

  if (isAllServers) {
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

  let matching = srvData.servers.filter((s: any) => s.dataType === desiredType);
  let audioFallback = false;

  if (matching.length === 0) {
    matching = srvData.servers;
    audioFallback = true;
  }

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
      for (const alt of matching) {
        if (sameServerCandidates.includes(alt)) continue;
        try {
          const altStream = await decryptFlixStream(alt.access_id, alt.version || 1);
          if (altStream && altStream.hls) {
            streamInfo = altStream;
            chosen = alt;
            break;
          }
        } catch {}
      }
    }
  }

  if (!streamInfo || !streamInfo.hls) {
    throw new Error("Failed to decrypt video stream from provider");
  }

  return {
    anime: anime || {
      title: { english: `Anime ${targetAnilistId || targetQuery}` },
      slug: srvData.slug,
      anilist_id: targetAnilistId ? parseInt(String(targetAnilistId), 10) : null,
    },
    episode: {
      number: targetEpNum,
      title: epInfo?.title || `Episode ${targetEpNum}`,
      title_romanji: epInfo?.title_romanji,
    },
    search_mode: searchMode || "auto",
    requested_audio: desiredType,
    audio: chosen.dataType || desiredType,
    audio_fallback: audioFallback,
    has_dub: hasDubServers,
    has_sub: hasSubServers,
    server: chosen.serverName || "HD-1",
    access_id: chosen.access_id,
    version: chosen.version || 1,
    hls: streamInfo.hls,
    pk: streamInfo.pk,
    subtitles: streamInfo.subtitles || [],
    all_servers: allDecrypted.length > 0 ? allDecrypted : null,
    available_servers: srvData.servers.map((s: any) => ({
      server: s.serverName,
      audio: s.dataType,
      access_id: s.access_id,
      version: s.version || 1,
    })),
  };
}
