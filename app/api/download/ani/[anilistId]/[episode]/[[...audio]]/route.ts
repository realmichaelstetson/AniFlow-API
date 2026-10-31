import { NextRequest } from "next/server";
import { GET as downloadGET, OPTIONS as downloadOPTIONS } from "@/app/api/download/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export { downloadOPTIONS as OPTIONS };

export async function GET(
  request: NextRequest,
  { params }: { params: { anilistId: string; episode: string; audio?: string[] } }
) {
  const url = new URL(request.url);
  url.searchParams.set("anilistId", params.anilistId);
  url.searchParams.set("episode", params.episode.replace(/\.(mp4|ts)$/i, ""));
  const audio = params.audio?.[0]?.replace(/\.(mp4|ts)$/i, "").toLowerCase();
  if (audio) url.searchParams.set("audio", audio === "dub" ? "dub" : "sub");

  return downloadGET(new NextRequest(url.toString(), { headers: request.headers, method: "GET", signal: request.signal }));
}
