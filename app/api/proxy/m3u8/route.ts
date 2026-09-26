import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import http from "http";
import https from "https";
import { decryptFlixStream, findAndStream, isStreamTokenExpired } from "@/lib/reanime";

export const dynamic = "force-dynamic";

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 40,
  maxFreeSockets: 10,
  timeout: 30000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 40,
  maxFreeSockets: 10,
  timeout: 30000,
});

const m3u8Axios = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 15000,
});

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
  let targetUrl = searchParams.get("url");
  let pk = searchParams.get("pk") || "";
  const audio = searchParams.get("audio") || "sub";
  const referer = searchParams.get("referer") || "";
  const origin = searchParams.get("origin") || "";
  const ua = searchParams.get("ua") || "";
  const aid = searchParams.get("aid") || "";
  const v = parseInt(searchParams.get("v") || "2", 10);
  const q = searchParams.get("q") || searchParams.get("anilistId") || searchParams.get("anilist_id");
  const ep = parseInt(searchParams.get("ep") || searchParams.get("episode") || "1", 10);
  const server = searchParams.get("server") || "HD-1";

  if (!targetUrl) {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    if (
      targetUrl.includes("vivibebe") ||
      targetUrl.includes("ibyteimg") ||
      targetUrl.includes("vibevibe")
    ) {
      return NextResponse.json(
        { error: "Blocked stream source", code: 403 },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const tryRefreshStream = async () => {
      if (aid) {
        try {
          const fresh = await decryptFlixStream(aid, v);
          if (fresh.hls && !isStreamTokenExpired(fresh.hls)) {
            return { hls: fresh.hls, pk: fresh.pk };
          }
        } catch {}
      }
      if (q) {
        try {
          const targetAnilistId = /^\d+$/.test(q) ? parseInt(q, 10) : undefined;
          const freshData = await findAndStream({
            anilistId: targetAnilistId,
            query: !targetAnilistId ? q : undefined,
            episode: ep,
            server: server,
          });
          const matching = (freshData.all_servers || []).find((s) => s.audio === audio) || freshData;
          if (matching?.hls && !isStreamTokenExpired(matching.hls)) {
            return { hls: matching.hls, pk: matching.pk };
          }
        } catch {}
      }
      return null;
    };

    if (isStreamTokenExpired(targetUrl)) {
      const fresh = await tryRefreshStream();
      if (fresh) {
        targetUrl = fresh.hls;
        if (fresh.pk) pk = fresh.pk;
      } else {
        return NextResponse.json(
          { error: "Stream token expired", code: 410, expired: true },
          { status: 410, headers: CORS_HEADERS }
        );
      }
    }

    let effectiveReferer = referer;
    if (!effectiveReferer) {
      if (targetUrl.includes("flixcloud") || targetUrl.includes("atomic4cdn")) {
        effectiveReferer = "https://flixcloud.cc/";
      } else {
        try {
          const parsed = new URL(targetUrl);
          effectiveReferer = `${parsed.protocol}//${parsed.host}/`;
        } catch {}
      }
    }

    let effectiveOrigin = origin;
    if (!effectiveOrigin && effectiveReferer) {
      try {
        effectiveOrigin = new URL(effectiveReferer).origin;
      } catch {}
    }

    const headers: Record<string, string> = {
      "User-Agent":
        ua ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      Accept: "*/*",
      Referer: effectiveReferer,
    };
    if (effectiveOrigin) {
      headers["Origin"] = effectiveOrigin;
    }

    let response: any;
    try {
      response = await m3u8Axios.get(targetUrl, {
        responseType: "text",
        timeout: 15000,
        headers,
      });
    } catch (fetchErr: any) {
      const status = fetchErr.response?.status;
      if (status === 401 || status === 403 || status === 410 || !response) {
        const fresh = await tryRefreshStream();
        if (fresh) {
          targetUrl = fresh.hls;
          if (fresh.pk) pk = fresh.pk;
          try {
            response = await m3u8Axios.get(targetUrl, {
              responseType: "text",
              timeout: 15000,
              headers,
            });
          } catch {}
        }
      }
      if (!response) {
        const isAuthError = status === 403 || status === 401 || status === 410;
        const statusCode = isAuthError ? 410 : (status || 502);
        return NextResponse.json(
          { error: isAuthError ? "Stream token expired" : `Proxy upstream error: ${fetchErr.message || fetchErr}`, code: statusCode, expired: isAuthError },
          { status: statusCode, headers: CORS_HEADERS }
        );
      }
    }

    let content = response.data;

    // Decrypt if XOR-encrypted with pk
    if (pk && typeof content === "string" && !content.startsWith("#EXTM3U")) {
      try {
        const l = Buffer.from(pk, "base64").toString("binary");
        const u = Buffer.from(content.trim(), "base64").toString("binary");
        const d = [];
        for (let h = 0; h < u.length; h++) {
          d.push(u.charCodeAt(h) ^ l.charCodeAt(h % l.length));
        }
        const dec = new TextDecoder().decode(new Uint8Array(d));
        if (dec.startsWith("#EXTM3U")) {
          content = dec;
        }
      } catch {}
    }

    // Rewrite HLS manifest URIs to pass through proxy
    if (typeof content === "string" && content.startsWith("#EXTM3U")) {
      const baseUrl = targetUrl;
      const lines = content.split("\n");
      const rewrittenLines: string[] = [];
      const audioMediaLines: Array<{ line: string; isEng: boolean; isJpn: boolean }> = [];

      const resolveUrlWithBase = (relative: string): string => {
        try {
          const u = new URL(relative, baseUrl);
          if (!u.search) {
            const baseParsed = new URL(baseUrl);
            if (baseParsed.search) u.search = baseParsed.search;
          }
          return u.href;
        } catch {
          return new URL(relative, baseUrl).href;
        }
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) {
          rewrittenLines.push(line);
          continue;
        }

        // Collect and modify #EXT-X-MEDIA:TYPE=AUDIO
        if (trimmed.startsWith("#EXT-X-MEDIA:") && trimmed.includes("TYPE=AUDIO")) {
          let audioLine = line;
          const qParam = q ? `&q=${encodeURIComponent(q)}` : "";
          const epParam = ep ? `&ep=${ep}` : "";
          const srvParam = server ? `&server=${encodeURIComponent(server)}` : "";

          if (audioLine.includes('URI="')) {
            audioLine = audioLine.replace(/URI="([^"]+)"/, (m, uri) => {
              const abs = resolveUrlWithBase(uri);
              return `URI="/api/proxy/m3u8?url=${encodeURIComponent(abs)}&pk=${encodeURIComponent(pk || "")}&audio=${audio}${aid ? `&aid=${encodeURIComponent(aid)}` : ""}${v ? `&v=${v}` : ""}${qParam}${epParam}${srvParam}"`;
            });
          }

          const isEng = /NAME="English"/i.test(audioLine) || /LANGUAGE="eng?"/i.test(audioLine);
          const isJpn = /NAME="Native"/i.test(audioLine) || /LANGUAGE="jp[an]?"/i.test(audioLine);

          if (audio === "dub") {
            if (isEng) {
              audioLine = audioLine
                .replace(/DEFAULT=(YES|NO)/gi, "DEFAULT=YES")
                .replace(/AUTOSELECT=(YES|NO)/gi, "AUTOSELECT=YES");
            } else if (isJpn) {
              audioLine = audioLine
                .replace(/DEFAULT=(YES|NO)/gi, "DEFAULT=NO")
                .replace(/AUTOSELECT=(YES|NO)/gi, "AUTOSELECT=NO");
            }
          } else {
            if (isJpn) {
              audioLine = audioLine
                .replace(/DEFAULT=(YES|NO)/gi, "DEFAULT=YES")
                .replace(/AUTOSELECT=(YES|NO)/gi, "AUTOSELECT=YES");
            } else if (isEng) {
              audioLine = audioLine
                .replace(/DEFAULT=(YES|NO)/gi, "DEFAULT=NO")
                .replace(/AUTOSELECT=(YES|NO)/gi, "AUTOSELECT=NO");
            }
          }

          audioMediaLines.push({ line: audioLine, isEng, isJpn });
          continue;
        }

        // When reaching the first stream definition line, output sorted audio tracks first
        if (
          audioMediaLines.length > 0 &&
          (trimmed.startsWith("#EXT-X-STREAM-INF:") ||
            trimmed.startsWith("#EXTINF:") ||
            trimmed.startsWith("#EXT-X-MAP:") ||
            trimmed.startsWith("#EXT-X-KEY:"))
        ) {
          const sortedAudio = [...audioMediaLines].sort((a, b) => {
            if (audio === "dub") {
              if (a.isEng && !b.isEng) return -1;
              if (!a.isEng && b.isEng) return 1;
            } else {
              if (a.isJpn && !b.isJpn) return -1;
              if (!a.isJpn && b.isJpn) return 1;
            }
            return 0;
          });
          sortedAudio.forEach((item) => rewrittenLines.push(item.line));
          audioMediaLines.length = 0;
        }

        // Rewrite #EXT-X-MEDIA other than AUDIO
        if (trimmed.startsWith("#EXT-X-MEDIA:") && trimmed.includes('URI="')) {
          const rewrittenMedia = line.replace(/URI="([^"]+)"/, (m, uri) => {
            const abs = resolveUrlWithBase(uri);
            return `URI="/api/proxy/m3u8?url=${encodeURIComponent(abs)}&pk=${encodeURIComponent(pk || "")}"`;
          });
          rewrittenLines.push(rewrittenMedia);
          continue;
        }

        const isFlixcloudStream = Boolean(aid || pk || (targetUrl && (targetUrl.includes("flixcloud") || targetUrl.includes("atomic4cdn"))));

        // Handle #EXT-X-MAP with URI
        if (trimmed.startsWith("#EXT-X-MAP:") && trimmed.includes('URI="')) {
          const rewrittenMap = line.replace(/URI="([^"]+)"/, (m, uri) => {
            const abs = resolveUrlWithBase(uri);
            if (isFlixcloudStream) {
              return `URI="/api/proxy/ts?url=${encodeURIComponent(abs)}"`;
            }
            const refParam = effectiveReferer ? `&referer=${encodeURIComponent(effectiveReferer)}` : "";
            const origParam = effectiveOrigin ? `&origin=${encodeURIComponent(effectiveOrigin)}` : "";
            const uaParam = ua ? `&ua=${encodeURIComponent(ua)}` : "";
            return `URI="/api/proxy/segment?url=${encodeURIComponent(abs)}${refParam}${origParam}${uaParam}"`;
          });
          rewrittenLines.push(rewrittenMap);
          continue;
        }

        // Rewrite #EXT-X-KEY lines (AES-128 encryption key)
        if (trimmed.startsWith("#EXT-X-KEY:") && /URI=["']?([^"',\s]+)["']?/.test(trimmed)) {
          const rewrittenKey = line.replace(/URI=["']?([^"',\s]+)["']?/, (m, uri) => {
            const abs = resolveUrlWithBase(uri);
            if (isFlixcloudStream) {
              const refParam = effectiveReferer ? `&referer=${encodeURIComponent(effectiveReferer)}` : "";
              const origParam = effectiveOrigin ? `&origin=${encodeURIComponent(effectiveOrigin)}` : "";
              return `URI="/api/proxy/key?url=${encodeURIComponent(abs)}${refParam}${origParam}"`;
            }
            const refParam = effectiveReferer ? `&referer=${encodeURIComponent(effectiveReferer)}` : "";
            const origParam = effectiveOrigin ? `&origin=${encodeURIComponent(effectiveOrigin)}` : "";
            const uaParam = ua ? `&ua=${encodeURIComponent(ua)}` : "";
            return `URI="/api/proxy/segment?url=${encodeURIComponent(abs)}${refParam}${origParam}${uaParam}"`;
          });
          rewrittenLines.push(rewrittenKey);
          continue;
        }

        // Rewrite child m3u8 playlist lines
        if (!trimmed.startsWith("#") && (trimmed.endsWith(".m3u8") || trimmed.includes(".m3u8?") || trimmed.endsWith(".txt") || trimmed.includes(".txt?"))) {
          const abs = resolveUrlWithBase(trimmed);
          const refParam = effectiveReferer ? `&referer=${encodeURIComponent(effectiveReferer)}` : "";
          const origParam = effectiveOrigin ? `&origin=${encodeURIComponent(effectiveOrigin)}` : "";
          const uaParam = ua ? `&ua=${encodeURIComponent(ua)}` : "";
          const qParam = q ? `&q=${encodeURIComponent(q)}` : "";
          const epParam = ep ? `&ep=${ep}` : "";
          const srvParam = server ? `&server=${encodeURIComponent(server)}` : "";
          rewrittenLines.push(
            `/api/proxy/m3u8?url=${encodeURIComponent(abs)}&pk=${encodeURIComponent(pk || "")}&audio=${audio}${aid ? `&aid=${encodeURIComponent(aid)}` : ""}${v ? `&v=${v}` : ""}${qParam}${epParam}${srvParam}${refParam}${origParam}${uaParam}`
          );
          continue;
        }

        // Rewrite media segment lines
        if (!trimmed.startsWith("#")) {
          const abs = resolveUrlWithBase(trimmed);
          if (isFlixcloudStream) {
            rewrittenLines.push(`/api/proxy/ts?url=${encodeURIComponent(abs)}`);
          } else {
            const refParam = effectiveReferer ? `&referer=${encodeURIComponent(effectiveReferer)}` : "";
            const origParam = effectiveOrigin ? `&origin=${encodeURIComponent(effectiveOrigin)}` : "";
            const uaParam = ua ? `&ua=${encodeURIComponent(ua)}` : "";
            rewrittenLines.push(`/api/proxy/segment?url=${encodeURIComponent(abs)}${refParam}${origParam}${uaParam}`);
          }
          continue;
        }

        rewrittenLines.push(line);
      }

      if (audioMediaLines.length > 0) {
        const sortedAudio = [...audioMediaLines].sort((a, b) => {
          if (audio === "dub") {
            if (a.isEng && !b.isEng) return -1;
            if (!a.isEng && b.isEng) return 1;
          } else {
            if (a.isJpn && !b.isJpn) return -1;
            if (!a.isJpn && b.isJpn) return 1;
          }
          return 0;
        });
        sortedAudio.forEach((item) => rewrittenLines.push(item.line));
      }

      return new NextResponse(rewrittenLines.join("\n"), {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    return new NextResponse(content, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": String(response.headers["content-type"] || "text/plain"),
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: any) {
    const upstreamStatus =
      err.response?.status && err.response.status >= 400 && err.response.status < 500
        ? err.response.status
        : 502;
    return NextResponse.json(
      { error: `Proxy upstream error: ${err.message || err}`, code: upstreamStatus },
      { status: upstreamStatus, headers: CORS_HEADERS }
    );
  }
}
