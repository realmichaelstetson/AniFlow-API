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

const XOR_KEY = [
  157, 42, 241, 71, 179, 142, 92, 112, 166, 25, 228, 59, 216, 98, 15, 197,
];

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 60,
  maxFreeSockets: 20,
  timeout: 30000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 60,
  maxFreeSockets: 20,
  timeout: 30000,
});

const tsAxios = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 15000,
});

const segmentCache = new Map<string, { buf: Buffer; time: number }>();
const MAX_CACHE_ENTRIES = 50;
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCachedSegment(url: string): Buffer | null {
  const entry = segmentCache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.time > CACHE_TTL_MS) {
    segmentCache.delete(url);
    return null;
  }
  segmentCache.delete(url);
  segmentCache.set(url, entry);
  return entry.buf;
}

function setCachedSegment(url: string, buf: Buffer) {
  if (segmentCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = segmentCache.keys().next().value;
    if (oldestKey) segmentCache.delete(oldestKey);
  }
  segmentCache.set(url, { buf, time: Date.now() });
}

const inFlightSegments = new Map<string, Promise<Buffer | null>>();

function processTsBuffer(rawBuf: Buffer): Buffer {
  let buf = rawBuf;

  let foundPlainOffset = -1;
  if (buf.length >= 188) {
    if (buf[0] === 0x47 && (buf.length < 376 || buf[188] === 0x47)) {
      foundPlainOffset = 0;
    } else {
      const searchLimit = Math.min(buf.length - 376, 2048);
      for (let i = 0; i < searchLimit; i++) {
        if (
          buf[i] === 0x47 &&
          buf[i + 188] === 0x47 &&
          (i + 376 >= buf.length || buf[i + 376] === 0x47)
        ) {
          foundPlainOffset = i;
          break;
        }
      }
    }
  }

  if (foundPlainOffset !== -1) {
    if (foundPlainOffset > 0) {
      buf = buf.subarray(foundPlainOffset);
    }
  } else if (
    buf.length >= 12 &&
    buf[0] === 82 &&
    buf[1] === 73 &&
    buf[2] === 70 &&
    buf[3] === 70 &&
    buf[8] === 87 &&
    buf[9] === 69 &&
    buf[10] === 66 &&
    buf[11] === 80
  ) {
    const isPlain = buf.length >= 13 && buf[12] === 0x47;
    buf = buf.subarray(12);
    if (!isPlain) {
      for (let c = 0; c < buf.length; c++) {
        buf[c] ^= XOR_KEY[c & 15];
      }
    }
  } else if (
    buf.length >= 8 &&
    buf[0] === 137 &&
    buf[1] === 80 &&
    buf[2] === 78 &&
    buf[3] === 71
  ) {
    const isPlain = buf.length >= 9 && buf[8] === 0x47;
    buf = buf.subarray(8);
    if (!isPlain) {
      for (let c = 0; c < buf.length; c++) {
        buf[c] ^= XOR_KEY[c & 15];
      }
    }
  }

  return buf;
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

  if (request.signal.aborted) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  const cached = getCachedSegment(targetUrl);
  if (cached) {
    return new NextResponse(new Uint8Array(cached), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "video/mp2t",
        "Content-Length": cached.length.toString(),
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  }

  let fetchPromise = inFlightSegments.get(targetUrl);
  if (!fetchPromise) {
    fetchPromise = (async () => {
      let resultBuf: Buffer | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (request.signal.aborted) return null;

        try {
          const response = await tsAxios.get(targetUrl, {
            responseType: "arraybuffer",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
              Referer: "https://flixcloud.cc/",
            },
          });
          if (response.data) {
            resultBuf = processTsBuffer(Buffer.from(response.data));
            break;
          }
        } catch (err: any) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);
            const fRes = await fetch(targetUrl, {
              signal: controller.signal,
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                Referer: "https://flixcloud.cc/",
              },
            });
            clearTimeout(timeoutId);
            if (fRes.ok) {
              const ab = await fRes.arrayBuffer();
              resultBuf = processTsBuffer(Buffer.from(ab));
              break;
            }
          } catch {}
        }

        if (attempt < 3 && !request.signal.aborted) {
          await new Promise((r) => setTimeout(r, attempt * 150));
        }
      }

      if (resultBuf) {
        setCachedSegment(targetUrl, resultBuf);
      }
      return resultBuf;
    })();

    inFlightSegments.set(targetUrl, fetchPromise);
  }

  let buf: Buffer | null = null;
  try {
    buf = await fetchPromise;
  } finally {
    inFlightSegments.delete(targetUrl);
  }

  if (!buf) {
    if (request.signal.aborted) {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }
    return NextResponse.json(
      { error: "Segment proxy error: failed to fetch chunk" },
      { status: 502, headers: CORS_HEADERS }
    );
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "video/mp2t",
      "Content-Length": buf.length.toString(),
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
