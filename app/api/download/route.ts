import { NextRequest, NextResponse } from "next/server";
import { GET as playGET } from "@/app/api/play/route";
import { resolveFromAniListId, resolveFromMalId } from "@/lib/anime-resolver";
import { buildDownloadPlan, streamDownload } from "@/lib/episode-download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "Content-Disposition, X-Episode-Duration, X-Episode-Resolution",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function errorResponse(status: number, code: string, error: string) {
  return NextResponse.json({ success: false, code, error }, { status, headers: CORS_HEADERS });
}

function buildFilename(title: string, episode: number, audio: string, ext: string) {
  const base = (title || "AniFlow").replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return `${base} - E${String(episode).padStart(2, "0")} [${audio.toUpperCase()}].${ext}`;
}

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function resolveTitle(anilistId: number | null, malId: number | null, fallback: string) {
  try {
    const mapping = anilistId ? await resolveFromAniListId(anilistId) : malId ? await resolveFromMalId(malId) : null;
    return mapping?.title || fallback;
  } catch {
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const anilistId = parseInt(searchParams.get("anilistId") || searchParams.get("anilist_id") || "", 10) || null;
  const malId = parseInt(searchParams.get("malId") || searchParams.get("mal_id") || "", 10) || null;
  const q = searchParams.get("q") || searchParams.get("title") || "";
  const episode = parseInt(searchParams.get("episode") || searchParams.get("ep") || "1", 10) || 1;
  const audio = searchParams.get("audio") === "dub" ? "dub" : "sub";
  const server = (searchParams.get("server") || "flow").toLowerCase();
  const quality = parseInt(searchParams.get("quality") || "0", 10) || 0;

  if (!anilistId && !malId && !q) {
    return errorResponse(400, "MISSING_ID", "Provide anilistId, malId or q (anime title)");
  }

  // Reuse the /api/play m3u8 fast-path to pick the provider and get a proxied playlist URL
  const playUrl = new URL("/api/play", request.url);
  if (anilistId) playUrl.searchParams.set("anilistId", String(anilistId));
  if (malId) playUrl.searchParams.set("malId", String(malId));
  if (q) playUrl.searchParams.set("q", q);
  playUrl.searchParams.set("episode", String(episode));
  playUrl.searchParams.set("audio", audio);
  playUrl.searchParams.set("server", server);
  playUrl.searchParams.set("format", "m3u8");

  const [playRes, title] = await Promise.all([
    playGET(new NextRequest(playUrl.toString(), { headers: request.headers, method: "GET" })),
    resolveTitle(anilistId, malId, q),
  ]);

  const playlistUrl = playRes.headers.get("location");
  if (!playlistUrl) {
    return errorResponse(404, "CONTENT_UNAVAILABLE", "Stream source not available on any server");
  }

  let plan;
  try {
    plan = await buildDownloadPlan(playlistUrl, audio, quality, request.signal);
  } catch (err: any) {
    return errorResponse(502, "PLAYLIST_ERROR", err?.message || "Failed to read stream playlist");
  }
  if (plan.video.segments.length === 0) {
    return errorResponse(502, "PLAYLIST_ERROR", "Stream playlist contains no segments");
  }

  let result;
  try {
    result = streamDownload(plan, request.signal);
  } catch (err: any) {
    if (err?.message === "FFMPEG_REQUIRED") {
      return errorResponse(
        501,
        "FFMPEG_REQUIRED",
        "This server delivers audio as a separate track; ffmpeg must be installed on the API host to merge it. Try server=buzz or server=yuri."
      );
    }
    return errorResponse(500, "DOWNLOAD_ERROR", err?.message || "Failed to start download");
  }

  const filename = buildFilename(title, episode, audio, result.container);
  return new NextResponse(result.stream, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": result.container === "mp4" ? "video/mp4" : "video/mp2t",
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "no-store",
      "X-Episode-Duration": String(Math.round(plan.video.duration)),
      "X-Episode-Resolution": plan.height ? `${plan.height}p` : "unknown",
    },
  });
}
