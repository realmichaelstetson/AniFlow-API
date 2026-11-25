import { NextRequest, NextResponse } from "next/server";
import { findAndStream, getReanimeEpisodeSources, isReanimeCloudflareBlocked } from "@/lib/reanime";
import { resolveAnimexPlayStream, getAnimexEpisodeSources } from "@/lib/aniembed-extractor";
import { resolveFromAniListId, resolveFromMalId } from "@/lib/anime-resolver";
import { resolveBuzzStream } from "@/lib/buzz";
import { getVidlyKatanaSources, fetchVidlyKatanaSource, VidlyKatanaSource, cleanAudioParam, fetchVidlyManifestText } from "@/lib/vidly";
import { getAniFlowSkipSummary } from "@/lib/aniskip";
import { ticketStore } from "@/lib/tickets";
import { handleMoviePlay, handleTvPlay } from "@/lib/media-service";

export const dynamic = "force-dynamic";

function rewriteM3u8AudioQuery(urlStr: string, audioVal: string): string {
  if (!urlStr) return urlStr;
  if (/([?&])audio=[^&]*/i.test(urlStr)) {
    return urlStr.replace(/([?&])audio=[^&]*/i, `$1audio=${encodeURIComponent(audioVal)}`);
  }
  return `${urlStr}${urlStr.includes("?") ? "&" : "?"}audio=${encodeURIComponent(audioVal)}`;
}

