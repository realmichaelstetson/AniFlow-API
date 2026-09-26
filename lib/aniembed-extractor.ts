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

// In-memory cache for embed info to avoid hitting aniembed.se repeatedly
const embedInfoCache = new Map<string, { data: AnimexEmbedInfo; timestamp: number }>();
const animeSlugCache = new Map<number, string>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

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
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Accept": "application/json",
      "Referer": "https://aniembed.se/",
      "Origin": "https://aniembed.se",
    },
    signal: AbortSignal.timeout(4000),
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

  let knownSlug = animeSlugCache.get(anilistId);

  if (knownSlug) {
    let servers = { subProviders: [] as AnimexProvider[], dubProviders: [] as AnimexProvider[] };
    try {
      servers = await getServers(knownSlug, episode);
    } catch {}

    const subProviders = servers.subProviders.length > 0 ? servers.subProviders : [
      { id: "yuki", default: true, tip: "Soft sub" },
      { id: "zuna", default: false, tip: "Zuna" },
    ];
    const dubProviders = servers.dubProviders || [];

    const parsedInfo: AnimexEmbedInfo = {
      slug: knownSlug,
      anilistId,
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
    const res = await fetch(dataUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(4500),
    });
    if (res.ok) {
      const j = await res.json();
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(4500),
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
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Accept": "application/json",
      "Referer": "https://aniembed.se/",
      "Origin": "https://aniembed.se",
    },
    signal: AbortSignal.timeout(15000),
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
  const providers = rawProviders.filter((p) => !isBlockedAnimexProvider(p.id));

  const candidateProviders: string[] = [];
  if (provider && !isBlockedAnimexProvider(provider)) {
    candidateProviders.push(provider);
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

  let lastError: any = null;
  let result: AnimexSourceResult | null = null;
  let selectedProvider = "";

  for (const prov of candidateProviders) {
    try {
      const res = await getSource(targetSlug, episode, type, prov);
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
        selectedProvider = prov;
        break;
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  if (!result || !result.sources?.[0] || !selectedProvider) {
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
