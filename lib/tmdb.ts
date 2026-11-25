import axios from "axios";

const TMDB_API_KEY = "4e44d9029b1270a757cddc766a1bcb63";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export interface TmdbMovie {
  id: number;
  title: string;
  original_title?: string;
  overview?: string;
  release_date?: string;
  year?: string;
  poster?: string | null;
  backdrop?: string | null;
  runtime?: number;
  vote_average?: number;
  genres?: string[];
}

export interface TmdbTvSeason {
  season_number: number;
  name: string;
  episode_count: number;
  poster_path?: string | null;
}

export interface TmdbTv {
  id: number;
  name: string;
  original_name?: string;
  overview?: string;
  first_air_date?: string;
  year?: string;
  poster?: string | null;
  backdrop?: string | null;
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: TmdbTvSeason[];
  vote_average?: number;
  genres?: string[];
}

const tmdbCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 mins

export async function getTmdbMovie(tmdbId: number): Promise<TmdbMovie | null> {
  const cacheKey = `movie_${tmdbId}`;
  const cached = tmdbCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const res = await axios.get(`${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}`, {
      timeout: 6000,
    });
    const d = res.data;
    const year = d.release_date ? d.release_date.split("-")[0] : undefined;
    const movie: TmdbMovie = {
      id: d.id,
      title: d.title || d.original_title || `Movie ${tmdbId}`,
      original_title: d.original_title,
      overview: d.overview,
      release_date: d.release_date,
      year,
      poster: d.poster_path ? `${TMDB_IMAGE_BASE}/w500${d.poster_path}` : null,
      backdrop: d.backdrop_path ? `${TMDB_IMAGE_BASE}/w1280${d.backdrop_path}` : null,
      runtime: d.runtime,
      vote_average: d.vote_average,
      genres: d.genres?.map((g: any) => g.name) || [],
    };
    tmdbCache.set(cacheKey, { data: movie, timestamp: Date.now() });
    return movie;
  } catch (err: any) {
    return null;
  }
}

export async function getTmdbTv(tmdbId: number): Promise<TmdbTv | null> {
  const cacheKey = `tv_${tmdbId}`;
  const cached = tmdbCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const res = await axios.get(`${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`, {
      timeout: 6000,
    });
    const d = res.data;
    const year = d.first_air_date ? d.first_air_date.split("-")[0] : undefined;
    const tv: TmdbTv = {
      id: d.id,
      name: d.name || d.original_name || `TV Show ${tmdbId}`,
      original_name: d.original_name,
      overview: d.overview,
      first_air_date: d.first_air_date,
      year,
      poster: d.poster_path ? `${TMDB_IMAGE_BASE}/w500${d.poster_path}` : null,
      backdrop: d.backdrop_path ? `${TMDB_IMAGE_BASE}/w1280${d.backdrop_path}` : null,
      number_of_seasons: d.number_of_seasons,
      number_of_episodes: d.number_of_episodes,
      seasons: (d.seasons || [])
        .filter((s: any) => s.season_number > 0)
        .map((s: any) => ({
          season_number: s.season_number,
          name: s.name,
          episode_count: s.episode_count,
          poster_path: s.poster_path ? `${TMDB_IMAGE_BASE}/w300${s.poster_path}` : null,
        })),
      vote_average: d.vote_average,
      genres: d.genres?.map((g: any) => g.name) || [],
    };
    tmdbCache.set(cacheKey, { data: tv, timestamp: Date.now() });
    return tv;
  } catch (err: any) {
    return null;
  }
}

export async function searchTmdb(query: string, type: "movie" | "tv" | "multi" = "multi"): Promise<any[]> {
  try {
    const res = await axios.get(`${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`, {
      timeout: 5000,
    });
    return res.data?.results || [];
  } catch {
    return [];
  }
}
