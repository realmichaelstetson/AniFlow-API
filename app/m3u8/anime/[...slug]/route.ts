import { NextRequest, NextResponse } from "next/server";
import { GET as playGET, OPTIONS as playOPTIONS } from "@/app/api/play/route";
import { parseAnimeSlug } from "@/lib/route-utils";

export const dynamic = "force-dynamic";

export { playOPTIONS as OPTIONS };

export async function GET(
  request: NextRequest,
  { params }: { params: { slug?: string[] } }
) {
  const url = new URL(request.url);
  const parsed = parseAnimeSlug(params.slug, url.searchParams);

  if (!parsed) {
    return NextResponse.json(
      { success: false, error: "Invalid anime route parameters. Expected /m3u8/anime/{ani|mal}/{id}/{episode}/[audio]" },
      { status: 400 }
    );
  }

  if (parsed.idType === "mal") {
    url.searchParams.set("malId", String(parsed.id));
  } else {
    url.searchParams.set("anilistId", String(parsed.id));
  }
  url.searchParams.set("episode", String(parsed.episode));
  url.searchParams.set("audio", parsed.audio);
  url.searchParams.set("format", "m3u8");

  const forwardRequest = new NextRequest(url.toString(), {
    headers: request.headers,
    method: "GET",
  });
  return playGET(forwardRequest);
}
