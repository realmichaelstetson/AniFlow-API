import { NextRequest, NextResponse } from "next/server";
import { parseTvSlug } from "@/lib/route-utils";
import { handleTvDownload, DOWNLOAD_CORS_HEADERS } from "@/lib/media-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: DOWNLOAD_CORS_HEADERS });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug?: string[] } }
) {
  const url = new URL(request.url);
  const parsed = parseTvSlug(params.slug, url.searchParams);

  if (!parsed) {
    return NextResponse.json(
      {
        success: false,
        code: "MISSING_ID",
        error:
          "Provide tmdb_id in path or query. Expected /api/download/tv/{tmdb_id}/{episode}/[audio] or /api/download/tv/{tmdb_id}/{season}/{episode}/[audio]",
      },
      { status: 400, headers: DOWNLOAD_CORS_HEADERS }
    );
  }

  const quality = parseInt(url.searchParams.get("quality") || "0", 10) || 0;
  return handleTvDownload(request, parsed.tmdbId, parsed.season, parsed.episode, parsed.audio, quality);
}
