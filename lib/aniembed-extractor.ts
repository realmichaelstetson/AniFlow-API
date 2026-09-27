/**
 * AniEmbed / Animex Video Source Extractor
 * 
 * Scrapes aniembed.se embed pages to get internal slug IDs and provider lists,
 * then calls pp.animex.one API to resolve direct video sources (.m3u8) and subtitles.
 */

const ANIEMBED_BASE = "https://aniembed.se";
const API_BASE = "https://pp.animex.one";

// XOR key used by AniEmbed CDN proxy
const XOR_KEY = "10b06cdc1ca48c9fb0b94af97cc040cf";

// Providers that are non-functional, expired, or banned in sandboxed iframes
export const BLOCKED_ANIMEX_PROVIDERS = new Set([
  "loli",
  "sora",
  "imgnex",
  "megaplay",
  "vidwish",
  "playmogo",
  "otakuvid",
  "goyabu",
  "beep",
  "neko",
]);

export function isBlockedAnimexProvider(providerId?: string | null): boolean {
  if (!providerId) return false;
  return BLOCKED_ANIMEX_PROVIDERS.has(providerId.toLowerCase().trim());
}

export interface AnimexProvider {
  id: string;
  default: boolean;
  tip: string;
}

export interface AnimexEmbedInfo {
  slug: string;
  anilistId: number;
  malId: number;
  episodeNumber: number;
  subProviders: AnimexProvider[];
  dubProviders: AnimexProvider[];
  backdropUrl?: string;
}

export interface AnimexSourceTrack {
  id?: string;
  url: string;
  lang: string;
  label: string;
  kind?: string;
  default?: boolean;
}

export interface AnimexSourceChapter {
  title: string;
  start: number;
  end: number;
}

export interface AnimexSourceResult {
  sources: Array<{
    url: string;
    quality: string;
    type: string;
  }>;
  tracks: AnimexSourceTrack[] | null;
  audio: unknown;
  chapters: AnimexSourceChapter[] | null;
  headers: Record<string, string> | null;
}

import {
  getOutboundHttpsAgent,
  resilientFetch,
  hasOutboundProxy,
  isCloudflareChallenge,
} from "./proxy-agent";

// Pre-seeded slugs for popular anime to bypass cloud scraping latency/Cloudflare blocks
const PRESEEDED_SLUGS: Array<[number, string]> = [
  [16498, "attack-on-titan-2jqd0"],
  [25777, "shingeki-no-kyojin-season-2-20pj0"],
  [99147, "shingeki-no-kyojin-season-3-20pj1"],
  [104578, "shingeki-no-kyojin-season-3-part-2-20pj2"],
  [110277, "shingeki-no-kyojin-the-final-season-20p26"],
  [131681, "shingeki-no-kyojin-the-final-season-part-2-20p27"],
  [154587, "frieren-beyond-journey-s-end-faato"],
  [21, "one-piece-20j04"],
  [20, "naruto-20p25"],
  [1735, "naruto-shippuuden-20p2k"],
  [269, "bleach-20p20"],
  [159322, "bleach-sennen-kessen-hen-ketsubetsu-tan-20v9o"],
  [101922, "kimetsu-no-yaiba-20p61"],
  [129874, "kimetsu-no-yaiba-yuukaku-hen-20v9l"],
  [145139, "kimetsu-no-yaiba-katanakaji-no-sato-hen-20v9m"],
  [113415, "jujutsu-kaisen-20j65"],
  [145064, "jujutsu-kaisen-2nd-season-20v9k"],
  [151807, "solo-leveling-20j02"],
  [176496, "solo-leveling-season-2-arise-from-the-shadow-1w3cm"],
  [11061, "hunter-x-hunter-2011-20p50"],
  [1535, "death-note-20p4k"],
  [21519, "kimi-no-na-wa-20p4m"],
  [5114, "fullmetal-alchemist-brotherhood-20j0v"],
  [117710, "cyberpunk-edgerunners-20j00"],
  [127230, "chainsaw-man-20j0k"],
  [140960, "spy-x-family-20j0e"],
  [10087, "fate-zero-20j07"],
  [9253, "steins-gate-20p4p"],
  [131573, "bocchi-the-rock-20j09"],
  [164212, "oshi-no-ko-20j08"],
  [142838, "mashle-20j0d"],
  [163134, "kaiju-no-8-20j0f"],
  [166240, "dandadan-20j0g"],
  [20605, "tokyo-ghoul-2zpd0"],
  [20954, "koe-no-katachi-20p7k"],
  [21459, "boku-no-hero-academia-20p48"],
  [98444, "boku-no-hero-academia-2nd-season-20p45"],
  [100166, "boku-no-hero-academia-3rd-season-20p46"],
  [104276, "boku-no-hero-academia-4th-season-20p47"],
  [101348, "vinland-saga-20j08"],
  [97940, "black-clover-20j03"],
  [21202, "kono-subarashii-sekai-ni-shukufuku-wo-20j05"],
  [21355, "re-zero-kara-hajimeru-isekai-seikatsu-20j06"],
];

