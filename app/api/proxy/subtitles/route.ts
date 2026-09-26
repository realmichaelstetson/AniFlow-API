import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

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

function convertAssToVtt(assText: string): string {
  const lines = assText.replace(/\r\n/g, "\n").split("\n");
  const vttLines = ["WEBVTT\n"];

  const formatVttTime = (t: string) => {
    const segs = t.split(":");
    let sec = segs[segs.length - 1].replace(",", ".");
    if (!sec.includes(".")) sec += ".000";
    const secParts = sec.split(".");
    sec = secParts[0].padStart(2, "0") + "." + secParts[1].padEnd(3, "0").slice(0, 3);

    if (segs.length === 2) {
      return `00:${segs[0].padStart(2, "0")}:${sec}`;
    } else if (segs.length === 3) {
      return `${segs[0].padStart(2, "0")}:${segs[1].padStart(2, "0")}:${sec}`;
    }
    return t;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith("Dialogue:")) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const content = line.substring(colonIdx + 1).trim();
    const parts = content.split(",");
    if (parts.length < 9) continue;

    const startStr = parts[1].trim();
    const endStr = parts[2].trim();
    const rawText = parts.slice(9).join(",");

    const cleanText = rawText
      .replace(/\{[^}]*\}/g, "")
      .replace(/\\N/gi, "\n")
      .replace(/\\n/gi, "\n")
      .replace(/\\h/gi, " ")
      .trim();

    if (!cleanText) continue;

    vttLines.push(`${formatVttTime(startStr)} --> ${formatVttTime(endStr)}\n${cleanText}\n`);
  }

  return vttLines.join("\n");
}

function convertSrtToVtt(srtText: string): string {
  let vtt = srtText.replace(/\r\n/g, "\n");
  vtt = vtt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  if (!vtt.startsWith("WEBVTT")) {
    vtt = "WEBVTT\n\n" + vtt;
  }
  return vtt;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawTargetUrl = searchParams.get("url");

  if (!rawTargetUrl) {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  let targetUrl: string = rawTargetUrl;

  while (targetUrl.includes("/api/proxy/subtitles") && targetUrl.includes("url=")) {
    try {
      const u = new URL(targetUrl, "http://localhost:3000");
      const inner = u.searchParams.get("url");
      if (inner && inner !== targetUrl) {
        targetUrl = inner;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  if (
    targetUrl.includes("brenopolanski") ||
    targetUrl.includes("html5-video-webvtt-example")
  ) {
    return new NextResponse("WEBVTT\n\n", {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/vtt; charset=utf-8",
      },
    });
  }

  try {
    const customReferer = searchParams.get("referer");
    let effectiveReferer = customReferer || "https://flixcloud.cc/";
    if (!customReferer) {
      if (targetUrl.includes("megacloud")) {
        effectiveReferer = "https://megacloud.tv/";
      } else if (targetUrl.includes("rapid-cloud")) {
        effectiveReferer = "https://rapid-cloud.co/";
      } else if (targetUrl.includes("rabbitstream")) {
        effectiveReferer = "https://rabbitstream.net/";
      } else if (targetUrl.includes("flixcloud") || targetUrl.includes("coolapi")) {
        effectiveReferer = "https://flixcloud.cc/";
      } else {
        try {
          effectiveReferer = new URL(targetUrl).origin + "/";
        } catch {}
      }
    }

    const response = await axios.get(targetUrl, {
      responseType: "text",
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Referer: effectiveReferer,
        Accept: "*/*",
      },
    });

    const rawContent: string = response.data || "";
    let finalVtt = rawContent;

    if (rawContent.includes("[Script Info]") || rawContent.includes("Dialogue:")) {
      finalVtt = convertAssToVtt(rawContent);
    } else if (rawContent.includes("-->") && !rawContent.trim().startsWith("WEBVTT")) {
      finalVtt = convertSrtToVtt(rawContent);
    } else if (!rawContent.trim().startsWith("WEBVTT")) {
      finalVtt = "WEBVTT\n\n" + rawContent;
    }

    return new NextResponse(finalVtt, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/vtt; charset=utf-8",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (err: any) {
    return new NextResponse("Failed to load subtitle", {
      status: 502,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/plain",
      },
    });
  }
}
