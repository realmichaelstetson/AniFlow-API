import { NextRequest, NextResponse } from "next/server";
import { getVidlyMovieSources, getVidlyTvSources, cleanAudioParam, VidlyKatanaSource, fetchVidlyManifestText } from "@/lib/vidly";
import { getTmdbMovie, getTmdbTv } from "@/lib/tmdb";
import { buildDownloadPlan, streamDownload } from "@/lib/episode-download";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export const DOWNLOAD_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "Content-Disposition, X-Episode-Duration, X-Episode-Resolution",
};

function orderMediaCandidates(
  sources: VidlyKatanaSource[],
  serverParam: string,
  audioCode: string
): VidlyKatanaSource[] {
  const matchesServer = (s: VidlyKatanaSource) =>
    Boolean(
      serverParam &&
        (s.id.toLowerCase() === serverParam ||
          s.server.toLowerCase().includes(serverParam) ||
          s.serverName.toLowerCase().includes(serverParam))
    );
  const matchesAudio = (s: VidlyKatanaSource) =>
    s.audioTracks.some((t) => t.id === audioCode);

  const buckets: VidlyKatanaSource[][] = serverParam
    ? [
        sources.filter((s) => matchesServer(s) && matchesAudio(s) && !s.isHevc),
        sources.filter((s) => matchesServer(s) && matchesAudio(s) && s.isHevc),
        sources.filter((s) => matchesServer(s) && !s.isHevc),
        sources.filter((s) => matchesServer(s) && s.isHevc),
        sources.filter((s) => matchesAudio(s) && !s.isHevc),
        sources.filter((s) => matchesAudio(s) && s.isHevc),
        sources.filter((s) => !s.isHevc),
        sources.filter((s) => s.isHevc),
      ]
    : [
        sources.filter((s) => matchesAudio(s) && !s.isHevc),
        sources.filter((s) => matchesAudio(s) && s.isHevc),
        sources.filter((s) => !s.isHevc),
        sources.filter((s) => s.isHevc),
      ];

  const ordered: VidlyKatanaSource[] = [];
  const seen = new Set<string>();
  for (const bucket of buckets) {
    for (const s of bucket) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        ordered.push(s);
      }
    }
  }
  return ordered;
}

async function verifyM3u8DirectUrl(directUrl?: string): Promise<boolean> {
  if (!directUrl) return false;
  try {
    const res = await fetch(directUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Referer: "https://vidly.pro/",
        Accept: "*/*",
      },
      signal: AbortSignal.timeout(4500),
    });
    if (res.ok) {
      const text = (await res.text()).replace(/^\uFEFF/, "").trimStart();
      if (text.startsWith("#EXTM3U")) return true;
    }
  } catch {}

  try {
    const bypass = await fetchVidlyManifestText(directUrl, 5000);
    if (bypass && bypass.status < 400 && bypass.body) {
      return bypass.body.replace(/^\uFEFF/, "").trimStart().startsWith("#EXTM3U");
    }
  } catch {}

  return false;
}

async function pickWorkingM3u8Source(
  sources: VidlyKatanaSource[],
  serverParam: string,
  audioCode: string
): Promise<VidlyKatanaSource | null> {
  const candidates = orderMediaCandidates(sources, serverParam, audioCode);
  for (const cand of candidates) {
    if (await verifyM3u8DirectUrl(cand.directUrl)) {
      return cand;
    }
  }
  return null;
}