async function isAnimeM3u8CandidateHealthy(videoOrProxyUrl: string, baseUrl: string): Promise<boolean> {
  if (!videoOrProxyUrl) return false;
  let directTarget = videoOrProxyUrl;
  let pk = "";
  let referer = "";
  try {
    const parsed = new URL(videoOrProxyUrl, baseUrl);
    if (parsed.pathname.includes("/api/proxy/m3u8")) {
      directTarget = parsed.searchParams.get("url") || "";
      pk = parsed.searchParams.get("pk") || "";
      referer = parsed.searchParams.get("referer") || "";
    }
  } catch {}
  if (!directTarget) return false;
  // XOR-encrypted manifests carry `pk` and auto-refresh via token-refresher on the proxy
  if (pk) return true;
  try {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      Accept: "*/*",
    };
    if (referer) {
      headers["Referer"] = referer;
    } else if (
      directTarget.includes("streamrip") ||
      directTarget.includes("rousav") ||
      directTarget.includes("vidly") ||
      directTarget.includes("hikari")
    ) {
      headers["Referer"] = "https://vidly.pro/";
    } else if (directTarget.includes("megaplay") || directTarget.includes("akirax")) {
      headers["Referer"] = "https://megaplay.buzz/";
    }
    const res = await fetch(directTarget, {
      headers,
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const text = (await res.text()).replace(/^\uFEFF/, "").trimStart();
      if (text.startsWith("#EXTM3U")) return true;
    }
  } catch {}

  try {
    const bypass = await fetchVidlyManifestText(directTarget, 4500);
    if (bypass && bypass.status < 400 && bypass.body) {
      return bypass.body.replace(/^\uFEFF/, "").trimStart().startsWith("#EXTM3U");
    }
  } catch {}
  return false;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const sourcesCache = new Map<string, { data: any[]; expiresAt: number }>();
const SOURCES_CACHE_TTL = 15 * 60 * 1000; // 15 mins

async function getAllSourcesCached(
  targetIdentifier: string | number,
  anilistId: number | null,
  episode: number,
  title?: string
): Promise<any[]> {
  const cacheKey = `${targetIdentifier}_ep${episode}`;
  const cached = sourcesCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const numericTarget =
    typeof targetIdentifier === "number"
      ? targetIdentifier
      : /^\d+$/.test(String(targetIdentifier))
      ? parseInt(String(targetIdentifier), 10)
      : null;
  const effectiveAniId = anilistId || numericTarget;

  // 1. Re:ANIME (Flow, Yuri)
  const reanimePromise = isReanimeCloudflareBlocked()
    ? Promise.resolve([])
    : getReanimeEpisodeSources(targetIdentifier, episode).catch(() => []);

  // 2. Animex (Kitty, Zuri)
  const animexPromise = anilistId
    ? getAnimexEpisodeSources(anilistId, episode).catch(() => [])
    : Promise.resolve([]);

  // 3. Buzz (Buzz Sub & Dub)
  const buzzPromise = effectiveAniId
    ? Promise.all([
        resolveBuzzStream({ anilistId: effectiveAniId, episode, type: "sub" }).catch(() => null),
        resolveBuzzStream({ anilistId: effectiveAniId, episode, type: "dub" }).catch(() => null),
      ])
        .then(([buzzSub, buzzDub]) => {
          const bSources: any[] = [];
          if (buzzSub?.m3u8) {
            bSources.push({
              id: "buzz-sub",
              server: "Buzz",
              name: "Buzz",
              serverName: "Buzz (Sub)",
              type: "SUB",
              audio: "sub",
              videoUrl: buzzSub.m3u8,
              m3u8: buzzSub.m3u8,
              quality: "1080p",
              isHls: true,
              subtitles: buzzSub.subtitles || [],
              intro: buzzSub.intro,
              outro: buzzSub.outro,
            });
          }
          if (buzzDub?.m3u8) {
            bSources.push({
              id: "buzz-dub",
              server: "Buzz",
              name: "Buzz",
              serverName: "Buzz (English Dub)",
              type: "DUB",
              audio: "dub",
              videoUrl: buzzDub.m3u8,
              m3u8: buzzDub.m3u8,
              quality: "1080p",
              isHls: true,
              subtitles: buzzDub.subtitles || [],
              intro: buzzDub.intro,
              outro: buzzDub.outro,
            });
          }
          return bSources;
        })
        .catch(() => [])
    : Promise.resolve([]);

  // 4. Katana (Vidly Katana Sub & Katana Dub)
  const katanaPromise = effectiveAniId
    ? getVidlyKatanaSources(effectiveAniId, episode)
        .then((res) => res.sources)
        .catch(() => [])
    : Promise.resolve([]);

  const [katanaSources, reanimeSources, animexSources, buzzSources] = await Promise.all([
    katanaPromise,
    reanimePromise,
    animexPromise,
    buzzPromise,
  ]);

  const all = [...katanaSources, ...reanimeSources, ...animexSources, ...buzzSources];
  if (all.length > 0) {
    const ttl = effectiveAniId && katanaSources.length === 0 ? 45 * 1000 : SOURCES_CACHE_TTL;
    sourcesCache.set(cacheKey, { data: all, expiresAt: Date.now() + ttl });
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
    const rawAudio = body.audio;
    const cleanAudio = rawAudio ? cleanAudioParam(String(rawAudio)) : { code: "en", name: "English" };
    const audio = (
      rawAudio
        ? cleanAudio.code === "ja" || String(rawAudio).toLowerCase() === "sub"
          ? "sub"
          : "dub"
        : body.dub === false || body.dub === "false" || body.dub === "0"
        ? "sub"
        : "dub"
    ) as "sub" | "dub";
    const server = body.server || (audio === "dub" ? "katana-dub" : "katana-sub");
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
    const tmdbId = searchParams.get("tmdb_id") || searchParams.get("tmdbId");
    const mediaType = searchParams.get("type");

    if (mediaType === "movie" || (tmdbId && !searchParams.has("season") && !searchParams.has("episode") && !searchParams.has("ep"))) {
      return handleMoviePlay(request);
    }
    if (mediaType === "tv" || (tmdbId && (searchParams.has("season") || searchParams.has("episode") || searchParams.has("ep")))) {
      return handleTvPlay(request);
    }

    const q = searchParams.get("q") || searchParams.get("query") || searchParams.get("title");
    let rawAnilistId = searchParams.get("anilistId") || searchParams.get("anilist_id");
    let rawMalId = searchParams.get("malId") || searchParams.get("mal_id");
    const episode = parseInt(searchParams.get("episode") || searchParams.get("ep") || "1", 10);
    const rawAudioParam = searchParams.get("audio");
    const dubParam = searchParams.get("dub");
    const explicitServer = searchParams.get("server");
    const providerParam = searchParams.get("provider") || searchParams.get("providerId");

    let audio: "sub" | "dub" = "dub";
    let targetAudioCode = "en";

    if (rawAudioParam) {
      const norm = cleanAudioParam(rawAudioParam);
      targetAudioCode = norm.code;
      audio = norm.code === "ja" ? "sub" : norm.code === "en" ? "dub" : "sub";
    } else if (dubParam !== null) {
      const isDub = dubParam === "true" || dubParam === "1";
      audio = isDub ? "dub" : "sub";
      targetAudioCode = isDub ? "en" : "ja";
    } else if (explicitServer) {
      const sLow = explicitServer.toLowerCase();
      if (sLow.includes("-sub") || sLow === "zuri" || sLow === "zuna") {
        audio = "sub";
        targetAudioCode = "ja";
      } else {
        audio = "dub";
        targetAudioCode = "en";
      }
    }

    const serverParam = (explicitServer || (audio === "dub" ? "katana-dub" : "katana-sub")).toLowerCase();
    const hasExplicitServer = Boolean(explicitServer || providerParam);
    const isMultiLangOverride = targetAudioCode !== "en" && targetAudioCode !== "ja";
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
    const effectiveAniId = anilistId || (typeof targetIdentifier === "number" ? targetIdentifier : (/^\d+$/.test(String(targetIdentifier)) ? parseInt(String(targetIdentifier), 10) : null));

    const isKatanaParam = serverParam.includes("katana");
    const isZuriParam = serverParam === "zuri" || serverParam === "zuna" || providerParam === "zuri" || providerParam === "zuna";
    const isBuzzParam = serverParam === "buzz" || serverParam === "megaplay" || providerParam === "buzz";
    const isAnimexMode = Boolean(
      (providerParam && !isZuriParam && !isBuzzParam && !isKatanaParam) ||
      (audio === "sub" && isZuriParam) ||
      serverParam === "yuri" ||
      serverParam === "yuki" ||
      serverParam === "animex" ||
      serverParam === "aniembed"
    );

    // FAST-PATH: If caller is requesting direct .m3u8 stream playback (HLS video element)
    if (wantsM3u8) {
      const m3u8Candidates: string[] = [];
      let deferredKatanaSubUrl: string | null = null;
      const addCandidate = (candidate?: string | null) => {
        if (!candidate) return;
        const abs = candidate.startsWith("http") ? candidate : new URL(candidate, baseUrl).href;
        if (!m3u8Candidates.includes(abs)) m3u8Candidates.push(abs);
      };

      const tryKatanaCandidates = async () => {
        if (!effectiveAniId) return;
        try {
          if (isMultiLangOverride) {
            const kAll = await getVidlyKatanaSources(effectiveAniId, episode);
            const sorted = [...kAll.sources].sort((a, b) => {
              const aHas = a.audioTracks?.some((t) => t.id === targetAudioCode) ? 0 : 1;
              const bHas = b.audioTracks?.some((t) => t.id === targetAudioCode) ? 0 : 1;
              return aHas - bHas;
            });
            for (const s of sorted) {
              addCandidate(rewriteM3u8AudioQuery(s.videoUrl, targetAudioCode));
            }
          } else {
            const targetAudio = serverParam.includes("dub") && !rawAudioParam ? "dub" : audio;
            const kSrc = await fetchVidlyKatanaSource(effectiveAniId, episode, targetAudio);
            if (kSrc?.videoUrl) {
              addCandidate(kSrc.videoUrl);
            }
            if (targetAudio === "dub") {
              const kSub = await fetchVidlyKatanaSource(effectiveAniId, episode, "sub");
              if (kSub?.videoUrl) {
                deferredKatanaSubUrl = kSub.videoUrl;
              }
            }
          }
        } catch {}
      };

      const tryBuzzCandidate = async () => {
        if (!anilistId && !malId) return;
        try {
          const buzz = await resolveBuzzStream({
            anilistId,
            malId,
            episode,
            type: audio,
          });
          if (buzz?.m3u8) addCandidate(buzz.m3u8);
        } catch {}
      };

      const tryAnimexCandidate = async (provOverride?: string) => {
        if (!anilistId) return;
        try {
          const animex = await resolveAnimexPlayStream({
            anilistId,
            episode,
            type: audio,
            provider: provOverride || providerParam || (serverParam !== "flow" && !serverParam.startsWith("flow") ? serverParam : undefined),
            slug: slugParam || undefined,
            title: title || undefined,
          });
          if (animex?.proxyM3u8) addCandidate(animex.proxyM3u8);
        } catch {}
      };

      const isFlow2Req =
        serverParam.includes("kitty") ||
        serverParam.includes("flow2") ||
        serverParam.includes("flow-2") ||
        serverParam.includes("flow 2") ||
        serverParam.includes("hd-2") ||
        serverParam === "hd2";

      const tryFlowCandidate = async () => {
        if (isReanimeCloudflareBlocked()) return;
        const flowServer = isFlow2Req ? "HD-2" : serverParam.includes("hd-1") || serverParam.includes("flow1") || serverParam === "hd1" ? "HD-1" : "all";
        const flowData = await findAndStream({
          anilistId: anilistId || undefined,
          query: title || (malId ? String(malId) : undefined),
          episode,
          type: audio,
          server: flowServer,
        }).catch(() => null);
        if (flowData?.hls) {
          const flowEffectiveAudio = flowData.audio_fallback ? "sub" : (flowData.audio || audio);
          const mainAidParam = flowData.access_id ? `&aid=${encodeURIComponent(flowData.access_id)}` : "";
          const mainVParam = flowData.version ? `&v=${flowData.version}` : "";
          const qParam = anilistId ? `&q=${anilistId}` : `&q=${encodeURIComponent(title)}`;
          const epParam = `&ep=${episode}`;
          const srvParam = `&server=${encodeURIComponent(flowData.server || "HD-1")}`;
          addCandidate(`/api/proxy/m3u8?url=${encodeURIComponent(flowData.hls)}&pk=${encodeURIComponent(flowData.pk || "")}&audio=${flowEffectiveAudio}${mainAidParam}${mainVParam}${qParam}${epParam}${srvParam}`);
        }
      };

      // 1. Try the explicitly requested / primary server first
      if (isKatanaParam) {
        await tryKatanaCandidates();
      } else if (isBuzzParam) {
        await tryBuzzCandidate();
      } else if (isAnimexMode) {
        await tryAnimexCandidate();
      } else {
        await tryFlowCandidate();
      }

      for (const candidateUrl of m3u8Candidates) {
        if (await isAnimeM3u8CandidateHealthy(candidateUrl, baseUrl)) {
          return NextResponse.redirect(candidateUrl, { status: 302, headers: CORS_HEADERS });
        }
      }

      // 2. Fallback across remaining servers if primary returned dead/expired stream
      const prevCount = m3u8Candidates.length;
      await Promise.all([
        isKatanaParam ? Promise.resolve() : tryKatanaCandidates(),
        (!isKatanaParam && !isBuzzParam && !isAnimexMode) ? Promise.resolve() : tryFlowCandidate(),
        isBuzzParam ? Promise.resolve() : tryBuzzCandidate(),
        isAnimexMode ? Promise.resolve() : tryAnimexCandidate("yuri"),
      ]);

      for (const candidateUrl of m3u8Candidates.slice(prevCount)) {
        if (await isAnimeM3u8CandidateHealthy(candidateUrl, baseUrl)) {
          return NextResponse.redirect(candidateUrl, { status: 302, headers: CORS_HEADERS });
        }
      }

      const deferredSub = deferredKatanaSubUrl as string | null;
      if (deferredSub) {
        addCandidate(deferredSub);
        const absSub = deferredSub.startsWith("http")
          ? deferredSub
          : new URL(deferredSub, baseUrl).href;
        if (await isAnimeM3u8CandidateHealthy(absSub, baseUrl)) {
          return NextResponse.redirect(absSub, { status: 302, headers: CORS_HEADERS });
        }
      }

      if (m3u8Candidates[0]) {
        return NextResponse.redirect(m3u8Candidates[0], { status: 302, headers: CORS_HEADERS });
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

    // Concurrently resolve all streams & skip times
    const resolveStreamTask = async () => {
      let result: any = null;
      let resolvedServerName = serverParam;

      // 1. Katana from Vidly
      let katanaSourcesList: VidlyKatanaSource[] = [];
      if (effectiveAniId) {
        try {
          const katanaRes = await getVidlyKatanaSources(effectiveAniId, episode);
          katanaSourcesList = katanaRes.sources;
        } catch {}
      }

      const allServersFormatted: any[] = [...katanaSourcesList];

      let katanaSubFallback: any = null;
      if (isKatanaParam && katanaSourcesList.length > 0) {
        const wantsDub = audio === "dub" || (!rawAudioParam && serverParam.includes("dub"));
        const dubSrc =
          katanaSourcesList.find((s) => s.type === "DUB") ||
          katanaSourcesList.find((s) => s.audioTracks?.some((a) => a.id === "en"));
        const subSrc =
          katanaSourcesList.find((s) => s.id === "katana-sub") ||
          katanaSourcesList.find((s) => s.type === "SUB") ||
          katanaSourcesList[0];

        // Merge all distinct audio tracks across Katana sources so all languages are visible
        const combinedKatanaAudio: any[] = [];
        const seenKatanaAudio = new Set<string>();
        for (const ks of katanaSourcesList) {
          for (const at of ks.audioTracks || []) {
            if (!seenKatanaAudio.has(at.id)) {
              seenKatanaAudio.add(at.id);
              combinedKatanaAudio.push(at);
            }
          }
        }

        if (isMultiLangOverride) {
          const langSrc =
            katanaSourcesList.find((s) => s.audioTracks?.some((a) => a.id === targetAudioCode)) || subSrc;
          const m3u8Url = rewriteM3u8AudioQuery(langSrc.videoUrl, targetAudioCode);
          resolvedServerName = langSrc.serverName;
          result = {
            server: "Katana",
            serverName: langSrc.serverName,
            provider: "katana",
            audio: targetAudioCode,
            m3u8: m3u8Url,
            fullM3u8: m3u8Url.startsWith("http") ? m3u8Url : `${baseUrl}${m3u8Url}`,
            audioTracks: combinedKatanaAudio.length > 0 ? combinedKatanaAudio : (langSrc.audioTracks || []),
            subtitles: langSrc.subtitles || [],
            intro: null,
            outro: null,
            chapters: [],
            hasDub: Boolean(dubSrc),
            audio_fallback: false,
          };
        } else if (!wantsDub || dubSrc) {
          const activeKatana = wantsDub ? dubSrc! : subSrc;
          const effAudio = wantsDub ? "dub" : "sub";
          const m3u8Url = rewriteM3u8AudioQuery(activeKatana.videoUrl, wantsDub ? "en" : "ja");
          resolvedServerName = activeKatana.serverName;
          result = {
            server: "Katana",
            serverName: activeKatana.serverName,
            provider: "katana",
            audio: effAudio,
            m3u8: m3u8Url,
            fullM3u8: m3u8Url.startsWith("http") ? m3u8Url : `${baseUrl}${m3u8Url}`,
            audioTracks: combinedKatanaAudio.length > 0 ? combinedKatanaAudio : (activeKatana.audioTracks || []),
            subtitles: activeKatana.subtitles || [],
            intro: null,
            outro: null,
            chapters: [],
            hasDub: Boolean(dubSrc),
            audio_fallback: false,
          };
        } else {
          const m3u8Url = rewriteM3u8AudioQuery(subSrc.videoUrl, "ja");
          katanaSubFallback = {
            server: "Katana",
            serverName: subSrc.serverName,
            provider: "katana",
            audio: "sub",
            m3u8: m3u8Url,
            fullM3u8: m3u8Url.startsWith("http") ? m3u8Url : `${baseUrl}${m3u8Url}`,
            audioTracks: combinedKatanaAudio.length > 0 ? combinedKatanaAudio : (subSrc.audioTracks || []),
            subtitles: subSrc.subtitles || [],
            intro: null,
            outro: null,
            chapters: [],
            hasDub: false,
            audio_fallback: true,
          };
        }
      }

      // 2. Animex if requested
      if (isAnimexMode && anilistId && !result) {
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
          }
        } catch (err: any) {
          console.warn("[/api/play] Animex resolution notice:", err?.message || err);
        }
      }

      // Concurrently query Flow (Re:ANIME), Animex (Yuri & Zuri), AniSkip, and Buzz (Sub & Dub)
      const isFlow2 =
        serverParam.includes("kitty") ||
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

      const animexSourcesPromise = anilistId
        ? getAnimexEpisodeSources(anilistId, episode).catch(() => [])
        : Promise.resolve([]);

      const aniSkipPromise = effectiveAniId
        ? getAniFlowSkipSummary({ animeId: effectiveAniId, episodeNumber: episode }).catch(() => null)
        : Promise.resolve(null);

      const buzzSubPromise = effectiveAniId
        ? resolveBuzzStream({
            anilistId: effectiveAniId,
            malId: malId || undefined,
            episode,
            type: "sub",
          }).catch(() => null)
        : Promise.resolve(null);

      const buzzDubPromise = effectiveAniId
        ? resolveBuzzStream({
            anilistId: effectiveAniId,
            malId: malId || undefined,
            episode,
            type: "dub",
          }).catch(() => null)
        : Promise.resolve(null);

      const [flowData, animexSourcesList, aniSkipData, buzzSubData, buzzDubData] = await Promise.all([
        flowPromise,
        animexSourcesPromise,
        aniSkipPromise,
        buzzSubPromise,
        buzzDubPromise,
      ]);

      const aniSkipIntro = aniSkipData?.intro || null;
      const aniSkipOutro = aniSkipData?.outro || null;

      const anyFlowIntro = flowData?.intro || (flowData?.all_servers || []).find((s: any) => s.intro)?.intro || null;
      const anyFlowOutro = flowData?.outro || (flowData?.all_servers || []).find((s: any) => s.outro)?.outro || null;
      const anyFlowChapters = (flowData?.chapters && flowData.chapters.length > 0)
        ? flowData.chapters
        : ((flowData?.all_servers || []).find((s: any) => s.chapters?.length)?.chapters || []);
      const anyFlowRefDur = flowData?.refDuration || (flowData?.all_servers || []).find((s: any) => s.refDuration)?.refDuration || 1440;

      // Handle Buzz if requested
      if (isBuzzParam) {
        resolvedServerName = "Buzz";
        const hasBuzzDub = Boolean(buzzDubData?.m3u8);
        const isAudioFallback = audio === "dub" && !hasBuzzDub;
        const targetBuzz = (audio === "dub" && hasBuzzDub) ? buzzDubData : buzzSubData;
        if (targetBuzz?.m3u8) {
          result = {
            server: "Buzz",
            serverName: `Buzz (${(audio === "dub" && hasBuzzDub) ? "English Dub" : "Sub"})`,
            provider: "buzz",
            audio: (audio === "dub" && hasBuzzDub) ? "dub" : "sub",
            m3u8: targetBuzz.m3u8,
            fullM3u8: targetBuzz.m3u8.startsWith("http") ? targetBuzz.m3u8 : `${baseUrl}${targetBuzz.m3u8}`,
            subtitles: targetBuzz.subtitles || [],
            intro: targetBuzz.intro || aniSkipIntro,
            outro: targetBuzz.outro || aniSkipOutro,
            chapters: [],
            hasDub: hasBuzzDub,
            audio_fallback: isAudioFallback,
          };
        }
      }

      // Process Re:ANIME / Flow servers
      const flowHasDub = Boolean(flowData?.has_dub && !flowData?.audio_fallback);
      if (flowData?.hls) {
        const flowEffectiveAudio = flowData.audio_fallback ? "sub" : (flowData.audio || audio);
        const mainAidParam = flowData.access_id ? `&aid=${encodeURIComponent(flowData.access_id)}` : "";
        const mainVParam = flowData.version ? `&v=${flowData.version}` : "";
        const qParam = anilistId ? `&q=${anilistId}` : `&q=${encodeURIComponent(title)}`;
        const epParam = `&ep=${episode}`;
        const srvParam = `&server=${encodeURIComponent(flowData.server || "HD-1")}`;
        const proxyM3u8 = `/api/proxy/m3u8?url=${encodeURIComponent(flowData.hls)}&pk=${encodeURIComponent(flowData.pk || "")}&audio=${flowEffectiveAudio}${mainAidParam}${mainVParam}${qParam}${epParam}${srvParam}`;

        const flowServers = (flowData.all_servers || []).map((s: any) => {
          const isDubSrv = s.audio === "dub" && flowHasDub;
          const sAidParam = s.access_id ? `&aid=${encodeURIComponent(s.access_id)}` : "";
          const sVParam = s.version ? `&v=${s.version}` : "";
          const subUrl = `${baseUrl}/api/proxy/m3u8?url=${encodeURIComponent(s.hls || "")}&pk=${encodeURIComponent(s.pk || "")}&audio=sub${sAidParam}${sVParam}${qParam}${epParam}&server=${encodeURIComponent(s.server)}`;
          const dubUrl = isDubSrv
            ? `${baseUrl}/api/proxy/m3u8?url=${encodeURIComponent(s.hls || "")}&pk=${encodeURIComponent(s.pk || "")}&audio=dub${sAidParam}${sVParam}${qParam}${epParam}&server=${encodeURIComponent(s.server)}`
            : null;
          const isKittySrv = (s.server || "").includes("2") || (s.server || "").toUpperCase().includes("HD-2");
          const srvName = isKittySrv ? "Kitty" : "Flow";
          const srvAudio = isDubSrv ? "dub" : "sub";
          const srvId = isKittySrv ? `kitty-${srvAudio}` : `flow-${srvAudio}`;
          return {
            id: srvId,
            server: srvName,
            name: srvName,
            serverName: `${srvName} (${srvAudio === "dub" ? "English Dub" : "Sub"})`,
            type: srvAudio === "dub" ? "DUB" : "SUB",
            audio: srvAudio,
            videoUrl: isDubSrv ? dubUrl : subUrl,
            m3u8: isDubSrv ? dubUrl : subUrl,
            quality: "1080p",
            isHls: true,
            subtitles: (s.subtitles && s.subtitles.length > 0) ? s.subtitles : (flowData.subtitles || []),
            intro: s.intro || anyFlowIntro || null,
            outro: s.outro || anyFlowOutro || null,
            chapters: (s.chapters && s.chapters.length > 0) ? s.chapters : anyFlowChapters,
            refDuration: s.refDuration || anyFlowRefDur || 1440,
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

        const isKittyCurrent = (flowData.server || "HD-1").toUpperCase().includes("HD-2") || (flowData.server || "").toUpperCase().includes("2");
        const flowServerLabel = isKittyCurrent ? "Kitty" : "Flow";
        const isAudioFallback = Boolean(flowData.audio_fallback || (audio === "dub" && !flowHasDub));
        const effectiveAudio = isAudioFallback ? "sub" : (flowData.audio || audio);
        if (!result) {
          resolvedServerName = flowServerLabel;
          result = {
            server: flowServerLabel,
            serverName: `${flowServerLabel} (${effectiveAudio === "dub" ? "English Dub" : "Sub"})`,
            audio: effectiveAudio,
            m3u8: proxyM3u8,
            fullM3u8: `${baseUrl}${proxyM3u8}`,
            subtitles: subsFormatted,
            intro: flowData.intro || anyFlowIntro || null,
            outro: flowData.outro || anyFlowOutro || null,
            chapters: (flowData.chapters && flowData.chapters.length > 0) ? flowData.chapters : anyFlowChapters,
            refDuration: flowData.refDuration || anyFlowRefDur || 1440,
            allServers: allServersFormatted,
            hasDub: flowHasDub,
            hasSub: flowData.has_sub,
            audio_fallback: isAudioFallback,
          };
        }
      }

      // Add Animex (Yuri & Zuri)
      if (Array.isArray(animexSourcesList) && animexSourcesList.length > 0) {
        for (const as of animexSourcesList) {
          if (!allServersFormatted.some((s) => s.id === as.id)) {
            allServersFormatted.push({
              id: as.id,
              server: as.serverName.replace(/\s*\([^)]*\)/, "").trim(),
              name: as.serverName.replace(/\s*\([^)]*\)/, "").trim(),
              serverName: as.serverName,
              type: as.type,
              audio: as.type === "DUB" ? "dub" : "sub",
              videoUrl: as.videoUrl,
              m3u8: as.videoUrl,
              quality: as.quality || "1080p",
              isHls: true,
              subtitles: as.subtitles || [],
              intro: aniSkipIntro,
              outro: aniSkipOutro,
              chapters: [],
              refDuration: 1440,
            });
          }
        }
      }

      // Add Buzz (Sub and Dub if available)
      if (buzzSubData?.m3u8 && !allServersFormatted.some((s) => s.id === "buzz-sub")) {
        allServersFormatted.push({
          id: "buzz-sub",
          server: "Buzz",
          name: "Buzz",
          serverName: "Buzz (Sub)",
          type: "SUB",
          audio: "sub",
          videoUrl: buzzSubData.m3u8,
          m3u8: buzzSubData.m3u8,
          quality: "1080p",
          isHls: true,
          subtitles: buzzSubData.subtitles || [],
          intro: buzzSubData.intro || aniSkipIntro,
          outro: buzzSubData.outro || aniSkipOutro,
          chapters: [],
          refDuration: 1440,
        });
      }
      if (buzzDubData?.m3u8 && !allServersFormatted.some((s) => s.id === "buzz-dub")) {
        allServersFormatted.push({
          id: "buzz-dub",
          server: "Buzz",
          name: "Buzz",
          serverName: "Buzz (English Dub)",
          type: "DUB",
          audio: "dub",
          videoUrl: buzzDubData.m3u8,
          m3u8: buzzDubData.m3u8,
          quality: "1080p",
          isHls: true,
          subtitles: buzzDubData.subtitles || [],
          intro: buzzDubData.intro || aniSkipIntro,
          outro: buzzDubData.outro || aniSkipOutro,
          chapters: [],
          refDuration: 1440,
        });
      }

      // Guarantee all standard providers exist in allServersFormatted (Katana, Flow, Kitty, Yuri, Zuri, Buzz)
      const flowDubAvailable = flowHasDub && allServersFormatted.some((s) => s.server === "Flow" && s.type === "DUB");
      const kittyDubAvailable = flowHasDub && allServersFormatted.some((s) => s.server === "Kitty" && s.type === "DUB");
      const yuriDubAvailable = (Array.isArray(animexSourcesList) ? animexSourcesList : []).some(
        (s) => s.type === "DUB" && (s.id?.includes("yuri") || s.serverName?.toLowerCase().includes("yuri"))
      );
      const buzzDubAvailable = Boolean(buzzDubData?.m3u8);
      const katanaDubAvailable = katanaSourcesList.some(
        (s) => s.type === "DUB" || s.audioTracks?.some((a) => a.id === "en")
      );

      const standardProviders = [
        { prov: "Katana", srv: "katana", subId: "katana-sub", dubId: "katana-dub", canDub: katanaDubAvailable },
        { prov: "Flow", srv: "flow", subId: "flow-sub", dubId: "flow-dub", canDub: flowDubAvailable },
        { prov: "Kitty", srv: "kitty", subId: "kitty-sub", dubId: "kitty-dub", canDub: kittyDubAvailable },
        { prov: "Yuri", srv: "yuri", subId: "animex-yuri-sub", dubId: "animex-yuri-dub", canDub: yuriDubAvailable },
        { prov: "Zuri", srv: "zuri", subId: "animex-zuri-sub", dubId: null, canDub: false },
        { prov: "Buzz", srv: "buzz", subId: "buzz-sub", dubId: "buzz-dub", canDub: buzzDubAvailable },
      ];

      for (const sp of standardProviders) {
        const isFlowProv = sp.prov === "Flow";
        const isKittyProv = sp.prov === "Kitty";
        const hasSub = allServersFormatted.some(
          (s) =>
            (s.id === sp.subId ||
              s.server === sp.prov ||
              s.name === sp.prov ||
              (isFlowProv && (s.id === "flow-sub" || s.server === "Flow" || s.server === "HD-1")) ||
              (isKittyProv && (s.id === "kitty-sub" || s.server === "Kitty" || s.server === "HD-2"))) &&
            s.type === "SUB"
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
            intro: (isFlowProv || isKittyProv) ? (anyFlowIntro || flowData?.intro || null) : aniSkipIntro,
            outro: (isFlowProv || isKittyProv) ? (anyFlowOutro || flowData?.outro || null) : aniSkipOutro,
            chapters: (isFlowProv || isKittyProv) ? (anyFlowChapters || flowData?.chapters || []) : [],
            refDuration: (isFlowProv || isKittyProv) ? (anyFlowRefDur || flowData?.refDuration || 1440) : 1440,
          });
        }

        if (sp.canDub && sp.dubId) {
          const hasDub = allServersFormatted.some(
            (s) =>
              (s.id === sp.dubId ||
                s.server === sp.prov ||
                s.name === sp.prov ||
                (isFlowProv && (s.id === "flow-dub" || s.server === "Flow" || s.server === "HD-1")) ||
                (isKittyProv && (s.id === "kitty-dub" || s.server === "Kitty" || s.server === "HD-2"))) &&
              s.type === "DUB"
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
              intro: (isFlowProv || isKittyProv) ? (anyFlowIntro || flowData?.intro || null) : aniSkipIntro,
              outro: (isFlowProv || isKittyProv) ? (anyFlowOutro || flowData?.outro || null) : aniSkipOutro,
              chapters: (isFlowProv || isKittyProv) ? (anyFlowChapters || flowData?.chapters || []) : [],
              refDuration: (isFlowProv || isKittyProv) ? (anyFlowRefDur || flowData?.refDuration || 1440) : 1440,
            });
          }
        }
      }

      // Fallback: If no server result yet (e.g. Katana lacked Dub), try authentic Dub from other providers before Sub fallback
      if (!result && audio === "dub" && (!hasExplicitServer || serverParam === "katana-dub" || serverParam === "katana")) {
        const dubCandidate =
          allServersFormatted.find(
            (s) => s.type === "DUB" && !s.audio_fallback && s.videoUrl && !String(s.videoUrl).includes("format=m3u8")
          ) || allServersFormatted.find((s) => s.type === "DUB" && !s.audio_fallback && s.videoUrl);
        if (dubCandidate) {
          resolvedServerName = dubCandidate.serverName || dubCandidate.server;
          result = {
            server: dubCandidate.server || resolvedServerName,
            serverName: dubCandidate.serverName || resolvedServerName,
            audio: "dub",
            m3u8: dubCandidate.videoUrl,
            fullM3u8: dubCandidate.videoUrl.startsWith("http") ? dubCandidate.videoUrl : `${baseUrl}${dubCandidate.videoUrl}`,
            audioTracks: dubCandidate.audioTracks || [],
            subtitles: dubCandidate.subtitles || [],
            intro: dubCandidate.intro || aniSkipIntro,
            outro: dubCandidate.outro || aniSkipOutro,
            chapters: dubCandidate.chapters || [],
            refDuration: dubCandidate.refDuration || 1440,
            allServers: allServersFormatted,
            hasDub: true,
            audio_fallback: false,
          };
        }
      }

      if (!result && katanaSubFallback) {
        resolvedServerName = katanaSubFallback.serverName;
        result = katanaSubFallback;
      }

      // Fallback: If no server result yet, pick matching from allServersFormatted
      if (!result && allServersFormatted.length > 0) {
        const match = allServersFormatted.find((s) => s.type === (audio === "dub" ? "DUB" : "SUB")) || allServersFormatted[0];
        if (match?.videoUrl) {
          resolvedServerName = match.serverName || match.server;
          const isFallback = audio === "dub" && match.type !== "DUB";
          result = {
            server: match.server || resolvedServerName,
            serverName: match.serverName || resolvedServerName,
            audio: isFallback ? "sub" : (match.type?.toLowerCase() || audio),
            m3u8: match.videoUrl,
            fullM3u8: match.videoUrl.startsWith("http") ? match.videoUrl : `${baseUrl}${match.videoUrl}`,
            audioTracks: match.audioTracks || [],
            subtitles: match.subtitles || [],
            intro: match.intro || aniSkipIntro,
            outro: match.outro || aniSkipOutro,
            chapters: match.chapters || [],
            refDuration: match.refDuration || 1440,
            allServers: allServersFormatted,
            hasDub: allServersFormatted.some((s) => s.type === "DUB"),
            audio_fallback: isFallback,
          };
        }
      }

      return {
        result,
        resolvedServerName,
        allSources: allServersFormatted,
      };
    };

    const { result, resolvedServerName, allSources } = await resolveStreamTask();
    let streamResult = result;
    let resolvedServer = resolvedServerName;

    const hasAnyAuthenticDub = allSources.some((s: any) => s.type === "DUB" && !s.audio_fallback);

    if (allSources.length > 0) {
      const hasRealKatana =
        !effectiveAniId ||
        allSources.some((s: any) => s.id?.startsWith("katana") && !String(s.videoUrl || "").includes("format=m3u8"));
      const ttl = hasRealKatana ? SOURCES_CACHE_TTL : 45 * 1000;
      sourcesCache.set(`${targetIdentifier}_ep${episode}`, { data: allSources, expiresAt: Date.now() + ttl });
    }

    // Last-resort fallback: If streamResult is still null, take any available source from allSources
    if (!streamResult && allSources.length > 0) {
      const matchAudio = allSources.find((s: any) => s.type === (audio === "dub" ? "DUB" : "SUB")) || allSources[0];
      if (matchAudio?.videoUrl) {
        resolvedServer = matchAudio.serverName || "Auto";
        const isFallback = audio === "dub" && matchAudio.type !== "DUB";
        streamResult = {
          server: resolvedServer,
          serverName: matchAudio.serverName || resolvedServer,
          audio: isFallback ? "sub" : (matchAudio.type?.toLowerCase() || audio),
          m3u8: matchAudio.videoUrl,
          fullM3u8: matchAudio.videoUrl.startsWith("http") ? matchAudio.videoUrl : `${baseUrl}${matchAudio.videoUrl}`,
          audioTracks: matchAudio.audioTracks || [],
          subtitles: matchAudio.subtitles || [],
          intro: matchAudio.intro || null,
          outro: matchAudio.outro || null,
          allServers: allSources,
          hasDub: hasAnyAuthenticDub,
          audio_fallback: isFallback,
        };
      }
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

    const finalHasDub = Boolean(streamResult.hasDub || hasAnyAuthenticDub);
    const finalAudioFallback = Boolean(streamResult.audio_fallback || (audio === "dub" && !finalHasDub));

    return NextResponse.json(
      {
        success: true,
        title,
        anilistId,
        malId,
        episode,
        audio: streamResult.audio || audio,
        hasDub: finalHasDub,
        audio_fallback: finalAudioFallback,
        server: resolvedServer,
        serverName: streamResult.serverName,
        streamUrl: streamResult.m3u8,
        url: streamResult.m3u8,
        m3u8: streamResult.m3u8,
        fullM3u8: streamResult.fullM3u8,
        m3u8Endpoint: anilistId
          ? `/api/m3u8/ani/${anilistId}/${episode}/${streamResult.audio || audio}`
          : malId
          ? `/api/m3u8/mal/${malId}/${episode}/${streamResult.audio || audio}`
          : `/api/m3u8?q=${encodeURIComponent(title)}&ep=${episode}&audio=${streamResult.audio || audio}`,
        fullM3u8Endpoint: `${baseUrl}${
          anilistId
            ? `/api/m3u8/ani/${anilistId}/${episode}/${streamResult.audio || audio}`
            : malId
            ? `/api/m3u8/mal/${malId}/${episode}/${streamResult.audio || audio}`
            : `/api/m3u8?q=${encodeURIComponent(title)}&ep=${episode}&audio=${streamResult.audio || audio}`
        }`,
        audioTracks: streamResult.audioTracks || [],
        subtitles: streamResult.subtitles || [],
        intro: streamResult.intro || null,
        outro: streamResult.outro || null,
        chapters: streamResult.chapters || null,
        refDuration: streamResult.refDuration || 1440,
        allServers: allSources,
        sources: allSources,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error("[/api/play] Error resolving playback source:", err);
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
