import { NextRequest, NextResponse } from "next/server";
import { findAndStream } from "@/lib/reanime";
import { resolveAnimexPlayStream } from "@/lib/aniembed-extractor";
import { resolveFromAniListId, resolveFromMalId } from "@/lib/anime-resolver";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

// In-memory ticket storage for `/embed?t={ticket}`
export const ticketStore = new Map<
  string,
  {
    anilistId?: number;
    malId?: number;
    episode: number;
    audio: "sub" | "dub";
    server: string;
    startAt?: number;
    createdAt: number;
  }
>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const anilistId = body.anilistId || body.anilist_id;
    const malId = body.malId || body.mal_id;
    const episode = parseInt(String(body.episode || "1"), 10);
    const audio = (body.audio === "dub" ? "dub" : "sub") as "sub" | "dub";
    const server = body.server || "flow";
    const startAt = body.startAt || body.progress || 0;

    const ticket = `vh_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
    ticketStore.set(ticket, {
      anilistId: anilistId ? parseInt(String(anilistId), 10) : undefined,
      malId: malId ? parseInt(String(malId), 10) : undefined,
      episode,
      audio,
      server,
      startAt,
      createdAt: Date.now(),
    });

    const host = request.headers.get("host") || "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const baseUrl = `${protocol}://${host}`;

    return NextResponse.json(
      {
        success: true,
        ticket,
        embedUrl: `${baseUrl}/embed?t=${ticket}&progress=${startAt}`,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Invalid play request" },
      { status: 400, headers: CORS_HEADERS }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || searchParams.get("query") || searchParams.get("title");
    let rawAnilistId = searchParams.get("anilistId") || searchParams.get("anilist_id");
    let rawMalId = searchParams.get("malId") || searchParams.get("mal_id");
    const episode = parseInt(searchParams.get("episode") || searchParams.get("ep") || "1", 10);
    const dub = searchParams.get("dub") === "true" || searchParams.get("dub") === "1";
    const audio = (searchParams.get("audio") || (dub ? "dub" : "sub")) as "sub" | "dub";
    const serverParam = (searchParams.get("server") || "flow").toLowerCase();
    const format = searchParams.get("format");
    const wantsM3u8 =
      format === "m3u8" ||
      searchParams.get("m3u8") === "true" ||
      request.headers.get("accept")?.includes("application/vnd.apple.mpegurl") ||
      request.headers.get("accept")?.includes("audio/x-mpegurl") ||
      request.nextUrl.pathname.endsWith(".m3u8");

    const host = request.headers.get("host") || "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const baseUrl = `${protocol}://${host}`;

    let anilistId: number | null = rawAnilistId ? parseInt(rawAnilistId, 10) : null;
    let malId: number | null = rawMalId ? parseInt(rawMalId, 10) : null;
    let title: string = q || "";

    // 1. Resolve IDs bidirectional mapping
    if (malId && !anilistId) {
      const mapping = await resolveFromMalId(malId);
      if (mapping) {
        anilistId = mapping.anilistId;
        if (!title) title = mapping.title;
      }
    } else if (anilistId && !malId) {
      const mapping = await resolveFromAniListId(anilistId);
      if (mapping) {
        malId = mapping.malId;
        if (!title) title = mapping.title;
      }
    }

    if (!anilistId && !malId && !title) {
      return NextResponse.json(
        {
          success: false,
          error: "Please provide anilistId, malId, or anime name via query parameter",
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    let streamResult: any = null;
    let resolvedServer = serverParam;

    // 2. Try requested server first: 'zuri' (AniEmbed) or 'flow' (Re:ANIME)
    if (serverParam === "zuri" && anilistId) {
      try {
        const animex = await resolveAnimexPlayStream({
          anilistId,
          episode,
          type: audio,
          title: title || undefined,
        });

        if (animex?.proxyM3u8) {
          streamResult = {
            server: "Zuri",
            serverName: `Zuri (${animex.provider.toUpperCase()})`,
            provider: animex.provider,
            audio,
            m3u8: animex.proxyM3u8,
            fullM3u8: `${baseUrl}${animex.proxyM3u8}`,
            subtitles: animex.subtitles || [],
            chapters: animex.chapters,
          };
        }
      } catch (err: any) {
        console.warn("[/api/play] Zuri primary failed, attempting Flow fallback:", err?.message || err);
      }
    }

    // If 'flow' requested or 'zuri' failed, try 'flow'
    if (!streamResult) {
      try {
        const flowData = await findAndStream({
          anilistId: anilistId || undefined,
          query: title || (malId ? String(malId) : undefined),
          episode,
          type: audio,
          server: "all",
        });

        if (flowData?.hls) {
          const mainAidParam = flowData.access_id ? `&aid=${encodeURIComponent(flowData.access_id)}` : "";
          const mainVParam = flowData.version ? `&v=${flowData.version}` : "";
          const qParam = anilistId ? `&q=${anilistId}` : `&q=${encodeURIComponent(title)}`;
          const epParam = `&ep=${episode}`;
          const srvParam = `&server=${encodeURIComponent(flowData.server || "HD-1")}`;
          const proxyM3u8 = `/api/proxy/m3u8?url=${encodeURIComponent(flowData.hls)}&pk=${encodeURIComponent(flowData.pk || "")}&audio=${audio}${mainAidParam}${mainVParam}${qParam}${epParam}${srvParam}`;

          const allServersFormatted = (flowData.all_servers || []).map((s: any) => {
            const isDubSrv = s.audio === "dub";
            const sAidParam = s.access_id ? `&aid=${encodeURIComponent(s.access_id)}` : "";
            const sVParam = s.version ? `&v=${s.version}` : "";
            const subUrl = `${baseUrl}/api/proxy/m3u8?url=${encodeURIComponent(s.hls || "")}&pk=${encodeURIComponent(s.pk || "")}&audio=sub${sAidParam}${sVParam}${qParam}${epParam}&server=${encodeURIComponent(s.server)}`;
            const dubUrl = isDubSrv
              ? `${baseUrl}/api/proxy/m3u8?url=${encodeURIComponent(s.hls || "")}&pk=${encodeURIComponent(s.pk || "")}&audio=dub${sAidParam}${sVParam}${qParam}${epParam}&server=${encodeURIComponent(s.server)}`
              : null;
            return {
              server: s.server,
              audio: s.audio,
              m3u8: isDubSrv ? dubUrl : subUrl,
              subtitles: s.subtitles || [],
            };
          });

          const subsFormatted = (flowData.subtitles || []).map((sub: any, idx: number) => {
            const rawUrl = sub.url || sub.file || "";
            const proxySubUrl = rawUrl
              ? (rawUrl.startsWith("/api/proxy") ? rawUrl : `/api/proxy/subtitles?url=${encodeURIComponent(rawUrl)}`)
              : "";
            return {
              language: sub.language || sub.lang || sub.label || "English",
              label: sub.label || sub.language || `Subtitle ${idx + 1}`,
              url: proxySubUrl,
              direct_url: rawUrl,
              default: sub.default !== undefined ? sub.default : idx === 0,
            };
          });

          resolvedServer = "flow";
          streamResult = {
            server: "Flow",
            serverName: `Flow (${flowData.server || "HD-1"})`,
            audio: flowData.audio || audio,
            m3u8: proxyM3u8,
            fullM3u8: `${baseUrl}${proxyM3u8}`,
            subtitles: subsFormatted,
            allServers: allServersFormatted,
            hasDub: flowData.has_dub,
            hasSub: flowData.has_sub,
          };
        }
      } catch (err: any) {
        console.warn("[/api/play] Flow server notice:", err?.message || err);
      }
    }

    // If flow failed and we haven't tried Zuri yet, try Zuri as fallback
    if (!streamResult && serverParam !== "zuri" && anilistId) {
      try {
        const animex = await resolveAnimexPlayStream({
          anilistId,
          episode,
          type: audio,
          title: title || undefined,
        });

        if (animex?.proxyM3u8) {
          resolvedServer = "zuri";
          streamResult = {
            server: "Zuri",
            serverName: `Zuri (${animex.provider.toUpperCase()})`,
            provider: animex.provider,
            audio,
            m3u8: animex.proxyM3u8,
            fullM3u8: `${baseUrl}${animex.proxyM3u8}`,
            subtitles: animex.subtitles || [],
            chapters: animex.chapters,
          };
        }
      } catch {}
    }

    // Auto-retry the same number as MAL ID if AniList lookup failed
    if (!streamResult && anilistId && !malId) {
      try {
        const fallbackMapping = await resolveFromMalId(anilistId);
        if (fallbackMapping?.anilistId && fallbackMapping.anilistId !== anilistId) {
          const flowFallback = await findAndStream({
            anilistId: fallbackMapping.anilistId,
            episode,
            type: audio,
          });
          if (flowFallback?.hls) {
            const proxyM3u8 = `/api/proxy/m3u8?url=${encodeURIComponent(flowFallback.hls)}&pk=${encodeURIComponent(flowFallback.pk || "")}&audio=${audio}&q=${fallbackMapping.anilistId}&ep=${episode}`;
            streamResult = {
              server: "Flow",
              serverName: `Flow (${flowFallback.server || "HD-1"})`,
              audio,
              m3u8: proxyM3u8,
              fullM3u8: `${baseUrl}${proxyM3u8}`,
              subtitles: flowFallback.subtitles || [],
            };
          }
        }
      } catch {}
    }

    if (!streamResult) {
      return NextResponse.json(
        {
          success: false,
          code: "CONTENT_UNAVAILABLE",
          available: false,
          error: "Stream source not available on any server",
          anilistId,
          malId,
          episode,
          audio,
          server: serverParam,
        },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (wantsM3u8) {
      return NextResponse.redirect(new URL(streamResult.m3u8, baseUrl).href, {
        status: 302,
        headers: CORS_HEADERS,
      });
    }

    return NextResponse.json(
      {
        success: true,
        title,
        anilistId,
        malId,
        episode,
        audio,
        server: resolvedServer,
        serverName: streamResult.serverName,
        m3u8: streamResult.m3u8,
        fullM3u8: streamResult.fullM3u8,
        subtitles: streamResult.subtitles || [],
        chapters: streamResult.chapters || null,
        allServers: streamResult.allServers || null,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        code: "INTERNAL_ERROR",
        available: false,
        error: err?.message || "Failed to resolve playback source",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
