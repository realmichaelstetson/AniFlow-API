import axios from "axios";

export interface SkipTimeInterval {
  start: number;
  end: number;
}

export interface EpisodeSkipTimes {
  intro: SkipTimeInterval | null;
  outro: SkipTimeInterval | null;
}

const skipTimesCache = new Map<string, { data: EpisodeSkipTimes; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Resolves opening and ending skip timestamps via AniSkip API
 */
export async function getEpisodeSkipTimes(
  malId: number | null | undefined,
  episodeNumber: number,
  episodeLengthSeconds: number = 0
): Promise<EpisodeSkipTimes> {
  if (!malId) {
    return { intro: null, outro: null };
  }

  const cacheKey = `${malId}-${episodeNumber}`;
  const cached = skipTimesCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNumber}?types=op&types=ed&episodeLength=${Math.floor(episodeLengthSeconds)}`;
    const res = await axios.get(url, {
      timeout: 3500,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) VidHawk-API",
        Accept: "application/json",
      },
    });

    let intro: SkipTimeInterval | null = null;
    let outro: SkipTimeInterval | null = null;

    if (res.data?.found && Array.isArray(res.data.results)) {
      for (const item of res.data.results) {
        if (item.skipType === "op" && item.interval) {
          intro = {
            start: Math.floor(item.interval.startTime),
            end: Math.floor(item.interval.endTime),
          };
        } else if (item.skipType === "ed" && item.interval) {
          outro = {
            start: Math.floor(item.interval.startTime),
            end: Math.floor(item.interval.endTime),
          };
        }
      }
    }

    const result = { intro, outro };
    skipTimesCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch {
    return { intro: null, outro: null };
  }
}
