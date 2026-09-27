import { safeFetch } from "./fetch-client";
import { GogoanimeProvider, AnimeParadiseProvider, HttpClient } from "anime-sdk";

export interface DiscoveredStreamSource {
  type: "SUB" | "DUB";
  language: string;
  videoUrl: string;
  quality: string;
  isHls: boolean;
  isDefault: boolean;
  serverName: string;
  subtitles?: Array<{
    id?: string;
    language: string;
    label: string;
    subtitleUrl: string;
    isDefault: boolean;
  }>;
}

export function isRealVideoStream(url?: string | null): boolean {
  if (!url) return false;
  const u = url.toLowerCase().trim();
  if (
    u.includes("vivibebe") ||
    u.includes("vibevibe") ||
    u.includes("ibyteimg") ||
    u.includes("anizara") ||
    u.includes("provider=beep") ||
    u.includes("provider=neko") ||
    u.includes("provider=loli") ||
    u.includes("provider=sora") ||
    u.includes("provider=imgnex") ||
    u.includes("provider=megaplay") ||
    u.includes("provider=vidwish") ||
    u.includes("provider=playmogo") ||
    u.includes("provider=otakuvid") ||
    u.includes("imgnex") ||
    u.includes("playmogo") ||
    u.includes("otakuvid") ||
    u.includes("goyabu")
  ) {
    return false;
  }
  return u.includes(".m3u8") || u.includes("vixcloud") || u.includes("animeparadise") || u.includes("token=");
}

function getConsumetAnime() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ext = require("@consumet/extensions");
    return ext.ANIME || null;
  } catch (err: any) {
    console.warn("[Consumet] Notice loading @consumet/extensions:", err?.message || err);
    return null;
  }
}

export interface ConsumetSource {
  url: string;
  isM3U8: boolean;
  quality?: string;
}

export interface ConsumetSubtitle {
  url: string;
  lang?: string;
  label?: string;
  default?: boolean;
}

export interface ConsumetWatchResponse {
  providerId: string;
  headers?: Record<string, string>;
  sources: ConsumetSource[];
  subtitles?: ConsumetSubtitle[];
  download?: string;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
}

export interface ConsumetProviderMeta {
  id: string;
  name: string;
  category: "anime" | "meta" | "movies" | "manga" | "books" | "news";
  baseUrl?: string;
  description: string;
  supportsHls: boolean;
  languages: string[];
}

/**
 * Official providers list matching https://docs.consumet.org/list-of-providers
 */
export const CONSUMET_PROVIDERS: ConsumetProviderMeta[] = [
  {
    id: "animepahe",
    name: "AnimePahe",
    category: "anime",
    baseUrl: "https://animepahe.ru",
    description: "High quality anime streaming links with multiple resolutions.",
    supportsHls: true,
    languages: ["sub", "dub"],
  },
  {
    id: "animekai",
    name: "AnimeKai",
    category: "anime",
    baseUrl: "https://anikai.to",
    description: "Modern anime streaming site with MegaUp servers.",
    supportsHls: true,
    languages: ["sub"],
  },
  {
    id: "hianime",
    name: "HiAnime",
    category: "anime",
    baseUrl: "https://hianime.to",
    description: "High quality anime streaming with sub/dub options, spotlight, and schedule.",
    supportsHls: true,
    languages: ["sub", "dub"],
  },
  {
    id: "kickassanime",
    name: "KickAssAnime",
    category: "anime",
    baseUrl: "https://kaas.to",
    description: "Anime streaming with multiple server options.",
    supportsHls: true,
    languages: ["sub", "dub"],
  },
  {
    id: "animesaturn",
    name: "AnimeSaturn",
    category: "anime",
    baseUrl: "https://www.animesaturn.cx/",
    description: "Italian anime streaming provider.",
    supportsHls: true,
    languages: ["sub-ita"],
  },
  {
    id: "animeunity",
    name: "AnimeUnity",
    category: "anime",
    baseUrl: "https://www.animeunity.to",
    description: "Italian anime streaming provider with Vixcloud HLS.",
    supportsHls: true,
    languages: ["sub-ita"],
  },
  {
    id: "animesama",
    name: "AnimeSama",
    category: "anime",
    baseUrl: "https://anime-sama.org",
    description: "French anime streaming provider.",
    supportsHls: true,
    languages: ["vostfr", "vf"],
  },
  {
    id: "gogoanime",
    name: "Gogoanime",
    category: "anime",
    baseUrl: "https://gogoanime.ee",
    description: "Classic anime streaming provider with Vidstreaming HLS.",
    supportsHls: true,
    languages: ["sub", "dub"],
  },
  {
    id: "animeparadise",
    name: "AnimeParadise",
    category: "anime",
    baseUrl: "https://animeparadise.moe",
    description: "Ultra fast direct master HLS .m3u8 streams with multi-language WebVTT subtitles.",
    supportsHls: true,
    languages: ["sub"],
  },
];

