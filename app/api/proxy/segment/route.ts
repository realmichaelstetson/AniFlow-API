import { NextRequest, NextResponse } from "next/server";
import http from "http";
import https from "https";
import axios from "axios";
import { isSafePublicUrl } from "@/shared/validators";
import { findTsStartOffset, looksLikeTextErrorPayload, isFmp4Buffer } from "@/lib/stream-proxy/media-buffer";

export const dynamic = "force-dynamic";

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 10, timeout: 30000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 10, timeout: 30000 });
const segmentAxios = axios.create({ httpAgent, httpsAgent, timeout: 15000, responseType: "arraybuffer" });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const segmentCache = new Map<string, { buf: Uint8Array; time: number }>();
const MAX_CACHE_ENTRIES = 120;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Concurrent requests for the same segment (hls.js retries, several viewers) share one upstream fetch
const inFlightSegments = new Map<string, Promise<SegmentResult>>();

type SegmentResult = { buf: Uint8Array } | { error: string; status: number };

function getCachedSegment(url: string): Uint8Array | null {
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

function setCachedSegment(url: string, buf: Uint8Array) {
  if (segmentCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = segmentCache.keys().next().value;
    if (oldestKey) segmentCache.delete(oldestKey);
  }
  segmentCache.set(url, { buf, time: Date.now() });
}

function segmentResponse(buf: Uint8Array) {
  const isFmp4 = isFmp4Buffer(buf);
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": isFmp4 ? "video/mp4" : "video/mp2t",
      "Content-Length": buf.length.toString(),
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}

async function fetchSegment(
  targetUrl: string,
  headers: Record<string, string>,
  isEncrypted: boolean
): Promise<SegmentResult> {
  let lastError = "Segment proxy error";
  let lastStatus = 502;

  // One quick retry on transient failures (timeouts, resets, 5xx); 4xx is final.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await segmentAxios.get(targetUrl, { headers });
      let buf = new Uint8Array(res.data);

      // Some hosts wrap MPEG-TS in a fake image header (e.g. a 252-byte PNG header from
      // TikTokCDN/Megaplay). Strip it; ciphertext and fMP4 are passed through untouched.
      const tsOffset = findTsStartOffset(buf, isEncrypted);
      if (tsOffset > 0) {
        buf = buf.subarray(tsOffset);
      }

      if (buf.length < 188 || looksLikeTextErrorPayload(buf)) {
        return { error: "Invalid video chunk received from upstream", status: 502 };
      }
      return { buf };
    } catch (err: any) {
      lastError = err?.message || lastError;
      const status = err?.response?.status;
      if (status && status >= 400 && status < 500) {
        return { error: lastError, status: status === 404 ? 404 : 502 };
      }
      lastStatus = 502;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 150));
    }
  }
  return { error: lastError, status: lastStatus };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");
  const referer = searchParams.get("referer") || "";
  const customOrigin = searchParams.get("origin") || "";
  const customUa = searchParams.get("ua") || "";
  // Set by /api/proxy/m3u8 for segments covered by #EXT-X-KEY (AES ciphertext)
  const isEncrypted = searchParams.get("raw") === "1";

  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!isSafePublicUrl(targetUrl)) {
    return NextResponse.json(
      { error: "Prohibited URL (SSRF protection)" },
      { status: 403, headers: CORS_HEADERS }
    );
  }

  // Block ad segments and dead workers immediately
  if (
    targetUrl.includes("vivibebe") ||
    targetUrl.includes("ibyteimg") ||
    targetUrl.includes("vibevibe")
  ) {
    return NextResponse.json({ error: "Blocked segment" }, { status: 403, headers: CORS_HEADERS });
  }

  if (request.signal.aborted) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  const cached = getCachedSegment(targetUrl);
  if (cached) {
    return segmentResponse(cached);
  }

  let effectiveReferer = referer;
  if (!effectiveReferer) {
    if (
      targetUrl.includes("hikari") ||
      targetUrl.includes("streamrip.fun") ||
      targetUrl.includes("vidly") ||
      targetUrl.includes("rousav.tech") ||
      targetUrl.includes("hakunaymatata.com") ||
      targetUrl.includes("workers.dev")
    ) {
      effectiveReferer = "https://vidly.pro/";
    } else if (
      targetUrl.includes("megaplay") ||
      targetUrl.includes("broforgotsave") ||
      targetUrl.includes("eclipseharbor") ||
      targetUrl.includes("nexabloom") ||
      targetUrl.includes("akirax")
    ) {
      effectiveReferer = "https://megaplay.buzz/";
    } else {
      try {
        const parsed = new URL(targetUrl);
        effectiveReferer = `${parsed.protocol}//${parsed.host}/`;
      } catch {}
    }
  }

  const headers: Record<string, string> = {
    "User-Agent":
      customUa ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "*/*",
  };
  if (effectiveReferer) {
    headers["Referer"] = effectiveReferer;
    try {
      headers["Origin"] = customOrigin || new URL(effectiveReferer).origin;
    } catch {}
  } else if (customOrigin) {
    headers["Origin"] = customOrigin;
  }

  let pending = inFlightSegments.get(targetUrl);
  if (!pending) {
    pending = fetchSegment(targetUrl, headers, isEncrypted).then((result) => {
      if ("buf" in result) setCachedSegment(targetUrl, result.buf);
      return result;
    });
    inFlightSegments.set(targetUrl, pending);
    pending.finally(() => inFlightSegments.delete(targetUrl));
  }

  const result = await pending;
  if ("buf" in result) {
    return segmentResponse(result.buf);
  }
  return NextResponse.json({ error: result.error }, { status: result.status, headers: CORS_HEADERS });
}
