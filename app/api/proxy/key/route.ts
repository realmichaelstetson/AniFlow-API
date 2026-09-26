import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import http from "http";
import https from "https";

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

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 30,
  maxFreeSockets: 10,
  timeout: 30000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 30,
  maxFreeSockets: 10,
  timeout: 30000,
});

const keyAxios = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 15000,
});

const keyMemoryCache = new Map<string, { key: Buffer; time: number }>();
const KEY_TTL_MS = 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const cached = keyMemoryCache.get(targetUrl);
  if (cached && Date.now() - cached.time < KEY_TTL_MS) {
    return new NextResponse(new Uint8Array(cached.key), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  }

  const urlsToTry = [targetUrl];
  if (targetUrl.includes("fetch9.flixcloud.cc")) {
    urlsToTry.push(targetUrl.replace("fetch9.flixcloud.cc", "fetch8.flixcloud.cc"));
    urlsToTry.push(targetUrl.replace("fetch9.flixcloud.cc", "fetch7.flixcloud.cc"));
  } else if (targetUrl.includes("fetch8.flixcloud.cc")) {
    urlsToTry.push(targetUrl.replace("fetch8.flixcloud.cc", "fetch9.flixcloud.cc"));
    urlsToTry.push(targetUrl.replace("fetch8.flixcloud.cc", "fetch7.flixcloud.cc"));
  }

  const referer = searchParams.get("referer") || "https://flixcloud.cc/";
  const origin = searchParams.get("origin") || "https://flixcloud.cc";

  let lastErr: any = null;
  for (const url of urlsToTry) {
    try {
      const response = await keyAxios.get(url, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          Referer: referer,
          Origin: origin,
        },
      });

      const keyBuf = Buffer.from(response.data);
      keyMemoryCache.set(targetUrl, { key: keyBuf, time: Date.now() });

      return new NextResponse(new Uint8Array(keyBuf), {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/octet-stream",
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    } catch (err: any) {
      lastErr = err;
    }
  }

  return NextResponse.json(
    { error: "Decryption key expired or unavailable", code: 410, expired: true },
    { status: 410, headers: CORS_HEADERS }
  );
}
