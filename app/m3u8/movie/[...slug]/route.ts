import { NextRequest, NextResponse } from "next/server";
import { handleMoviePlay, CORS_HEADERS } from "@/lib/media-service";
import { parseMovieSlug } from "@/lib/route-utils";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug?: string[] } }
) {
  const url = new URL(request.url);
  const parsed = parseMovieSlug(params.slug, url.searchParams);

  if (!parsed) {
    return NextResponse.json(
      { success: false, error: "Invalid movie route parameters. Expected /m3u8/movie/{tmdb_id}/[audio]" },
      { status: 400 }
    );
  }

  url.searchParams.set("tmdb_id", String(parsed.tmdbId));
  url.searchParams.set("audio", parsed.audio);
  url.searchParams.set("format", "m3u8");

  const forwardRequest = new NextRequest(url.toString(), {
    headers: request.headers,
    method: "GET",
  });
  return handleMoviePlay(forwardRequest, parsed.tmdbId, parsed.audio);
}