// Configurable Consumet API Base URL (per https://docs.consumet.org/)
const DEFAULT_CONSUMET_API_URL = process.env.CONSUMET_API_URL || "https://api.consumet.org";

/**
 * Normalizes title for search across Consumet providers
 */
export function cleanTitleForConsumet(title: string, seasonNumber?: number | null): string {
  let cleaned = title
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (seasonNumber && seasonNumber > 1) {
    if (!cleaned.toLowerCase().includes(`season ${seasonNumber}`)) {
      cleaned = `${cleaned} Season ${seasonNumber}`;
    }
  }

  return cleaned;
}

/**
 * Queries Consumet REST API endpoint (per https://docs.consumet.org/)
 * Supports /anime/animepahe, /anime/animekai, /anime/hianime, /anime/gogoanime, etc.
 */
export async function queryConsumetRestApi(
  endpoint: string,
  timeoutMs = 4500
): Promise<any | null> {
  const baseUrls = [
    process.env.CONSUMET_API_URL,
    "https://api.consumet.org",
    "https://api-consumet-org.vercel.app",
    "https://consumet.vercel.app",
  ].filter(Boolean) as string[];

  for (const base of baseUrls) {
    const fullUrl = `${base.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
    try {
      const res = await safeFetch(fullUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeoutMs,
      });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch {
      // Continue to next mirror
    }
  }

  return null;
}

/**
 * Individual provider resolvers from https://docs.consumet.org/list-of-providers
 */

// Helper to match the exact season from AnimeUnity search results
export function selectAnimeUnityResult(
  results: any[],
  targetTitle: string,
  seasonNumber?: number | null
): any | null {
  if (!results || results.length === 0) return null;

  let targetSeason = seasonNumber || 1;
  const titleLower = targetTitle.toLowerCase();
  const seasonMatch = titleLower.match(/\b(?:season|s)\s*([2-9])\b/i) || titleLower.match(/\b([2-9])(?:nd|rd|th)\s*season\b/i);
  if (seasonMatch) {
    targetSeason = parseInt(seasonMatch[1], 10);
  }

  // Filter out Italian dub (ITA) unless only ITA is available
  const subResults = results.filter((r) => {
    const id = (r.id || "").toLowerCase();
    const title = (r.title || "").toLowerCase();
    return !id.endsWith("-ita") && !id.includes("-ita-") && !title.includes("(ita)");
  });

  const candidates = subResults.length > 0 ? subResults : results;

  const isSequel = (r: any): boolean => {
    const id = (r.id || "").toLowerCase();
    const title = (r.title || "").toLowerCase();
    return (
      /[-_]([2-9]|season[-_]?[2-9]|part[-_]?[2-9])([-_]|$)/.test(id) ||
      /\b(season\s*[2-9]|2nd\s*season|3rd\s*season|4th\s*season|5th\s*season|part\s*[2-9]|cour\s*[2-9])\b/i.test(title) ||
      /\b[2-9]\b/.test(title.replace(/[^\w\s]/g, " ")) ||
      title.includes(" ii") ||
      title.includes(" iii") ||
      title.includes(" iv") ||
      id.includes("the-culling-game") ||
      id.includes("arise-from-the-shadow") ||
      id.includes("entertainment-district") ||
      id.includes("swordsmith-village") ||
      id.includes("hashira-training") ||
      id.includes("mugen-train-arc") ||
      title.includes("yuukaku-hen") ||
      title.includes("katanakaji no sato") ||
      title.includes("hashira geiko")
    );
  };

  const isMovieOrSpecial = (r: any): boolean => {
    const id = (r.id || "").toLowerCase();
    const title = (r.title || "").toLowerCase();
    return (
      id.includes("-movie") ||
      title.includes("movie") ||
      id.includes("-special") ||
      id.includes("-ova") ||
      id.includes("-0") ||
      title.includes(" 0") ||
      id.includes("hidden-inventory") ||
      title.includes("kaigyoku")
    );
  };

  if (targetSeason === 1) {
    // For Season 1: strictly reject sequels and movies
    const exactS1 = candidates.filter((r) => !isSequel(r) && !isMovieOrSpecial(r));
    if (exactS1.length > 0) {
      exactS1.sort((a, b) => (a.id || "").length - (b.id || "").length);
      return exactS1[0];
    }

    const anyNonSequel = candidates.filter((r) => !isSequel(r));
    if (anyNonSequel.length > 0) {
      anyNonSequel.sort((a, b) => (a.id || "").length - (b.id || "").length);
      return anyNonSequel[0];
    }

    // Do NOT return a Season 2 or Season 3 anime for Season 1
    return null;
  }

  // For Season 2+
  const targetPatterns = [
    `-${targetSeason}-`,
    `-${targetSeason}`,
    `-season-${targetSeason}`,
    `-part-${targetSeason}`,
    `season ${targetSeason}`,
    `season${targetSeason}`,
    `${targetSeason}nd season`,
    `${targetSeason}rd season`,
    `${targetSeason}th season`,
    `part ${targetSeason}`,
    ` ${targetSeason}`,
  ];

  const matched = candidates.find((r) => {
    const id = (r.id || "").toLowerCase();
    const title = (r.title || "").toLowerCase();
    return targetPatterns.some((p) => id.includes(p) || title.includes(p));
  });

  return matched || null;
}

// 1. AnimeUnity (Italian provider from Consumet with Vixcloud HLS streams)
export async function resolveConsumetAnimeUnity(
  title: string,
  episodeNumber: number,
  seasonNumber?: number | null
): Promise<ConsumetWatchResponse | null> {
  try {
    const ANIME = getConsumetAnime();
    if (!ANIME?.AnimeUnity) return null;
    const unity = new ANIME.AnimeUnity();
    const searchRes: any = await unity.search(title).catch(() => null);
    const results = searchRes?.results || (Array.isArray(searchRes) ? searchRes : []);
    if (!results || results.length === 0) return null;

    const best = selectAnimeUnityResult(results, title, seasonNumber);
    if (!best) return null;

    const animeInfo: any = await unity.fetchAnimeInfo(best.id).catch(() => null);
    if (!animeInfo?.episodes || animeInfo.episodes.length === 0) return null;

    const targetEp =
      animeInfo.episodes.find((e: any) => Number(e.number) === episodeNumber) ||
      animeInfo.episodes[episodeNumber - 1];
    if (!targetEp) return null;

    const sourceData: any = await unity.fetchEpisodeSources(targetEp.id).catch(() => null);
    if (!sourceData?.sources || !Array.isArray(sourceData.sources) || sourceData.sources.length === 0) {
      return null;
    }

    const validSources: ConsumetSource[] = sourceData.sources
      .filter((s: any) => s.url && (s.isM3U8 || s.url.includes(".m3u8")) && isRealVideoStream(s.url))
      .map((s: any) => ({
        url: s.url,
        isM3U8: true,
        quality: s.quality || "1080p",
      }));

    if (validSources.length === 0) return null;

    return {
      providerId: "animeunity",
      headers: { Referer: "https://www.animeunity.to" },
      sources: validSources,
      download: sourceData.download,
    };
  } catch (err: any) {
    console.warn(`[Consumet:AnimeUnity] Notice:`, err?.message || err);
    return null;
  }
}

// 2. Gogoanime (Classic Vidstreaming HLS extractor per Consumet specs)
export async function resolveConsumetGogoanime(
  title: string,
  episodeNumber: number,
  seasonNumber?: number | null
): Promise<ConsumetWatchResponse | null> {
  try {
    const http = new HttpClient({ timeoutMs: 6500 });
    const gogo = new GogoanimeProvider(http);
    const searchClean = cleanTitleForConsumet(title, seasonNumber);

    const searchRes: any = await gogo.search(searchClean).catch(() => []);
    const results = Array.isArray(searchRes) ? [...searchRes] : [];
    if (results.length === 0) return null;

    let best = results[0];
    if (seasonNumber && seasonNumber > 1) {
      const sMatch = results.find((r: any) =>
        (r.title || "").toLowerCase().includes(`season ${seasonNumber}`)
      );
      if (sMatch) best = sMatch;
    }

    const units: any = await gogo.fetchContentUnits(best.id).catch(() => []);
    if (!units || units.length === 0) return null;

    const targetUnit =
      units.find((u: any) => Number(u.number) === episodeNumber) ||
      units[episodeNumber - 1];
    if (!targetUnit) return null;

    const stream: any = await gogo.resolveStream(targetUnit.id, "sub").catch(() => null);
    if (!stream?.streams || !Array.isArray(stream.streams) || stream.streams.length === 0) {
      return null;
    }

    const validSources: ConsumetSource[] = stream.streams
      .filter((s: any) => s.sourceUrl && isRealVideoStream(s.sourceUrl))
      .map((s: any) => ({
        url: s.sourceUrl,
        isM3U8: Boolean(s.isHLS || s.sourceUrl.includes(".m3u8")),
        quality: s.quality || "auto",
      }));

    if (validSources.length === 0) return null;

    return {
      providerId: "gogoanime",
      headers: stream.streams[0]?.headers || { Referer: "https://gogoanime.ee" },
      sources: validSources,
      subtitles: [],
    };
  } catch (err: any) {
    console.warn(`[Consumet:Gogoanime] Notice:`, err?.message || err);
    return null;
  }
}

// 3. AnimeParadise (Direct Master HLS .m3u8 extractor with multi-language WebVTT subtitles)
export async function resolveConsumetAnimeParadise(
  title: string,
  episodeNumber: number,
  seasonNumber?: number | null
): Promise<ConsumetWatchResponse | null> {
  try {
    const http = new HttpClient({ timeoutMs: 6500 });
    const paradise = new AnimeParadiseProvider(http);
    const searchClean = cleanTitleForConsumet(title, seasonNumber);

    const pSearch: any = await paradise.search(searchClean).catch(() => []);
    const pResults: any[] = Array.isArray(pSearch) ? [...pSearch] : [];
    if (pResults.length === 0) {
      const baseTitle = title.replace(/\s*(?:Season\s*\d+|Part\s*\d+).*$/i, "").trim();
      const fb: any = await paradise.search(baseTitle).catch(() => []);
      if (Array.isArray(fb)) pResults.push(...fb);
    }
    if (pResults.length === 0) return null;

    let best = pResults[0];
    if (seasonNumber && seasonNumber > 1) {
      const sMatch = pResults.find((r: any) =>
        (r.title || "").toLowerCase().includes(`season ${seasonNumber}`)
      );
      if (sMatch) best = sMatch;
    }

    const units: any = await paradise.fetchContentUnits(best.id).catch(() => []);
    if (!units || units.length === 0) return null;

    const targetUnit =
      units.find((u: any) => Number(u.number) === episodeNumber) ||
      units[episodeNumber - 1];
    if (!targetUnit) return null;

    const stream: any = await paradise.resolveStream(targetUnit.id, "sub").catch(() => null);
    if (!stream?.streams || !Array.isArray(stream.streams) || stream.streams.length === 0) {
      return null;
    }

    const validSources: ConsumetSource[] = stream.streams
      .filter((s: any) => s.sourceUrl && isRealVideoStream(s.sourceUrl))
      .map((s: any) => ({
        url: s.sourceUrl,
        isM3U8: true,
        quality: s.quality || "1080p",
      }));

    const subtitles: ConsumetSubtitle[] = (stream.streams[0]?.subtitles || []).map((sub: any, idx: number) => ({
      url: sub.url,
      lang: sub.language || "en",
      label: sub.label || "English",
      default: idx === 0,
    }));

    if (validSources.length === 0) return null;

    return {
      providerId: "animeparadise",
      headers: stream.streams[0]?.headers || { Referer: "https://animeparadise.moe" },
      sources: validSources,
      subtitles,
    };
  } catch (err: any) {
    console.warn(`[Consumet:AnimeParadise] Notice:`, err?.message || err);
    return null;
  }
}

// 4. HiAnime / Zoro (Consumet extensions provider + REST API fallback)
export async function resolveConsumetHiAnime(
  title: string,
  episodeNumber: number
): Promise<ConsumetWatchResponse | null> {
  // Try remote Consumet REST API endpoint
  try {
    const slug = cleanTitleForConsumet(title).toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
    const rest = await queryConsumetRestApi(`anime/zoro/watch?episodeId=${slug}$episode$${episodeNumber}`, 3000);
    if (rest?.sources && Array.isArray(rest.sources)) {
      const validSources = rest.sources
        .filter((s: any) => s.url && (s.isM3U8 || s.url.includes(".m3u8")) && isRealVideoStream(s.url))
        .map((s: any) => ({ url: s.url, isM3U8: true, quality: s.quality || "1080p" }));
      if (validSources.length > 0) {
        return {
          providerId: "hianime",
          headers: rest.headers,
          sources: validSources,
          subtitles: rest.subtitles,
        };
      }
    }
  } catch {}

  // In-process fallback
  try {
    const ANIME = getConsumetAnime();
    if (!ANIME?.Hianime) return null;
    const hianime = new ANIME.Hianime();
    const res: any = await hianime.search(title).catch(() => null);
    if (res?.results && res.results.length > 0) {
      const epSources: any = await hianime.fetchEpisodeSources(
        `${res.results[0].id}$episode$${episodeNumber}`
      ).catch(() => null);
      if (epSources?.sources && Array.isArray(epSources.sources)) {
        const validSources = epSources.sources
          .filter((s: any) => s.url && (s.isM3U8 || s.url.includes(".m3u8")) && isRealVideoStream(s.url))
          .map((s: any) => ({ url: s.url, isM3U8: true, quality: s.quality || "1080p" }));
        if (validSources.length > 0) {
          return {
            providerId: "hianime",
            sources: validSources,
            subtitles: epSources.subtitles,
          };
        }
      }
    }
  } catch {}

  return null;
}

// 5. AnimePahe (Consumet extensions provider + REST API fallback)
export async function resolveConsumetAnimePahe(
  title: string,
  episodeNumber: number
): Promise<ConsumetWatchResponse | null> {
  try {
    const slug = cleanTitleForConsumet(title).toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
    const rest = await queryConsumetRestApi(`anime/animepahe/watch/${slug}?ep=${episodeNumber}`, 3000);
    if (rest?.sources && Array.isArray(rest.sources)) {
      const validSources = rest.sources
        .filter((s: any) => s.url && (s.isM3U8 || s.url.includes(".m3u8")) && isRealVideoStream(s.url))
        .map((s: any) => ({ url: s.url, isM3U8: true, quality: s.quality || "1080p" }));
      if (validSources.length > 0) {
        return {
          providerId: "animepahe",
          headers: rest.headers,
          sources: validSources,
          subtitles: rest.subtitles,
        };
      }
    }
  } catch {}

  return null;
}

// 6. AnimeKai (Consumet extensions provider + REST API fallback)
export async function resolveConsumetAnimeKai(
  title: string,
  episodeNumber: number
): Promise<ConsumetWatchResponse | null> {
  try {
    const slug = cleanTitleForConsumet(title).toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
    const rest = await queryConsumetRestApi(`anime/animekai/watch/${slug}-episode-${episodeNumber}`, 3000);
    if (rest?.sources && Array.isArray(rest.sources)) {
      const validSources = rest.sources
        .filter((s: any) => s.url && (s.isM3U8 || s.url.includes(".m3u8")) && isRealVideoStream(s.url))
        .map((s: any) => ({ url: s.url, isM3U8: true, quality: s.quality || "1080p" }));
      if (validSources.length > 0) {
        return {
          providerId: "animekai",
          sources: validSources,
          subtitles: rest.subtitles,
        };
      }
    }
  } catch {}

  return null;
}

// 7. KickAssAnime (Consumet extensions provider + REST API fallback)
export async function resolveConsumetKickAssAnime(
  title: string,
  episodeNumber: number
): Promise<ConsumetWatchResponse | null> {
  try {
    const slug = cleanTitleForConsumet(title).toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
    const rest = await queryConsumetRestApi(`anime/kickassanime/watch/${slug}-episode-${episodeNumber}`, 3000);
    if (rest?.sources && Array.isArray(rest.sources)) {
      const validSources = rest.sources
        .filter((s: any) => s.url && (s.isM3U8 || s.url.includes(".m3u8")) && isRealVideoStream(s.url))
        .map((s: any) => ({ url: s.url, isM3U8: true, quality: s.quality || "1080p" }));
      if (validSources.length > 0) {
        return {
          providerId: "kickassanime",
          sources: validSources,
        };
      }
    }
  } catch {}

  return null;
}

// 8. AnimeSaturn (Consumet extensions provider + REST API fallback)
export async function resolveConsumetAnimeSaturn(
  title: string,
  episodeNumber: number
): Promise<ConsumetWatchResponse | null> {
  try {
    const slug = cleanTitleForConsumet(title).toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
    const rest = await queryConsumetRestApi(`anime/animesaturn/watch/${slug}-episode-${episodeNumber}`, 3000);
    if (rest?.sources && Array.isArray(rest.sources)) {
      const validSources = rest.sources
        .filter((s: any) => s.url && (s.isM3U8 || s.url.includes(".m3u8")) && isRealVideoStream(s.url))
        .map((s: any) => ({ url: s.url, isM3U8: true, quality: s.quality || "1080p" }));
      if (validSources.length > 0) {
        return {
          providerId: "animesaturn",
          sources: validSources,
        };
      }
    }
  } catch {}

  return null;
}

// 9. AnimeSama (Consumet extensions provider + REST API fallback)
export async function resolveConsumetAnimeSama(
  title: string,
  episodeNumber: number
): Promise<ConsumetWatchResponse | null> {
  try {
    const slug = cleanTitleForConsumet(title).toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
    const rest = await queryConsumetRestApi(`anime/animesama/watch/${slug}-episode-${episodeNumber}`, 3000);
    if (rest?.sources && Array.isArray(rest.sources)) {
      const validSources = rest.sources
        .filter((s: any) => s.url && (s.isM3U8 || s.url.includes(".m3u8")) && isRealVideoStream(s.url))
        .map((s: any) => ({ url: s.url, isM3U8: true, quality: s.quality || "1080p" }));
      if (validSources.length > 0) {
        return {
          providerId: "animesama",
          sources: validSources,
        };
      }
    }
  } catch {}

  return null;
}

/**
 * Executes a specific Consumet provider by ID or returns the best match
 */
export async function resolveConsumetByProvider(
  providerId: string,
  animeTitle: string,
  episodeNumber: number,
  seasonNumber?: number | null
): Promise<ConsumetWatchResponse | null> {
  const norm = providerId.toLowerCase().trim();
  switch (norm) {
    case "animeunity":
      return resolveConsumetAnimeUnity(animeTitle, episodeNumber, seasonNumber);
    case "gogoanime":
      return resolveConsumetGogoanime(animeTitle, episodeNumber, seasonNumber);
    case "animeparadise":
      return resolveConsumetAnimeParadise(animeTitle, episodeNumber, seasonNumber);
    case "hianime":
    case "zoro":
      return resolveConsumetHiAnime(animeTitle, episodeNumber);
    case "animepahe":
      return resolveConsumetAnimePahe(animeTitle, episodeNumber);
    case "animekai":
      return resolveConsumetAnimeKai(animeTitle, episodeNumber);
    case "kickassanime":
      return resolveConsumetKickAssAnime(animeTitle, episodeNumber);
    case "animesaturn":
      return resolveConsumetAnimeSaturn(animeTitle, episodeNumber);
    case "animesama":
      return resolveConsumetAnimeSama(animeTitle, episodeNumber);
    default:
      return null;
  }
}

/**
 * Universal Consumet Stream Resolver across ALL official providers from https://docs.consumet.org/list-of-providers
 * Runs providers in parallel with safe timeouts to retrieve verified HLS (.m3u8) video sources and subtitles.
 */
export async function resolveConsumetStreams({
  animeTitle,
  episodeNumber,
  anilistId,
  malId,
  seasonNumber,
  providerFilter,
}: {
  animeTitle: string;
  episodeNumber: number;
  anilistId?: number | null;
  malId?: number | null;
  seasonNumber?: number | null;
  providerFilter?: string;
}): Promise<DiscoveredStreamSource[]> {
  const results: DiscoveredStreamSource[] = [];
  const seenUrls = new Set<string>();

  console.log(
    `[Consumet] Resolving HLS streams for "${animeTitle}" EP ${episodeNumber} across all Consumet providers...`
  );

  // If a specific provider was requested, only run that one
  if (providerFilter) {
    const single = await resolveConsumetByProvider(providerFilter, animeTitle, episodeNumber, seasonNumber);
    if (single && single.sources.length > 0) {
      for (const src of single.sources) {
        if (!src.url || !isRealVideoStream(src.url) || seenUrls.has(src.url.trim())) continue;
        seenUrls.add(src.url.trim());
        results.push({
          type: "SUB",
          language: "Japanese (Consumet HLS)",
          videoUrl: src.url,
          quality: src.quality || "1080p",
          isHls: true,
          isDefault: false,
          serverName: `${single.providerId.charAt(0).toUpperCase() + single.providerId.slice(1)} (HLS ${src.quality || "1080p"})`,
          subtitles: single.subtitles?.map((s) => ({
            language: s.lang || "en",
            label: s.label || "English",
            subtitleUrl: s.url,
            isDefault: Boolean(s.default),
          })),
        });
      }
    }
    return results;
  }

  // Otherwise, run all primary Consumet providers concurrently in parallel with safe timeouts
  const providerPromises = [
    // 1. AnimeParadise (Fast direct 1080p master .m3u8 HLS)
    resolveConsumetAnimeParadise(animeTitle, episodeNumber, seasonNumber),
    // 2. AnimeUnity (Direct Vixcloud 1080p HLS)
    resolveConsumetAnimeUnity(animeTitle, episodeNumber, seasonNumber),
    // 3. Gogoanime (Vidstreaming HLS)
    resolveConsumetGogoanime(animeTitle, episodeNumber, seasonNumber),
    // 4. HiAnime / Zoro
    resolveConsumetHiAnime(animeTitle, episodeNumber),
    // 5. AnimePahe
    resolveConsumetAnimePahe(animeTitle, episodeNumber),
    // 6. AnimeKai
    resolveConsumetAnimeKai(animeTitle, episodeNumber),
    // 7. KickAssAnime
    resolveConsumetKickAssAnime(animeTitle, episodeNumber),
    // 8. AnimeSaturn
    resolveConsumetAnimeSaturn(animeTitle, episodeNumber),
    // 9. AnimeSama
    resolveConsumetAnimeSama(animeTitle, episodeNumber),
  ];

  const settled = await Promise.allSettled(providerPromises);

  for (const item of settled) {
    if (item.status === "fulfilled" && item.value && Array.isArray(item.value.sources)) {
      const resp = item.value;
      for (const src of resp.sources) {
        if (!src.url || !isRealVideoStream(src.url)) continue;
        const urlKey = src.url.trim();
        if (seenUrls.has(urlKey)) continue;
        seenUrls.add(urlKey);

        const subList = (resp.subtitles || []).map((sub: any, idx: number) => ({
          language: sub.lang || "en",
          label: sub.label || "English",
          subtitleUrl: sub.url,
          isDefault: sub.default !== undefined ? sub.default : idx === 0,
        }));

        const provName =
          resp.providerId === "animeunity"
            ? "AnimeUnity"
            : resp.providerId === "gogoanime"
            ? "Gogoanime"
            : resp.providerId === "animeparadise"
            ? "AnimeParadise"
            : resp.providerId === "hianime"
            ? "HiAnime"
            : resp.providerId === "animepahe"
            ? "AnimePahe"
            : resp.providerId === "animekai"
            ? "AnimeKai"
            : resp.providerId === "kickassanime"
            ? "KickAssAnime"
            : resp.providerId === "animesaturn"
            ? "AnimeSaturn"
            : resp.providerId === "animesama"
            ? "AnimeSama"
            : "Consumet";

        results.push({
          type: "SUB",
          language: "Japanese (Consumet HLS)",
          videoUrl: src.url,
          quality: src.quality && src.quality !== "auto" ? src.quality : "1080p",
          isHls: true,
          isDefault: false,
          serverName: `${provName} (HLS ${src.quality || "1080p"})`,
          subtitles: subList.length > 0 ? subList : undefined,
        });
      }
    }
  }

  console.log(
    `[Consumet] Total HLS sources discovered across all providers for "${animeTitle}" EP ${episodeNumber}: ${results.length}`
  );

  return results;
}

