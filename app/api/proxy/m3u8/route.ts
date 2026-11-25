import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import http from "http";
import https from "https";
import { decryptFlixStream, findAndStream } from "@/lib/reanime";
import { getFreshStreamToken, fetchBufferWithBypass } from "@/lib/token-refresher";
import { isStreamTokenExpired } from "@/lib/token-utils";
import { isSafePublicUrl } from "@/shared/validators";
import { cleanAudioParam, normalizeLanguage } from "@/lib/vidly";

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
  const audio = searchParams.get("audio") || "english";
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

  if (!isSafePublicUrl(targetUrl)) {
    return NextResponse.json(
      { error: "Prohibited URL (SSRF protection)", code: 403 },
      { status: 403, headers: CORS_HEADERS }
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
      const fresh = await getFreshStreamToken({
        aid,
        v,
        q,
        ep,
        server,
        audio,
        forceFresh: true,
      });
      if (fresh?.hls && !isStreamTokenExpired(fresh.hls)) {
        return { hls: fresh.hls, pk: fresh.pk };
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
      if (
        targetUrl.includes("hikari") ||
        targetUrl.includes("streamrip.fun") ||
        targetUrl.includes("vidly") ||
        targetUrl.includes("rousav.tech") ||
        targetUrl.includes("hakunaymatata.com") ||
        targetUrl.includes("workers.dev")
      ) {
        effectiveReferer = "https://vidly.pro/";
      } else if (targetUrl.includes("flixcloud") || targetUrl.includes("atomic4cdn")) {
        effectiveReferer = "https://flixcloud.cc/";
      } else if (targetUrl.includes("animeparadise")) {
        effectiveReferer = "https://animeparadise.moe/";
      } else if (targetUrl.includes("vixcloud")) {
        effectiveReferer = "https://vixcloud.co/";
      } else if (targetUrl.includes("megaplay") || targetUrl.includes("akirax")) {
        effectiveReferer = "https://megaplay.buzz/";
      } else if (targetUrl.includes("megacloud") || targetUrl.includes("rapid-cloud") || targetUrl.includes("rabbitstream")) {
        effectiveReferer = "https://megacloud.tv/";
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
    let lastFetchErr: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await m3u8Axios.get(targetUrl, {
          responseType: "arraybuffer",
          timeout: 15000,
          headers,
        });
        break;
      } catch (fetchErr: any) {
        lastFetchErr = fetchErr;
        const status = fetchErr.response?.status;
        if (status === 401 || status === 403 || status === 410) {
          const fresh = await tryRefreshStream();
          if (fresh) {
            targetUrl = fresh.hls;
            if (fresh.pk) pk = fresh.pk;
            try {
              response = await m3u8Axios.get(targetUrl, {
                responseType: "arraybuffer",
                timeout: 15000,
                headers,
              });
              break;
            } catch (e2: any) {
              lastFetchErr = e2;
            }
          }
          if (status === 403 && headers["Origin"] && attempt === 0) {
            delete headers["Origin"];
            continue;
          }
          break;
        }
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    }

    // Fallback to got-scraping Chrome TLS + IPv4 if axios was blocked by Cloudflare/WAF or IPv6
    if (!response) {
      let bypass = await fetchBufferWithBypass(targetUrl, { headers, timeoutMs: 12000 });
      if (bypass && bypass.statusCode === 403 && headers["Origin"]) {
        const noOriginHeaders = { ...headers };
        delete noOriginHeaders["Origin"];
        bypass = await fetchBufferWithBypass(targetUrl, { headers: noOriginHeaders, timeoutMs: 12000 });
      }
      if (bypass && bypass.statusCode < 400 && bypass.buffer.length > 0) {
        response = {
          data: bypass.buffer,
          status: bypass.statusCode,
          headers: {},
        };
      }
    }

    if (!response) {
      const status = lastFetchErr?.response?.status;
      const isAuthError = status === 403 || status === 401 || status === 410;
      const statusCode = isAuthError ? 410 : (status || 502);
      return NextResponse.json(
        {
          error: isAuthError
            ? "Stream token expired"
            : `Proxy upstream error: ${lastFetchErr?.message || lastFetchErr}`,
          code: statusCode,
          expired: isAuthError,
        },
        { status: statusCode, headers: CORS_HEADERS }
      );
    }

    const rawBuf = Buffer.from(response.data);
    const upstreamCt = String(response.headers["content-type"] || "").toLowerCase();
    let content: string | null = null;
    if (!upstreamCt.startsWith("video/") || targetUrl.toLowerCase().includes(".m3u8")) {
      content = rawBuf.toString("utf8").replace(/^\uFEFF/, "");
    }

    // Decrypt if XOR-encrypted with pk
    if (pk && content !== null && !content.trimStart().startsWith("#EXTM3U")) {
      try {
        const l = Buffer.from(pk, "base64").toString("binary");
        const u = Buffer.from(content.trim(), "base64").toString("binary");
        const d = [];
        for (let h = 0; h < u.length; h++) {
          d.push(u.charCodeAt(h) ^ l.charCodeAt(h % l.length));
        }
        const dec = new TextDecoder().decode(new Uint8Array(d)).replace(/^\uFEFF/, "");
        if (dec.trimStart().startsWith("#EXTM3U")) {
          content = dec;
        }
      } catch {}
    }

    // Rewrite HLS manifest URIs to pass through proxy
    if (content !== null && content.trimStart().startsWith("#EXTM3U")) {
      const baseUrl = targetUrl;
      const lines = content.split(/\r?\n/);
      const rewrittenLines: string[] = [];
      const audioMediaLines: Array<{ line: string; isMatch: boolean; wasDefault: boolean; groupId: string }> = [];

      const setHlsFlag = (mediaLine: string, attr: "DEFAULT" | "AUTOSELECT", val: "YES" | "NO") => {
        const re = new RegExp(`${attr}=(YES|NO)`, "gi");
        if (re.test(mediaLine)) {
          return mediaLine.replace(re, `${attr}=${val}`);
        }
        return `${mediaLine},${attr}=${val}`;
      };

      const flushAudioMediaLines = () => {
        if (audioMediaLines.length === 0) return;
        const groupHasMatch = new Set<string>();
        const groupSelectedDone = new Set<string>();
        for (const item of audioMediaLines) {
          if (item.isMatch) groupHasMatch.add(item.groupId);
        }
        const sortedAudio = [...audioMediaLines].sort((a, b) => {
          if (a.isMatch && !b.isMatch) return -1;
          if (!a.isMatch && b.isMatch) return 1;
          return 0;
        });
        for (const item of sortedAudio) {
          const hasMatchInGroup = groupHasMatch.has(item.groupId);
          let shouldBeDefault = false;
          if (hasMatchInGroup) {
            if (item.isMatch && !groupSelectedDone.has(item.groupId)) {
              shouldBeDefault = true;
              groupSelectedDone.add(item.groupId);
            }
          } else {
            const firstOrDefault =
              sortedAudio.find((x) => x.groupId === item.groupId && x.wasDefault) ||
              sortedAudio.find((x) => x.groupId === item.groupId);
            if (item === firstOrDefault && !groupSelectedDone.has(item.groupId)) {
              shouldBeDefault = true;
              groupSelectedDone.add(item.groupId);
            }
          }
          let outLine = setHlsFlag(item.line, "DEFAULT", shouldBeDefault ? "YES" : "NO");
          outLine = setHlsFlag(outLine, "AUTOSELECT", shouldBeDefault ? "YES" : "NO");
          rewrittenLines.push(outLine);
        }
        audioMediaLines.length = 0;
      };

      const resolveUrlWithBase = (relative: string): string => {
        try {
          const trimmedRel = relative.trim();
          if (trimmedRel.startsWith("http://") || trimmedRel.startsWith("https://")) {
            return new URL(trimmedRel).href;
          }
          const u = new URL(trimmedRel, baseUrl);
          if (!u.search) {
            const baseParsed = new URL(baseUrl);
            if (baseParsed.search && !baseParsed.searchParams.has("url")) {
              u.search = baseParsed.search;
            }
          }
          return u.href;
        } catch {
          return new URL(relative, baseUrl).href;
        }
      };

      const isFlixcloudStream = Boolean(
        aid ||
        pk ||
        (targetUrl &&
          (targetUrl.includes("flixcloud") ||
            targetUrl.includes("atomic4cdn") ||
            targetUrl.includes("rundowncdn")))
      );
      const aidParam = aid ? `&aid=${encodeURIComponent(aid)}` : "";
      const vParam = v ? `&v=${v}` : "";
      const qParam = q ? `&q=${encodeURIComponent(q)}` : "";
      const epParam = ep ? `&ep=${ep}` : "";
      const srvParam = server ? `&server=${encodeURIComponent(server)}` : "";
      const audioParam = audio ? `&audio=${encodeURIComponent(audio)}` : "";
      const refParam = effectiveReferer ? `&referer=${encodeURIComponent(effectiveReferer)}` : "";
      const origParam = effectiveOrigin ? `&origin=${encodeURIComponent(effectiveOrigin)}` : "";
      const uaParam = ua ? `&ua=${encodeURIComponent(ua)}` : "";

      let isExpectingSegment = false;
      let isExpectingChildPlaylist = false;
      let segmentsEncrypted = false;

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

          if (audioLine.includes('URI="')) {
            audioLine = audioLine.replace(/URI="([^"]+)"/, (m, uri) => {
              const abs = resolveUrlWithBase(uri);
              return `URI="/api/proxy/m3u8?url=${encodeURIComponent(abs)}&pk=${encodeURIComponent(pk || "")}&audio=${encodeURIComponent(audio)}${aidParam}${vParam}${qParam}${epParam}${srvParam}${refParam}${origParam}${uaParam}"`;
            });
          }

          const targetAudio = cleanAudioParam(audio);
          const langMatch = audioLine.match(/LANGUAGE="([^"]+)"/);
          const nameMatch = audioLine.match(/NAME="([^"]+)"/);
          const groupMatch = audioLine.match(/GROUP-ID="([^"]+)"/);
          const wasDefault = /DEFAULT=YES/i.test(audioLine);
          const groupId = groupMatch ? groupMatch[1] : "__default__";
          const trackLang = normalizeLanguage(langMatch ? langMatch[1] : "", nameMatch ? nameMatch[1] : "");
          const isMatch =
            trackLang.code === targetAudio.code ||
            (targetAudio.code === "en" && (/English/i.test(audioLine) || /LANGUAGE="eng?"/i.test(audioLine))) ||
            (targetAudio.code === "ja" && (/Native|Japanese/i.test(audioLine) || /LANGUAGE="jp[an]?"/i.test(audioLine)));

          audioMediaLines.push({ line: audioLine, isMatch, wasDefault, groupId });
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
          flushAudioMediaLines();
        }

        // Rewrite #EXT-X-MEDIA other than AUDIO (e.g. SUBTITLES)
        if (trimmed.startsWith("#EXT-X-MEDIA:") && trimmed.includes('URI="')) {
          const rewrittenMedia = line.replace(/URI="([^"]+)"/, (m, uri) => {
            const abs = resolveUrlWithBase(uri);
            return `URI="/api/proxy/m3u8?url=${encodeURIComponent(abs)}&pk=${encodeURIComponent(pk || "")}${refParam}${origParam}${uaParam}"`;
          });
          rewrittenLines.push(rewrittenMedia);
          continue;
        }

        // Handle #EXT-X-MAP with URI
        if (trimmed.startsWith("#EXT-X-MAP:") && trimmed.includes('URI="')) {
          const rewrittenMap = line.replace(/URI="([^"]+)"/, (m, uri) => {
            const abs = resolveUrlWithBase(uri);
            if (isFlixcloudStream) {
              return `URI="/api/proxy/ts?url=${encodeURIComponent(abs)}${aidParam}${vParam}${qParam}${epParam}${srvParam}"`;
            }
            return `URI="/api/proxy/segment?url=${encodeURIComponent(abs)}${refParam}${origParam}${uaParam}"`;
          });
          rewrittenLines.push(rewrittenMap);
          continue;
        }

        // Rewrite #EXT-X-KEY lines (AES-128 encryption key)
        if (trimmed.startsWith("#EXT-X-KEY:")) {
          const methodMatch = trimmed.match(/METHOD=([A-Z0-9-]+)/i);
          segmentsEncrypted = Boolean(methodMatch && methodMatch[1].toUpperCase() !== "NONE");
        }
        if (trimmed.startsWith("#EXT-X-KEY:") && /URI=["']?([^"',\s]+)["']?/.test(trimmed)) {
          const rewrittenKey = line.replace(/URI=["']?([^"',\s]+)["']?/, (m, uri) => {
            const abs = resolveUrlWithBase(uri);
            if (isFlixcloudStream) {
              return `URI="/api/proxy/key?url=${encodeURIComponent(abs)}${aidParam}${vParam}${qParam}${epParam}${srvParam}${audioParam}${refParam}${origParam}"`;
            }
            return `URI="/api/proxy/segment?url=${encodeURIComponent(abs)}${refParam}${origParam}${uaParam}&key=1"`;
          });
          rewrittenLines.push(rewrittenKey);
          continue;
        }

        // Track whether following line is a media segment or child playlist
        if (trimmed.startsWith("#EXTINF:")) {
          isExpectingSegment = true;
          isExpectingChildPlaylist = false;
        } else if (trimmed.startsWith("#EXT-X-STREAM-INF:")) {
          isExpectingChildPlaylist = true;
          isExpectingSegment = false;
          // Strip non-standard DEFAULT attribute from #EXT-X-STREAM-INF (RFC 8216 compliance)
          const cleanStreamInf = line
            .replace(/,\s*DEFAULT=(YES|NO)/gi, "")
            .replace(/DEFAULT=(YES|NO)\s*,?/gi, "");
          rewrittenLines.push(cleanStreamInf);
          continue;
        }

        // Process URI lines (non-comment lines)
        if (!trimmed.startsWith("#")) {
          const abs = resolveUrlWithBase(trimmed);

          let absPathname = "";
          try {
            absPathname = new URL(abs).pathname.toLowerCase();
          } catch {}

          // Subtitle segment files (.vtt, .srt, .ass, etc.) must be served via subtitle proxy
          if (/\.(vtt|webvtt|srt|ass|ssa)$/i.test(absPathname)) {
            isExpectingSegment = false;
            rewrittenLines.push(
              `/api/proxy/subtitles?url=${encodeURIComponent(abs)}${refParam}${origParam}`
            );
            continue;
          }

          // Explicitly following #EXT-X-STREAM-INF or explicitly an .m3u8 playlist URL
          const isPlaylistUrl =
            isExpectingChildPlaylist ||
            trimmed.endsWith(".m3u8") ||
            trimmed.includes(".m3u8?") ||
            absPathname.endsWith(".m3u8");

          if (isPlaylistUrl && !isExpectingSegment) {
            isExpectingChildPlaylist = false;
            rewrittenLines.push(
              `/api/proxy/m3u8?url=${encodeURIComponent(abs)}&pk=${encodeURIComponent(pk || "")}&audio=${encodeURIComponent(audio)}${aidParam}${vParam}${qParam}${epParam}${srvParam}${refParam}${origParam}${uaParam}`
            );
            continue;
          }

          // Otherwise it is a media segment (e.g. .ts, .m4s, .jpg, .js, .txt)
          isExpectingSegment = false;
          const rawParam = segmentsEncrypted ? "&raw=1" : "";
          if (isFlixcloudStream) {
            rewrittenLines.push(`/api/proxy/ts?url=${encodeURIComponent(abs)}${aidParam}${vParam}${qParam}${epParam}${srvParam}${audioParam}${refParam}${origParam}${rawParam}`);
          } else {
            rewrittenLines.push(`/api/proxy/segment?url=${encodeURIComponent(abs)}${refParam}${origParam}${uaParam}${rawParam}`);
          }
          continue;
        }

        rewrittenLines.push(line);
      }

      flushAudioMediaLines();

      return new NextResponse(rewrittenLines.join("\n"), {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    return new NextResponse(new Uint8Array(rawBuf), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": String(response.headers["content-type"] || "application/octet-stream"),
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
