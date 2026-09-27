import { NextRequest, NextResponse } from "next/server";

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

function rewriteHls(
  manifest: string,
  manifestUrl: string,
  proxyBase: string,
  hParam?: string
): string {
  const base = manifestUrl.substring(0, manifestUrl.lastIndexOf("/") + 1);

  return manifest
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_, uri) => {
          let abs = uri;
          if (!uri.startsWith("http://") && !uri.startsWith("https://")) {
            abs = uri.startsWith("/")
              ? new URL(uri, manifestUrl).href
              : base + uri;
          }
          const enc = encodeURIComponent(abs);
          let proxied = `${proxyBase}?url=${enc}`;
          if (hParam) proxied += `&h=${encodeURIComponent(hParam)}`;
          return `URI="${proxied}"`;
        });
      }

      if (!trimmed) return line;

      let abs = trimmed;
      if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
        abs = trimmed.startsWith("/")
          ? new URL(trimmed, manifestUrl).href
          : base + trimmed;
      }

      const enc = encodeURIComponent(abs);
      let proxied = `${proxyBase}?url=${enc}`;
      if (hParam) proxied += `&h=${encodeURIComponent(hParam)}`;
      return proxied;
    })
    .join("\n");
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json(
      { error: "Missing param: url" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const hParam = searchParams.get("h");
  const upstreamHeaders: Record<string, string> = {
    Accept: "*/*",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
  };

  if (hParam) {
    try {
      const decoded = JSON.parse(Buffer.from(hParam, "base64").toString("utf8"));
      Object.assign(upstreamHeaders, decoded);
    } catch {}
  }

  const referer = searchParams.get("referer");
  if (referer) {
    upstreamHeaders["Referer"] = referer;
  } else if (!upstreamHeaders["Referer"] && !upstreamHeaders["referer"]) {
    try {
      const parsed = new URL(targetUrl);
      upstreamHeaders["Referer"] = `${parsed.protocol}//${parsed.host}/`;
    } catch {}
  }

  const range = request.headers.get("range");
  if (range) {
    upstreamHeaders["Range"] = range;
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: upstreamHeaders,
      redirect: "follow",
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: `Upstream returned ${upstream.status}: ${errText.slice(0, 100)}` },
        { status: upstream.status === 404 ? 404 : 502, headers: CORS_HEADERS }
      );
    }

    const ct = upstream.headers.get("content-type") ?? "";
    const looksLikeHls =
      ct.toLowerCase().includes("mpegurl") ||
      targetUrl.split("?")[0].toLowerCase().endsWith(".m3u8");

    if (looksLikeHls) {
      const text = await upstream.text();
      if (text.trim().startsWith("#EXTM3U") || looksLikeHls) {
        const proxyBase = `${request.nextUrl.origin}/api/proxy`;
        const rewritten = rewriteHls(text, targetUrl, proxyBase, hParam ?? undefined);

        return new NextResponse(rewritten, {
          status: upstream.status,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });
      }
    }

    const ctOverride = searchParams.get("ct");
    let contentType = ct || "application/octet-stream";
    if (ctOverride) {
      contentType = ctOverride;
    } else if (
      targetUrl.split("?")[0].toLowerCase().endsWith(".ts") &&
      (ct.startsWith("image/") || (ct.startsWith("text/") && !ct.includes("html")))
    ) {
      contentType = "video/mp2t";
    } else if (
      contentType === "application/octet-stream" &&
      targetUrl.split("?")[0].toLowerCase().endsWith(".mp4")
    ) {
      contentType = "video/mp4";
    }

    const isMediaChunk =
      contentType.startsWith("video/") ||
      targetUrl.includes(".ts") ||
      targetUrl.includes(".m4s");

    const outHeaders: Record<string, string> = {
      ...CORS_HEADERS,
      "Content-Type": contentType,
      "Cache-Control": isMediaChunk ? "public, max-age=86400, immutable" : "public, max-age=86400",
    };

    const cl = upstream.headers.get("content-length");
    if (cl) outHeaders["Content-Length"] = cl;
    const cr = upstream.headers.get("content-range");
    if (cr) outHeaders["Content-Range"] = cr;
    const ar = upstream.headers.get("accept-ranges");
    outHeaders["Accept-Ranges"] = ar ?? "bytes";

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: outHeaders,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Proxy fetch failed: ${err.message || err}` },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}
