import { NextRequest, NextResponse } from "next/server";
import { findAndStream, getReanimeEpisodeSources, isReanimeCloudflareBlocked } from "@/lib/reanime";
import { resolveAnimexPlayStream, getAnimexEpisodeSources } from "@/lib/aniembed-extractor";
import { resolveFromAniListId, resolveFromMalId } from "@/lib/anime-resolver";
import { resolveConsumetStreams, resolveConsumetAnimeParadise, resolveConsumetHiAnime, resolveConsumetGogoanime } from "@/lib/consumet";
import { extractStreams } from "@/lib/anime-extract";
import { kaido } from "@/lib/anime-extract/kaido";
import { kaa } from "@/lib/anime-extract/kaa";

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

      // Check specific requested provider first
      const isParadiseReq = serverParam.includes("paradise");
      const isKaidoReq = serverParam.includes("kaido");
      const isKaaReq = serverParam.includes("kaa");
      const isHiAnimeReq = serverParam.includes("hianime");
      const isGogoReq = serverParam.includes("gogo");
      const isFlow2Req =
        serverParam.includes("flow2") ||
        serverParam.includes("flow-2") ||
        serverParam.includes("flow 2") ||
        serverParam.includes("hd-2") ||
        serverParam === "hd2";

      if (isParadiseReq && (title || anilistId)) {
        try {
          const paradiseData = await resolveConsumetAnimeParadise(title || String(anilistId), episode);
          if (paradiseData?.sources?.[0]?.url) {
            const rawUrl = paradiseData.sources[0].url;
            const proxiedUrl = rawUrl.startsWith("/api/proxy") ? rawUrl : `/api/proxy/m3u8?url=${encodeURIComponent(rawUrl)}`;
            return NextResponse.redirect(new URL(proxiedUrl, baseUrl).href, { status: 302, headers: CORS_HEADERS });
          }
        } catch {}
      }

      if (isKaidoReq && anilistId) {
        try {
          const kaidoData = await kaido(String(anilistId), String(episode), audio);
          const streams = kaidoData?.[`s${audio}`]?.streams || kaidoData?.streams || [];
          if (streams[0]?.url) {
            const rawUrl = streams[0].url;
            const proxiedUrl = rawUrl.startsWith("/api/proxy") ? rawUrl : `/api/proxy/m3u8?url=${encodeURIComponent(rawUrl)}`;
            return NextResponse.redirect(new URL(proxiedUrl, baseUrl).href, { status: 302, headers: CORS_HEADERS });
          }
        } catch {}
      }

      if (isKaaReq && anilistId) {
        try {
          const kaaData = await kaa(String(anilistId), String(episode), "sub");
          const streams = kaaData?.ssub?.streams || kaaData?.streams || [];
          if (streams[0]?.url) {
            const rawUrl = streams[0].url;
            const proxiedUrl = rawUrl.startsWith("/api/proxy") ? rawUrl : `/api/proxy/m3u8?url=${encodeURIComponent(rawUrl)}`;
            return NextResponse.redirect(new URL(proxiedUrl, baseUrl).href, { status: 302, headers: CORS_HEADERS });
          }
        } catch {}
      }

      if (isHiAnimeReq) {
        try {
          const target = title || (anilistId ? String(anilistId) : "");
          const hiData = await resolveConsumetHiAnime(target, episode);
          if (hiData?.sources?.[0]?.url) {
            const rawUrl = hiData.sources[0].url;
            const proxiedUrl = rawUrl.startsWith("/api/proxy") ? rawUrl : `/api/proxy/m3u8?url=${encodeURIComponent(rawUrl)}`;
            return NextResponse.redirect(new URL(proxiedUrl, baseUrl).href, { status: 302, headers: CORS_HEADERS });
          }
        } catch {}
      }

      if (isGogoReq) {
        try {
          const target = title || (anilistId ? String(anilistId) : "");
          const gogoData = await resolveConsumetGogoanime(target, episode);
          if (gogoData?.sources?.[0]?.url) {
            const rawUrl = gogoData.sources[0].url;
            const proxiedUrl = rawUrl.startsWith("/api/proxy") ? rawUrl : `/api/proxy/m3u8?url=${encodeURIComponent(rawUrl)}`;
            return NextResponse.redirect(new URL(proxiedUrl, baseUrl).href, { status: 302, headers: CORS_HEADERS });
          }
        } catch {}
      }

      // Concurrently query Flow (Re:ANIME), AnimeParadise (Consumet), and Extractors (Kaido & Kaa)
      const flowServer = isFlow2Req ? "HD-2" : serverParam.includes("hd-1") || serverParam.includes("flow1") || serverParam === "hd1" ? "HD-1" : "all";

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

      // Concurrently query Flow (Re:ANIME), AnimeParadise (Consumet), Kaido, Kaa, Animex, HiAnime, and Gogoanime
      const isFlow2 =
        serverParam.includes("flow2") ||
        serverParam.includes("flow-2") ||
        serverParam.includes("flow 2") ||
        serverParam.includes("hd-2") ||
        serverParam === "hd2";
      const flowServer = isFlow2 ? "HD-2" : serverParam.includes("hd-1") || serverParam.includes("flow1") || serverParam === "hd1" ? "HD-1" : "all";

      const wantsHiAnime = serverParam.includes("hianime");
      const wantsGogo = serverParam.includes("gogo");
      const targetTitle = title || (anilistId ? String(anilistId) : "");

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

      const kaidoPromise = anilistId
        ? kaido(String(anilistId), String(episode), audio).catch(() => null)
        : Promise.resolve(null);

      const kaaPromise = anilistId
        ? kaa(String(anilistId), String(episode), "sub").catch(() => null)
        : Promise.resolve(null);

      const animexSourcesPromise = anilistId
        ? getAnimexEpisodeSources(anilistId, episode).catch(() => [])
        : Promise.resolve([]);

      const hianimePromise = (wantsHiAnime && targetTitle)
        ? resolveConsumetHiAnime(targetTitle, episode).catch(() => null)
        : Promise.resolve(null);

      const gogoPromise = (wantsGogo && targetTitle)
        ? resolveConsumetGogoanime(targetTitle, episode).catch(() => null)
        : Promise.resolve(null);

      const [flowData, paradiseData, kaidoData, kaaData, animexSourcesList, hianimeData, gogoData] = await Promise.all([
        flowPromise,
        paradisePromise,
        kaidoPromise,
        kaaPromise,
        animexSourcesPromise,
        hianimePromise,
        gogoPromise,
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

      // 3. Add Kaido (Extractor)
      if (kaidoData) {
        const audioKey = `s${audio}`;
        const streams = kaidoData?.[audioKey]?.streams || kaidoData?.streams || [];
        if (Array.isArray(streams) && streams.length > 0 && streams[0]?.url) {
          const rawUrl = streams[0].url;
          const kaidoProxy = rawUrl.startsWith("/api/proxy") ? rawUrl : `/api/proxy/m3u8?url=${encodeURIComponent(rawUrl)}`;
          const rawSubs = kaidoData?.[audioKey]?.subtitles || kaidoData?.subtitles || [];
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

          const kaidoServer = {
            id: `extract-kaido-${audio}`,
            server: "Kaido",
            name: "Kaido",
            serverName: `Kaido (${audio === "dub" ? "English Dub" : "Sub"})`,
            type: audio === "dub" ? "DUB" : "SUB",
            audio,
            videoUrl: kaidoProxy,
            m3u8: kaidoProxy,
            quality: "1080p",
            isHls: true,
            subtitles: subList,
          };
          allServersFormatted.push(kaidoServer);

          if (!result && serverParam.includes("kaido")) {
            resolvedServerName = "Kaido";
            result = {
              server: "Kaido",
              serverName: `Kaido (${audio === "dub" ? "English Dub" : "Sub"})`,
              audio,
              m3u8: kaidoProxy,
              fullM3u8: `${baseUrl}${kaidoProxy}`,
              subtitles: subList,
              allServers: allServersFormatted,
            };
          }
        }
      }

      // 4. Add Kaa (Extractor - Sub only)
      if (kaaData) {
        const streams = kaaData?.ssub?.streams || kaaData?.streams || [];
        if (Array.isArray(streams) && streams.length > 0 && streams[0]?.url) {
          const rawUrl = streams[0].url;
          const kaaProxy = rawUrl.startsWith("/api/proxy") ? rawUrl : `/api/proxy/m3u8?url=${encodeURIComponent(rawUrl)}`;
          const rawSubs = kaaData?.ssub?.subtitles || kaaData?.subtitles || [];
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

          const kaaServer = {
            id: "extract-kaa-sub",
            server: "Kaa",
            name: "Kaa",
            serverName: "Kaa (Sub)",
            type: "SUB",
            audio: "sub",
            videoUrl: kaaProxy,
            m3u8: kaaProxy,
            quality: "1080p",
            isHls: true,
            subtitles: subList,
          };
          allServersFormatted.push(kaaServer);

          if (!result && serverParam.includes("kaa")) {
            resolvedServerName = "Kaa";
            result = {
              server: "Kaa",
              serverName: "Kaa (Sub)",
              audio: "sub",
              m3u8: kaaProxy,
              fullM3u8: `${baseUrl}${kaaProxy}`,
              subtitles: subList,
              allServers: allServersFormatted,
            };
          }
        }
      }

      // 5. Add HiAnime if available
      if (hianimeData?.sources?.[0]?.url) {
        const rawUrl = hianimeData.sources[0].url;
        const hianimeProxy = rawUrl.startsWith("/api/proxy") ? rawUrl : `/api/proxy/m3u8?url=${encodeURIComponent(rawUrl)}`;
        const isDubH = (hianimeData.sources[0] as any)?.type === "DUB" || audio === "dub";
        const hianimeServer = {
          id: `consumet-hianime-${isDubH ? "dub" : "sub"}`,
          server: "HiAnime",
          name: "HiAnime",
          serverName: `HiAnime (${isDubH ? "English Dub" : "Sub"})`,
          type: isDubH ? "DUB" : "SUB",
          audio: isDubH ? "dub" : "sub",
          videoUrl: hianimeProxy,
          m3u8: hianimeProxy,
          quality: "1080p",
          isHls: true,
          subtitles: hianimeData.subtitles || [],
        };
        allServersFormatted.push(hianimeServer);

        if (!result && serverParam.includes("hianime")) {
          resolvedServerName = "HiAnime";
          result = {
            server: "HiAnime",
            serverName: hianimeServer.serverName,
            audio: hianimeServer.audio,
            m3u8: hianimeProxy,
            fullM3u8: `${baseUrl}${hianimeProxy}`,
            subtitles: hianimeData.subtitles || [],
            allServers: allServersFormatted,
          };
        }
      }

      // 6. Add Gogoanime if available
      if (gogoData?.sources?.[0]?.url) {
        const rawUrl = gogoData.sources[0].url;
        const gogoProxy = rawUrl.startsWith("/api/proxy") ? rawUrl : `/api/proxy/m3u8?url=${encodeURIComponent(rawUrl)}`;
        const isDubG = (gogoData.sources[0] as any)?.type === "DUB" || audio === "dub";
        const gogoServer = {
          id: `consumet-gogoanime-${isDubG ? "dub" : "sub"}`,
          server: "Gogoanime",
          name: "Gogoanime",
          serverName: `Gogoanime (${isDubG ? "English Dub" : "Sub"})`,
          type: isDubG ? "DUB" : "SUB",
          audio: isDubG ? "dub" : "sub",
          videoUrl: gogoProxy,
          m3u8: gogoProxy,
          quality: "1080p",
          isHls: true,
          subtitles: gogoData.subtitles || [],
        };
        allServersFormatted.push(gogoServer);

        if (!result && serverParam.includes("gogo")) {
          resolvedServerName = "Gogoanime";
          result = {
            server: "Gogoanime",
            serverName: gogoServer.serverName,
            audio: gogoServer.audio,
            m3u8: gogoProxy,
            fullM3u8: `${baseUrl}${gogoProxy}`,
            subtitles: gogoData.subtitles || [],
            allServers: allServersFormatted,
          };
        }
      }

      // 7. Add Animex (Yuri & Zuri)
      if (Array.isArray(animexSourcesList) && animexSourcesList.length > 0) {
        for (const as of animexSourcesList) {
          if (!allServersFormatted.some((s) => s.id === as.id)) {
            allServersFormatted.push({
              id: as.id,
              server: as.serverName.replace(/\s*\([^)]*\)/, ""),
              name: as.serverName.replace(/\s*\([^)]*\)/, ""),
              serverName: as.serverName,
              type: as.type,
              audio: as.type === "DUB" ? "dub" : "sub",
              videoUrl: as.videoUrl,
              m3u8: as.videoUrl,
              quality: as.quality || "1080p",
              isHls: true,
              subtitles: as.subtitles || [],
            });
          }
        }
      }

      // Guarantee all 9 standard providers exist in allServersFormatted (Sub & Dub)
      const standardProviders = [
        { prov: "Flow 1", srv: "flow1", subId: "flow-1-sub", dubId: "flow-1-dub", hasDub: true },
        { prov: "Flow 2", srv: "flow2", subId: "flow-2-sub", dubId: "flow-2-dub", hasDub: true },
        { prov: "AnimeParadise", srv: "paradise", subId: "animeparadise-sub", dubId: null, hasDub: false },
        { prov: "Kaido", srv: "kaido", subId: "extract-kaido-sub", dubId: "extract-kaido-dub", hasDub: true },
        { prov: "Kaa", srv: "kaa", subId: "extract-kaa-sub", dubId: null, hasDub: false },
        { prov: "HiAnime", srv: "hianime", subId: "consumet-hianime-sub", dubId: "consumet-hianime-dub", hasDub: true },
        { prov: "Gogoanime", srv: "gogo", subId: "consumet-gogoanime-sub", dubId: "consumet-gogoanime-dub", hasDub: true },
        { prov: "Yuri", srv: "yuri", subId: "animex-yuri-sub", dubId: "animex-yuri-dub", hasDub: true },
        { prov: "Zuri", srv: "zuri", subId: "animex-zuri-sub", dubId: null, hasDub: false },
      ];

      for (const sp of standardProviders) {
        const hasSub = allServersFormatted.some(
          (s) => (s.id === sp.subId || s.server === sp.prov || s.name === sp.prov) && s.type === "SUB"
        );
        if (!hasSub) {
          const subRoute = `/api/play?${anilistId ? `anilistId=${anilistId}&` : ""}${malId ? `malId=${malId}&` : ""}${title ? `q=${encodeURIComponent(title)}&` : ""}episode=${episode}&audio=sub&server=${sp.srv}&format=m3u8`;
          allServersFormatted.push({
            id: sp.subId,
            server: sp.prov,
            name: sp.prov,
            serverName: `${sp.prov} (Sub)`,
            type: "SUB",
            audio: "sub",
            videoUrl: subRoute,
            m3u8: subRoute,
            quality: "1080p",
            isHls: true,
            subtitles: [],
          });
        }

        if (sp.hasDub && sp.dubId) {
          const hasDub = allServersFormatted.some(
            (s) => (s.id === sp.dubId || s.server === sp.prov || s.name === sp.prov) && s.type === "DUB"
          );
          if (!hasDub) {
            const dubRoute = `/api/play?${anilistId ? `anilistId=${anilistId}&` : ""}${malId ? `malId=${malId}&` : ""}${title ? `q=${encodeURIComponent(title)}&` : ""}episode=${episode}&audio=dub&server=${sp.srv}&format=m3u8`;
            allServersFormatted.push({
              id: sp.dubId,
              server: sp.prov,
              name: sp.prov,
              serverName: `${sp.prov} (English Dub)`,
              type: "DUB",
              audio: "dub",
              videoUrl: dubRoute,
              m3u8: dubRoute,
              quality: "1080p",
              isHls: true,
              subtitles: [],
            });
          }
        }
      }

      // 8. Fallback to Animex resolveAnimexPlayStream if all above failed
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

      // Match target server if explicitly requested
      if (allServersFormatted.length > 0) {
        const targetServerNorm = serverParam.toLowerCase().replace(/[\s_-]/g, "");
        if (targetServerNorm && targetServerNorm !== "all" && targetServerNorm !== "flow" && targetServerNorm !== "flow1") {
          const matchingRequested = allServersFormatted.find((s) => {
            const sId = (s.id || "").toLowerCase().replace(/[\s_-]/g, "");
            const sName = (s.server || s.name || "").toLowerCase().replace(/[\s_-]/g, "");
            const matchAudio = s.type === (audio === "dub" ? "DUB" : "SUB");
            return (
              matchAudio &&
              (sId.includes(targetServerNorm) ||
                sName.includes(targetServerNorm) ||
                targetServerNorm.includes(sName) ||
                (targetServerNorm.includes("paradise") && (sId.includes("paradise") || sName.includes("paradise"))) ||
                (targetServerNorm.includes("kaido") && (sId.includes("kaido") || sName.includes("kaido"))) ||
                (targetServerNorm.includes("kaa") && (sId.includes("kaa") || sName.includes("kaa"))) ||
                (targetServerNorm.includes("hianime") && (sId.includes("hianime") || sName.includes("hianime"))) ||
                (targetServerNorm.includes("gogo") && (sId.includes("gogo") || sName.includes("gogo"))))
            );
          }) || allServersFormatted.find((s) => {
            const sId = (s.id || "").toLowerCase().replace(/[\s_-]/g, "");
            const sName = (s.server || s.name || "").toLowerCase().replace(/[\s_-]/g, "");
            return (
              sId.includes(targetServerNorm) ||
              sName.includes(targetServerNorm) ||
              targetServerNorm.includes(sName)
            );
          });

          if (matchingRequested?.videoUrl) {
            resolvedServerName = matchingRequested.server || matchingRequested.name;
            result = {
              server: resolvedServerName,
              serverName: matchingRequested.serverName || resolvedServerName,
              audio: matchingRequested.audio || audio,
              m3u8: matchingRequested.videoUrl,
              fullM3u8: matchingRequested.videoUrl.startsWith("http") ? matchingRequested.videoUrl : `${baseUrl}${matchingRequested.videoUrl}`,
              subtitles: matchingRequested.subtitles || [],
              allServers: allServersFormatted,
            };
          }
        }
      }

      if (result && (!result.allServers || result.allServers.length === 0)) {
        result.allServers = allServersFormatted;
      }

      return { result, resolvedServerName, allServersFormatted };
    };

    // 1. FAST-PATH: Resolve stream FIRST with highest priority (zero delay!)
    const streamResolution = await resolveStreamTask();
    let streamResult = streamResolution.result;
    let resolvedServer = streamResolution.resolvedServerName;
    const formattedServers = streamResolution.allServersFormatted || [];

    // 5. Source list retrieval (Fast & non-blocking!)
    let allSources: any[] = formattedServers.length > 0 ? [...formattedServers] : [];
    const cachedSources = sourcesCache.get(`${targetIdentifier}_ep${episode}`);

    if (cachedSources && Date.now() - cachedSources.timestamp < SOURCES_CACHE_TTL) {
      for (const cs of cachedSources.data) {
        if (!allSources.some((s) => s.id === cs.id || s.videoUrl === cs.videoUrl)) {
          allSources.push(cs);
        }
      }
    } else if (!streamResult && allSources.length === 0) {
      // Only wait for scrapers if we literally have zero streams available
      const fetched = await Promise.race([
        getAllSourcesCached(targetIdentifier, anilistId, episode, title),
        new Promise<any[]>((res) => setTimeout(() => res([]), 2500)),
      ]);
      if (fetched.length > 0) {
        allSources = fetched;
      }
    } else {
      // Stream is already ready! Run background scraper so subsequent requests are enriched without client delay.
      getAllSourcesCached(targetIdentifier, anilistId, episode, title).catch(() => {});
    }

    if (allSources.length > 0) {
      sourcesCache.set(`${targetIdentifier}_ep${episode}`, { data: allSources, timestamp: Date.now() });
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
        allServers: allSources,
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