// In-memory cache for embed info to avoid hitting aniembed.se repeatedly
const embedInfoCache = new Map<string, { data: AnimexEmbedInfo; timestamp: number }>();
const animeSlugCache = new Map<number, string>(PRESEEDED_SLUGS);
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const ANIMEX_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://aniembed.se/",
  Origin: "https://aniembed.se",
  "Sec-Ch-Ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

/**
 * Call pp.animex.one API to get available servers (providers) for an anime episode.
 */
export async function getServers(slug: string, episode: number): Promise<{
  subProviders: AnimexProvider[];
  dubProviders: AnimexProvider[];
}> {
  const url = `${API_BASE}/rest/api/servers?id=${encodeURIComponent(slug)}&epNum=${episode}`;
  const res = await fetch(url, {
    headers: {
      ...ANIMEX_HEADERS,
      "Sec-Fetch-Site": "cross-site",
    },
    signal: AbortSignal.timeout(3000),
  });

  if (!res.ok) {
    throw new Error(`Animex Servers API responded with ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  const filterBroken = (providers: any[]): AnimexProvider[] => {
    return (providers || [])
      .filter((p: any) => p && p.id && !isBlockedAnimexProvider(p.id))
      .map((p: any) => ({
        id: p.id,
        default: Boolean(p.default),
        tip: p.tip || "",
      }));
  };

  return {
    subProviders: filterBroken(data.subProviders),
    dubProviders: filterBroken(data.dubProviders),
  };
}

/**
 * Scrape the aniembed.se embed page to extract slug ID and providers.
 */
export async function getEmbedInfo(
  anilistId: number,
  episode: number,
  title?: string
): Promise<AnimexEmbedInfo> {
  const cacheKey = `${anilistId}-${episode}`;
  const cached = embedInfoCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const numId = typeof anilistId === "number" ? anilistId : parseInt(String(anilistId), 10);
  let knownSlug = animeSlugCache.get(numId);

  if (knownSlug) {
    let servers = { subProviders: [] as AnimexProvider[], dubProviders: [] as AnimexProvider[] };
    try {
      servers = await getServers(knownSlug, episode);
    } catch {}

    const subProviders = servers.subProviders.length > 0 ? servers.subProviders : [
      { id: "yuki", default: true, tip: "Soft sub" },
      { id: "zuna", default: false, tip: "Zuna" },
    ];
    const dubProviders = (servers.dubProviders && servers.dubProviders.length > 0) ? servers.dubProviders : [
      { id: "yuki", default: true, tip: "Soft sub" },
    ];

    const parsedInfo: AnimexEmbedInfo = {
      slug: knownSlug,
      anilistId: numId,
      malId: 0,
      episodeNumber: episode,
      subProviders,
      dubProviders,
    };
    embedInfoCache.set(cacheKey, { data: parsedInfo, timestamp: Date.now() });
    return parsedInfo;
  }

  // 1. Try SvelteKit __data.json endpoint first (clean, fast JSON, no HTML/regex overhead)
  try {
    const dataUrl = `${ANIEMBED_BASE}/e/${anilistId}/${episode}/__data.json`;
    let j: any = null;

    if (hasOutboundProxy()) {
      try {
        const proxied = await resilientFetch(dataUrl, { headers: ANIMEX_HEADERS, timeout: 4000 });
        j = JSON.parse(proxied.data);
      } catch {}
    }

    if (!j) {
      const res = await fetch(dataUrl, {
        headers: ANIMEX_HEADERS,
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        j = await res.json();
      }
    }

    if (j) {
      const nodes = j?.nodes?.[1]?.data;
      if (Array.isArray(nodes) && nodes.length > 0 && nodes[0]?.id !== undefined) {
        const root = nodes[0];
        const extractedSlug = nodes[root.id];
        if (typeof extractedSlug === "string" && extractedSlug) {
          animeSlugCache.set(anilistId, extractedSlug);
          let subProviders: AnimexProvider[] = [];
          let dubProviders: AnimexProvider[] = [];
          try {
            const servers = await getServers(extractedSlug, episode);
            subProviders = servers.subProviders;
            dubProviders = servers.dubProviders;
          } catch {}

          if (subProviders.length === 0) {
            subProviders = [{ id: "yuki", default: true, tip: "Soft sub" }];
          }

          const parsedInfo: AnimexEmbedInfo = {
            slug: extractedSlug,
            anilistId: root.anilistId && typeof nodes[root.anilistId] === "number" ? nodes[root.anilistId] : anilistId,
            malId: root.malId && typeof nodes[root.malId] === "number" ? nodes[root.malId] : 0,
            episodeNumber: episode,
            subProviders,
            dubProviders,
          };
          embedInfoCache.set(cacheKey, { data: parsedInfo, timestamp: Date.now() });
          return parsedInfo;
        }
      }
    }
  } catch {}

  // 2. Fallback to HTML scraping
  let html = "";
  try {
    const url = `${ANIEMBED_BASE}/e/${anilistId}/${episode}`;
    const res = await fetch(url, {
      headers: {
        ...ANIMEX_HEADERS,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
      },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      html = await res.text();
    }
  } catch {}

  if (!html) {
    throw new Error(`Failed to fetch embed page for AniList ID ${anilistId} EP ${episode}`);
  }

  const dataMatch = html.match(/data:\s*\[null,\s*\{type:"data",data:(\{[\s\S]*?\})\s*,uses:/);
  if (!dataMatch) {
    throw new Error("Could not find SSR data in embed page");
  }

  const dataStr = dataMatch[1];
  const slugMatch = dataStr.match(/,id:"([^"]+)",anilistId:/) || dataStr.match(/\bid:"([^"]+)",anilistId:/);
  const anilistMatch = dataStr.match(/anilistId:(\d+)/);
  const malMatch = dataStr.match(/malId:(\d+)/);
  const epMatch = dataStr.match(/epNum:(\d+)/);
  const backdropMatch = dataStr.match(/backdropUrl:"([^"]+)"/);

  if (!slugMatch) {
    throw new Error("Could not extract slug ID from embed page");
  }

  const targetSlug = slugMatch[1];
  animeSlugCache.set(anilistId, targetSlug);

  const subProvidersMatch = dataStr.match(/subProviders:\[([\s\S]*?)\]/);
  const dubProvidersMatch = dataStr.match(/dubProviders:\[([\s\S]*?)\]/);

  const parseProviders = (str: string | undefined): AnimexProvider[] => {
    if (!str) return [];
    const providers: AnimexProvider[] = [];
    const providerRegex = /\{id:"([^"]+)",default:(true|false),tip:"([^"]+)"\}/g;
    let match;
    while ((match = providerRegex.exec(str)) !== null) {
      providers.push({
        id: match[1],
        default: match[2] === "true",
        tip: match[3],
      });
    }
    return providers.filter((p) => !isBlockedAnimexProvider(p.id));
  };

  const parsedInfo: AnimexEmbedInfo = {
    slug: targetSlug,
    anilistId: anilistMatch ? parseInt(anilistMatch[1], 10) : anilistId,
    malId: malMatch ? parseInt(malMatch[1], 10) : 0,
    episodeNumber: epMatch ? parseInt(epMatch[1], 10) : episode,
    subProviders: parseProviders(subProvidersMatch?.[1]),
    dubProviders: parseProviders(dubProvidersMatch?.[1]),
    backdropUrl: backdropMatch?.[1],
  };

  embedInfoCache.set(cacheKey, { data: parsedInfo, timestamp: Date.now() });
  return parsedInfo;
}

/**
 * Call pp.animex.one API to get video sources for a specific provider.
 */
export async function getSource(
  slug: string,
  episode: number,
  type: "sub" | "dub",
  providerId: string
): Promise<AnimexSourceResult> {
  const url = `${API_BASE}/rest/api/sources?id=${encodeURIComponent(slug)}&epNum=${episode}&type=${type}&providerId=${encodeURIComponent(providerId)}`;

  const res = await fetch(url, {
    headers: {
      ...ANIMEX_HEADERS,
      "Sec-Fetch-Site": "cross-site",
    },
    signal: AbortSignal.timeout(3500),
  });

  if (!res.ok) {
    throw new Error(`Animex API responded with ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<AnimexSourceResult>;
}

/**
 * Helper to resolve the best playable stream for a provider or type.
 */
export async function resolveAnimexPlayStream({
  anilistId,
  episode,
  type = "sub",
  provider,
  slug,
  title,
}: {
  anilistId: number;
  episode: number;
  type?: "sub" | "dub";
  provider?: string;
  slug?: string;
  title?: string;
}) {
  let targetSlug = slug;
  let subProviders: AnimexProvider[] = [];
  let dubProviders: AnimexProvider[] = [];

  if (targetSlug) {
    if (!provider) {
      try {
        const servers = await getServers(targetSlug, episode);
        subProviders = servers.subProviders;
        dubProviders = servers.dubProviders;
      } catch (err: any) {
        console.warn("[resolveAnimexPlayStream] getServers notice:", err?.message || err);
      }
    }
  } else {
    const info = await getEmbedInfo(anilistId, episode, title);
    targetSlug = info.slug;
    subProviders = info.subProviders;
    dubProviders = info.dubProviders;
  }

  if (!targetSlug) {
    throw new Error(`No Animex slug found for AniList ID ${anilistId}`);
  }

  if (provider && isBlockedAnimexProvider(provider)) {
    throw new Error(`Provider "${provider}" is disabled`);
  }

  const rawProviders = type === "sub" ? subProviders : dubProviders;
  // Zuri is actually 'zuna' from the extractor and is strictly SUB ONLY
  const providers = rawProviders.filter(
    (p) => !isBlockedAnimexProvider(p.id) && !(type === "dub" && (p.id.toLowerCase() === "zuna" || p.id.toLowerCase() === "zuri"))
  );

  const candidateProviders: string[] = [];
  if (provider && !isBlockedAnimexProvider(provider)) {
    const norm = provider.toLowerCase();
    if (norm === "yuri" || norm === "yuki") {
      candidateProviders.push("yuki", "yuri");
    } else if (norm === "zuri" || norm === "zuna") {
      // Zuri / zuna is only valid for SUB
      if (type === "sub") {
        candidateProviders.push("zuna", "zuri", "yuki");
      }
    } else {
      candidateProviders.push(provider);
    }
  }
  const defaultProvider = providers.find((p) => p.default);
  if (defaultProvider && !candidateProviders.includes(defaultProvider.id)) {
    candidateProviders.push(defaultProvider.id);
  }
  for (const p of providers) {
    if (!candidateProviders.includes(p.id)) {
      candidateProviders.push(p.id);
    }
  }
  if (!candidateProviders.includes("yuki") && !isBlockedAnimexProvider("yuki")) {
    candidateProviders.push("yuki");
  }

  // Optimize speed: for SUB, prioritize 'zuna' (Zuri) first as it responds in ~600ms
  if (type === "sub") {
    const zIdx = candidateProviders.indexOf("zuna");
    if (zIdx > -1) {
      candidateProviders.splice(zIdx, 1);
    }
    candidateProviders.unshift("zuna");
  }

  let lastError: any = null;
  let result: AnimexSourceResult | null = null;
  let selectedProvider = "";

  const seenMapped = new Set<string>();
  for (const prov of candidateProviders) {
    const mappedProv =
      prov.toLowerCase() === "yuri" ? "yuki" : prov.toLowerCase() === "zuri" ? "zuna" : prov.toLowerCase();
    if (seenMapped.has(mappedProv)) continue;
    seenMapped.add(mappedProv);

    try {
      const res = await getSource(targetSlug, episode, type, mappedProv);
      if (res?.sources && res.sources.length > 0 && res.sources[0]?.url) {
        const streamUrl = res.sources[0].url.toLowerCase();
        if (
          streamUrl.includes("vibevibe") ||
          streamUrl.includes("vivibebe") ||
          streamUrl.includes("ibyteimg")
        ) {
          continue;
        }
        result = res;
        const pNorm = prov.toLowerCase();
        selectedProvider =
          pNorm === "yuri" || pNorm === "yuki"
            ? "Yuri"
            : pNorm === "zuri" || pNorm === "zuna"
            ? "Zuri"
            : prov.charAt(0).toUpperCase() + prov.slice(1);
        break;
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  if (!result || !result.sources?.[0] || !selectedProvider) {
    if (type === "dub") {
      throw new Error(`English Dub is not available on Yuri/Animex for this episode.`);
    }
    throw (
      lastError ||
      new Error(`No working stream source found across providers (${candidateProviders.join(", ")})`)
    );
  }

  const source = result.sources[0];

  const params = new URLSearchParams({ url: source.url });
  if (result.headers?.Referer) params.set("referer", result.headers.Referer);
  if (result.headers?.Origin) params.set("origin", result.headers.Origin);
  if (result.headers?.["User-Agent"]) params.set("ua", result.headers["User-Agent"]);
  const proxyM3u8 = `/api/proxy/m3u8?${params.toString()}`;

  const subtitles = (result.tracks || []).map((track) => ({
    server: selectedProvider,
    language: track.lang || track.label || "English",
    label: track.label || track.lang || "English",
    kind: track.kind || "captions",
    default: !!track.default,
    url: `/api/proxy/subtitles?url=${encodeURIComponent(track.url)}&referer=${encodeURIComponent(result.headers?.Referer || "")}`,
    direct_url: track.url,
    format: "vtt",
  }));

  return {
    slug: targetSlug,
    provider: selectedProvider,
    type,
    episode,
    proxyM3u8,
    rawSource: source,
    subtitles,
    chapters: result.chapters || null,
    headers: result.headers,
    availableProviders: providers,
  };
}

export interface AnimexEpisodeSourceItem {
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

const animexSourcesCache = new Map<string, { data: AnimexEpisodeSourceItem[]; timestamp: number }>();

/**
 * Fetch all available Animex video source records (SUB & DUB) for an episode.
 */
export async function getAnimexEpisodeSources(
  anilistId: number,
  episodeNumber: number
): Promise<AnimexEpisodeSourceItem[]> {
  const cacheKey = `${anilistId}_${episodeNumber}`;
  const cached = animexSourcesCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const sources: AnimexEpisodeSourceItem[] = [];

  try {
    const info = await getEmbedInfo(anilistId, episodeNumber);

    // 1. Resolve SUB providers: Yuri and Zuri
    const targetSubProviders: AnimexProvider[] = [];
    const existingYuri = info.subProviders.find((p) => p.id.toLowerCase() === "yuki" || p.id.toLowerCase() === "yuri");
    targetSubProviders.push(existingYuri || { id: "yuri", default: true, tip: "Yuri" });

    const existingZuri = info.subProviders.find((p) => p.id.toLowerCase() === "zuna" || p.id.toLowerCase() === "zuri");
    targetSubProviders.push(existingZuri || { id: "zuri", default: false, tip: "Zuri" });

    for (const p of targetSubProviders) {
      if (isBlockedAnimexProvider(p.id)) continue;
      const normId =
        p.id.toLowerCase() === "yuki" || p.id.toLowerCase() === "yuri"
          ? "yuri"
          : p.id.toLowerCase() === "zuna" || p.id.toLowerCase() === "zuri"
          ? "zuri"
          : p.id;
      const displayName =
        normId === "yuri" ? "Yuri" : normId === "zuri" ? "Zuri" : p.id.charAt(0).toUpperCase() + p.id.slice(1);

      sources.push({
        id: `animex-${normId}-sub`,
        type: "SUB",
        language: "Japanese",
        videoUrl: `/api/play?slug=${encodeURIComponent(info.slug)}&anilistId=${anilistId}&episode=${episodeNumber}&type=sub&provider=${encodeURIComponent(normId)}&format=m3u8`,
        quality: "1080p",
        isHls: true,
        serverName: `${displayName} (Sub)`,
      });
    }

    // 2. Resolve DUB providers: Yuri only (strictly when dub exists on Animex)
    const targetDubProviders: AnimexProvider[] = [];
    const existingDubYuri = info.dubProviders?.find((p) => p.id.toLowerCase() === "yuki" || p.id.toLowerCase() === "yuri");
    if (existingDubYuri) {
      targetDubProviders.push(existingDubYuri);
    }

    for (const p of targetDubProviders) {
      if (isBlockedAnimexProvider(p.id)) continue;
      const normId = "yuri";
      const displayName = "Yuri";

      sources.push({
        id: `animex-${normId}-dub`,
        type: "DUB",
        language: "English Dub",
        videoUrl: `/api/play?slug=${encodeURIComponent(info.slug)}&anilistId=${anilistId}&episode=${episodeNumber}&type=dub&provider=${encodeURIComponent(normId)}&format=m3u8`,
        quality: "1080p",
        isHls: true,
        serverName: `${displayName} (English Dub)`,
      });
    }
  } catch (err: any) {
    if (!err?.message?.includes("404")) {
      console.warn(`[AnimexExtractor] Notice resolving sources for ${anilistId} ep ${episodeNumber}:`, err?.message || err);
    }
  }

  if (sources.length > 0) {
    animexSourcesCache.set(cacheKey, { data: sources, timestamp: Date.now() });
  }

  return sources;
}

