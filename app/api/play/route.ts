import { NextRequest, NextResponse } from "next/server";
import { findAndStream, getReanimeEpisodeSources, isReanimeCloudflareBlocked } from "@/lib/reanime";
import { resolveAnimexPlayStream, getAnimexEpisodeSources } from "@/lib/aniembed-extractor";
import { resolveFromAniListId, resolveFromMalId } from "@/lib/anime-resolver";
import { resolveConsumetStreams, resolveConsumetAnimeParadise } from "@/lib/consumet";
import { extractStreams } from "@/lib/anime-extract";

import { ticketStore } from "@/lib/tickets";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const sourcesCache = new Map<string, { data: any[]; timestamp: number }>();
const SOURCES_CACHE_TTL = 15 * 60 * 1000; // 15 mins

async function getAllSourcesCached(
  targetIdentifier: string | number,
  anilistId: number | null,
  episode: number,
  title?: string
): Promise<any[]> {
  const cacheKey = `${targetIdentifier}_ep${episode}`;
  const cached = sourcesCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SOURCES_CACHE_TTL) {
    return cached.data;
  }

  const reanimePromise = isReanimeCloudflareBlocked()
    ? Promise.resolve([])
    : getReanimeEpisodeSources(targetIdentifier, episode).catch(() => []);

  const animexPromise = anilistId
    ? getAnimexEpisodeSources(anilistId, episode).catch(() => [])
    : Promise.resolve([]);

  const consumetPromise = resolveConsumetStreams({
    animeTitle: title || String(targetIdentifier),
    episodeNumber: episode,
    anilistId,
  })
    .then((cStreams) =>
      cStreams.map((cs) => {
        const isDub = cs.type === "DUB";
        const proxyUrl = cs.videoUrl.startsWith("/api/proxy")
          ? cs.videoUrl
          : `/api/proxy/m3u8?url=${encodeURIComponent(cs.videoUrl)}`;
        return {
          id: `consumet-${cs.serverName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
          server: cs.serverName,
          name: cs.serverName,
          serverName: `${cs.serverName} (${isDub ? "English Dub" : "Sub"})`,
          type: cs.type,
          audio: isDub ? "dub" : "sub",
          videoUrl: proxyUrl,
          m3u8: proxyUrl,
          quality: cs.quality || "1080p",
          isHls: true,
          subtitles: cs.subtitles || [],
        };
      })
    )
    .catch(() => []);

  const [reanimeSources, animexSources, consumetSources] = await Promise.all([
    reanimePromise,
    animexPromise,
    consumetPromise,
  ]);
  const all = [...reanimeSources, ...animexSources, ...consumetSources];
  if (all.length > 0) {
    sourcesCache.set(cacheKey, { data: all, timestamp: Date.now() });
  }
  return all;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

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
    const providerParam = searchParams.get("provider") || searchParams.get("providerId");
    const slugParam = searchParams.get("slug");
    const format = searchParams.get("format");
    const wantsM3u8 =
      format === "m3u8" ||
      searchParams.get("m3u8") === "true" ||
      request.headers.get("accept")?.includes("application/vnd.apple.mpegurl") ||
      (request.nextUrl?.pathname || new URL(request.url).pathname).endsWith(".m3u8");

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

    const targetIdentifier = anilistId || title || (malId ? String(malId) : "");

    // Check if AniEmbed / Animex provider was explicitly requested.
    // Zuri is actually 'zuna' from pp.animex.one extractor and is strictly SUB ONLY (no Dub).
    const isZuriParam = serverParam === "zuri" || serverParam === "zuna" || providerParam === "zuri" || providerParam === "zuna";
    const isAnimexMode = Boolean(
      (providerParam && !isZuriParam) ||
      (audio === "sub" && isZuriParam) ||
      serverParam === "yuri" ||
      serverParam === "yuki" ||
      serverParam === "animex" ||
      serverParam === "aniembed"
    );

    // FAST-PATH: If caller is requesting direct .m3u8 stream playback (HLS video element)
    if (wantsM3u8) {
      if (isAnimexMode && anilistId) {
        try {
          const animex = await resolveAnimexPlayStream({
            anilistId,
            episode,
            type: audio,
            provider: providerParam || (serverParam !== "flow" && !serverParam.startsWith("flow") ? serverParam : undefined),
            slug: slugParam || undefined,
            title: title || undefined,
          });
          if (animex?.proxyM3u8) {
            return NextResponse.redirect(new URL(animex.proxyM3u8, baseUrl).href, {
              status: 302,
              headers: CORS_HEADERS,
            });
          }
        } catch {}
      }

      // Concurrently query Flow (Re:ANIME), AnimeParadise (Consumet), and Extractors (Kaido & Kaa)
      const isFlow2 =
        serverParam.includes("flow2") ||
        serverParam.includes("flow-2") ||
        serverParam.includes("flow 2") ||
        serverParam.includes("hd-2") ||
        serverParam === "hd2";
      const flowServer = isFlow2 ? "HD-2" : serverParam.includes("hd-1") || serverParam.includes("flow1") || serverParam === "hd1" ? "HD-1" : "all";

      const flowPromise = isReanimeCloudflareBlocked()
        ? Promise.resolve(null)
        : findAndStream({
            anilistId: anilistId || undefined,
            query: title || (malId ? String(malId) : undefined),
            episode,
            type: audio,
            server: flowServer,
          }).catch(() => null);

      const paradisePromise = (title || anilistId)
        ? resolveConsumetAnimeParadise(title || String(anilistId), episode).catch(() => null)
        : Promise.resolve(null);

      const extractPromise = anilistId
        ? extractStreams(String(anilistId), String(episode), audio).catch(() => null)
        : Promise.resolve(null);

      const [flowData, paradiseData, extractResult] = await Promise.all([
        flowPromise,
        paradisePromise,
        extractPromise,
      ]);

      if (flowData?.hls) {
        const mainAidParam = flowData.access_id ? `&aid=${encodeURIComponent(flowData.access_id)}` : "";
        const mainVParam = flowData.version ? `&v=${flowData.version}` : "";
        const qParam = anilistId ? `&q=${anilistId}` : `&q=${encodeURIComponent(title)}`;
        const epParam = `&ep=${episode}`;
        const srvParam = `&server=${encodeURIComponent(flowData.server || "HD-1")}`;
        const proxyM3u8 = `/api/proxy/m3u8?url=${encodeURIComponent(flowData.hls)}&pk=${encodeURIComponent(flowData.pk || "")}&audio=${audio}${mainAidParam}${mainVParam}${qParam}${epParam}${srvParam}`;
        return NextResponse.redirect(new URL(proxyM3u8, baseUrl).href, {
          status: 302,
          headers: CORS_HEADERS,
        });
      }

      if (paradiseData?.sources?.[0]?.url) {
        const rawUrl = paradiseData.sources[0].url;
        const proxiedUrl = rawUrl.startsWith("/api/proxy")
          ? rawUrl
          : `/api/proxy/m3u8?url=${encodeURIComponent(rawUrl)}`;
        return NextResponse.redirect(new URL(proxiedUrl, baseUrl).href, {
          status: 302,
          headers: CORS_HEADERS,
        });
      }

      if (extractResult) {
        const audioKey = `s${audio}`;
        const streams = extractResult?.[audioKey]?.streams || extractResult?.streams || [];
        if (Array.isArray(streams) && streams.length > 0 && streams[0]?.url) {
          const rawUrl = streams[0].url;
          const proxiedUrl = rawUrl.startsWith("/api/proxy")
            ? rawUrl
            : `/api/proxy/m3u8?url=${encodeURIComponent(rawUrl)}`;
          return NextResponse.redirect(new URL(proxiedUrl, baseUrl).href, {
            status: 302,
            headers: CORS_HEADERS,
          });
        }
      }

      // Last fallback: Animex
      if (anilistId) {
        try {
          const animex = await resolveAnimexPlayStream({
            anilistId,
            episode,
            type: audio,
            title: title || undefined,
          });
          if (animex?.proxyM3u8) {
            return NextResponse.redirect(new URL(animex.proxyM3u8, baseUrl).href, {
              status: 302,
              headers: CORS_HEADERS,
            });
          }
        } catch {}
      }

      return NextResponse.json(
        { success: false, error: "Stream unavailable" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // If caller explicitly asks for the full sources list
    if (
      searchParams.get("sources") === "true" ||
      searchParams.get("action") === "sources" ||
      format === "sources"
    ) {
      const allSources = await getAllSourcesCached(targetIdentifier, anilistId, episode);
      return NextResponse.json(
        {
          success: true,
          title,
          anilistId,
          malId,
          episode,
          audio,
          sources: allSources,
        },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // Helper to resolve stream for requested provider concurrently
    const resolveStreamTask = async () => {
      let result: any = null;
      let resolvedServerName = serverParam;

      if (isAnimexMode && anilistId) {
        try {
          const animex = await resolveAnimexPlayStream({
            anilistId,
            episode,
            type: audio,
            provider: providerParam || (serverParam !== "flow" && !serverParam.startsWith("flow") ? serverParam : undefined),
            slug: slugParam || undefined,
            title: title || undefined,
          });

          if (animex?.proxyM3u8) {
            const provNorm = (animex.provider || "").toLowerCase();
            const provName = provNorm === "yuki" || provNorm === "yuri" ? "Yuri" : provNorm === "zuna" || provNorm === "zuri" ? "Zuri" : animex.provider;
            resolvedServerName = provName;
            result = {
              server: provName,
              serverName: `${provName} (${audio === "dub" ? "English Dub" : "Sub"})`,
              provider: animex.provider,
              audio,
              m3u8: animex.proxyM3u8,
              fullM3u8: `${baseUrl}${animex.proxyM3u8}`,
              subtitles: animex.subtitles || [],
              chapters: animex.chapters,
            };
            return { result, resolvedServerName };
          }
        } catch (err: any) {
          console.warn("[/api/play] Animex resolution notice:", err?.message || err);
        }
      }

      // Concurrently query Flow (Re:ANIME), AnimeParadise (Consumet), and Extractors (Kaido & Kaa)
      const isFlow2 =
        serverParam.includes("flow2") ||
        serverParam.includes("flow-2") ||
        serverParam.includes("flow 2") ||
        serverParam.includes("hd-2") ||
        serverParam === "hd2";
      const flowServer = isFlow2 ? "HD-2" : serverParam.includes("hd-1") || serverParam.includes("flow1") || serverParam === "hd1" ? "HD-1" : "all";

      const flowPromise = isReanimeCloudflareBlocked()
        ? Promise.resolve(null)
        : findAndStream({
            anilistId: anilistId || undefined,
            query: title || (malId ? String(malId) : undefined),
            episode,
            type: audio,
            server: flowServer,
          }).catch(() => null);

      const paradisePromise = (title || anilistId)
        ? resolveConsumetAnimeParadise(title || String(anilistId), episode).catch(() => null)
        : Promise.resolve(null);

      const extractPromise = anilistId
        ? extractStreams(String(anilistId), String(episode), audio).catch(() => null)
        : Promise.resolve(null);

      const [flowData, paradiseData, extractResult] = await Promise.all([
        flowPromise,
        paradisePromise,
        extractPromise,
      ]);

      const allServersFormatted: any[] = [];

      // 1. Process Re:ANIME / Flow servers
      if (flowData?.hls) {
        const mainAidParam = flowData.access_id ? `&aid=${encodeURIComponent(flowData.access_id)}` : "";
        const mainVParam = flowData.version ? `&v=${flowData.version}` : "";
        const qParam = anilistId ? `&q=${anilistId}` : `&q=${encodeURIComponent(title)}`;
        const epParam = `&ep=${episode}`;
        const srvParam = `&server=${encodeURIComponent(flowData.server || "HD-1")}`;
        const proxyM3u8 = `/api/proxy/m3u8?url=${encodeURIComponent(flowData.hls)}&pk=${encodeURIComponent(flowData.pk || "")}&audio=${audio}${mainAidParam}${mainVParam}${qParam}${epParam}${srvParam}`;

        const flowServers = (flowData.all_servers || []).map((s: any) => {
          const isDubSrv = s.audio === "dub";
          const sAidParam = s.access_id ? `&aid=${encodeURIComponent(s.access_id)}` : "";
          const sVParam = s.version ? `&v=${s.version}` : "";
          const subUrl = `${baseUrl}/api/proxy/m3u8?url=${encodeURIComponent(s.hls || "")}&pk=${encodeURIComponent(s.pk || "")}&audio=sub${sAidParam}${sVParam}${qParam}${epParam}&server=${encodeURIComponent(s.server)}`;
          const dubUrl = isDubSrv
            ? `${baseUrl}/api/proxy/m3u8?url=${encodeURIComponent(s.hls || "")}&pk=${encodeURIComponent(s.pk || "")}&audio=dub${sAidParam}${sVParam}${qParam}${epParam}&server=${encodeURIComponent(s.server)}`
            : null;
          const srvNum = (s.server || "").includes("2") ? "2" : "1";
          return {
            id: `flow-${srvNum}-${s.audio}`,
            server: s.server,
            name: s.server,
            serverName: `${s.server} (${s.audio === "dub" ? "English Dub" : "Sub"})`,
            type: s.audio === "dub" ? "DUB" : "SUB",
            audio: s.audio,
            videoUrl: isDubSrv ? dubUrl : subUrl,
            m3u8: isDubSrv ? dubUrl : subUrl,
            quality: "1080p",
            isHls: true,
            subtitles: s.subtitles || [],
          };
        });
        allServersFormatted.push(...flowServers);

        const subsFormatted = (flowData.subtitles || []).map((sub: any, idx: number) => {
          const rawUrl = sub.url || sub.file || "";
          const proxySubUrl = rawUrl
            ? rawUrl.startsWith("/api/proxy")
              ? rawUrl
              : `/api/proxy/subtitles?url=${encodeURIComponent(rawUrl)}`
            : "";
          return {
            language: sub.language || sub.lang || sub.label || "English",
            label: sub.label || sub.language || `Subtitle ${idx + 1}`,
            url: proxySubUrl,
            direct_url: rawUrl,
            default: sub.default !== undefined ? sub.default : idx === 0,
          };
        });

        const flowServerLabel = (flowData.server || "HD-1").toUpperCase().includes("HD-2") || (flowData.server || "").toUpperCase().includes("2") ? "Flow 2" : "Flow 1";
        resolvedServerName = flowServerLabel;
        result = {
          server: flowServerLabel,
          serverName: `${flowServerLabel} (${audio === "dub" ? "English Dub" : "Sub"})`,
          audio: flowData.audio || audio,
          m3u8: proxyM3u8,
          fullM3u8: `${baseUrl}${proxyM3u8}`,
          subtitles: subsFormatted,
          allServers: allServersFormatted,
          hasDub: flowData.has_dub,
          hasSub: flowData.has_sub,
        };
      }

      // 2. Add AnimeParadise (Consumet - 1080p master HLS)
      if (paradiseData?.sources?.[0]?.url) {
        const rawUrl = paradiseData.sources[0].url;
        const paradiseProxy = rawUrl.startsWith("/api/proxy")
          ? rawUrl
          : `/api/proxy/m3u8?url=${encodeURIComponent(rawUrl)}`;
        const paradiseServer = {
          id: "animeparadise-hd",
          server: "AnimeParadise",
          name: "AnimeParadise",
          serverName: `AnimeParadise (${audio === "dub" ? "English Dub" : "Sub"})`,
          type: audio === "dub" ? "DUB" : "SUB",
          audio,
          videoUrl: paradiseProxy,
          m3u8: paradiseProxy,
          quality: "1080p",
          isHls: true,
          subtitles: paradiseData.subtitles || [],
        };
        allServersFormatted.push(paradiseServer);

        if (!result) {
          resolvedServerName = "AnimeParadise";
          result = {
            server: "AnimeParadise",
            serverName: `AnimeParadise (${audio === "dub" ? "English Dub" : "Sub"})`,
            audio: "sub",
            m3u8: paradiseProxy,
            fullM3u8: `${baseUrl}${paradiseProxy}`,
            subtitles: paradiseData.subtitles || [],
            allServers: allServersFormatted,
            hasDub: false,
            hasSub: true,
          };
        }
      }

      // 3. Add ExtractStreams (Kaido & Kaa)
      if (extractResult) {
        const audioKey = `s${audio}`;
        const streams = extractResult?.[audioKey]?.streams || extractResult?.streams || [];
        if (Array.isArray(streams) && streams.length > 0 && streams[0]?.url) {
          const rawUrl = streams[0].url;
          const extractProxy = rawUrl.startsWith("/api/proxy")
            ? rawUrl
            : `/api/proxy/m3u8?url=${encodeURIComponent(rawUrl)}`;
          const prov = (extractResult.provider || "HD").toUpperCase();
          const rawSubs = extractResult?.[audioKey]?.subtitles || extractResult?.subtitles || [];
          const subList = rawSubs.map((sub: any, idx: number) => {
            const sUrl = sub.file || sub.url || "";
            return {
              language: sub.language || "en",
              label: sub.label || "English",
              url: sUrl.startsWith("/api/proxy") ? sUrl : `/api/proxy/subtitles?url=${encodeURIComponent(sUrl)}`,
              direct_url: sUrl,
              default: sub.default || idx === 0,
            };
          });

          const extractServer = {
            id: `extract-${prov.toLowerCase()}`,
            server: prov,
            name: prov,
            serverName: `${prov} (${audio === "dub" ? "English Dub" : "Sub"})`,
            type: audio === "dub" ? "DUB" : "SUB",
            audio,
            videoUrl: extractProxy,
            m3u8: extractProxy,
            quality: "1080p",
            isHls: true,
            subtitles: subList,
          };
          allServersFormatted.push(extractServer);

          if (!result) {
            resolvedServerName = prov;
            result = {
              server: prov,
              serverName: `${prov} (${audio === "dub" ? "English Dub" : "Sub"})`,
              audio,
              m3u8: extractProxy,
              fullM3u8: `${baseUrl}${extractProxy}`,
              subtitles: subList,
              allServers: allServersFormatted,
            };
          }
        }
      }

      // 4. Fallback to Animex if all above failed
      if (!result && anilistId) {
        try {
          const animex = await resolveAnimexPlayStream({
            anilistId,
            episode,
            type: audio,
            title: title || undefined,
          });

          if (animex?.proxyM3u8) {
            const provNorm = (animex.provider || "").toLowerCase();
            const provName = provNorm === "yuki" || provNorm === "yuri" ? "Yuri" : provNorm === "zuna" || provNorm === "zuri" ? "Zuri" : animex.provider;
            resolvedServerName = provName;
            result = {
              server: provName,
              serverName: `${provName} (${audio === "dub" ? "English Dub" : "Sub"})`,
              provider: animex.provider,
              audio: animex.type,
              m3u8: animex.proxyM3u8,
              fullM3u8: `${baseUrl}${animex.proxyM3u8}`,
              subtitles: animex.subtitles || [],
              chapters: animex.chapters,
            };
          }
        } catch (animexErr: any) {
          console.warn("[/api/play] Animex fallback notice:", animexErr?.message || animexErr);
        }
      }

      if (result && (!result.allServers || result.allServers.length === 0)) {
        result.allServers = allServersFormatted;
      }

      return { result, resolvedServerName };
    };

    // 1. FAST-PATH: Resolve stream FIRST with highest priority (zero delay!)
    const streamResolution = await resolveStreamTask();
    let streamResult = streamResolution.result;
    let resolvedServer = streamResolution.resolvedServerName;

    // 5. Source list retrieval (if streamResult is missing, allow up to 4000ms to resolve sources!)
    let allSources: any[] = [];
    const cachedSources = sourcesCache.get(`${targetIdentifier}_ep${episode}`);
    if (cachedSources && Date.now() - cachedSources.timestamp < SOURCES_CACHE_TTL) {
      allSources = cachedSources.data;
    } else if (!streamResult) {
      allSources = await Promise.race([
        getAllSourcesCached(targetIdentifier, anilistId, episode, title),
        new Promise<any[]>((res) => setTimeout(() => res([]), 4000)),
      ]);
    } else {
      allSources = await Promise.race([
        getAllSourcesCached(targetIdentifier, anilistId, episode, title),
        new Promise<any[]>((res) => setTimeout(() => res([]), 1200)),
      ]);
    }

    // 6. Last-resort fallback: If streamResult is still null, take any available source from allSources
    if (!streamResult && allSources.length > 0) {
      const matchAudio = allSources.find((s: any) => s.type === (audio === "dub" ? "DUB" : "SUB")) || allSources[0];
      if (matchAudio?.videoUrl) {
        resolvedServer = matchAudio.serverName || "Auto";
        streamResult = {
          server: resolvedServer,
          serverName: matchAudio.serverName || resolvedServer,
          audio: matchAudio.type?.toLowerCase() || audio,
          m3u8: matchAudio.videoUrl,
          fullM3u8: matchAudio.videoUrl.startsWith("http") ? matchAudio.videoUrl : `${baseUrl}${matchAudio.videoUrl}`,
          subtitles: matchAudio.subtitles || [],
          allServers: allSources,
        };
      }
    }

    // 7. Ultimate self-healing fallback: never crash or return 404 if anilistId is known!
    if (!streamResult && anilistId) {
      const fallbackProxy = `/api/play?anilistId=${anilistId}&episode=${episode}&audio=${audio}&server=yuri&format=m3u8`;
      resolvedServer = "Yuri";
      streamResult = {
        server: "Yuri",
        serverName: `Yuri (${audio === "dub" ? "English Dub" : "Sub"})`,
        audio,
        m3u8: fallbackProxy,
        fullM3u8: `${baseUrl}${fallbackProxy}`,
        subtitles: [],
        allServers: allSources.length > 0 ? allSources : null,
      };
    }

    // Ensure allServers is attached to streamResult whenever available
    if (streamResult && (!streamResult.allServers || streamResult.allServers.length === 0) && allSources.length > 0) {
      streamResult.allServers = allSources;
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
          sources: allSources,
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
        streamUrl: streamResult.m3u8,
        url: streamResult.m3u8,
        m3u8: streamResult.m3u8,
        fullM3u8: streamResult.fullM3u8,
        subtitles: streamResult.subtitles || [],
        chapters: streamResult.chapters || null,
        allServers: streamResult.allServers || null,
        sources: allSources,
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