function buildFilename(title: string, audio: string, ext: string, season?: number, episode?: number) {
  const base = (title || "Media").replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  if (season !== undefined && episode !== undefined) {
    const sStr = `S${String(season).padStart(2, "0")}`;
    const eStr = `E${String(episode).padStart(2, "0")}`;
    return `${base} - ${sStr}${eStr} [${audio.toUpperCase()}].${ext}`;
  }
  return `${base} [${audio.toUpperCase()}].${ext}`;
}

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function handleMoviePlay(
  request: NextRequest,
  overrideTmdbId?: number,
  overrideAudio?: string
) {
  try {
    const { searchParams } = new URL(request.url);
    const tmdbIdRaw =
      overrideTmdbId ||
      searchParams.get("tmdb_id") ||
      searchParams.get("tmdbId") ||
      searchParams.get("id");
    const audioRaw = overrideAudio || searchParams.get("audio") || "english";
    const serverParam = (searchParams.get("server") || "").toLowerCase();
    const format = searchParams.get("format");
    const wantsM3u8 =
      format === "m3u8" ||
      searchParams.get("m3u8") === "true" ||
      request.headers.get("accept")?.includes("application/vnd.apple.mpegurl") ||
      (request.nextUrl?.pathname || new URL(request.url).pathname).endsWith(".m3u8");

    if (!tmdbIdRaw) {
      return NextResponse.json(
        { success: false, error: "tmdb_id parameter is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const tmdbId = typeof tmdbIdRaw === "number" ? tmdbIdRaw : parseInt(tmdbIdRaw, 10);
    if (!tmdbId || isNaN(tmdbId)) {
      return NextResponse.json(
        { success: false, error: "Invalid tmdb_id parameter" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const audioClean = cleanAudioParam(audioRaw);

    const [sourcesRes, tmdbData] = await Promise.all([
      getVidlyMovieSources(tmdbId, audioClean.name),
      getTmdbMovie(tmdbId).catch(() => null),
    ]);

    let { sources, meta: vidlyMeta } = sourcesRes;

    if (!sources || sources.length === 0) {
      return NextResponse.json(
        { success: false, error: `No movie stream sources found for TMDB ID ${tmdbId}` },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    let ordered = orderMediaCandidates(sources, serverParam, audioClean.code);
    let chosenSource = ordered[0] || sources[0];

    const host = request.headers.get("host") || "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const baseUrl = `${protocol}://${host}`;

    if (wantsM3u8) {
      let verified = await pickWorkingM3u8Source(sources, serverParam, audioClean.code);
      if (!verified) {
        const refreshed = await getVidlyMovieSources(tmdbId, audioClean.name, { forceRefresh: true });
        if (refreshed.sources.length > 0) {
          sources = refreshed.sources;
          verified = await pickWorkingM3u8Source(sources, serverParam, audioClean.code);
        }
      }
      const finalSrc = verified || chosenSource;
      const targetM3u8 = finalSrc.videoUrl || finalSrc.m3u8;
      const absoluteUrl = targetM3u8.startsWith("http") ? targetM3u8 : new URL(targetM3u8, baseUrl).href;
      return NextResponse.redirect(absoluteUrl, { status: 302, headers: CORS_HEADERS });
    }

    const title = tmdbData?.title || vidlyMeta?.title || `Movie ${tmdbId}`;
    const year = tmdbData?.year || vidlyMeta?.year;
    const poster = tmdbData?.poster || vidlyMeta?.poster;
    const backdrop = tmdbData?.backdrop || vidlyMeta?.backdrop;
    const overview = tmdbData?.overview || vidlyMeta?.overview;

    return NextResponse.json(
      {
        success: true,
        kind: "movie",
        tmdb_id: tmdbId,
        title,
        year,
        poster,
        backdrop,
        overview,
        runtime: tmdbData?.runtime || vidlyMeta?.runtime,
        audio: audioClean.name,
        audioCode: audioClean.code,
        videoUrl: chosenSource.videoUrl,
        m3u8: chosenSource.m3u8,
        quality: chosenSource.quality,
        server: chosenSource.server,
        serverId: chosenSource.id,
        audioTracks: chosenSource.audioTracks || [],
        subtitles: chosenSource.subtitles || [],
        sources: sources.map((s) => ({
          id: s.id,
          server: s.server,
          name: s.name,
          serverName: s.serverName,
          type: s.type,
          isHls: s.isHls,
          isHevc: Boolean(s.isHevc),
          quality: s.quality,
          audio: s.audio,
          language: s.language,
          audioTracks: s.audioTracks,
          subtitles: s.subtitles || [],
          subtitlesCount: s.subtitles?.length || 0,
          videoUrl: s.videoUrl,
          m3u8: s.m3u8,
        })),
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process movie play request" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function handleTvPlay(
  request: NextRequest,
  overrideTmdbId?: number,
  overrideSeason?: number,
  overrideEpisode?: number,
  overrideAudio?: string
) {
  try {
    const { searchParams } = new URL(request.url);
    const tmdbIdRaw =
      overrideTmdbId ||
      searchParams.get("tmdb_id") ||
      searchParams.get("tmdbId") ||
      searchParams.get("id");
    const episodeRaw =
      overrideEpisode !== undefined
        ? overrideEpisode
        : searchParams.get("episode") || searchParams.get("ep") || searchParams.get("e") || "1";
    const seasonRaw =
      overrideSeason !== undefined
        ? overrideSeason
        : searchParams.get("season") || searchParams.get("s") || "1";
    const audioRaw = overrideAudio || searchParams.get("audio") || "english";
    const serverParam = (searchParams.get("server") || "").toLowerCase();
    const format = searchParams.get("format");
    const wantsM3u8 =
      format === "m3u8" ||
      searchParams.get("m3u8") === "true" ||
      request.headers.get("accept")?.includes("application/vnd.apple.mpegurl") ||
      (request.nextUrl?.pathname || new URL(request.url).pathname).endsWith(".m3u8");

    if (!tmdbIdRaw) {
      return NextResponse.json(
        { success: false, error: "tmdb_id parameter is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const tmdbId = typeof tmdbIdRaw === "number" ? tmdbIdRaw : parseInt(tmdbIdRaw, 10);
    const season = typeof seasonRaw === "number" ? seasonRaw : parseInt(String(seasonRaw), 10) || 1;
    const episode = typeof episodeRaw === "number" ? episodeRaw : parseInt(String(episodeRaw), 10) || 1;

    if (!tmdbId || isNaN(tmdbId)) {
      return NextResponse.json(
        { success: false, error: "Invalid tmdb_id parameter" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const audioClean = cleanAudioParam(audioRaw);

    const [sourcesRes, tmdbData] = await Promise.all([
      getVidlyTvSources(tmdbId, season, episode, audioClean.name),
      getTmdbTv(tmdbId).catch(() => null),
    ]);

    let { sources, meta: vidlyMeta } = sourcesRes;

    if (!sources || sources.length === 0) {
      return NextResponse.json(
        { success: false, error: `No TV stream sources found for TMDB ID ${tmdbId} S${season}E${episode}` },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    let ordered = orderMediaCandidates(sources, serverParam, audioClean.code);
    let chosenSource = ordered[0] || sources[0];

    const host = request.headers.get("host") || "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const baseUrl = `${protocol}://${host}`;

    if (wantsM3u8) {
      let verified = await pickWorkingM3u8Source(sources, serverParam, audioClean.code);
      if (!verified) {
        const refreshed = await getVidlyTvSources(tmdbId, season, episode, audioClean.name, { forceRefresh: true });
        if (refreshed.sources.length > 0) {
          sources = refreshed.sources;
          verified = await pickWorkingM3u8Source(sources, serverParam, audioClean.code);
        }
      }
      const finalSrc = verified || chosenSource;
      const targetM3u8 = finalSrc.videoUrl || finalSrc.m3u8;
      const absoluteUrl = targetM3u8.startsWith("http") ? targetM3u8 : new URL(targetM3u8, baseUrl).href;
      return NextResponse.redirect(absoluteUrl, { status: 302, headers: CORS_HEADERS });
    }

    const title = tmdbData?.name || vidlyMeta?.title || `TV Show ${tmdbId}`;
    const year = tmdbData?.year || vidlyMeta?.year;
    const poster = tmdbData?.poster || vidlyMeta?.poster;
    const backdrop = tmdbData?.backdrop || vidlyMeta?.backdrop;
    const overview = tmdbData?.overview || vidlyMeta?.overview;
    const subtitle = vidlyMeta?.subtitle || `S${season} · E${episode}`;

    return NextResponse.json(
      {
        success: true,
        kind: "tv",
        tmdb_id: tmdbId,
        season,
        episode,
        title,
        subtitle,
        year,
        poster,
        backdrop,
        overview,
        audio: audioClean.name,
        audioCode: audioClean.code,
        videoUrl: chosenSource.videoUrl,
        m3u8: chosenSource.m3u8,
        quality: chosenSource.quality,
        server: chosenSource.server,
        serverId: chosenSource.id,
        audioTracks: chosenSource.audioTracks || [],
        subtitles: chosenSource.subtitles || [],
        seasons: tmdbData?.seasons,
        sources: sources.map((s) => ({
          id: s.id,
          server: s.server,
          name: s.name,
          serverName: s.serverName,
          type: s.type,
          isHls: s.isHls,
          isHevc: Boolean(s.isHevc),
          quality: s.quality,
          audio: s.audio,
          language: s.language,
          audioTracks: s.audioTracks,
          subtitles: s.subtitles || [],
          subtitlesCount: s.subtitles?.length || 0,
          videoUrl: s.videoUrl,
          m3u8: s.m3u8,
        })),
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process TV play request" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function handleMovieDownload(
  request: NextRequest,
  tmdbId: number,
  audio: string,
  quality = 0
) {
  const playRes = await handleMoviePlay(request, tmdbId, audio);
  let playlistUrl: string | null = null;

  if (playRes.status === 302) {
    playlistUrl = playRes.headers.get("location");
  } else {
    try {
      const data = await playRes.json();
      playlistUrl = data.videoUrl || data.m3u8;
    } catch {}
  }

  if (!playlistUrl) {
    return NextResponse.json({ success: false, error: "Movie stream source not available" }, { status: 404, headers: DOWNLOAD_CORS_HEADERS });
  }

  const host = request.headers.get("host") || "localhost:3000";
  const protocol = request.headers.get("x-forwarded-proto") || "http";
  const absolutePlaylistUrl = playlistUrl.startsWith("http") ? playlistUrl : `${protocol}://${host}${playlistUrl}`;

  let plan;
  try {
    plan = await buildDownloadPlan(absolutePlaylistUrl, audio, quality, request.signal);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Failed to read movie stream playlist" }, { status: 502, headers: DOWNLOAD_CORS_HEADERS });
  }

  if (plan.video.segments.length === 0) {
    return NextResponse.json({ success: false, error: "Movie stream playlist contains no segments" }, { status: 502, headers: DOWNLOAD_CORS_HEADERS });
  }

  let result;
  try {
    result = streamDownload(plan, request.signal);
  } catch (err: any) {
    if (err?.message === "FFMPEG_REQUIRED") {
      return NextResponse.json(
        { success: false, error: "ffmpeg must be installed on host to remux separate audio track" },
        { status: 501, headers: DOWNLOAD_CORS_HEADERS }
      );
    }
    return NextResponse.json({ success: false, error: err?.message || "Failed to start movie download" }, { status: 500, headers: DOWNLOAD_CORS_HEADERS });
  }

  const tmdbData = await getTmdbMovie(tmdbId).catch(() => null);
  const title = tmdbData?.title || `Movie ${tmdbId}`;
  const filename = buildFilename(title, audio, result.container);

  return new NextResponse(result.stream, {
    status: 200,
    headers: {
      ...DOWNLOAD_CORS_HEADERS,
      "Content-Type": result.container === "mp4" ? "video/mp4" : "video/mp2t",
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "no-store",
      "X-Episode-Duration": String(Math.round(plan.video.duration)),
      "X-Episode-Resolution": plan.height ? `${plan.height}p` : "unknown",
    },
  });
}

export async function handleTvDownload(
  request: NextRequest,
  tmdbId: number,
  season: number,
  episode: number,
  audio: string,
  quality = 0
) {
  const playRes = await handleTvPlay(request, tmdbId, season, episode, audio);
  let playlistUrl: string | null = null;

  if (playRes.status === 302) {
    playlistUrl = playRes.headers.get("location");
  } else {
    try {
      const data = await playRes.json();
      playlistUrl = data.videoUrl || data.m3u8;
    } catch {}
  }

  if (!playlistUrl) {
    return NextResponse.json({ success: false, error: "TV stream source not available" }, { status: 404, headers: DOWNLOAD_CORS_HEADERS });
  }

  const host = request.headers.get("host") || "localhost:3000";
  const protocol = request.headers.get("x-forwarded-proto") || "http";
  const absolutePlaylistUrl = playlistUrl.startsWith("http") ? playlistUrl : `${protocol}://${host}${playlistUrl}`;

  let plan;
  try {
    plan = await buildDownloadPlan(absolutePlaylistUrl, audio, quality, request.signal);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Failed to read TV stream playlist" }, { status: 502, headers: DOWNLOAD_CORS_HEADERS });
  }

  if (plan.video.segments.length === 0) {
    return NextResponse.json({ success: false, error: "TV stream playlist contains no segments" }, { status: 502, headers: DOWNLOAD_CORS_HEADERS });
  }

  let result;
  try {
    result = streamDownload(plan, request.signal);
  } catch (err: any) {
    if (err?.message === "FFMPEG_REQUIRED") {
      return NextResponse.json(
        { success: false, error: "ffmpeg must be installed on host to remux separate audio track" },
        { status: 501, headers: DOWNLOAD_CORS_HEADERS }
      );
    }
    return NextResponse.json({ success: false, error: err?.message || "Failed to start TV download" }, { status: 500, headers: DOWNLOAD_CORS_HEADERS });
  }

  const tmdbData = await getTmdbTv(tmdbId).catch(() => null);
  const title = tmdbData?.name || `TV Show ${tmdbId}`;
  const filename = buildFilename(title, audio, result.container, season, episode);

  return new NextResponse(result.stream, {
    status: 200,
    headers: {
      ...DOWNLOAD_CORS_HEADERS,
      "Content-Type": result.container === "mp4" ? "video/mp4" : "video/mp2t",
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "no-store",
      "X-Episode-Duration": String(Math.round(plan.video.duration)),
      "X-Episode-Resolution": plan.height ? `${plan.height}p` : "unknown",
    },
  });
}
