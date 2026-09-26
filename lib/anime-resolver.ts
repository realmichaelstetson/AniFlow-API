import axios from "axios";

export interface AnimeMapping {
  anilistId: number;
  malId: number | null;
  title: string;
  romajiTitle?: string;
  nativeTitle?: string;
  coverImage?: string;
  episodes?: number;
}

const anilistToMalCache = new Map<number, AnimeMapping>();
const malToAnilistCache = new Map<number, AnimeMapping>();

/**
 * Resolve anime details and MAL ID from AniList ID
 */
export async function resolveFromAniListId(anilistId: number): Promise<AnimeMapping | null> {
  if (anilistToMalCache.has(anilistId)) {
    return anilistToMalCache.get(anilistId)!;
  }

  // 1. AniList GraphQL
  try {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          idMal
          title {
            english
            romaji
            native
          }
          coverImage {
            large
            medium
          }
          episodes
        }
      }
    `;

    const res = await axios.post(
      "https://graphql.anilist.co",
      { query, variables: { id: anilistId } },
      { timeout: 5000 }
    );

    const media = res.data?.data?.Media;
    if (media) {
      const mapping: AnimeMapping = {
        anilistId: media.id,
        malId: media.idMal || null,
        title: media.title?.english || media.title?.romaji || media.title?.native || `Anime ${anilistId}`,
        romajiTitle: media.title?.romaji,
        nativeTitle: media.title?.native,
        coverImage: media.coverImage?.large || media.coverImage?.medium,
        episodes: media.episodes,
      };

      anilistToMalCache.set(anilistId, mapping);
      if (media.idMal) {
        malToAnilistCache.set(media.idMal, mapping);
      }
      return mapping;
    }
  } catch {}

  // 2. ARM API fallback
  try {
    const armRes = await axios.get(
      `https://arm.haglund.dev/api/v2/ids?source=anilist&id=${anilistId}`,
      { timeout: 4000 }
    );
    const malId = armRes.data?.myanimelist ? parseInt(armRes.data.myanimelist, 10) : null;
    const mapping: AnimeMapping = {
      anilistId,
      malId,
      title: `Anime ${anilistId}`,
    };
    anilistToMalCache.set(anilistId, mapping);
    if (malId) malToAnilistCache.set(malId, mapping);
    return mapping;
  } catch {}

  return null;
}

/**
 * Resolve anime details and AniList ID from MAL ID
 */
export async function resolveFromMalId(malId: number): Promise<AnimeMapping | null> {
  if (malToAnilistCache.has(malId)) {
    return malToAnilistCache.get(malId)!;
  }

  // 1. AniList GraphQL by MAL ID
  try {
    const query = `
      query ($idMal: Int) {
        Media(idMal: $idMal, type: ANIME) {
          id
          idMal
          title {
            english
            romaji
            native
          }
          coverImage {
            large
            medium
          }
          episodes
        }
      }
    `;

    const res = await axios.post(
      "https://graphql.anilist.co",
      { query, variables: { idMal: malId } },
      { timeout: 5000 }
    );

    const media = res.data?.data?.Media;
    if (media) {
      const mapping: AnimeMapping = {
        anilistId: media.id,
        malId: media.idMal || malId,
        title: media.title?.english || media.title?.romaji || media.title?.native || `Anime MAL ${malId}`,
        romajiTitle: media.title?.romaji,
        nativeTitle: media.title?.native,
        coverImage: media.coverImage?.large || media.coverImage?.medium,
        episodes: media.episodes,
      };

      malToAnilistCache.set(malId, mapping);
      anilistToMalCache.set(media.id, mapping);
      return mapping;
    }
  } catch {}

  // 2. ARM API fallback
  try {
    const armRes = await axios.get(
      `https://arm.haglund.dev/api/v2/ids?source=myanimelist&id=${malId}`,
      { timeout: 4000 }
    );
    const anilistId = armRes.data?.anilist ? parseInt(armRes.data.anilist, 10) : malId;
    const mapping: AnimeMapping = {
      anilistId,
      malId,
      title: `Anime MAL ${malId}`,
    };
    malToAnilistCache.set(malId, mapping);
    anilistToMalCache.set(anilistId, mapping);
    return mapping;
  } catch {}

  return null;
}
