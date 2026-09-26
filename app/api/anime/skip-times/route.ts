import { NextRequest, NextResponse } from "next/server";
import { getEpisodeSkipTimes } from "@/lib/skip-times";
import { resolveFromAniListId } from "@/lib/anime-resolver";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const episodeNumber = parseInt(searchParams.get("episodeNumber") || searchParams.get("episode") || "1", 10);
  const anilistIdParam = searchParams.get("anilistId") || searchParams.get("anilist_id");
  const malIdParam = searchParams.get("malId") || searchParams.get("mal_id");
  const duration = parseInt(searchParams.get("duration") || "0", 10);

  let malId = malIdParam ? parseInt(malIdParam, 10) : null;
  if (!malId && anilistIdParam) {
    const mapping = await resolveFromAniListId(parseInt(anilistIdParam, 10));
    if (mapping?.malId) {
      malId = mapping.malId;
    }
  }

  try {
    const skipTimes = await getEpisodeSkipTimes(malId, episodeNumber, duration);
    return NextResponse.json(skipTimes, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { intro: null, outro: null, error: err.message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
