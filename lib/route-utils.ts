import { cleanAudioParam } from "@/lib/vidly";

export interface ParsedAnimeParams {
  idType: "ani" | "mal";
  id: number;
  episode: number;
  audio: string;
}

export interface ParsedMovieParams {
  tmdbId: number;
  audio: string;
}

export interface ParsedTvParams {
  tmdbId: number;
  season: number;
  episode: number;
  audio: string;
}

function cleanAudioSegment(raw?: string | null): string {
  if (!raw) return "";
  let s = String(raw).trim();
  try {
    s = decodeURIComponent(s).trim();
  } catch {}
  s = s.replace(/^["']+|["']+$/g, "").trim();
  if (s.toLowerCase().startsWith("audio=")) {
    s = s.slice(6).trim();
    s = s.replace(/^["']+|["']+$/g, "").trim();
  }
  return s;
}

/**
 * Normalizes an anime audio path/query value into "dub", "sub", or an ISO language code.
 * Defaults to "dub" (English) when omitted.
 */
export function resolveAnimeAudioParam(raw?: string | null): string {
  const cleaned = cleanAudioSegment(raw);
  if (!cleaned) return "dub";
  const norm = cleanAudioParam(cleaned);
  if (norm.code === "ja") return "sub";
  if (norm.code === "en") return "dub";
  return norm.code;
}

export function parseAnimeSlug(
  slug?: string[] | null,
  searchParams?: URLSearchParams
): ParsedAnimeParams | null {
  const parts = slug ? [...slug] : [];
  let idType: "ani" | "mal" = "ani";
  let idStr = "";
  let epStr = "1";
  let audioStr = searchParams?.get("audio") || "";

  if (parts.length > 0) {
    if (parts[0].toLowerCase() === "ani" || parts[0].toLowerCase() === "mal") {
      idType = parts[0].toLowerCase() as "ani" | "mal";
      idStr = parts[1] || "";
      epStr = parts[2] || "1";
      if (parts[3] && !audioStr) {
        audioStr = parts[3];
      }
    } else {
      idStr = parts[0] || "";
      epStr = parts[1] || "1";
      if (parts[2] && !audioStr) {
        audioStr = parts[2];
      }
    }
  }

  const cleanEp = parseInt(epStr.replace(/\.m3u8$/i, ""), 10) || 1;
  const cleanId = parseInt(idStr, 10);
  if (!cleanId || isNaN(cleanId)) return null;

  const audioClean = cleanAudioSegment(audioStr) || "english";

  return {
    idType,
    id: cleanId,
    episode: cleanEp,
    audio: audioClean,
  };
}

export function parseMovieSlug(
  slug?: string[] | null,
  searchParams?: URLSearchParams
): ParsedMovieParams | null {
  const parts = slug ? [...slug] : [];
  let idStr = parts[0] || searchParams?.get("tmdb_id") || searchParams?.get("id") || "";
  let audioStr = searchParams?.get("audio") || "";

  if (parts[1] && !audioStr) {
    audioStr = parts[1];
  }

  const cleanId = parseInt(idStr.replace(/\.m3u8$/i, ""), 10);
  if (!cleanId || isNaN(cleanId)) return null;

  const audioClean = cleanAudioSegment(audioStr) || "english";

  return {
    tmdbId: cleanId,
    audio: audioClean,
  };
}

export function parseTvSlug(
  slug?: string[] | null,
  searchParams?: URLSearchParams
): ParsedTvParams | null {
  const parts = slug ? [...slug] : [];
  let idStr = parts[0] || searchParams?.get("tmdb_id") || searchParams?.get("id") || "";
  let season = parseInt(searchParams?.get("season") || searchParams?.get("s") || "1", 10) || 1;
  let episode = parseInt(searchParams?.get("episode") || searchParams?.get("ep") || searchParams?.get("e") || "1", 10) || 1;
  let audioStr = searchParams?.get("audio") || "";

  if (parts.length === 2) {
    // /tv/1399/1 -> episode 1 (season 1) or audio?
    // If parts[1] is a number, it's episode.
    if (/^\d+(\.m3u8)?$/i.test(parts[1])) {
      episode = parseInt(parts[1].replace(/\.m3u8$/i, ""), 10) || 1;
    } else {
      audioStr = parts[1];
    }
  } else if (parts.length === 3) {
    // Could be: /tv/1399/1/audio="english" (id, ep, audio)
    // OR /tv/1399/2/5 (id, season, episode)
    if (/^\d+$/i.test(parts[1]) && /^\d+(\.m3u8)?$/i.test(parts[2])) {
      season = parseInt(parts[1], 10) || 1;
      episode = parseInt(parts[2].replace(/\.m3u8$/i, ""), 10) || 1;
    } else if (/^\d+(\.m3u8)?$/i.test(parts[1])) {
      episode = parseInt(parts[1].replace(/\.m3u8$/i, ""), 10) || 1;
      audioStr = parts[2];
    }
  } else if (parts.length >= 4) {
    // /tv/1399/2/5/audio="english" (id, season, episode, audio)
    season = parseInt(parts[1], 10) || 1;
    episode = parseInt(parts[2].replace(/\.m3u8$/i, ""), 10) || 1;
    if (!audioStr) {
      audioStr = parts[3];
    }
  }

  const cleanId = parseInt(idStr.replace(/\.m3u8$/i, ""), 10);
  if (!cleanId || isNaN(cleanId)) return null;

  const audioClean = cleanAudioSegment(audioStr) || "english";

  return {
    tmdbId: cleanId,
    season,
    episode,
    audio: audioClean,
  };
}
