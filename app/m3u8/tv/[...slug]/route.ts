import { NextRequest, NextResponse } from "next/server";
import { handleTvPlay, CORS_HEADERS } from "@/lib/media-service";
import { parseTvSlug } from "@/lib/route-utils";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug?: string[] } }
) {
  const url = new URL(request.url);
  const parsed = parseTvSlug(params.slug, url.searchParams);

  if (!parsed) {
    return NextResponse.json(
      { success: false, error: "Invalid TV route parameters. Expected /m3u8/tv/{tmdb_id}/{episode}/[audio] or /m3u8/tv/{tmdb_id}/{season}/{episode}/[audio]" },
      { status: 400 }
    );
  }

  url.searchParams.set("tmdb_id", String(parsed.tmdbId));
  url.searchParams.set("season", String(parsed.season));
  url.searchParams.set("episode", String(parsed.episode));
  url.searchParams.set("audio", parsed.audio);
  url.searchParams.set("format", "m3u8");

  const forwardRequest = new NextRequest(url.toString(), {
    headers: request.headers,
    method: "GET",
  });
  return handleTvPlay(forwardRequest, parsed.tmdbId, parsed.season, parsed.episode, parsed.audio);
}
