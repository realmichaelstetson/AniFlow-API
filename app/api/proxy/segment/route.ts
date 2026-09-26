import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const segmentCache = new Map<string, { buf: Uint8Array; time: number }>();
const MAX_CACHE_ENTRIES = 40;
const CACHE_TTL_MS = 5 * 60 * 1000;

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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");
  const referer = searchParams.get("referer") || "";
  const customOrigin = searchParams.get("origin") || "";
  const customUa = searchParams.get("ua") || "";

  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  if (
    targetUrl.includes("vivibebe") ||
    targetUrl.includes("ibyteimg") ||
    targetUrl.includes("vibevibe")
  ) {
    return NextResponse.json({ error: "Blocked segment" }, { status: 403 });
  }

  if (request.signal.aborted) {
    return new NextResponse(null, { status: 204 });
  }

  const cached = getCachedSegment(targetUrl);
  if (cached) {
    return new NextResponse(cached as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "video/mp2t",
        "Content-Length": cached.length.toString(),
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  }

  try {
    let effectiveReferer = referer;
    if (!effectiveReferer) {
      try {
        const parsed = new URL(targetUrl);
        effectiveReferer = `${parsed.protocol}//${parsed.host}/`;
      } catch {}
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

    const res = await fetch(targetUrl, { headers });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${res.status}` },
        { status: res.status }
      );
    }

    const buffer = await res.arrayBuffer();
    let buf = new Uint8Array(buffer);

    if (buf.length >= 188 && !(buf[0] === 0x47 && (buf.length < 376 || buf[188] === 0x47))) {
      const searchLimit = Math.min(buf.length - 376, 2048);
      for (let i = 0; i < searchLimit; i++) {
        if (
          buf[i] === 0x47 &&
          buf[i + 188] === 0x47 &&
          (i + 376 >= buf.length || buf[i + 376] === 0x47)
        ) {
          buf = buf.subarray(i);
          break;
        }
      }
    }

    setCachedSegment(targetUrl, buf);

    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "video/mp2t",
        "Content-Length": buf.length.toString(),
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Segment proxy error" },
      { status: 502 }
    );
  }
}
