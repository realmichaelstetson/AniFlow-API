import { NextRequest, NextResponse } from "next/server";
import { getFreshStreamToken, fetchBufferWithBypass } from "@/lib/token-refresher";
import { isStreamTokenExpired, replaceStreamToken } from "@/lib/token-utils";

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

// Lightweight LRU cache for recently accessed segments to eliminate redundant fetches
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

// In-flight request deduplication map to avoid parallel duplicate network round-trips
const inFlightSegments = new Map<string, Promise<Buffer | null>>();

function processTsBuffer(rawBuf: Buffer): Buffer {
  let buf = rawBuf;

  // 1. If already clean MPEG-TS or has a dummy image header with plain TS packets:
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
    // If WebP header (RIFF....WEBP), strip 12 bytes and XOR decrypt
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
    // If PNG header, strip 8 bytes and XOR decrypt
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
  let targetUrl = searchParams.get("url");

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

  // If client aborted request (e.g. user seeked or changed episode)
  if (request.signal.aborted) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  // Check in-memory cache first
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

  // Proactive check: if token in targetUrl is already expired, refresh before fetching
  if (isStreamTokenExpired(targetUrl)) {
    const freshToken = await getFreshStreamToken({
      aid,
      v,
      q,
      ep,
      server,
      forceFresh: false,
    });
    if (freshToken) {
      targetUrl = replaceStreamToken(targetUrl, freshToken.token, freshToken.host);
    }
  }

  // Deduplicate concurrent in-flight requests for the same segment
  let fetchPromise = inFlightSegments.get(targetUrl);
  if (!fetchPromise) {
    fetchPromise = (async () => {
      let resultBuf: Buffer | null = null;
      let currentUrl = targetUrl;

      for (let attempt = 1; attempt <= 3; attempt++) {
        if (request.signal.aborted) return null;

        const res = await fetchBufferWithBypass(currentUrl, {
          referer: "https://flixcloud.cc/",
          origin: "https://flixcloud.cc",
          timeoutMs: 12000,
        });

        if (res && res.statusCode === 200 && res.buffer.length > 0) {
          resultBuf = processTsBuffer(res.buffer);
          break;
        }

        // On 401, 403, or 410: stream token expired on CDN -> renew token on the fly
        if (res && (res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 410)) {
          console.log(`[Proxy:ts] Segment token expired (status ${res.statusCode}), auto-renewing on-the-fly...`);
          const fresh = await getFreshStreamToken({
            aid,
            v,
            q,
            ep,
            server,
            forceFresh: true,
          });
          if (fresh) {
            currentUrl = replaceStreamToken(currentUrl, fresh.token, fresh.host);
          }
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
