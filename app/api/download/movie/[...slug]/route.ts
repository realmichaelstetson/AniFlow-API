import { NextRequest, NextResponse } from "next/server";
import { parseMovieSlug } from "@/lib/route-utils";
import { handleMovieDownload, DOWNLOAD_CORS_HEADERS } from "@/lib/media-service";

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
  const parsed = parseMovieSlug(params.slug, url.searchParams);

  if (!parsed) {
    return NextResponse.json(
      {
        success: false,
        code: "MISSING_ID",
        error: "Provide tmdb_id in path or query. Expected /api/download/movie/{tmdb_id}/[audio]",
      },
      { status: 400, headers: DOWNLOAD_CORS_HEADERS }
    );
  }

  const quality = parseInt(url.searchParams.get("quality") || "0", 10) || 0;
  return handleMovieDownload(request, parsed.tmdbId, parsed.audio, quality);
}
