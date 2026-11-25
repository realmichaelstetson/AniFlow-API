import { NextRequest } from "next/server";
import { GET as playGET, OPTIONS as playOPTIONS } from "@/app/api/play/route";

export const dynamic = "force-dynamic";

export { playOPTIONS as OPTIONS };

export async function GET(
  request: NextRequest,
  { params }: { params: { malId: string; episode: string } }
) {
  const url = new URL(request.url);
  const cleanEp = params.episode.replace(/\.m3u8$/i, "");
  url.searchParams.set("malId", params.malId);
  url.searchParams.set("episode", cleanEp);
  if (!url.searchParams.has("audio")) {
    url.searchParams.set("audio", "dub");
  }
  url.searchParams.set("format", "m3u8");

  const forwardRequest = new NextRequest(url.toString(), {
    headers: request.headers,
    method: "GET",
  });
  return playGET(forwardRequest);
}
