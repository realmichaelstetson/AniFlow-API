import { NextRequest, NextResponse } from "next/server";
import { getOrRefreshDecryptionKey } from "@/lib/token-refresher";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
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
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const aid = searchParams.get("aid");
  const v = parseInt(searchParams.get("v") || "2", 10);
  const q = searchParams.get("q") || searchParams.get("anilistId") || searchParams.get("anilist_id");
  const ep = parseInt(searchParams.get("ep") || searchParams.get("episode") || "1", 10);
  const server = searchParams.get("server") || "HD-1";
  const audio = searchParams.get("audio") || "sub";
  const referer = searchParams.get("referer") || "https://flixcloud.cc/";
  const origin = searchParams.get("origin") || "https://flixcloud.cc";

  try {
    const keyBuf = await getOrRefreshDecryptionKey({
      targetUrl,
      aid,
      v,
      q,
      ep,
      server,
      audio,
      referer,
      origin,
    });

    if (keyBuf && keyBuf.length > 0) {
      return new NextResponse(new Uint8Array(keyBuf), {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/octet-stream",
          "Content-Length": keyBuf.length.toString(),
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    }
  } catch (err: any) {
    console.error("[Proxy:key] Error resolving decryption key:", err?.message || err);
  }

  return NextResponse.json(
    { error: "Decryption key expired or unavailable", code: 410, expired: true },
    { status: 410, headers: CORS_HEADERS }
  );
}
