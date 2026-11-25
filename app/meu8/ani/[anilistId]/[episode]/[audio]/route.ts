import { NextRequest } from "next/server";
import { GET as playGET, OPTIONS as playOPTIONS } from "@/app/api/play/route";
import { resolveAnimeAudioParam } from "@/lib/route-utils";

export const dynamic = "force-dynamic";

export { playOPTIONS as OPTIONS };

export async function GET(
  request: NextRequest,
  { params }: { params: { anilistId: string; episode: string; audio: string } }
) {
  const url = new URL(request.url);
  const cleanEp = params.episode.replace(/\.m3u8$/i, "");
  const cleanAudio = resolveAnimeAudioParam(params.audio.replace(/\.m3u8$/i, ""));
  url.searchParams.set("anilistId", params.anilistId);
  url.searchParams.set("episode", cleanEp);
  url.searchParams.set("audio", cleanAudio);
  url.searchParams.set("format", "m3u8");

  const forwardRequest = new NextRequest(url.toString(), {
    headers: request.headers,
    method: "GET",
  });
  return playGET(forwardRequest);
}
