"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Hls from "hls.js";
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  FastForward,
  SkipForward,
  Settings,
  Captions,
  PictureInPicture2,
  Tv,
  Check,
  Sparkles,
  Server,
  PlayCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sliders,
  SlidersHorizontal,
  Headphones,
  Search,
  Upload,
} from "lucide-react";
import { formatSecondsToTime, cn } from "@/lib/utils";
import { normalizeLanguage, cleanAudioParam } from "@/lib/vidly-lang";
import * as CountryFlags from "country-flag-icons/react/3x2";
import { SubtitleSettingsDialog, SubtitleStyles } from "./subtitle-settings-dialog";
import { attachAvSyncGuard } from "./player-core/av-sync-guard";
import { collectScopedSubtitles } from "./player-core/subtitle-scope";
import { adaptSkipTimes } from "@/lib/skip-times-adapter";

export interface SubtitleTrack {
  id?: string;
  language: string;
  label: string;
  url: string;
  countryCode?: string;
  flag?: string;
  default?: boolean;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface VideoSourceData {
  id: string;
  type: "SUB" | "DUB";
  language: string;
  videoUrl: string;
  quality: string;
  isHls: boolean;
  serverName?: string | null;
  isDefault?: boolean;
  subtitles?: Array<{
    id?: string;
    language?: string;
    label?: string;
    subtitleUrl?: string;
    url?: string;
    file?: string;
    direct_url?: string;
    isDefault?: boolean;
    default?: boolean;
  }>;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  chapters?: Array<{ start: number; end?: number; title: string }>;
  refDuration?: number;
}

const COUNTRY_CODE_MAP: Record<string, string> = {
  ja: "JP",
  jp: "JP",
  jpn: "JP",
  en: "GB",
  eng: "GB",
  gb: "GB",
  uk: "GB",
  us: "US",
  es: "ES",
  spa: "ES",
  fr: "FR",
  fre: "FR",
  fra: "FR",
  de: "DE",
  ger: "DE",
  deu: "DE",
  it: "IT",
  ita: "IT",
  pt: "BR",
  por: "BR",
  br: "BR",
  ar: "SA",
  ara: "SA",
  sa: "SA",
  ru: "RU",
  rus: "RU",
  pl: "PL",
  pol: "PL",
  zh: "CN",
  chi: "CN",
  zho: "CN",
  cn: "CN",
  ko: "KR",
  kor: "KR",
  kr: "KR",
  hi: "IN",
  hin: "IN",
  in: "IN",
  te: "IN",
  tel: "IN",
  ta: "IN",
  tam: "IN",
  kn: "IN",
  kan: "IN",
  ml: "IN",
  mal: "IN",
  fil: "PH",
  tl: "PH",
  ph: "PH",
  id: "ID",
  ind: "ID",
  tr: "TR",
  tur: "TR",
  th: "TH",
  tha: "TH",
  vi: "VN",
  vie: "VN",
  vn: "VN",
  nl: "NL",
  dut: "NL",
  nld: "NL",
  sv: "SE",
  swe: "SE",
  se: "SE",
  no: "NO",
  nor: "NO",
  da: "DK",
  dan: "DK",
  dk: "DK",
  fi: "FI",
  fin: "FI",
  el: "GR",
  ell: "GR",
  gr: "GR",
  he: "IL",
  heb: "IL",
  il: "IL",
  cs: "CZ",
  ces: "CZ",
  cze: "CZ",
  cz: "CZ",
  hu: "HU",
  hun: "HU",
  ro: "RO",
  ron: "RO",
  rum: "RO",
  ukr: "UA",
  ua: "UA",
  bg: "BG",
  bul: "BG",
  hr: "HR",
  hrv: "HR",
  sr: "RS",
  srp: "RS",
  rs: "RS",
  sk: "SK",
  slk: "SK",
  slo: "SK",
  sl: "SI",
  slv: "SI",
  si: "SI",
  bn: "BD",
  ben: "BD",
  bd: "BD",
  ur: "PK",
  urd: "PK",
  pk: "PK",
  fa: "IR",
  fas: "IR",
  per: "IR",
  ir: "IR",
  ms: "MY",
  msa: "MY",
  may: "MY",
  my: "MY",
  ca: "ES",
  cat: "ES",
  lt: "LT",
  lit: "LT",
  lv: "LV",
  lav: "LV",
  et: "EE",
  est: "EE",
  ee: "EE",
  ptpt: "PT",
  la: "MX",
  es419: "MX",
};

export function LanguageFlag({ countryCode, flag, name }: { countryCode?: string; flag?: string; name?: string }) {
  const raw = (countryCode || "").toLowerCase().trim();
  const code = (COUNTRY_CODE_MAP[raw] || raw.toUpperCase()).trim();
  const FlagComponent = (CountryFlags as any)[code];

  if (FlagComponent) {
    return (
      <span className="inline-flex items-center justify-center shrink-0 w-[15px] h-[10px] overflow-hidden rounded-[2px] shadow-[0_0_1px_rgba(0,0,0,0.8)] ring-1 ring-white/10 pointer-events-none">
        <FlagComponent className="w-full h-full object-cover" />
      </span>
    );
  }

  return (
    <span className="w-[15px] h-[10px] flex items-center justify-center text-[10px] text-zinc-400 font-mono shrink-0 select-none pointer-events-none">
      {flag || "🌐"}
    </span>
  );
}

export function deduplicateSubtitleTracks(subtitles: any[]): SubtitleTrack[] {
  const seenLanguages = new Set<string>();
  const result: SubtitleTrack[] = [];
  for (const sub of subtitles) {
    const rawLang = sub.language || sub.label || "";
    const norm = normalizeLanguage(rawLang, sub.label);
    const langKey = norm.code || norm.name.toLowerCase();
    if (!langKey || seenLanguages.has(langKey)) continue;
    const u = sub.url || sub.subtitleUrl || sub.file || "";
    if (!u) continue;
    seenLanguages.add(langKey);
    result.push({
      id: sub.id || `sub-${norm.code}`,
      language: norm.code,
      label: norm.name,
      countryCode: norm.countryCode,
      flag: norm.flag,
      url: u,
      default: sub.default ?? sub.isDefault,
    });
  }
  return result;
}

export function isNativePlayerSource(s: VideoSourceData): boolean {
  if (!s || !s.videoUrl) return false;
  const url = s.videoUrl.toLowerCase();
  const name = (s.serverName || "").toLowerCase();

  // Server Buzz streams are direct proxied .m3u8 manifests, so they play natively
  if (name.includes("buzz") || url.includes("server=buzz") || s.id?.includes("buzz")) {
    return true;
  }

  const isEmbedHost =
    url.includes("anixo.buzz") ||
    url.includes("vidwish.live") ||
    url.includes("otakuvid") ||
    url.includes("otakuhg") ||
    url.includes("zokoanime") ||
    url.includes("videasy") ||
    url.includes("multiembed") ||
    url.includes("vidsrc") ||
    url.includes("2embed") ||
    url.includes("autoembed");

  if (isEmbedHost) {
    return false;
  }

  return Boolean(
    s.isHls ||
    url.includes(".m3u8") ||
    url.includes("m3u8") ||
    url.includes("/api/play") ||
    url.includes("/api/proxy/m3u8")
  );
}

export function isUnnamedHlsAudioTrack(t: { lang?: string; name?: string }): boolean {
  const rawLang = (t.lang || "").trim();
  const rawName = (t.name || "").trim();
  return (
    !rawLang &&
    (!rawName || /^(main|default|audio(\s*\d+)?|track(\s*\d+)?|und|unknown)$/i.test(rawName))
  );
}

export function isInvalidOrUnknownAudioTrack(t: { lang?: string; name?: string }): boolean {
  if (isUnnamedHlsAudioTrack(t)) return true;
  return !normalizeLanguage(t.lang || "", t.name || "").known;
}

export function resolveSourceProviderName(src: VideoSourceData): string {
  const sId = (src.id || "").toLowerCase();
  const sName = (src.serverName || "").toLowerCase();
  const sServer = ((src as any).server || "").toLowerCase();
  const sUrl = (src.videoUrl || "").toLowerCase();

  // Vidly Movie & TV servers
  if (sId.includes("singularity") || sId.includes("evion") || sServer === "edge" || sName === "edge") {
    return "Edge";
  }
  if (sId.includes("prism") || sServer === "prism" || sName.includes("prism")) {
    return (src as any).name || src.serverName || "Prism";
  }
  if (sId.includes("flux") || sServer === "flux" || sName.includes("flux")) {
    return (src as any).name || src.serverName || "Flux";
  }
  if (sId.includes("nimbus") || sServer === "nimbus" || sName.includes("nimbus")) {
    return (src as any).name || src.serverName || "Nimbus";
  }
  if (sId.includes("comet") || sServer === "comet" || sName.includes("comet")) {
    return (src as any).name || src.serverName || "Comet";
  }
  if (sId.includes("citadel") || sServer === "citadel" || sName.includes("citadel")) {
    return (src as any).name || src.serverName || "Citadel";
  }

  // 0. Katana from Vidly
  if (sId.includes("katana") || sName.includes("katana") || sUrl.includes("katana")) {
    return "Katana";
  }

  // 1. Buzz from Megaplay
  if (
    sId.includes("buzz") ||
    sName.includes("buzz") ||
    sUrl.includes("server=buzz") ||
    sId.includes("megaplay") ||
    sName.includes("megaplay") ||
    sUrl.includes("megaplay")
  ) {
    return "Buzz";
  }

  // 2. Zuri from Extractor
  if (
    sId.includes("zuri") ||
    sName.includes("zuri") ||
    sUrl.includes("provider=zuri") ||
    sId.includes("zuna") ||
    sName.includes("zuna") ||
    sUrl.includes("provider=zuna")
  ) {
    return "Zuri";
  }

  // 3. Yuri from Extractor
  if (
    sId.includes("yuri") ||
    sName.includes("yuri") ||
    sUrl.includes("provider=yuri") ||
    sId.includes("yuki") ||
    sName.includes("yuki") ||
    sUrl.includes("provider=yuki")
  ) {
    return "Yuri";
  }

  // 4. Kitty (Flow 2 / HD-2)
  if (
    sId.includes("kitty") ||
    sName.includes("kitty") ||
    sUrl.includes("server=kitty") ||
    sId.includes("flow-2") ||
    sName.includes("flow 2") ||
    sName.includes("hd-2") ||
    sUrl.includes("server=hd-2")
  ) {
    return "Kitty";
  }

  // 5. Flow (default for all Re:ANIME / HD-1 / Flow streams)
  return "Flow";
}

export interface EmbedPlayerProps {
  mediaType?: "anime" | "movie" | "tv";
  anilistId?: number | null;
  malId?: number | null;
  tmdbId?: number | null;
  seasonNumber?: number;
  episodeNumber?: number;
  initialAudio?: string;
  initialServer?: string;
  startAt?: number;
  autoskipIntro?: boolean;
  autoskipOutro?: boolean;
  parentHost?: string | null;
  title?: string;
}

export function EmbedPlayer({
  mediaType = "anime",
  anilistId,
  malId,
  tmdbId,
  seasonNumber = 1,
  episodeNumber = 1,
  initialAudio = "english",
  initialServer,
  startAt = 0,
  autoskipIntro = true,
  autoskipOutro = true,
  parentHost,
  title: initialTitle,
}: EmbedPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsContentRef = useRef<HTMLDivElement | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showRemainingTime, setShowRemainingTime] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volumeBoost, setVolumeBoost] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTheater, setIsTheater] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);

  // Server & Audio options
  const isAnimeContent = useMemo(
    () => mediaType !== "movie" && mediaType !== "tv" && !(Boolean(tmdbId) && !anilistId && !malId),
    [mediaType, tmdbId, anilistId, malId]
  );
  const normInitAudio = cleanAudioParam(initialAudio);
  const initType = isAnimeContent ? (normInitAudio.code === "ja" ? "sub" : "dub") : normInitAudio.code;
  const defaultServer = initialServer
    ? initialServer.toLowerCase()
    : mediaType === "movie"
    ? "singularity"
    : mediaType === "tv"
    ? "evion"
    : initType === "dub"
    ? "katana-dub"
    : "katana-sub";
  const [selectedType, setSelectedType] = useState<string>(initType);
  const selectedTypeRef = useRef<string>(initType);
  selectedTypeRef.current = selectedType;
  const [server, setServer] = useState<string>(defaultServer);
  const explicitServerRef = useRef<boolean>(Boolean(initialServer));
  const [sources, setSources] = useState<VideoSourceData[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [autoSkipState, setAutoSkipState] = useState<boolean>(autoskipIntro);
  const [autoSkipOutroState, setAutoSkipOutroState] = useState<boolean>(autoskipOutro);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [animeTitle, setAnimeTitle] = useState<string>(initialTitle || (mediaType === "movie" ? "Movie" : mediaType === "tv" ? "TV Show" : "Anime"));
  const [reloadCounter, setReloadCounter] = useState<number>(0);

  // HLS & Qualities
  const [hlsLevels, setHlsLevels] = useState<{ index: number; name: string; height: number }[]>([]);
  const [selectedHlsLevel, setSelectedHlsLevel] = useState<number>(-1);

  // Audio Tracks (Katana Sub / Katana Dub / HLS)
  const [audioTracks, setAudioTracks] = useState<{ id: string; name: string; label: string; lang: string; countryCode?: string; flag?: string }[]>([]);
  const [activeAudioTrack, setActiveAudioTrack] = useState<string>(normInitAudio.code);
  const pendingAudioRef = useRef<string | null>(normInitAudio.code);
  const skipNextLoadStreamRef = useRef<boolean>(false);
  const lastEpisodeKeyRef = useRef<string>("");
  const prevMediaKeyRef = useRef<string>("");

  // Subtitles
  const [allAvailableSubtitles, setAllAvailableSubtitles] = useState<SubtitleTrack[]>([]);
  const [activeSubtitleTrack, setActiveSubtitleTrack] = useState<string | null>("en");
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [currentSubtitleText, setCurrentSubtitleText] = useState<string>("");
  const [showSubtitleStyling, setShowSubtitleStyling] = useState(false);
  const [subtitleStyles, setSubtitleStyles] = useState<SubtitleStyles>({
    fontSize: "base",
    fontFamily: "sans",
    fontWeight: "bold",
    color: "#ffffff",
    background: "transparent",
    shadow: true,
    outline: "thick",
  });

  // Saved preferences live in localStorage, which the server can't see. Restoring them after
  // mount keeps the first client render identical to the server HTML (volume icon, subtitle styling).
  useEffect(() => {
    try {
      const savedVolume = parseFloat(localStorage.getItem("anime_player_volume") || "");
      if (!Number.isNaN(savedVolume)) setVolume(Math.min(1, Math.max(0, savedVolume)));
      if (localStorage.getItem("anime_player_muted") === "true") setIsMuted(true);
      const savedStyles = localStorage.getItem("anime_subtitle_styles");
      if (savedStyles) setSubtitleStyles(JSON.parse(savedStyles));
    } catch {}
  }, []);

  // Baseline Skip Times (e.g. from Re:ANIME chapters or AniSkip submission)
  const [rawSkipTimes, setRawSkipTimes] = useState<{
    intro: { start: number; end: number } | null;
    outro: { start: number; end: number } | null;
    refDuration: number;
    source?: string;
  }>({ intro: null, outro: null, refDuration: 1440 });

  // Effective Skip Times dynamically adapted to the currently playing video duration
  const [skipTimes, setSkipTimes] = useState<{
    intro: { start: number; end: number } | null;
    outro: { start: number; end: number } | null;
  }>({ intro: null, outro: null });

  // Dynamically set skip times; only adapt with math if from Flow/Re:ANIME baseline
  useEffect(() => {
    if (!rawSkipTimes.intro && !rawSkipTimes.outro) return;
    const isFlowSource = rawSkipTimes.source?.includes("flow") || rawSkipTimes.source?.includes("reanime");
    const isFlowSrv = server.toLowerCase().includes("flow") || server.toLowerCase().includes("kitty");
    if ((isFlowSource || isFlowSrv) && duration > 0) {
      const adapted = adaptSkipTimes(
        rawSkipTimes.intro,
        rawSkipTimes.outro,
        rawSkipTimes.refDuration,
        duration
      );
      setSkipTimes({ intro: adapted.intro, outro: adapted.outro });
    } else {
      setSkipTimes({ intro: rawSkipTimes.intro, outro: rawSkipTimes.outro });
    }
  }, [duration, rawSkipTimes, server]);

  // Timeline hover
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);

  // Settings Menu
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [settingsSubMenu, setSettingsSubMenu] = useState<
    | "main"
    | "server"
    | "server-sub"
    | "server-dub"
    | "subtitles"
    | "audio-subtitles"
    | "subtitle-style"
    | "quality"
    | "preferences"
    | "speed"
    | "boost"
    | "autoskip"
  >("main");
  const [menuHeight, setMenuHeight] = useState<number | undefined>(undefined);
  const [menuMaxHeight, setMenuMaxHeight] = useState<number | undefined>(undefined);

  // Notifications & Feedback
  const [seekFeedback, setSeekFeedback] = useState<{
    side: "left" | "right";
    amount: number;
  } | null>(null);
  const [activeStreamToast, setActiveStreamToast] = useState<{
    type: "refreshing" | "success" | "info" | "error";
    message: string;
  } | null>(null);
  const [autoSkipToast, setAutoSkipToast] = useState<string | null>(null);

  // Operational refs
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);
  const progressSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const showControlsRef = useRef<boolean>(true);
  const isSwitchingServerRef = useRef<boolean>(false);
  const preserveTimeRef = useRef<number>(startAt || 0);
  const hasAutoSkippedIntroRef = useRef<boolean>(false);
  const hasAutoSkippedOutroRef = useRef<boolean>(false);
  const lastTouchTimeRef = useRef<number>(0);
  const lastTapInfoRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const singleTapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const seekFeedbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const connectedVideoRef = useRef<HTMLVideoElement | null>(null);
  const fallbackRef = useRef<() => void>(() => {});

  const lastProgressEmitRef = useRef<number>(0);

  // Broadcast to parent page via PostMessage
  const postToParent = useCallback(
    (name: string, data: any, requestId?: string) => {
      if (typeof window === "undefined" || window.parent === window) return;
      try {
        // Standard aniembed format from specification
        window.parent.postMessage(
          {
            source: "aniembed",
            version: 1,
            name,
            requestId,
            data,
          },
          "*"
        );

        // Backward compatibility for existing listeners
        window.parent.postMessage({ type: "PLAYER_EVENT", data: { type: name, ...data } }, "*");
        if (name === "progress") {
          window.parent.postMessage({ type: "watching-log", ...data }, "*");
        }
      } catch {}
    },
    []
  );

  // Show status toast
  const showToast = useCallback((type: "refreshing" | "success" | "info" | "error", message: string) => {
    setActiveStreamToast({ type, message });
    setTimeout(() => {
      setActiveStreamToast((prev) => (prev?.message === message ? null : prev));
    }, 3000);
  }, []);

  // Web Audio Graph setup for Volume Boost past 100%
  const setupAudioGraph = useCallback(() => {
    if (!videoRef.current || typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (connectedVideoRef.current !== videoRef.current) {
        if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
          try {
            audioCtxRef.current.close();
          } catch {}
        }
        audioCtxRef.current = null;
        gainNodeRef.current = null;
        sourceNodeRef.current = null;
      }

      if (!audioCtxRef.current) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const gain = ctx.createGain();
        gainNodeRef.current = gain;
        const source = ctx.createMediaElementSource(videoRef.current);
        sourceNodeRef.current = source;
        connectedVideoRef.current = videoRef.current;
        source.connect(gain);
        gain.connect(ctx.destination);
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
    } catch (err) {
      console.warn("[EmbedPlayer] Web Audio API init error:", err);
    }
  }, []);

  const handleVolumeBoost = (boost: number) => {
    setVolumeBoost(boost);
    try {
      localStorage.setItem("anime_volume_boost", boost.toString());
    } catch {}

    if (boost !== 1) {
      setupAudioGraph();
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = boost;
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
  };

  // Activity detection & Auto-hide Controls (3 seconds auto-hide when playing)
  const handleUserActivity = useCallback(() => {
    setShowControls(true);
    showControlsRef.current = true;
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    if (isPlayingRef.current) {
      hideControlsTimer.current = setTimeout(() => {
        if (!showSettingsMenu) {
          setShowControls(false);
          showControlsRef.current = false;
        }
      }, 3000);
    }
  }, [showSettingsMenu]);

  // Load Skip Times (Flow chapters for Flow/Kitty; direct AniSkip for other servers)
  useEffect(() => {
    let cancelled = false;
    async function loadSkipTimes() {
      if (mediaType !== "anime" && !anilistId && !malId) return;
      try {
        const idParam = anilistId ? `anilistId=${anilistId}` : `malId=${malId}`;
        const titleParam = animeTitle ? `&title=${encodeURIComponent(animeTitle)}` : "";
        const srvParam = `&server=${encodeURIComponent(server)}`;
        const isFlowSrv = server.toLowerCase().includes("flow") || server.toLowerCase().includes("kitty");
        const currentDur = (videoRef.current && videoRef.current.duration > 0)
          ? videoRef.current.duration
          : duration;
        const durParam = currentDur > 0 ? `&duration=${Math.round(currentDur)}` : "";

        // 1. Fetch skip times specifically for current server
        const res = await fetch(`/api/anime/skip-times?${idParam}&episode=${episodeNumber}${titleParam}${srvParam}${durParam}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.found && (data.intro || data.outro || data.rawIntro || data.rawOutro)) {
            const rawIn = data.rawIntro || data.intro || null;
            const rawOut = data.rawOutro || data.outro || null;
            const refDur = data.refDuration || 1440;
            const srcType = data.source || (isFlowSrv ? "flow-reanime" : "aniskip");

            setRawSkipTimes((prev) => {
              // Never downgrade verified Reanime chapters with generic aniskip
              if (prev.source === "flow-reanime" && srcType === "aniskip" && (prev.intro || prev.outro)) {
                return prev;
              }
              return {
                intro: rawIn,
                outro: rawOut,
                refDuration: refDur,
                source: srcType,
              };
            });

            if (isFlowSrv && currentDur > 0) {
              const adapted = adaptSkipTimes(rawIn, rawOut, refDur, currentDur);
              setSkipTimes((prev) => {
                if (data.source === "aniskip" && prev.intro && isFlowSrv) return prev;
                return { intro: adapted.intro, outro: adapted.outro };
              });
            } else {
              setSkipTimes((prev) => {
                if (data.source === "aniskip" && prev.intro && isFlowSrv) return prev;
                return { intro: data.intro || rawIn, outro: data.outro || rawOut };
              });
            }
            return;
          }
        }

        // 2. Direct fallback to flow-skip-times ONLY on Flow/Kitty servers
        if (isFlowSrv) {
          const flowRes = await fetch(`/api/anime/flow-skip-times?${idParam}&episode=${episodeNumber}${durParam}${titleParam}`);
          if (flowRes.ok && !cancelled) {
            const flowData = await flowRes.json();
            if (flowData.found && (flowData.intro || flowData.outro)) {
              const rawIn = flowData.rawIntro || flowData.intro || null;
              const rawOut = flowData.rawOutro || flowData.outro || null;
              const refDur = flowData.refDuration || 1440;
              setRawSkipTimes({
                intro: rawIn,
                outro: rawOut,
                refDuration: refDur,
                source: "flow-reanime",
              });
              if (currentDur > 0) {
                const adapted = adaptSkipTimes(rawIn, rawOut, refDur, currentDur);
                setSkipTimes({ intro: adapted.intro, outro: adapted.outro });
              } else {
                setSkipTimes({ intro: flowData.intro || rawIn, outro: flowData.outro || rawOut });
              }
            }
          }
        }
      } catch {}
    }
    loadSkipTimes();
    return () => {
      cancelled = true;
    };
  }, [anilistId, malId, episodeNumber, animeTitle, server]);

  // Fetch Stream from /api/play
  useEffect(() => {
    const mediaKey = `${mediaType}:${anilistId || ""}:${malId || ""}:${tmdbId || ""}:${seasonNumber}:${episodeNumber}`;
    const epKey = `${mediaKey}:${reloadCounter}`;
    if (prevMediaKeyRef.current !== "" && prevMediaKeyRef.current !== mediaKey) {
      pendingAudioRef.current = cleanAudioParam(initialAudio).code;
      explicitServerRef.current = Boolean(initialServer);
    }
    prevMediaKeyRef.current = mediaKey;

    if (skipNextLoadStreamRef.current && lastEpisodeKeyRef.current === epKey) {
      skipNextLoadStreamRef.current = false;
      return;
    }
    skipNextLoadStreamRef.current = false;
    lastEpisodeKeyRef.current = epKey;

    let cancelled = false;
    async function loadStream() {
      setIsLoading(true);
      setFatalError(null);
      try {
        let fetchUrl = "";
        const isMovie = mediaType === "movie" || (!mediaType && Boolean(tmdbId) && !seasonNumber && !episodeNumber && !anilistId && !malId);
        const isTv = mediaType === "tv" || (!mediaType && Boolean(tmdbId) && (Boolean(seasonNumber) || Boolean(episodeNumber)) && !anilistId && !malId);
        const desiredAudioCode = pendingAudioRef.current || cleanAudioParam(selectedType).code;

        if (isMovie) {
          const srvQuery = explicitServerRef.current ? `&server=${encodeURIComponent(server)}` : "";
          fetchUrl = `/api/movie/play?tmdb_id=${tmdbId}&audio=${encodeURIComponent(desiredAudioCode)}${srvQuery}`;
        } else if (isTv) {
          const srvQuery = explicitServerRef.current ? `&server=${encodeURIComponent(server)}` : "";
          fetchUrl = `/api/tv/play?tmdb_id=${tmdbId}&season=${seasonNumber || 1}&episode=${episodeNumber || 1}&audio=${encodeURIComponent(desiredAudioCode)}${srvQuery}`;
        } else {
          const params = new URLSearchParams();
          if (anilistId) params.set("anilistId", anilistId.toString());
          if (malId) params.set("malId", malId.toString());
          params.set("episode", (episodeNumber || 1).toString());
          const animeApiAudio =
            desiredAudioCode !== "en" && desiredAudioCode !== "ja" ? desiredAudioCode : selectedType;
          params.set("audio", animeApiAudio);
          params.set("server", server);
          fetchUrl = `/api/play?${params.toString()}`;
        }

        const res = await fetch(fetchUrl);
        if (!res.ok) {
          throw new Error(`Failed to load stream (status: ${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;

        if (data.title) {
          setAnimeTitle(data.title);
        }

        const initialStream = data.streamUrl || data.m3u8 || data.url || data.fullM3u8;

        const incomingSources: VideoSourceData[] = Array.isArray(data.sources) && data.sources.length > 0
          ? data.sources
          : Array.isArray(data.allServers) && data.allServers.length > 0
          ? data.allServers
          : [];

        // Clean & ensure proxying on external URLs
        const cleanedIncoming = incomingSources.map((s) => {
          let u = (s.videoUrl || "").trim();
          if ((u.startsWith("http://") || u.startsWith("https://")) && !u.includes("/api/proxy")) {
            u = `/api/proxy/m3u8?url=${encodeURIComponent(u)}`;
          }
          return { ...s, videoUrl: u };
        });

        const hasAuthenticDub =
          cleanedIncoming.some((s) => s.type === "DUB" && !(s as any).audio_fallback) ||
          data.hasDub === true;
        const canShowKatanaDub = hasAuthenticDub || (cleanedIncoming.length === 0 && data.hasDub !== false);

        // Build standard providers roster
        let standardFallbackProviders: VideoSourceData[] = [];
        if (isMovie) {
          standardFallbackProviders = [
            { id: "singularity", type: "SUB", language: "English", videoUrl: `/api/movie/play?tmdb_id=${tmdbId}&audio=${encodeURIComponent(desiredAudioCode)}&server=singularity&format=m3u8`, quality: "1080p", isHls: true, serverName: "Edge" },
            { id: "prism", type: "DUB", language: "English", videoUrl: `/api/movie/play?tmdb_id=${tmdbId}&audio=${encodeURIComponent(desiredAudioCode)}&server=prism&format=m3u8`, quality: "1080p", isHls: true, serverName: "Prism" },
            { id: "flux", type: "SUB", language: "English", videoUrl: `/api/movie/play?tmdb_id=${tmdbId}&audio=${encodeURIComponent(desiredAudioCode)}&server=flux&format=m3u8`, quality: "1080p", isHls: true, serverName: "Flux" },
            { id: "nimbus", type: "SUB", language: "English", videoUrl: `/api/movie/play?tmdb_id=${tmdbId}&audio=${encodeURIComponent(desiredAudioCode)}&server=nimbus&format=m3u8`, quality: "1080p", isHls: true, serverName: "Nimbus" },
            { id: "comet", type: "SUB", language: "English", videoUrl: `/api/movie/play?tmdb_id=${tmdbId}&audio=${encodeURIComponent(desiredAudioCode)}&server=comet&format=m3u8`, quality: "720p", isHls: true, serverName: "Comet" },
            { id: "citadel", type: "DUB", language: "English", videoUrl: `/api/movie/play?tmdb_id=${tmdbId}&audio=${encodeURIComponent(desiredAudioCode)}&server=citadel&format=m3u8`, quality: "720p", isHls: true, serverName: "Citadel" },
          ];
        } else if (isTv) {
          const sNum = seasonNumber || 1;
          const eNum = episodeNumber || 1;
          standardFallbackProviders = [
            { id: "evion", type: "SUB", language: "English", videoUrl: `/api/tv/play?tmdb_id=${tmdbId}&season=${sNum}&episode=${eNum}&audio=${encodeURIComponent(desiredAudioCode)}&server=evion&format=m3u8`, quality: "1080p", isHls: true, serverName: "Edge" },
            { id: "prism", type: "DUB", language: "English", videoUrl: `/api/tv/play?tmdb_id=${tmdbId}&season=${sNum}&episode=${eNum}&audio=${encodeURIComponent(desiredAudioCode)}&server=prism&format=m3u8`, quality: "1080p", isHls: true, serverName: "Prism" },
            { id: "flux", type: "SUB", language: "English", videoUrl: `/api/tv/play?tmdb_id=${tmdbId}&season=${sNum}&episode=${eNum}&audio=${encodeURIComponent(desiredAudioCode)}&server=flux&format=m3u8`, quality: "1080p", isHls: true, serverName: "Flux" },
            { id: "nimbus", type: "SUB", language: "English", videoUrl: `/api/tv/play?tmdb_id=${tmdbId}&season=${sNum}&episode=${eNum}&audio=${encodeURIComponent(desiredAudioCode)}&server=nimbus&format=m3u8`, quality: "1080p", isHls: true, serverName: "Nimbus" },
            { id: "comet", type: "SUB", language: "English", videoUrl: `/api/tv/play?tmdb_id=${tmdbId}&season=${sNum}&episode=${eNum}&audio=${encodeURIComponent(desiredAudioCode)}&server=comet&format=m3u8`, quality: "720p", isHls: true, serverName: "Comet" },
            { id: "citadel", type: "DUB", language: "English", videoUrl: `/api/tv/play?tmdb_id=${tmdbId}&season=${sNum}&episode=${eNum}&audio=${encodeURIComponent(desiredAudioCode)}&server=citadel&format=m3u8`, quality: "720p", isHls: true, serverName: "Citadel" },
          ];
        } else {
          const idParams = `${anilistId ? `anilistId=${anilistId}&` : ""}${malId ? `malId=${malId}&` : ""}episode=${episodeNumber || 1}`;
          standardFallbackProviders = [
            { id: "katana-sub", type: "SUB", language: "Japanese", videoUrl: `/api/play?${idParams}&audio=sub&server=katana-sub&format=m3u8`, quality: "1080p", isHls: true, serverName: "Katana (Sub)" },
            ...(canShowKatanaDub
              ? [{ id: "katana-dub", type: "DUB" as const, language: "English", videoUrl: `/api/play?${idParams}&audio=dub&server=katana-dub&format=m3u8`, quality: "1080p", isHls: true, serverName: "Katana (Dub)" }]
              : []),
            { id: "flow-sub", type: "SUB", language: "Japanese", videoUrl: `/api/play?${idParams}&audio=sub&server=flow&format=m3u8`, quality: "1080p", isHls: true, serverName: "Flow (Sub)" },
            { id: "kitty-sub", type: "SUB", language: "Japanese", videoUrl: `/api/play?${idParams}&audio=sub&server=kitty&format=m3u8`, quality: "1080p", isHls: true, serverName: "Kitty (Sub)" },
            { id: "animex-yuri-sub", type: "SUB", language: "Japanese", videoUrl: `/api/play?${idParams}&audio=sub&server=yuri&format=m3u8`, quality: "1080p", isHls: true, serverName: "Yuri (Sub)" },
            { id: "animex-zuri-sub", type: "SUB", language: "Japanese", videoUrl: `/api/play?${idParams}&audio=sub&server=zuri&format=m3u8`, quality: "1080p", isHls: true, serverName: "Zuri (Sub)" },
            { id: "buzz-sub", type: "SUB", language: "Japanese", videoUrl: `/api/play?${idParams}&audio=sub&server=buzz&format=m3u8`, quality: "1080p", isHls: true, serverName: "Buzz (Sub)" },
          ];
        }

        // Find if ANY Reanime source in incoming has chapters/skip times
        const reanimeCandidate = cleanedIncoming.find(
          (s) =>
            (s.id?.includes("flow") ||
              s.id?.includes("kitty") ||
              s.serverName?.toLowerCase().includes("flow") ||
              s.serverName?.toLowerCase().includes("kitty") ||
              s.serverName?.toLowerCase().includes("hd")) &&
            (s.intro || s.outro || (s.chapters && s.chapters.length > 0))
        );

        let apiIntro: { start: number; end: number } | null = data.intro || reanimeCandidate?.intro || null;
        let apiOutro: { start: number; end: number } | null = data.outro || reanimeCandidate?.outro || null;
        let apiChapters = (Array.isArray(data.chapters) && data.chapters.length > 0)
          ? data.chapters
          : (reanimeCandidate?.chapters || []);
        let apiRefDuration = data.refDuration || reanimeCandidate?.refDuration || 1440;

        if (!apiIntro && !apiOutro && Array.isArray(apiChapters) && apiChapters.length > 0) {
          const introChap = apiChapters.find((c: any) => c.title?.toLowerCase().includes("intro") || c.title?.toLowerCase().includes("op") || c.title?.toLowerCase().includes("opening"));
          const outroChap = apiChapters.find((c: any) => c.title?.toLowerCase().includes("outro") || c.title?.toLowerCase().includes("ed") || c.title?.toLowerCase().includes("ending"));
          if (introChap) apiIntro = { start: introChap.start, end: introChap.end };
          if (outroChap) apiOutro = { start: outroChap.start, end: outroChap.end };
        }

        // Enrich all Reanime sources so both Flow and Kitty servers share the exact same skip times right away
        const enrichedIncoming = cleanedIncoming.map((s) => {
          const isRe = s.id?.includes("flow") || s.id?.includes("kitty") || s.serverName?.toLowerCase().includes("flow") || s.serverName?.toLowerCase().includes("kitty") || s.serverName?.toLowerCase().includes("hd");
          if (isRe) {
            return {
              ...s,
              intro: s.intro || apiIntro,
              outro: s.outro || apiOutro,
              chapters: (s.chapters && s.chapters.length > 0) ? s.chapters : apiChapters,
              refDuration: s.refDuration || apiRefDuration,
            };
          }
          return s;
        });

        // Merge discovered streams with standard fallback routes
        const allAvailableSources: VideoSourceData[] = [...enrichedIncoming];
        if ((!isMovie && !isTv) || allAvailableSources.length === 0) {
          for (const fp of standardFallbackProviders) {
            if (!allAvailableSources.some((s) => s.id === fp.id)) {
              const isRe = fp.id.includes("flow") || fp.id.includes("kitty");
              allAvailableSources.push(
                isRe
                  ? { ...fp, intro: apiIntro, outro: apiOutro, chapters: apiChapters, refDuration: apiRefDuration }
                  : fp
              );
            }
          }
        }
        setSources(allAvailableSources);

        const anySourceHasDub = allAvailableSources.some((s) => s.type === "DUB" && !(s as any).audio_fallback);
        const wantsDubInit = !isMovie && !isTv && (selectedType === "dub" || desiredAudioCode === "en");
        let didFallbackToSub = false;

        if (wantsDubInit && (!anySourceHasDub || data.hasDub === false)) {
          didFallbackToSub = true;
          skipNextLoadStreamRef.current = true;
          setSelectedType("sub");
          setActiveAudioTrack("ja");
          pendingAudioRef.current = "ja";
          showToast("info", "No English Dub available for this episode. Switched to Sub.");
        }

        if (!initialStream && allAvailableSources.length === 0) {
          throw new Error(data.error || "No playable stream returned from server.");
        }

        const isDub = wantsDubInit && !didFallbackToSub && anySourceHasDub;
        const typeMatch = (s: VideoSourceData) => (isDub ? s.type === "DUB" : s.type === "SUB");
        const sNorm = server.toLowerCase().replace(/[\s_]/g, "-");
        let selectedSource: VideoSourceData | undefined;

        if (isMovie || isTv) {
          selectedSource =
            (!explicitServerRef.current && data.serverId
              ? allAvailableSources.find((s) => s.id === data.serverId)
              : undefined) ||
            allAvailableSources.find(
              (s) =>
                s.id.toLowerCase() === server.toLowerCase() ||
                (s as any).server?.toLowerCase().includes(server.toLowerCase()) ||
                s.serverName?.toLowerCase().includes(server.toLowerCase())
            ) ||
            allAvailableSources[0];
        } else {
          const reqBase = sNorm.replace(/-(sub|dub|multi)$/, "");
          const reqProv =
            reqBase === "hd-1" || reqBase === "flow-1" || reqBase === "flow1"
              ? "flow"
              : reqBase === "hd-2" || reqBase === "flow-2" || reqBase === "flow2"
              ? "kitty"
              : reqBase === "yuki"
              ? "yuri"
              : reqBase === "zuna"
              ? "zuri"
              : reqBase === "megaplay"
              ? "buzz"
              : reqBase;

          const normalizePath = (u?: string | null) => {
            if (!u) return "";
            try {
              const parsed = new URL(u, window.location.origin);
              return parsed.pathname + parsed.search;
            } catch {
              return u;
            }
          };
          const normInitialStream = normalizePath(initialStream);

          if (desiredAudioCode !== "en" && desiredAudioCode !== "ja") {
            selectedSource =
              allAvailableSources.find(
                (s) =>
                  resolveSourceProviderName(s).toLowerCase() === reqProv &&
                  Array.isArray((s as any).audioTracks) &&
                  (s as any).audioTracks.some((at: any) => at.id === desiredAudioCode || at.lang === desiredAudioCode)
              ) ||
              allAvailableSources.find(
                (s) =>
                  Array.isArray((s as any).audioTracks) &&
                  (s as any).audioTracks.some((at: any) => at.id === desiredAudioCode || at.lang === desiredAudioCode)
              );
          }

          if (!selectedSource && normInitialStream && data.server && !didFallbackToSub && !(data.audio_fallback && isDub)) {
            const apiProv = String(data.server).toLowerCase();
            selectedSource = allAvailableSources.find(
              (s) =>
                typeMatch(s) &&
                resolveSourceProviderName(s).toLowerCase() === apiProv &&
                normalizePath(s.videoUrl) === normInitialStream
            );
          }

          if (!selectedSource) {
            selectedSource = allAvailableSources.find(
              (s) =>
                typeMatch(s) &&
                (s.id.toLowerCase() === sNorm || resolveSourceProviderName(s).toLowerCase() === reqProv)
            );
          }

          if (!selectedSource && normInitialStream && !didFallbackToSub && !(data.audio_fallback && isDub)) {
            selectedSource = allAvailableSources.find(
              (s) => typeMatch(s) && normalizePath(s.videoUrl) === normInitialStream
            );
          }

          if (!selectedSource) {
            selectedSource =
              allAvailableSources.find((s) => typeMatch(s) && !s.videoUrl.includes("format=m3u8")) ||
              allAvailableSources.find(typeMatch) ||
              allAvailableSources[0];
          }
        }

        if (selectedSource) {
          setActiveSourceId(selectedSource.id);
          if (didFallbackToSub) {
            const provLower = resolveSourceProviderName(selectedSource).toLowerCase();
            const subSrvCode =
              provLower === "katana" ? "katana-sub" : provLower === "buzz" ? "buzz-sub" : provLower;
            skipNextLoadStreamRef.current = true;
            setServer(subSrvCode);
          } else if (isMovie || isTv) {
            if (selectedSource.id && selectedSource.id !== server) {
              skipNextLoadStreamRef.current = true;
              setServer(selectedSource.id);
            }
          } else if (isAnimeContent && data.server && !data.audio_fallback) {
            const actualProv = resolveSourceProviderName(selectedSource).toLowerCase();
            const srvCode =
              actualProv === "buzz"
                ? selectedSource.type === "DUB"
                  ? "buzz-dub"
                  : "buzz-sub"
                : actualProv === "katana"
                ? selectedSource.type === "DUB"
                  ? "katana-dub"
                  : "katana-sub"
                : selectedSource.type === "DUB"
                ? `${actualProv}-dub`
                : actualProv;
            if (srvCode !== server) {
              skipNextLoadStreamRef.current = true;
              setServer(srvCode);
            }
          }

          const shouldPreferSelectedUrl =
            Boolean(data.audio_fallback && isDub && selectedSource.type === "DUB") ||
            ((isMovie || isTv) && Boolean(selectedSource.videoUrl)) ||
            !initialStream;
          setStreamUrl(shouldPreferSelectedUrl ? selectedSource.videoUrl : initialStream);
        } else {
          setStreamUrl(initialStream);
        }

        // Apply skip times from Re:ANIME
        const isFlowData = data.server?.toLowerCase().includes("flow") || data.server?.toLowerCase().includes("kitty") || data.server?.toLowerCase().includes("hd") || Boolean(reanimeCandidate);
        if (apiIntro || apiOutro) {
          const refDur = apiRefDuration;
          setRawSkipTimes({
            intro: apiIntro,
            outro: apiOutro,
            refDuration: refDur,
            source: isFlowData ? "flow-reanime" : "aniskip",
          });
          const curDur = (videoRef.current && videoRef.current.duration > 0) ? videoRef.current.duration : duration;
          if (isFlowData && curDur > 0) {
            const adapted = adaptSkipTimes(apiIntro, apiOutro, refDur, curDur);
            setSkipTimes({ intro: adapted.intro, outro: adapted.outro });
          } else {
            setSkipTimes({ intro: apiIntro, outro: apiOutro });
          }
        }

        if (data.title) setAnimeTitle(data.title);

        // Subtitles resolution using scoped subtitle collectors
        const scopedSubs = collectScopedSubtitles({
          currentSource: selectedSource,
          allSources: allAvailableSources,
          dynamicSubtitles: data.subtitles,
        });

        const mappedSubs: SubtitleTrack[] = deduplicateSubtitleTracks(
          scopedSubs.map((s) => ({
            id: s.id,
            language: s.language,
            label: s.label,
            url: s.subtitleUrl,
            default: s.isDefault,
          }))
        );

        if (mappedSubs.length > 0) {
          setAllAvailableSubtitles(mappedSubs);
          const defaultSub =
            mappedSubs.find((s) => s.default) ||
            mappedSubs.find((s) => s.language?.toLowerCase().startsWith("en") || s.label?.toLowerCase().includes("english")) ||
            mappedSubs[0];
          if (defaultSub) {
            setActiveSubtitleTrack(defaultSub.id || defaultSub.url);
          }
        } else {
          setAllAvailableSubtitles([]);
          setActiveSubtitleTrack("");
        }

        const rawSourceAudioTracks: any[] =
          Array.isArray((selectedSource as any)?.audioTracks) && (selectedSource as any).audioTracks.length > 0
            ? (selectedSource as any).audioTracks
            : Array.isArray(data.audioTracks) && data.audioTracks.length > 0
            ? data.audioTracks
            : [];
        const sourceAudioTracks = rawSourceAudioTracks.filter((t: any) => {
          const norm = normalizeLanguage(t.lang || t.id || "", t.name || t.label || "");
          return norm.known;
        });
        setAudioTracks(sourceAudioTracks);

        const targetAudioCheck = didFallbackToSub ? "ja" : desiredAudioCode;
        let resolvedActiveCode = targetAudioCheck;
        if (sourceAudioTracks.length > 0) {
          const matchedTrack = sourceAudioTracks.find(
            (t: any) =>
              t.id === targetAudioCheck ||
              t.lang === targetAudioCheck ||
              cleanAudioParam(t.lang || t.id || t.name).code === targetAudioCheck
          );
          if (matchedTrack) {
            resolvedActiveCode = matchedTrack.id || matchedTrack.lang || targetAudioCheck;
          } else {
            const defTrack = sourceAudioTracks.find((t: any) => t.default) || sourceAudioTracks[0];
            resolvedActiveCode =
              defTrack?.id ||
              defTrack?.lang ||
              (isAnimeContent ? (selectedSource?.type === "DUB" ? "en" : "ja") : "en");
          }
        } else if (isAnimeContent) {
          resolvedActiveCode = selectedSource?.type === "DUB" ? "en" : "ja";
        } else if ((selectedSource as any)?.language) {
          const srcLangNorm = normalizeLanguage((selectedSource as any).language, (selectedSource as any).language);
          if (srcLangNorm.known) {
            resolvedActiveCode = srcLangNorm.code;
          }
        }
        setActiveAudioTrack(resolvedActiveCode);
        pendingAudioRef.current = resolvedActiveCode;

        postToParent("PLAYER_EVENT", {
          type: "ready",
          server,
          audio: didFallbackToSub ? "sub" : selectedType,
          episode: episodeNumber,
        });
      } catch (err: any) {
        if (!cancelled) {
          console.error("Stream loading failed:", err);
          setFatalError(err.message || "Failed to load stream");
          setIsLoading(false);
          postToParent("PLAYER_EVENT", {
            type: "error",
            code: "CONTENT_UNAVAILABLE",
            message: err.message,
          });
        }
      }
    }
    loadStream();
    return () => {
      cancelled = true;
    };
  }, [mediaType, anilistId, malId, tmdbId, seasonNumber, episodeNumber, selectedType, server, reloadCounter, postToParent]);

  // HLS player setup & Native fallback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const startPos = preserveTimeRef.current || startAt || 0;
    let networkRetryCount = 0;
    let mediaErrorCount = 0;
    const MAX_NETWORK_RETRIES = 3;
    let retryTimer: NodeJS.Timeout | null = null;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        maxBufferLength: 180,
        maxMaxBufferLength: 600,
        maxBufferSize: 150 * 1000 * 1000,
        highBufferWatchdogPeriod: 2,
        maxBufferHole: 0.5,
        nudgeMaxRetry: 10,
        nudgeOffset: 0.15,
        manifestLoadingTimeOut: 30000,
        manifestLoadingMaxRetry: 6,
        levelLoadingTimeOut: 30000,
        levelLoadingMaxRetry: 6,
        fragLoadingTimeOut: 30000,
        fragLoadingMaxRetry: 8,
      });

      const detachAvSync = attachAvSyncGuard(hls, video);

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      const syncAudioTracksFromHls = (hlsInst: Hls) => {
        if (!hlsInst.audioTracks || hlsInst.audioTracks.length === 0) return;
        const rawTracks = hlsInst.audioTracks;
        if (rawTracks.every((t) => isInvalidOrUnknownAudioTrack(t))) {
          // Single muxed or unknown-labeled audio track (e.g. Flow, Kitty, Yuri, Zuri, Buzz, "8. Unknown"):
          // keep activeAudioTrack derived from the active source rather than polluting the Audio menu.
          return;
        }

        const fallbackLang = isAnimeContent
          ? selectedTypeRef.current === "dub"
            ? { code: "en", name: "English", countryCode: "gb", flag: "🇬🇧" }
            : { code: "ja", name: "Japanese", countryCode: "jp", flag: "🇯🇵" }
          : { code: "en", name: "English", countryCode: "gb", flag: "🇬🇧" };

        const tracks = rawTracks
          .map((t, idx) => {
            if (isUnnamedHlsAudioTrack(t)) {
              return {
                hlsIndex: idx,
                id: fallbackLang.code,
                name: fallbackLang.name,
                label: fallbackLang.name,
                lang: fallbackLang.code,
                countryCode: fallbackLang.countryCode,
                flag: fallbackLang.flag,
                isFallbackMain: true,
                known: true,
              };
            }
            const norm = normalizeLanguage(t.lang || "", t.name || "");
            return {
              hlsIndex: idx,
              id: norm.code || String(idx),
              name: norm.name || t.name || `Audio ${idx + 1}`,
              label: norm.name || t.name || `Audio ${idx + 1}`,
              lang: norm.code || t.lang || "und",
              countryCode: norm.countryCode,
              flag: norm.flag,
              isFallbackMain: false,
              known: norm.known,
            };
          })
          .filter((tr, _, arr) => {
            if (!tr.known) return false;
            if (!tr.isFallbackMain) return true;
            return !arr.some((other) => !other.isFallbackMain && other.known && other.id === tr.id);
          });

        if (tracks.length === 0) return;
        setAudioTracks(tracks);

        const desiredCode = pendingAudioRef.current;
        if (desiredCode) {
          const target = tracks.find((tr) => tr.lang === desiredCode || tr.id === desiredCode);
          if (target) {
            if (hlsInst.audioTrack !== target.hlsIndex) {
              hlsInst.audioTrack = target.hlsIndex;
            }
            setActiveAudioTrack(target.id);
            pendingAudioRef.current = null;
            return;
          }
        }

        const currentTrackIndex = hlsInst.audioTrack;
        const active = tracks.find((tr) => tr.hlsIndex === currentTrackIndex) || tracks[0];
        if (active) {
          if (!tracks.some((tr) => tr.hlsIndex === currentTrackIndex) && hlsInst.audioTrack !== active.hlsIndex) {
            hlsInst.audioTrack = active.hlsIndex;
          }
          setActiveAudioTrack(active.id);
          pendingAudioRef.current = null;
        }
      };

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setIsLoading(false);
        networkRetryCount = 0;
        mediaErrorCount = 0;
        const levels = data.levels.map((lvl, index) => ({
          index,
          name: lvl.height ? `${lvl.height}p` : `Level ${index + 1}`,
          height: lvl.height || 0,
        }));
        setHlsLevels(levels);

        syncAudioTracksFromHls(hls);

        if (startPos > 0) {
          video.currentTime = startPos;
        }

        video.play().catch(() => {
          setIsPlaying(false);
        });
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        if (hlsRef.current) {
          syncAudioTracksFromHls(hlsRef.current);
        }
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, data) => {
        if (hlsRef.current && hlsRef.current.audioTracks && hlsRef.current.audioTracks[data.id]) {
          const t = hlsRef.current.audioTracks[data.id];
          if (isInvalidOrUnknownAudioTrack(t)) {
            if (
              isUnnamedHlsAudioTrack(t) &&
              hlsRef.current.audioTracks.length > 1 &&
              !hlsRef.current.audioTracks.every((tr) => isInvalidOrUnknownAudioTrack(tr))
            ) {
              const fallbackCode = isAnimeContent
                ? selectedTypeRef.current === "dub"
                  ? "en"
                  : "ja"
                : "en";
              setActiveAudioTrack(fallbackCode);
            }
            return;
          }
          const norm = normalizeLanguage(t.lang || "", t.name || "");
          if (norm.known && norm.code) {
            setActiveAudioTrack(norm.code);
          }
        }
      });

      hls.on(Hls.Events.BUFFER_APPENDED, () => {
        setIsLoading(false);
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        networkRetryCount = 0;
        mediaErrorCount = 0;
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        const httpStatus = data.response?.code;
        const isPermanentHttpError =
          httpStatus === 401 ||
          httpStatus === 403 ||
          httpStatus === 404 ||
          httpStatus === 410 ||
          httpStatus === 500 ||
          httpStatus === 502;

        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Stop infinite loops on permanent HTTP errors or if max retries exceeded
              if (isPermanentHttpError || networkRetryCount >= MAX_NETWORK_RETRIES) {
                console.warn(
                  `[EmbedPlayer] Fatal network error (${httpStatus || data.details}). Failing over to alternative server...`
                );
                hls.destroy();
                fallbackRef.current?.();
                break;
              }

              networkRetryCount++;
              const delay = networkRetryCount * 1000;
              console.warn(
                `[EmbedPlayer] Transient network error (${data.details}). Retrying in ${delay}ms (attempt ${networkRetryCount}/${MAX_NETWORK_RETRIES})...`
              );
              if (retryTimer) clearTimeout(retryTimer);
              retryTimer = setTimeout(() => {
                if (hlsRef.current) {
                  hlsRef.current.startLoad();
                }
              }, delay);
              break;

            case Hls.ErrorTypes.MEDIA_ERROR:
              if (mediaErrorCount === 0) {
                mediaErrorCount++;
                console.warn("[EmbedPlayer] Recovering from media error (attempt 1)...");
                hls.recoverMediaError();
              } else if (mediaErrorCount === 1) {
                mediaErrorCount++;
                console.warn("[EmbedPlayer] Swapping audio codec and recovering (attempt 2)...");
                hls.swapAudioCodec();
                hls.recoverMediaError();
              } else {
                console.warn("[EmbedPlayer] Unrecoverable fatal media error. Failing over...");
                hls.destroy();
                fallbackRef.current?.();
              }
              break;

            default:
              console.warn(`[EmbedPlayer] Unrecoverable fatal HLS error (${data.type}, ${data.details}). Failing over...`);
              hls.destroy();
              fallbackRef.current?.();
              break;
          }
        } else {
          // Handle non-fatal buffer stalls to prevent video freezes
          if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
            try {
              hls.startLoad();
            } catch {}
            if (video && !video.paused && video.readyState >= 2) {
              video.currentTime += 0.1;
            }
          } else if (data.details === Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE) {
            try {
              hls.startLoad();
            } catch {}
          }
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      video.addEventListener("loadedmetadata", () => {
        setIsLoading(false);
        if (startPos > 0) video.currentTime = startPos;
        video.play().catch(() => setIsPlaying(false));
      });
      video.addEventListener("error", () => {
        fallbackRef.current?.();
      });
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, startAt]);

  // Subtitle cues fetching & parsing (.vtt / .ass / .srt)
  useEffect(() => {
    if (activeSubtitleTrack === null || activeSubtitleTrack === "") {
      setCues([]);
      setCurrentSubtitleText("");
      return;
    }

    const currentSub =
      allAvailableSubtitles.find((s) => s.id === activeSubtitleTrack || s.url === activeSubtitleTrack || (s as any).subtitleUrl === activeSubtitleTrack) ||
      allAvailableSubtitles[0];

    const subUrl = currentSub?.url || (currentSub as any)?.subtitleUrl || (currentSub as any)?.direct_url || (currentSub as any)?.file;
    if (!currentSub || !subUrl) {
      setCues([]);
      setCurrentSubtitleText("");
      return;
    }

    const parseTime = (timeStr: string) => {
      const parts = timeStr.trim().split(":");
      if (parts.length === 3) {
        const [h, m, s] = parts;
        return (parseFloat(h) || 0) * 3600 + (parseFloat(m) || 0) * 60 + (parseFloat(s.replace(",", ".")) || 0);
      } else if (parts.length === 2) {
        const [m, s] = parts;
        return (parseFloat(m) || 0) * 60 + (parseFloat(s.replace(",", ".")) || 0);
      }
      return parseFloat(timeStr.replace(",", ".")) || 0;
    };

    let isMounted = true;
    const fetchUrl = subUrl.startsWith("/api/proxy")
      ? subUrl
      : `/api/proxy/subtitles?url=${encodeURIComponent(subUrl)}`;

    fetch(fetchUrl)
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => {
        if (!isMounted || !text) return;
        const parsedCues: SubtitleCue[] = [];
        const lines = text.replace(/\r\n/g, "\n").split("\n");
        const isAss = text.includes("[Script Info]") || text.includes("Dialogue:");

        if (isAss) {
          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith("Dialogue:")) continue;
            const colonIdx = line.indexOf(":");
            if (colonIdx === -1) continue;
            const parts = line.substring(colonIdx + 1).trim().split(",");
            if (parts.length < 9) continue;
            const start = parseTime(parts[1]);
            const end = parseTime(parts[2]);
            const cleanText = parts
              .slice(9)
              .join(",")
              .replace(/\{[^}]*\}/g, "")
              .replace(/\\N/gi, "\n")
              .replace(/\\n/gi, "\n")
              .replace(/\\h/gi, " ")
              .trim();
            if (cleanText && end > start) {
              parsedCues.push({ start, end, text: cleanText });
            }
          }
        } else {
          let i = 0;
          while (i < lines.length) {
            const line = lines[i].trim();
            if (line.includes("-->")) {
              const [startPart, endPart] = line.split("-->");
              if (startPart && endPart) {
                const startToken = startPart.trim().split(/\s+/)[0];
                const endToken = endPart.trim().split(/\s+/)[0];
                const start = parseTime(startToken);
                const end = parseTime(endToken);
                i++;
                const textLines: string[] = [];
                while (i < lines.length && lines[i].trim() !== "") {
                  textLines.push(lines[i].trim().replace(/<[^>]*>/g, ""));
                  i++;
                }
                const cueContent = textLines.join("\n").trim();
                if (cueContent && end > start) {
                  parsedCues.push({ start, end, text: cueContent });
                }
              }
            }
            i++;
          }
        }
        if (isMounted) {
          setCues(parsedCues);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [activeSubtitleTrack, allAvailableSubtitles]);

  // Video Time Update & Subtitle Cue Sync
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const current = video.currentTime;
    const dur = video.duration || 0;
    setCurrentTime(current);
    if (dur > 0 && duration === 0) {
      setDuration(dur);
    }

    if (dur > 0 && video.buffered.length > 0) {
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= current && current <= video.buffered.end(i)) {
          setBuffered(video.buffered.end(i));
          break;
        }
      }
    }

    // Sync subtitle cue
    if (cues.length > 0) {
      const active = cues.find((c) => current >= c.start && current <= c.end);
      setCurrentSubtitleText(active ? active.text : "");
    } else {
      setCurrentSubtitleText("");
    }

    // Auto-skip Intro
    if (autoSkipState && skipTimes.intro && !hasAutoSkippedIntroRef.current) {
      if (current >= skipTimes.intro.start && current < skipTimes.intro.end - 1) {
        hasAutoSkippedIntroRef.current = true;
        const target = Math.min(skipTimes.intro.end + 0.5, dur || skipTimes.intro.end + 1);
        video.currentTime = target;
        setCurrentTime(target);
        setAutoSkipToast("Auto-skipped Intro");
        setTimeout(() => setAutoSkipToast(null), 3000);
        return;
      }
    }

    // Auto-skip Outro
    if (autoSkipOutroState && skipTimes.outro && !hasAutoSkippedOutroRef.current) {
      if (current >= skipTimes.outro.start && current < skipTimes.outro.end - 1) {
        hasAutoSkippedOutroRef.current = true;
        const target = Math.min(skipTimes.outro.end + 0.5, dur || skipTimes.outro.end + 1);
        video.currentTime = target;
        setCurrentTime(target);
        setAutoSkipToast("Auto-skipped Outro");
        setTimeout(() => setAutoSkipToast(null), 3000);
        return;
      }
    }

    if (skipTimes.intro && current < skipTimes.intro.start - 5) {
      hasAutoSkippedIntroRef.current = false;
    }
    if (skipTimes.outro && current < skipTimes.outro.start - 5) {
      hasAutoSkippedOutroRef.current = false;
    }

    // Playing-state snapshot emitted every five seconds
    const now = Date.now();
    if (now - lastProgressEmitRef.current >= 5000) {
      lastProgressEmitRef.current = now;
      postToParent("progress", {
        currentTime: Math.round(current * 100) / 100,
        duration: Math.round(dur * 100) / 100,
        buffered: Math.round(buffered * 100) / 100,
        percentage: dur > 0 ? Math.round((current / dur) * 1000) / 10 : 0,
        paused: false,
      });
    }

    if (!progressSaveTimer.current) {
      progressSaveTimer.current = setTimeout(() => {
        fetch("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            anilistId,
            malId,
            episode: episodeNumber,
            currentTime: Math.floor(current),
            duration: Math.floor(dur),
          }),
        }).catch(() => {});
        progressSaveTimer.current = null;
      }, 4000);
    }
  };

  // Play / Pause toggler
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.muted || isMuted) {
      video.muted = false;
      setIsMuted(false);
      try {
        localStorage.setItem("anime_player_muted", "false");
      } catch {}
    }

    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
      postToParent("PLAYER_EVENT", { type: "play" });
    } else {
      video.pause();
      setIsPlaying(false);
      postToParent("PLAYER_EVENT", { type: "pause" });
    }
  };

  // Seek handler
  const handleSeek = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const target = Math.min(Math.max(seconds, 0), duration || 100);
    video.currentTime = target;
    setCurrentTime(target);
    postToParent("PLAYER_EVENT", { type: "seeked", currentTime: target });
  };

  const handleSeekRelative = (seconds: number) => {
    const video = videoRef.current;
    const cur = video ? video.currentTime : currentTime;
    const target = Math.min(Math.max(0, cur + seconds), duration || 100);
    handleSeek(target);

    const side = seconds >= 0 ? "right" : "left";
    setSeekFeedback((prev) => ({
      side,
      amount: (prev?.side === side ? prev.amount : 0) + Math.abs(seconds),
    }));
    if (seekFeedbackTimerRef.current) clearTimeout(seekFeedbackTimerRef.current);
    seekFeedbackTimerRef.current = setTimeout(() => {
      setSeekFeedback(null);
    }, 700);
  };

  // Skip Intro / Outro actions
  const handleSkipIntro = () => {
    if (!videoRef.current || !skipTimes.intro) return;
    const targetTime = Math.min(skipTimes.intro.end + 0.5, duration || skipTimes.intro.end + 1);
    handleSeek(targetTime);
    showToast("info", "Skipped Intro");
  };

  const handleSkipOutro = () => {
    if (!videoRef.current || !skipTimes.outro) return;
    const targetTime = Math.min(skipTimes.outro.end + 0.5, duration || skipTimes.outro.end + 1);
    handleSeek(targetTime);
    showToast("info", "Skipped Outro");
  };

  // Timeline handlers
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    handleSeek(pos * duration);
  };

  const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(pos * duration);
    setHoverPosition(pos * 100);
  };

  const handleTimelineTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !duration) return;
    const touch = e.touches[0] || e.changedTouches[0];
    if (!touch) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    handleSeek(pos * duration);
  };

  // Volume & Mute handlers
  const handleVolumeChange = (newVolume: number) => {
    const vol = Math.min(Math.max(newVolume, 0), 1);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = vol === 0;
    }
    setVolume(vol);
    setIsMuted(vol === 0);
    try {
      localStorage.setItem("anime_player_volume", vol.toString());
      localStorage.setItem("anime_player_muted", (vol === 0).toString());
    } catch {}
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const newMuted = !isMuted;
    video.muted = newMuted;
    if (!newMuted && volume === 0) {
      video.volume = 0.5;
      setVolume(0.5);
    }
    setIsMuted(newMuted);
    try {
      localStorage.setItem("anime_player_muted", newMuted.toString());
    } catch {}
  };

  // Fullscreen toggler - locks to 16:9 landscape on mobile phones
  const toggleFullscreen = async () => {
    const el = containerRef.current;
    const video = videoRef.current;
    if (!el) return;
    const isFs = Boolean(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement
    );

    if (!isFs) {
      // On iOS iPhone Safari: use webkitEnterFullscreen which native-locks to 16:9 landscape
      const isIPhone = typeof navigator !== "undefined" && /iPhone|iPod/.test(navigator.userAgent);
      if (isIPhone && video && (video as any).webkitEnterFullscreen) {
        try {
          (video as any).webkitEnterFullscreen();
          setIsFullscreen(true);
          return;
        } catch (err) {
          console.warn("webkitEnterFullscreen fallback", err);
        }
      }

      const requestFs =
        el.requestFullscreen ||
        (el as any).webkitRequestFullscreen ||
        (el as any).mozRequestFullScreen ||
        (el as any).msRequestFullscreen;

      if (requestFs) {
        try {
          await requestFs.call(el);
        } catch {}
      }
      setIsFullscreen(true);

      // Lock orientation to 16:9 landscape on mobile devices
      try {
        if (screen.orientation && (screen.orientation as any).lock) {
          await (screen.orientation as any).lock("landscape");
        }
      } catch {}
    } else {
      const exitFs =
        document.exitFullscreen ||
        (document as any).webkitExitFullscreen ||
        (document as any).mozCancelFullScreen ||
        (document as any).msExitFullscreen;

      if (exitFs) {
        try {
          await exitFs.call(document);
        } catch {}
      }
      setIsFullscreen(false);

      try {
        if (screen.orientation && (screen.orientation as any).unlock) {
          (screen.orientation as any).unlock();
        }
      } catch {}
    }
  };

  // Picture in Picture
  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
      }
    } catch {}
  };

  // Subtitle toggler
  const toggleSubtitles = () => {
    if (activeSubtitleTrack !== null) {
      setActiveSubtitleTrack(null);
      showToast("info", "Subtitles Off");
    } else {
      const defaultSub = allAvailableSubtitles[0];
      const target = defaultSub ? defaultSub.id || defaultSub.url : "en";
      setActiveSubtitleTrack(target);
      showToast("info", `Subtitles: ${defaultSub?.label || "On"}`);
    }
  };

  const toggleTimeDisplay = () => {
    setShowRemainingTime((prev) => !prev);
  };

  const handleSelectQuality = (lvlIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = lvlIndex;
      setSelectedHlsLevel(lvlIndex);
      const lvl = hlsLevels.find((l) => l.index === lvlIndex);
      showToast("success", `Quality: ${lvl ? lvl.name : "Auto"}`);
    }
  };

  const handleSelectAudioTrack = (track: { id: string; name: string; lang: string }) => {
    const targetCode = cleanAudioParam(track.lang || track.id || track.name).code;

    // 1. Try to switch track inside active HLS instance (ignoring synthetic/unknown tracks)
    if (
      hlsRef.current &&
      hlsRef.current.audioTracks &&
      hlsRef.current.audioTracks.length > 0 &&
      !hlsRef.current.audioTracks.every((t) => isInvalidOrUnknownAudioTrack(t))
    ) {
      const fallbackCode = isAnimeContent
        ? selectedTypeRef.current === "dub"
          ? "en"
          : "ja"
        : "en";
      const matchIdx = hlsRef.current.audioTracks.findIndex((t) => {
        if (isUnnamedHlsAudioTrack(t)) {
          return fallbackCode === targetCode || fallbackCode === track.id;
        }
        const norm = normalizeLanguage(t.lang || "", t.name || "");
        if (!norm.known) return false;
        return (
          norm.code === targetCode ||
          norm.code === track.id ||
          norm.name.toLowerCase() === track.name.toLowerCase()
        );
      });
      if (matchIdx >= 0) {
        hlsRef.current.audioTrack = matchIdx;
        setActiveAudioTrack(track.id);
        pendingAudioRef.current = null;
        if (isAnimeContent && (targetCode === "en" || targetCode === "ja")) {
          const nextType = targetCode === "en" ? "dub" : "sub";
          if (nextType !== selectedType) {
            skipNextLoadStreamRef.current = true;
            setSelectedType(nextType);
          }
        }
        showToast("success", `Audio: ${track.name}`);
        return;
      }
    }

    // 2. Not found in current HLS stream: find the best server providing this audio language
    const sourceHasTrack = (s: VideoSourceData) => {
      if (Array.isArray((s as any).audioTracks) && (s as any).audioTracks.length > 0) {
        const matched = (s as any).audioTracks.some((at: any) => {
          const norm = normalizeLanguage(at.lang || at.id || "", at.name || at.label || "");
          return (
            norm.known &&
            (norm.code === targetCode ||
              norm.code === track.id ||
              norm.name.toLowerCase() === track.name.toLowerCase())
          );
        });
        if (matched) return true;
      }
      if (isAnimeContent) {
        if (targetCode === "en") return s.type === "DUB" && !(s as any).audio_fallback;
        if (targetCode === "ja") return s.type === "SUB";
      }
      if (s.language) {
        const norm = normalizeLanguage(s.language, s.language);
        return norm.known && (norm.code === targetCode || norm.code === track.id);
      }
      return false;
    };

    const SERVER_PRIORITY = [
      "edge",
      "prism",
      "flux",
      "nimbus",
      "comet",
      "citadel",
      "katana",
      "flow",
      "kitty",
      "yuri",
      "zuri",
      "buzz",
    ];
    const currentProv = currentSource ? resolveSourceProviderName(currentSource).toLowerCase() : "";
    const matchingSources = sources
      .filter(sourceHasTrack)
      .sort((a, b) => {
        const aNotCurrent = a.id !== currentSource?.id ? 0 : 1;
        const bNotCurrent = b.id !== currentSource?.id ? 0 : 1;
        if (aNotCurrent !== bNotCurrent) return aNotCurrent - bNotCurrent;
        const aStub = a.videoUrl.includes("format=m3u8") ? 1 : 0;
        const bStub = b.videoUrl.includes("format=m3u8") ? 1 : 0;
        if (aStub !== bStub) return aStub - bStub;
        const aHevc = (a as any).isHevc ? 1 : 0;
        const bHevc = (b as any).isHevc ? 1 : 0;
        if (aHevc !== bHevc) return aHevc - bHevc;
        const provA = resolveSourceProviderName(a).toLowerCase().split(" ")[0];
        const provB = resolveSourceProviderName(b).toLowerCase().split(" ")[0];
        const aSame = provA === currentProv ? 0 : 1;
        const bSame = provB === currentProv ? 0 : 1;
        if (aSame !== bSame) return aSame - bSame;
        const idxA = SERVER_PRIORITY.indexOf(provA);
        const idxB = SERVER_PRIORITY.indexOf(provB);
        return (idxA >= 0 ? idxA : 99) - (idxB >= 0 ? idxB : 99);
      });

    let targetSource: VideoSourceData | undefined = matchingSources[0];

    if (!targetSource && isAnimeContent) {
      const isTargetDub = targetCode === "en" || track.name.toLowerCase().includes("english") || track.name.toLowerCase().includes("dub");
      targetSource =
        sources.find(
          (s) =>
            resolveSourceProviderName(s).toLowerCase() === currentProv &&
            (isTargetDub ? s.type === "DUB" && !(s as any).audio_fallback : s.type === "SUB")
        ) ||
        sources.find((s) => (isTargetDub ? s.type === "DUB" && !(s as any).audio_fallback : s.type === "SUB"));
    }

    if (targetSource) {
      let nextUrl = targetSource.videoUrl;
      if (
        nextUrl.includes("/api/proxy/m3u8") ||
        nextUrl.includes("/api/play") ||
        nextUrl.includes("/api/movie/play") ||
        nextUrl.includes("/api/tv/play")
      ) {
        try {
          const u = new URL(nextUrl, window.location.origin);
          const urlAudioVal =
            nextUrl.includes("/api/play") && (targetCode === "en" || targetCode === "ja")
              ? targetCode === "en"
                ? "dub"
                : "sub"
              : targetCode;
          u.searchParams.set("audio", urlAudioVal);
          nextUrl = u.pathname + u.search;
        } catch {}
      }

      if (targetSource.id !== currentSource?.id || nextUrl !== currentSource?.videoUrl) {
        handleSelectSource({ ...targetSource, videoUrl: nextUrl }, targetCode);
        showToast("refreshing", `Switched to ${formatServerRouteName(targetSource)} (${track.name})...`);
      } else {
        setActiveAudioTrack(track.id);
        pendingAudioRef.current = targetCode;
        showToast("info", `Audio: ${track.name}`);
      }
    } else {
      showToast("info", `${track.name} is not available on another server`);
    }
  };

  // Mobile touch handler: Smart single-tap controls toggle & double-tap seek
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    lastTouchTimeRef.current = Date.now();
    const touch = e.changedTouches[0];
    if (!touch || !containerRef.current) return;

    // Do not toggle or seek if user tapped on interactive control buttons, sliders or menus
    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.closest(".group\\/timeline") ||
      target.closest("[role='dialog']") ||
      target.closest("[role='menu']") ||
      target.closest("[data-controls-bar='true']")
    ) {
      handleUserActivity();
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const width = rect.width;
    const now = Date.now();
    const lastTap = lastTapInfoRef.current;

    // Detect true double-tap: within 320ms and within 45px radius
    const isDoubleTap =
      lastTap &&
      now - lastTap.time < 320 &&
      Math.abs(touch.clientX - lastTap.x) < 45 &&
      Math.abs(touch.clientY - lastTap.y) < 45;

    if (isDoubleTap) {
      lastTapInfoRef.current = null;
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }

      if (x < width * 0.4) {
        // Double-tap left: seek -10s
        const cur = videoRef.current ? videoRef.current.currentTime : currentTime;
        handleSeek(cur - 10);
        setSeekFeedback((prev) => ({
          side: "left",
          amount: prev?.side === "left" ? prev.amount + 10 : 10,
        }));
        if (seekFeedbackTimerRef.current) clearTimeout(seekFeedbackTimerRef.current);
        seekFeedbackTimerRef.current = setTimeout(() => setSeekFeedback(null), 700);
        handleUserActivity();
        return;
      }

      if (x > width * 0.6) {
        // Double-tap right: seek +10s
        const cur = videoRef.current ? videoRef.current.currentTime : currentTime;
        handleSeek(cur + 10);
        setSeekFeedback((prev) => ({
          side: "right",
          amount: prev?.side === "right" ? prev.amount + 10 : 10,
        }));
        if (seekFeedbackTimerRef.current) clearTimeout(seekFeedbackTimerRef.current);
        seekFeedbackTimerRef.current = setTimeout(() => setSeekFeedback(null), 700);
        handleUserActivity();
        return;
      }

      // Double-tap center: toggle play/pause
      togglePlay();
      handleUserActivity();
      return;
    }

    // Record potential first tap
    lastTapInfoRef.current = { time: now, x: touch.clientX, y: touch.clientY };

    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      lastTapInfoRef.current = null;

      const wasControlsVisible = showControlsRef.current;
      // Always show/keep controls visible and wait 3s before auto-hiding - just like on PC!
      handleUserActivity();

      // If controls were already visible, tapping the screen toggles play/pause (just like on PC!)
      if (wasControlsVisible) {
        togglePlay();
      }
    }, 250);
  };

  // Desktop click to play / pause
  const handleScreenClick = (e: React.MouseEvent<HTMLElement>) => {
    if (Date.now() - lastTouchTimeRef.current < 500) return;
    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.closest(".group\\/timeline") ||
      target.closest("[role='dialog']") ||
      target.closest("[role='menu']") ||
      target.closest("[data-controls-bar='true']")
    ) {
      return;
    }
    handleUserActivity();
    togglePlay();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (Date.now() - lastTouchTimeRef.current < 800) return;
    const target = e.target as HTMLElement;
    if (
      target.closest("[data-controls-bar='true']") ||
      target.closest(".group\\/timeline") ||
      target.closest("button") ||
      target.closest("input")
    ) {
      return;
    }
    toggleFullscreen();
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")
      ) {
        return;
      }
      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "arrowright":
          e.preventDefault();
          handleSeekRelative(10);
          break;
        case "arrowleft":
          e.preventDefault();
          handleSeekRelative(-10);
          break;
        case "arrowup":
          e.preventDefault();
          handleVolumeChange(volume + 0.05);
          break;
        case "arrowdown":
          e.preventDefault();
          handleVolumeChange(volume - 0.05);
          break;
        case "s":
          if (isInsideIntro) {
            e.preventDefault();
            handleSkipIntro();
          } else if (isInsideOutro) {
            e.preventDefault();
            handleSkipOutro();
          }
          break;
        case "c":
          e.preventDefault();
          toggleSubtitles();
          break;
        case "t":
          e.preventDefault();
          setIsTheater((prev) => !prev);
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });



  // Keep isPlayingRef updated and trigger auto-hide
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying) {
      handleUserActivity();
    } else {
      setShowControls(true);
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    }
  }, [isPlaying, handleUserActivity]);

  useEffect(() => {
    showControlsRef.current = showControls;
  }, [showControls]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      const isFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement
      );
      setIsFullscreen(isFs);
      if (isFs) {
        handleUserActivity();
        try {
          if (screen.orientation && (screen.orientation as any).lock) {
            (screen.orientation as any).lock("landscape").catch(() => {});
          }
        } catch {}
      } else {
        try {
          if (screen.orientation && (screen.orientation as any).unlock) {
            (screen.orientation as any).unlock();
          }
        } catch {}
      }
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
    };
  }, [handleUserActivity]);

  // Settings Menu dynamic height measurement
  useEffect(() => {
    const el = settingsContentRef.current;
    if (!el) return;
    const updateHeight = () => {
      const h = el.scrollHeight;
      if (h > 0) setMenuHeight(h);
      const playerEl = containerRef.current;
      if (playerEl) {
        const isMobile = window.innerWidth < 640;
        const bottomOffset = isMobile ? 78 : 86;
        const available = playerEl.clientHeight - bottomOffset - 8;
        setMenuMaxHeight(Math.max(available, 120));
      }
    };
    updateHeight();
    const ro = new ResizeObserver(() => updateHeight());
    ro.observe(el);
    return () => ro.disconnect();
  }, [settingsSubMenu, showSettingsMenu]);

  // Reset settings submenu to 'main' whenever settings menu is closed
  useEffect(() => {
    if (!showSettingsMenu) {
      setSettingsSubMenu("main");
    }
  }, [showSettingsMenu]);

  // Close settings on outside click
  useEffect(() => {
    if (!showSettingsMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        settingsMenuRef.current &&
        !settingsMenuRef.current.contains(target) &&
        settingsButtonRef.current &&
        !settingsButtonRef.current.contains(target)
      ) {
        setShowSettingsMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSettingsMenu]);

  // Subtitle typography helpers
  const getSubtitleFontFamily = () => {
    switch (subtitleStyles.fontFamily) {
      case "anime":
        return '"Trebuchet MS", "Segoe UI", sans-serif';
      case "mono":
        return 'ui-monospace, "Cascadia Code", monospace';
      case "serif":
        return 'Georgia, Cambria, "Times New Roman", serif';
      default:
        return 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    }
  };

  const getSubtitleOutlineStyles = (): React.CSSProperties => {
    const outline = subtitleStyles.outline || "thick";
    if (outline === "thick") {
      return {
        WebkitTextStroke: "2px #000000",
        paintOrder: "stroke fill",
        textShadow:
          "0 0 2px #000000, 0 -2px 0 #000000, 0 2px 0 #000000, -2px 0 0 #000000, 2px 0 0 #000000, -1.5px -1.5px 0 #000000, 1.5px -1.5px 0 #000000, -1.5px 1.5px 0 #000000, 1.5px 1.5px 0 #000000, 0 2px 4px rgba(0, 0, 0, 0.9)",
      };
    }
    if (outline === "thin") {
      return {
        WebkitTextStroke: "1px #000000",
        paintOrder: "stroke fill",
        textShadow:
          "0 0 1px #000000, 0 -1px 0 #000000, 0 1px 0 #000000, -1px 0 0 #000000, 1px 0 0 #000000, -1px -1px 0 #000000, 1px -1px 0 #000000, -1px 1px 0 #000000, 1px 1px 0 #000000, 0 1px 3px rgba(0, 0, 0, 0.8)",
      };
    }
    return {
      WebkitTextStroke: "0px transparent",
      paintOrder: "normal",
      textShadow: subtitleStyles.shadow ? "0 2px 4px rgba(0,0,0,0.9)" : "none",
    };
  };

  const isInsideIntro = Boolean(
    skipTimes.intro &&
      currentTime >= skipTimes.intro.start &&
      currentTime <= skipTimes.intro.end
  );
  const isInsideOutro = Boolean(
    skipTimes.outro &&
      currentTime >= skipTimes.outro.start &&
      currentTime <= skipTimes.outro.end
  );

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  const currentSub =
    activeSubtitleTrack === null
      ? null
      : allAvailableSubtitles.find((s) => s.id === activeSubtitleTrack || s.url === activeSubtitleTrack) ||
        allAvailableSubtitles[0];

  const activeSubLabel =
    activeSubtitleTrack === null ? "Off" : currentSub?.label || (allAvailableSubtitles.length ? allAvailableSubtitles[0].label : "Off");

  // Combined audio tracks gathered from current HLS/API state and available server sources
  const combinedAudioTracks = useMemo(() => {
    const list: Array<{ id: string; name: string; label: string; lang: string; countryCode: string; flag: string }> = [];
    const seen = new Set<string>();

    const addTrack = (rawLang: string, rawName: string) => {
      if (isUnnamedHlsAudioTrack({ lang: rawLang, name: rawName })) return;
      const norm = normalizeLanguage(rawLang, rawName);
      if (!norm.known || !norm.code || seen.has(norm.code)) return;
      seen.add(norm.code);
      list.push({
        id: norm.code,
        name: norm.name,
        label: norm.name,
        lang: norm.code,
        countryCode: norm.countryCode,
        flag: norm.flag,
      });
    };

    // 1. Audio tracks from active stream / HLS / API state
    for (const t of audioTracks) {
      addTrack(t.lang || t.id, t.name || t.label);
    }

    // 2. Audio tracks from available sources
    for (const s of sources) {
      if (Array.isArray((s as any).audioTracks)) {
        for (const at of (s as any).audioTracks) {
          addTrack(at.lang || at.id, at.name || at.label);
        }
      }
      if (isAnimeContent) {
        if (s.type === "SUB") addTrack("ja", "Japanese");
        if (s.type === "DUB" && !(s as any).audio_fallback) addTrack("en", "English");
      } else if (s.language) {
        addTrack(s.language, s.language);
      }
    }

    if (list.length === 0) {
      addTrack("en", "English");
      if (isAnimeContent) addTrack("ja", "Japanese");
    }

    // Always sort so English and Japanese are at the top, then alphabetically
    return list.sort((a, b) => {
      if (a.id === "en") return -1;
      if (b.id === "en") return 1;
      if (a.id === "ja") return -1;
      if (b.id === "ja") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [audioTracks, sources, isAnimeContent]);

  const activeAudioLabel = useMemo(() => {
    const normActive = cleanAudioParam(activeAudioTrack);
    const match = combinedAudioTracks.find(
      (t) =>
        t.id === activeAudioTrack ||
        t.lang === activeAudioTrack ||
        t.name.toLowerCase() === activeAudioTrack.toLowerCase() ||
        t.id === normActive.code
    );
    return match
      ? match.name
      : isAnimeContent
      ? selectedType === "dub"
        ? "English"
        : "Japanese"
      : normActive.name || "English";
  }, [combinedAudioTracks, activeAudioTrack, selectedType, isAnimeContent]);

  const currentQualityLabel = (() => {
    if (selectedHlsLevel === -1) {
      if (hlsLevels.length > 0) {
        const top = hlsLevels.reduce((max, l) => (l.height > max ? l.height : max), 0);
        return top ? `Auto (${top}p)` : "Auto";
      }
      return "Auto";
    }
    const found = hlsLevels.find((l) => l.index === selectedHlsLevel);
    return found ? found.name : "1080p";
  })();

  const sortedLevels = useMemo(() => {
    if (hlsLevels.length > 0) {
      return [...hlsLevels].sort((a, b) => b.height - a.height);
    }
    return [
      { index: 0, name: "1080p", height: 1080 },
      { index: 1, name: "720p", height: 720 },
      { index: 2, name: "480p", height: 480 },
      { index: 3, name: "360p", height: 360 },
    ];
  }, [hlsLevels]);

  const getSourceProvider = useCallback(resolveSourceProviderName, []);

  const sortSourcesByProvider = useCallback((a: VideoSourceData, b: VideoSourceData) => {
    const SERVER_SORT_ORDER = [
      "edge",
      "prism",
      "flux",
      "nimbus",
      "comet",
      "citadel",
      "katana",
      "flow",
      "kitty",
      "yuri",
      "zuri",
      "buzz",
    ];
    const provA = getSourceProvider(a).toLowerCase().split(" ")[0];
    const provB = getSourceProvider(b).toLowerCase().split(" ")[0];
    const idxA = SERVER_SORT_ORDER.indexOf(provA);
    const idxB = SERVER_SORT_ORDER.indexOf(provB);
    return (idxA >= 0 ? idxA : 99) - (idxB >= 0 ? idxB : 99);
  }, [getSourceProvider]);

  // All distinct Vidly servers for Movies & TV Shows (not split by Anime Sub/Dub)
  const vidlyServers = useMemo<VideoSourceData[]>(() => {
    const byId = new Map<string, VideoSourceData>();
    for (const s of sources) {
      const existing = byId.get(s.id);
      if (!existing || (existing.videoUrl.includes("format=m3u8") && !s.videoUrl.includes("format=m3u8"))) {
        byId.set(s.id, s);
      }
    }
    return Array.from(byId.values()).sort(sortSourcesByProvider);
  }, [sources, sortSourcesByProvider]);

  // Native player sources segregated for SUB and DUB
  const nativeSubSources = useMemo<VideoSourceData[]>(() => {
    const raw = sources.filter((s) => s.type === "SUB" && isNativePlayerSource(s));
    const list = raw.length > 0 ? raw : (sources.some(isNativePlayerSource) ? [] : sources.filter((s) => s.type === "SUB"));
    const byProv = new Map<string, VideoSourceData>();
    for (const s of list) {
      const prov = getSourceProvider(s).toLowerCase();
      const existing = byProv.get(prov);
      if (
        !existing ||
        s.id === activeSourceId ||
        (existing.id !== activeSourceId && existing.id === "katana-multi" && s.id === "katana-sub") ||
        (existing.id !== activeSourceId && existing.videoUrl.includes("format=m3u8") && !s.videoUrl.includes("format=m3u8"))
      ) {
        byProv.set(prov, s);
      }
    }
    return Array.from(byProv.values()).sort(sortSourcesByProvider);
  }, [sources, activeSourceId, getSourceProvider, sortSourcesByProvider]);

  const nativeDubSources = useMemo<VideoSourceData[]>(() => {
    const isAuthenticDub = (s: VideoSourceData) => {
      if ((s as any).audio_fallback) return false;
      return true;
    };
    const raw = sources.filter((s) => s.type === "DUB" && isNativePlayerSource(s) && isAuthenticDub(s));
    const list = raw.length > 0 ? raw : (sources.some(isNativePlayerSource) ? [] : sources.filter((s) => s.type === "DUB" && isAuthenticDub(s)));
    const byProv = new Map<string, VideoSourceData>();
    for (const s of list) {
      const prov = getSourceProvider(s).toLowerCase();
      const existing = byProv.get(prov);
      if (
        !existing ||
        s.id === activeSourceId ||
        (existing.id !== activeSourceId && existing.videoUrl.includes("format=m3u8") && !s.videoUrl.includes("format=m3u8"))
      ) {
        byProv.set(prov, s);
      }
    }
    return Array.from(byProv.values()).sort(sortSourcesByProvider);
  }, [sources, activeSourceId, getSourceProvider, sortSourcesByProvider]);

  const currentSource = useMemo(() => {
    if (activeSourceId) {
      const found = sources.find((s) => s.id === activeSourceId);
      if (found) return found;
    }
    const forType = sources.filter((s) => (s.type || "").toLowerCase() === selectedType.toLowerCase());
    return forType[0] || sources[0] || null;
  }, [sources, activeSourceId, selectedType]);

  const formatServerRouteName = useCallback((src: VideoSourceData) => {
    return getSourceProvider(src);
  }, [getSourceProvider]);

  const formatServerRouteAudio = useCallback((src: VideoSourceData) => {
    if (!isAnimeContent) {
      const rawTracks = Array.isArray((src as any).audioTracks) ? (src as any).audioTracks : [];
      const knownTracks = rawTracks.filter((t: any) =>
        normalizeLanguage(t.lang || t.id || "", t.name || t.label || "").known
      );
      if (knownTracks.length > 1) return `${knownTracks.length} Audio`;
      if (knownTracks.length === 1) {
        return normalizeLanguage(
          knownTracks[0].lang || knownTracks[0].id || "",
          knownTracks[0].name || knownTracks[0].label || ""
        ).name;
      }
      if (src.language) {
        const norm = normalizeLanguage(src.language, src.language);
        if (norm.known) return norm.name;
      }
      return src.quality || "HD";
    }
    return src.type === "DUB" ? "English Dub" : "Sub";
  }, [isAnimeContent]);

  const formatServerRouteLabel = useCallback((src: VideoSourceData) => {
    const name = formatServerRouteName(src);
    const audio = formatServerRouteAudio(src);
    return `${name} (${audio})`;
  }, [formatServerRouteName, formatServerRouteAudio]);

  const activeServerLabel = useMemo(() => {
    if (currentSource) {
      return formatServerRouteLabel(currentSource);
    }
    if (!isAnimeContent) {
      return "Edge (1080p)";
    }
    return selectedType === "dub" ? "Katana (English Dub)" : "Katana (Sub)";
  }, [currentSource, formatServerRouteLabel, selectedType, isAnimeContent]);

  const handleSelectSource = useCallback((src: VideoSourceData, explicitAudioCode?: string) => {
    const curTime = videoRef.current && videoRef.current.currentTime > 0
      ? videoRef.current.currentTime
      : currentTime;
    if (curTime > 0) {
      preserveTimeRef.current = curTime;
    }
    isSwitchingServerRef.current = true;
    explicitServerRef.current = true;
    setFatalError(null);
    setIsLoading(true);

    const newType = (src.type || "SUB").toLowerCase() as "sub" | "dub";
    if (isAnimeContent && newType !== selectedType) {
      skipNextLoadStreamRef.current = true;
      setSelectedType(newType);
    }

    const prov = getSourceProvider(src).toLowerCase();
    const srvCode = !isAnimeContent
      ? src.id
      : prov === "buzz"
      ? (src.type === "DUB" ? "buzz-dub" : "buzz-sub")
      : prov === "katana"
      ? (src.type === "DUB" ? "katana-dub" : "katana-sub")
      : (src.type === "DUB" ? `${prov}-dub` : prov);
    if (srvCode !== server) {
      skipNextLoadStreamRef.current = true;
      setServer(srvCode);
    }

    const rawSrcTracks: any[] = Array.isArray((src as any).audioTracks) ? (src as any).audioTracks : [];
    const srcTracks = rawSrcTracks.filter((t) =>
      normalizeLanguage(t.lang || t.id || "", t.name || t.label || "").known
    );
    let nextAudioCode = explicitAudioCode || "";
    if (!nextAudioCode) {
      if (isAnimeContent) {
        nextAudioCode = newType === "dub" ? "en" : "ja";
        if (srcTracks.length > 0 && !srcTracks.some((t) => (t.id || t.lang) === nextAudioCode)) {
          const def = srcTracks.find((t) => t.default) || srcTracks[0];
          nextAudioCode = def?.id || def?.lang || nextAudioCode;
        }
      } else {
        const curMatch = srcTracks.find((t) => (t.id || t.lang) === activeAudioTrack);
        if (curMatch) {
          nextAudioCode = curMatch.id || curMatch.lang;
        } else if (srcTracks.length > 0) {
          const def = srcTracks.find((t) => t.default) || srcTracks[0];
          nextAudioCode = def?.id || def?.lang || activeAudioTrack || "en";
        } else if ((src as any).language) {
          const srcLangNorm = normalizeLanguage((src as any).language, (src as any).language);
          nextAudioCode = srcLangNorm.known ? srcLangNorm.code : (activeAudioTrack || "en");
        } else {
          nextAudioCode = activeAudioTrack || "en";
        }
      }
    }
    pendingAudioRef.current = nextAudioCode;
    setActiveAudioTrack(nextAudioCode);
    setAudioTracks(srcTracks);

    // Apply skip times specifically for the newly selected anime server
    if (isAnimeContent) {
      const isFlowSrc = prov === "flow" || prov === "kitty";
      if (src.intro || src.outro) {
        setRawSkipTimes({
          intro: src.intro || null,
          outro: src.outro || null,
          refDuration: src.refDuration || 1440,
          source: isFlowSrc ? "flow-reanime" : "aniskip",
        });
        if (isFlowSrc && duration > 0) {
          const adapted = adaptSkipTimes(src.intro || null, src.outro || null, src.refDuration || 1440, duration);
          setSkipTimes({ intro: adapted.intro, outro: adapted.outro });
        } else {
          setSkipTimes({ intro: src.intro || null, outro: src.outro || null });
        }
      } else {
        const idParam = anilistId ? `anilistId=${anilistId}` : `malId=${malId}`;
        const titleParam = animeTitle ? `&title=${encodeURIComponent(animeTitle)}` : "";
        fetch(`/api/anime/skip-times?${idParam}&episode=${episodeNumber}${titleParam}&server=${srvCode}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.found && (d.intro || d.outro)) {
              setRawSkipTimes({
                intro: d.intro || null,
                outro: d.outro || null,
                refDuration: d.refDuration || 1440,
                source: d.source || (isFlowSrc ? "flow-reanime" : "aniskip"),
              });
              if (isFlowSrc && duration > 0) {
                const adapted = adaptSkipTimes(d.intro || null, d.outro || null, d.refDuration || 1440, duration);
                setSkipTimes({ intro: adapted.intro, outro: adapted.outro });
              } else {
                setSkipTimes({ intro: d.intro || null, outro: d.outro || null });
              }
            } else {
              setRawSkipTimes({ intro: null, outro: null, refDuration: 1440, source: isFlowSrc ? "flow-reanime" : "aniskip" });
              setSkipTimes({ intro: null, outro: null });
            }
          })
          .catch(() => {});
      }
    }

    setActiveSourceId(src.id);
    setStreamUrl(src.videoUrl);

    const rawSubsList = (src.subtitles && src.subtitles.length > 0)
      ? src.subtitles
      : sources.find((s) => getSourceProvider(s).toLowerCase() === prov && Array.isArray(s.subtitles) && s.subtitles.length > 0)?.subtitles;

    if (rawSubsList && rawSubsList.length > 0) {
      const formattedSubs: SubtitleTrack[] = deduplicateSubtitleTracks(
        rawSubsList.map((s: any, idx: number) => {
          const rawUrl = s.url || s.subtitleUrl || s.file || s.direct_url || s.link || "";
          const proxySubUrl = rawUrl
            ? (rawUrl.startsWith("/api/proxy") ? rawUrl : `/api/proxy/subtitles?url=${encodeURIComponent(rawUrl)}`)
            : "";
          return {
            id: s.id || `sub-${idx}`,
            language: s.language || s.lang || "en",
            label: s.label || s.language || `Subtitle ${idx + 1}`,
            url: proxySubUrl || rawUrl,
            default: s.default ?? s.isDefault ?? (idx === 0),
          };
        }).filter((s) => Boolean(s.url))
      );

      if (formattedSubs.length > 0) {
        setAllAvailableSubtitles(formattedSubs);
        const defaultSub = formattedSubs.find((s) => s.default) || formattedSubs[0];
        if (defaultSub) {
          setActiveSubtitleTrack(defaultSub.id || defaultSub.url);
        }
      }
    }

    // Always fetch fresh subtitles asynchronously for the chosen server in case they weren't attached yet
    const subFetchUrl = !isAnimeContent
      ? (mediaType === "movie" || (mediaType !== "tv" && !seasonNumber && !episodeNumber)
          ? `/api/movie/play?tmdb_id=${tmdbId}&audio=${encodeURIComponent(nextAudioCode)}&server=${encodeURIComponent(srvCode)}`
          : `/api/tv/play?tmdb_id=${tmdbId}&season=${seasonNumber || 1}&episode=${episodeNumber || 1}&audio=${encodeURIComponent(nextAudioCode)}&server=${encodeURIComponent(srvCode)}`)
      : `/api/play?${anilistId ? `anilistId=${anilistId}` : `malId=${malId}`}&episode=${episodeNumber}&audio=${
          nextAudioCode !== "en" && nextAudioCode !== "ja" ? encodeURIComponent(nextAudioCode) : newType
        }&server=${srvCode}`;

    fetch(subFetchUrl)
      .then((r) => r.json())
      .then((data) => {
        if (data?.subtitles && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
          const fetchedSubs: SubtitleTrack[] = deduplicateSubtitleTracks(
            data.subtitles
              .map((s: any, idx: number) => {
                const rawUrl = s.url || s.subtitleUrl || s.file || s.direct_url || s.link || "";
                const proxySubUrl = rawUrl
                  ? (rawUrl.startsWith("/api/proxy") ? rawUrl : `/api/proxy/subtitles?url=${encodeURIComponent(rawUrl)}`)
                  : "";
                return {
                  id: s.id || `sub-${idx}`,
                  language: s.language || s.lang || "en",
                  label: s.label || s.language || `Subtitle ${idx + 1}`,
                  url: proxySubUrl || rawUrl,
                  default: s.default ?? s.isDefault ?? (idx === 0),
                };
              })
              .filter((s: SubtitleTrack) => Boolean(s.url))
          );

          if (fetchedSubs.length > 0) {
            setAllAvailableSubtitles(fetchedSubs);
            setActiveSubtitleTrack((prevTrack) => {
              const match = fetchedSubs.find((sub) => sub.id === prevTrack || sub.url === prevTrack);
              if (match) return match.id || match.url;
              const def = fetchedSubs.find((sub) => sub.default) || fetchedSubs[0];
              return def ? (def.id || def.url) : null;
            });
            setSources((prev) =>
              prev.map((item) =>
                item.id === src.id ? { ...item, subtitles: fetchedSubs } : item
              )
            );
          }
        }
      })
      .catch(() => {});

    setShowSettingsMenu(false);
    setSettingsSubMenu("main");
    if (isAnimeContent) {
      showToast("success", `Switched to ${formatServerRouteName(src)} (${src.type === "DUB" ? "Dub" : "Sub"})`);
    } else {
      showToast("success", `Switched to ${formatServerRouteName(src)}`);
    }

    postToParent("PLAYER_EVENT", {
      type: "source_change",
      sourceId: src.id,
      serverName: src.serverName,
      audio: newType,
      videoUrl: src.videoUrl,
    });
  }, [
    currentTime,
    selectedType,
    server,
    sources,
    activeAudioTrack,
    isAnimeContent,
    mediaType,
    anilistId,
    malId,
    tmdbId,
    seasonNumber,
    episodeNumber,
    animeTitle,
    getSourceProvider,
    formatServerRouteName,
    showToast,
    postToParent,
    duration,
    rawSkipTimes,
  ]);

  const handleFallbackToNextServer = useCallback(() => {
    const isDub = selectedType === "dub";
    const available = isDub ? nativeDubSources : nativeSubSources;
    if (available.length <= 1) {
      setFatalError("Stream unavailable on any server");
      setIsLoading(false);
      return;
    }

    const currentIndex = available.findIndex(
      (s) => s.id === activeSourceId || s.videoUrl === streamUrl
    );
    const nextIndex = (currentIndex + 1) % available.length;
    const nextServer = available[nextIndex];

    if (nextServer && nextServer.id !== activeSourceId) {
      console.warn(`[EmbedPlayer] Auto-failing over to alternative server: ${formatServerRouteName(nextServer)}`);
      showToast("refreshing", `Auto-switching to ${formatServerRouteName(nextServer)}...`);
      handleSelectSource(nextServer);
    } else {
      setFatalError("Playback failed on all available servers");
      setIsLoading(false);
    }
  }, [selectedType, nativeDubSources, nativeSubSources, activeSourceId, streamUrl, formatServerRouteName, showToast, handleSelectSource]);

  useEffect(() => {
    fallbackRef.current = handleFallbackToNextServer;
  }, [handleFallbackToNextServer]);

  // Current player state snapshot
  const getPlayerState = useCallback(() => {
    const video = videoRef.current;
    const curTime = video && !isNaN(video.currentTime) ? video.currentTime : currentTime;
    const dur = video && !isNaN(video.duration) ? video.duration : duration;
    return {
      currentTime: Math.round((curTime || 0) * 100) / 100,
      duration: Math.round((dur || 0) * 100) / 100,
      paused: video ? video.paused : !isPlaying,
      muted: video ? video.muted : isMuted,
      volume: video ? Math.round(video.volume * 100) / 100 : volume,
      playbackRate: video ? video.playbackRate : playbackSpeed,
      percentage: dur > 0 ? Math.round(((curTime || 0) / dur) * 1000) / 10 : 0,
      provider: {
        language: selectedType,
        providerId: server,
      },
      episode: episodeNumber,
      anilistId,
      malId,
    };
  }, [currentTime, duration, isPlaying, isMuted, volume, playbackSpeed, selectedType, server, episodeNumber, anilistId, malId]);

  // Listen to postMessage from parent iframe / SDK
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg) return;

      const cmdName = msg.name || msg.command || msg.action || (msg.type !== "command" ? msg.type : undefined);
      if (!cmdName || typeof cmdName !== "string") return;

      const cmdData = msg.data || msg;
      const requestId = msg.requestId;

      const sendResult = (ok: boolean, error?: string) => {
        if (!requestId) return;
        const state = getPlayerState();
        if (typeof window !== "undefined" && window.parent && window.parent !== window) {
          window.parent.postMessage(
            {
              source: "aniembed",
              version: 1,
              name: "command-result",
              requestId,
              data: ok ? { ok: true, state } : { ok: false, error: error || "Command execution failed" },
            },
            "*"
          );
        }
      };

      const video = videoRef.current;

      switch (cmdName) {
        case "play": {
          if (video) {
            video
              .play()
              .then(() => {
                setIsPlaying(true);
                sendResult(true);
              })
              .catch((err) => {
                sendResult(false, err?.message || "Playback error");
              });
          } else {
            sendResult(false, "Video element unavailable");
          }
          break;
        }

        case "pause": {
          if (video) {
            video.pause();
            setIsPlaying(false);
            sendResult(true);
          } else {
            sendResult(false, "Video element unavailable");
          }
          break;
        }

        case "seek": {
          const seekTarget = Number(cmdData.time ?? cmdData.seconds ?? 0);
          if (!isNaN(seekTarget)) {
            handleSeek(seekTarget);
            sendResult(true);
          } else {
            sendResult(false, "Invalid seek time parameter");
          }
          break;
        }

        case "setVolume": {
          const targetVol = Number(cmdData.volume ?? 1);
          if (!isNaN(targetVol)) {
            const clamped = Math.max(0, Math.min(1, targetVol));
            if (video) {
              video.volume = clamped;
              if (clamped > 0 && (video.muted || isMuted)) {
                video.muted = false;
                setIsMuted(false);
              }
            }
            setVolume(clamped);
            sendResult(true);
          } else {
            sendResult(false, "Invalid volume parameter (must be 0..1)");
          }
          break;
        }

        case "setMuted": {
          const mutedBool = Boolean(cmdData.muted);
          if (video) {
            video.muted = mutedBool;
          }
          setIsMuted(mutedBool);
          sendResult(true);
          break;
        }

        case "setPlaybackRate": {
          const targetRate = Number(cmdData.rate ?? cmdData.playbackRate ?? 1);
          if (!isNaN(targetRate)) {
            const clampedRate = Math.max(0.25, Math.min(2, targetRate));
            if (video) {
              video.playbackRate = clampedRate;
            }
            setPlaybackSpeed(clampedRate);
            sendResult(true);
          } else {
            sendResult(false, "Invalid rate parameter (0.25..2)");
          }
          break;
        }

        case "setProvider": {
          const lang = (cmdData.language || "sub").toLowerCase();
          const pId = (cmdData.providerId || "").toLowerCase();
          const langUpper = lang.toUpperCase();

          const found = sources.find((s) => {
            const typeOk = (s.type || "").toUpperCase() === langUpper;
            const provOk = !pId || s.id?.toLowerCase().includes(pId) || s.serverName?.toLowerCase().includes(pId);
            return typeOk && provOk;
          }) || sources.find((s) => (s.type || "").toUpperCase() === langUpper);

          if (found) {
            handleSelectSource(found);
          } else {
            setSelectedType(lang as "sub" | "dub");
            if (pId) setServer(pId);
          }
          sendResult(true);
          break;
        }

        case "getState":
        case "getStatus": {
          sendResult(true);
          postToParent("PLAYER_EVENT", {
            type: "status",
            ...getPlayerState(),
          });
          break;
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [getPlayerState, handleSeek, handleSelectSource, sources, postToParent]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleUserActivity}
      onClick={handleScreenClick}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
      style={{}}
      className={cn(
        "relative w-full h-full bg-black overflow-hidden select-none transition-all duration-300 touch-manipulation font-product-sans",
        !showControls ? "cursor-none [&_*]:!cursor-none" : "cursor-default",
        isFullscreen
          ? "fixed inset-0 z-[99999] w-screen h-screen rounded-none border-0 max-h-none flex items-center justify-center bg-black"
          : "rounded-none border-0"
      )}
    >
      {/* HTML5 / HLS Video Element */}
      <video
        ref={videoRef}
        onError={(e) => {
          console.warn("HTML5 video error:", e);
          setIsLoading(false);
          fallbackRef.current?.();
        }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => {
          if (videoRef.current) {
            const dur = videoRef.current.duration;
            setDuration(dur);
            if (rawSkipTimes.intro || rawSkipTimes.outro) {
              const isFlowSrv = server.toLowerCase().includes("flow") || server.toLowerCase().includes("kitty");
              const isFlowSource = rawSkipTimes.source?.includes("flow") || rawSkipTimes.source?.includes("reanime");
              if ((isFlowSource || isFlowSrv) && dur > 0) {
                const adapted = adaptSkipTimes(rawSkipTimes.intro, rawSkipTimes.outro, rawSkipTimes.refDuration, dur);
                setSkipTimes({ intro: adapted.intro, outro: adapted.outro });
              }
            }
          }
        }}
        onDurationChange={() => {
          if (videoRef.current && videoRef.current.duration > 0) {
            const dur = videoRef.current.duration;
            setDuration(dur);
            if (rawSkipTimes.intro || rawSkipTimes.outro) {
              const isFlowSrv = server.toLowerCase().includes("flow") || server.toLowerCase().includes("kitty");
              const isFlowSource = rawSkipTimes.source?.includes("flow") || rawSkipTimes.source?.includes("reanime");
              if ((isFlowSource || isFlowSrv) && dur > 0) {
                const adapted = adaptSkipTimes(rawSkipTimes.intro, rawSkipTimes.outro, rawSkipTimes.refDuration, dur);
                setSkipTimes({ intro: adapted.intro, outro: adapted.outro });
              }
            }
          }
        }}
        onCanPlay={() => setIsLoading(false)}
        onCanPlayThrough={() => setIsLoading(false)}
        onSeeked={() => setIsLoading(false)}
        onLoadedData={() => setIsLoading(false)}
        onWaiting={() => {
          if (videoRef.current && !videoRef.current.paused) {
            setIsLoading(true);
          }
        }}
        onPlaying={() => {
          isSwitchingServerRef.current = false;
          setIsLoading(false);
          setIsPlaying(true);
          if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
            audioCtxRef.current.resume().catch(() => {});
          }
        }}
        onPause={() => {
          if (isSwitchingServerRef.current) return;
          setIsLoading(false);
          setIsPlaying(false);
          const v = videoRef.current;
          const cur = v ? v.currentTime : currentTime;
          const dur = v ? v.duration : duration;
          postToParent("pause", {
            currentTime: Math.round(cur * 100) / 100,
            duration: Math.round((dur || 0) * 100) / 100,
            percentage: dur > 0 ? Math.round((cur / dur) * 1000) / 10 : 0,
            paused: true,
          });
        }}
        onEnded={() => {
          setIsPlaying(false);
          const v = videoRef.current;
          const dur = v ? v.duration : duration;
          postToParent("ended", {
            currentTime: Math.round((dur || 0) * 100) / 100,
            duration: Math.round((dur || 0) * 100) / 100,
            percentage: 100,
            paused: true,
          });
        }}
        playsInline
        crossOrigin="anonymous"
        className="w-full h-full object-contain touch-manipulation"
      />

      {/* Double-Tap / Keyboard Arrow Seek Feedback Animation */}
      {seekFeedback && (
        <div
          className={cn(
            "absolute inset-y-0 w-1/3 z-20 flex items-center justify-center pointer-events-none transition-all duration-200 animate-in fade-in",
            seekFeedback.side === "left"
              ? "left-0 bg-gradient-to-r from-black/35 via-black/10 to-transparent"
              : "right-0 bg-gradient-to-l from-black/35 via-black/10 to-transparent"
          )}
        >
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-zinc-950/80 border border-white/15 shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.22)] backdrop-blur-2xl backdrop-saturate-150 animate-in zoom-in-90 duration-150 select-none">
            {seekFeedback.side === "left" ? (
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 text-white animate-pulse" />
            ) : (
              <RotateCw className="w-4 h-4 sm:w-5 sm:h-5 text-white animate-pulse" />
            )}
            <span className="text-xs sm:text-sm font-semibold text-white tracking-tight">
              {seekFeedback.side === "left" ? `-${seekFeedback.amount}s` : `+${seekFeedback.amount}s`}
            </span>
          </div>
        </div>
      )}

      {/* Custom Subtitle Overlay Container */}
      {currentSubtitleText && (
        <div
          className={cn(
            "absolute inset-x-4 z-20 pointer-events-none flex justify-center text-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            showControls ? "bottom-18 sm:bottom-20" : "bottom-5 sm:bottom-7"
          )}
        >
          <div
            className={cn(
              "inline-block px-3.5 py-1.5 rounded-lg transition-all duration-100 max-w-[85%] whitespace-pre-line leading-snug tracking-wide",
              (subtitleStyles.background.includes("0.4") || subtitleStyles.background === "blur") &&
                "backdrop-blur-[10px] bg-black/15 border border-white/10 shadow-lg"
            )}
            style={{
              fontSize:
                subtitleStyles.fontSize === "sm"
                  ? "15px"
                  : subtitleStyles.fontSize === "lg"
                  ? "25px"
                  : subtitleStyles.fontSize === "xl"
                  ? "32px"
                  : subtitleStyles.fontSize === "2xl"
                  ? "38px"
                  : "19px",
              fontFamily: getSubtitleFontFamily(),
              fontWeight: subtitleStyles.fontWeight === "normal" ? "normal" : "bold",
              color: subtitleStyles.color,
              backgroundColor:
                subtitleStyles.background.includes("0.4") || subtitleStyles.background === "blur"
                  ? undefined
                  : subtitleStyles.background === "solid" || subtitleStyles.background === "rgba(0, 0, 0, 0.85)"
                  ? "rgba(0, 0, 0, 0.85)"
                  : subtitleStyles.background,
              ...getSubtitleOutlineStyles(),
            }}
          >
            {currentSubtitleText}
          </div>
        </div>
      )}

      {/* Loading Spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] pointer-events-none z-20">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-zinc-950/65 backdrop-blur-2xl backdrop-saturate-150 text-white flex items-center justify-center shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.22)]">
            <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 text-white animate-spin drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
          </div>
        </div>
      )}

      {/* Fatal Error Overlay */}
      {fatalError && !isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md z-40 p-4 sm:p-6 text-center space-y-3 sm:space-y-4 animate-in fade-in duration-200">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-amber-400 shadow-2xl shrink-0">
            <Tv className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h4 className="text-sm font-semibold text-white font-product-sans">Stream Unavailable</h4>
            <p className="text-xs text-zinc-400 font-product-sans">{fatalError}</p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFatalError(null);
                setIsLoading(true);
                setServer((prev) => (prev === "katana-sub" ? "katana-dub" : "katana-sub"));
              }}
              className="px-4 py-2 rounded-full bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-all shadow-lg active:scale-95 cursor-pointer font-product-sans"
            >
              Switch to {server === "katana-sub" ? "Katana Dub" : "Katana Sub"}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFatalError(null);
                setIsLoading(true);
                setReloadCounter((prev) => prev + 1);
              }}
              className="px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition-all border border-white/10 active:scale-95 cursor-pointer font-product-sans"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Mobile Center Controls: Play / Pause */}
      {!isLoading && (
        <div className="sm:hidden absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="flex items-center justify-center select-none">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleUserActivity();
                togglePlay();
              }}
              className={cn(
                "rounded-full bg-zinc-950/80 active:bg-zinc-900/95 backdrop-blur-2xl backdrop-saturate-150 text-white flex items-center justify-center shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.25)] active:scale-95 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] touch-manipulation cursor-pointer",
                isFullscreen ? "w-16 h-16" : "w-14 h-14",
                showControls || !isPlaying ? "scale-100 pointer-events-auto" : "scale-0 pointer-events-none"
              )}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause
                  className={cn(
                    "fill-white text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]",
                    isFullscreen ? "w-7 h-7" : "w-6 h-6"
                  )}
                />
              ) : (
                <Play
                  className={cn(
                    "fill-white text-white ml-0.5 drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]",
                    isFullscreen ? "w-7 h-7" : "w-6 h-6"
                  )}
                />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Desktop Big Center Play Icon (Only when paused) */}
      {!isPlaying && !isLoading && (
        <div className="hidden sm:flex absolute inset-0 items-center justify-center pointer-events-none z-20">
          <div className="w-14 h-14 rounded-full bg-zinc-950/65 backdrop-blur-2xl backdrop-saturate-150 text-white flex items-center justify-center shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.22)] transition-transform duration-200">
            <Play className="w-6 h-6 fill-white text-white ml-0.5 drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]" />
          </div>
        </div>
      )}

      {/* Paused Dark Backdrop */}
      {!isPlaying && !isLoading && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-none z-10 transition-all" />
      )}

      {/* Autoplay Muted Notification Pill */}
      {isPlaying && isMuted && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (videoRef.current) {
              videoRef.current.muted = false;
              setIsMuted(false);
              try {
                localStorage.setItem("anime_player_muted", "false");
              } catch {}
            }
          }}
          className="absolute top-10 sm:top-14 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-auto cursor-pointer"
        >
          <div className="rounded-full bg-zinc-950/80 hover:bg-zinc-900 border border-white/15 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.22)] text-white text-xs px-3.5 py-1.5 flex items-center gap-2 font-medium select-none active:scale-95 transition-all group">
            <VolumeX className="w-3.5 h-3.5 text-amber-300 group-hover:scale-110 transition-transform animate-pulse" />
            <span>Click to unmute</span>
          </div>
        </div>
      )}

      {/* Stream Notification Toast */}
      {activeStreamToast !== null && (
        <div className="absolute top-10 sm:top-14 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-none max-w-[90%]">
          <div
            className={cn(
              "rounded-full bg-zinc-950/80 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.22)] px-3.5 py-1.5 flex items-center gap-2 font-medium text-xs select-none border transition-all",
              activeStreamToast.type === "refreshing" && "border-amber-500/40 text-amber-200",
              activeStreamToast.type === "success" && "border-emerald-500/40 text-emerald-200",
              activeStreamToast.type === "error" && "border-rose-500/40 text-rose-200",
              activeStreamToast.type === "info" && "border-sky-500/40 text-sky-200"
            )}
          >
            {activeStreamToast.type === "refreshing" && (
              <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
            )}
            {activeStreamToast.type === "success" && (
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <span className="truncate">{activeStreamToast.message}</span>
          </div>
        </div>
      )}

      {/* Auto-skip Notification Toast */}
      {autoSkipToast !== null && activeStreamToast === null && (
        <div className="absolute top-10 sm:top-14 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-none max-w-[90%]">
          <div className="rounded-full bg-zinc-950/65 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.22)] text-white text-xs px-3.5 py-1.5 flex items-center gap-2 font-medium select-none">
            <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300/30" />
            <span className="truncate">{autoSkipToast}</span>
          </div>
        </div>
      )}

      {/* Skip Intro Button Badge */}
      {isInsideIntro && (
        <div
          className={cn(
            "absolute right-3 sm:right-5 z-40 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            showControls ? "bottom-24 sm:bottom-28" : "bottom-6 sm:bottom-8"
          )}
        >
          <button
            type="button"
            onClick={handleSkipIntro}
            className="flex items-center gap-2 bg-zinc-950/65 hover:bg-zinc-900/80 text-white font-semibold text-xs px-3.5 py-2 rounded-full shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.22)] backdrop-blur-2xl backdrop-saturate-150 transition-transform active:scale-95 group cursor-pointer touch-manipulation select-none animate-in zoom-in-90 duration-300"
          >
            <FastForward className="w-4 h-4 fill-white text-white transition-transform group-hover:scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
            <span>Skip Intro ({formatSecondsToTime(skipTimes.intro?.end || 85)})</span>
            <kbd className="hidden sm:inline-block bg-white/15 text-white/90 px-1.5 py-0.5 rounded-full text-[10px] font-mono">
              S
            </kbd>
          </button>
        </div>
      )}

      {/* Skip Outro Button Badge */}
      {isInsideOutro && (
        <div
          className={cn(
            "absolute right-3 sm:right-5 z-40 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            showControls ? "bottom-24 sm:bottom-28" : "bottom-6 sm:bottom-8"
          )}
        >
          <button
            type="button"
            onClick={handleSkipOutro}
            className="flex items-center gap-2 bg-zinc-950/65 hover:bg-zinc-900/80 text-white font-semibold text-xs px-3.5 py-2 rounded-full shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.22)] backdrop-blur-2xl backdrop-saturate-150 transition-transform active:scale-95 group cursor-pointer touch-manipulation select-none animate-in zoom-in-90 duration-300"
          >
            <FastForward className="w-4 h-4 fill-white text-white transition-transform group-hover:scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
            <span>Skip Outro</span>
            <kbd className="hidden sm:inline-block bg-white/15 text-white/90 px-1.5 py-0.5 rounded-full text-[10px] font-mono">
              S
            </kbd>
          </button>
        </div>
      )}

      {/* Bottom Gradient Vignette */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 h-32 sm:h-40 bg-gradient-to-t from-black/50 via-black/15 to-transparent pointer-events-none transition-opacity duration-300 ease-out z-25",
          showControls && !fatalError ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Bottom Controls Bar */}
      {!fatalError && (
        <div
          data-controls-bar="true"
          onDoubleClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute bottom-0 left-0 right-0 px-3 py-2.5 sm:px-5 sm:py-4 z-30 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] font-product-sans",
            showControls ? "translate-y-0 pointer-events-auto" : "translate-y-[calc(100%+16px)] pointer-events-none"
          )}
        >
        {/* Timeline Seekbar with Apple Knob, Intro/Outro Markers & Hover Tooltip */}
        <div
          ref={timelineRef}
          onClick={handleTimelineClick}
          onMouseMove={handleTimelineMouseMove}
          onMouseLeave={() => setHoverTime(null)}
          onTouchStart={(e) => {
            handleUserActivity();
            handleTimelineTouch(e);
          }}
          onTouchMove={(e) => {
            handleUserActivity();
            handleTimelineTouch(e);
          }}
          className="relative group/timeline w-full h-5 sm:h-4 flex items-center cursor-pointer mb-2 sm:mb-2.5 touch-none select-none"
        >
          {/* Track Background */}
          <div className="relative w-full h-1 group-hover/timeline:h-1.5 bg-white/20 backdrop-blur-md rounded-full overflow-hidden transition-all duration-200 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
            {/* Buffered Progress */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-white/25 rounded-full transition-all"
              style={{ width: `${bufferedPercent}%` }}
            />

            {/* Played Progress (Clean Apple White with soft glow) */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-white rounded-full z-[5] transition-all shadow-[0_0_8px_rgba(255,255,255,0.7)]"
              style={{ width: `${progressPercent}%` }}
            />

            {/* Amber Intro Segment Marker */}
            {skipTimes.intro && duration > 0 && (
              <div
                className="absolute top-0 bottom-0 bg-amber-400 z-20 pointer-events-none ring-1 ring-amber-300/80 shadow-[0_0_10px_rgba(251,191,36,0.9)] transition-all rounded-full"
                style={{
                  left: `${(skipTimes.intro.start / duration) * 100}%`,
                  width: `${Math.max(0.8, ((skipTimes.intro.end - skipTimes.intro.start) / duration) * 100)}%`,
                }}
                title={`Intro: ${formatSecondsToTime(skipTimes.intro.start)} - ${formatSecondsToTime(skipTimes.intro.end)}`}
              />
            )}

            {/* Amber Outro Segment Marker */}
            {skipTimes.outro && duration > 0 && (
              <div
                className="absolute top-0 bottom-0 bg-amber-400 z-20 pointer-events-none ring-1 ring-amber-300/80 shadow-[0_0_10px_rgba(251,191,36,0.9)] transition-all rounded-full"
                style={{
                  left: `${(skipTimes.outro.start / duration) * 100}%`,
                  width: `${Math.max(0.8, ((skipTimes.outro.end - skipTimes.outro.start) / duration) * 100)}%`,
                }}
                title={`Outro: ${formatSecondsToTime(skipTimes.outro.start)} - ${formatSecondsToTime(skipTimes.outro.end)}`}
              />
            )}
          </div>

          {/* Scrubber Thumb: Circular Apple Knob */}
          <div
            className="absolute w-3 h-3 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.5)] border border-white/60 ring-2 ring-black/20 pointer-events-none -translate-x-1/2 transition-transform duration-150 z-30 scale-0 group-hover/timeline:scale-100"
            style={{ left: `${progressPercent}%` }}
          />

          {/* Hover Time Tooltip with Intro/Outro Label */}
          {hoverTime !== null && (() => {
            const isHoverIntro =
              skipTimes.intro &&
              hoverTime >= skipTimes.intro.start &&
              hoverTime <= skipTimes.intro.end;
            const isHoverOutro =
              skipTimes.outro &&
              hoverTime >= skipTimes.outro.start &&
              hoverTime <= skipTimes.outro.end;

            return (
              <div
                className={cn(
                  "absolute -top-9 px-2.5 py-1 rounded-full text-xs font-semibold pointer-events-none backdrop-blur-2xl backdrop-saturate-150 shadow-[0_8px_24px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.22)] flex items-center gap-1.5 z-40 select-none whitespace-nowrap leading-none transition-transform duration-75",
                  isHoverIntro || isHoverOutro ? "bg-zinc-950/80 text-amber-300" : "bg-zinc-950/80 text-white"
                )}
                style={{
                  left: `${hoverPosition}%`,
                  transform:
                    hoverPosition > 88
                      ? `translateX(-${50 + (hoverPosition - 88) * 4.16}%)`
                      : hoverPosition < 12
                      ? `translateX(-${Math.max(0, 50 - (12 - hoverPosition) * 4.16)}%)`
                      : "translateX(-50%)",
                }}
              >
                {isHoverIntro && (
                  <span className="font-semibold text-amber-400 inline-flex items-center gap-1 shrink-0">
                    <Sparkles className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                    <span>Intro</span>
                    <span className="opacity-60">•</span>
                  </span>
                )}
                {isHoverOutro && (
                  <span className="font-semibold text-amber-400 inline-flex items-center gap-1 shrink-0">
                    <Sparkles className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                    <span>Outro</span>
                    <span className="opacity-60">•</span>
                  </span>
                )}
                <span className="tracking-tight shrink-0">{formatSecondsToTime(hoverTime)}</span>
              </div>
            );
          })()}
        </div>

        {/* Control Capsules (Left & Right) */}
        <div className="flex items-center justify-between gap-2">
          {/* Left Controls: Unified Apple Liquid Glass Pill Container */}
          <div className="flex items-center h-10 sm:h-10.5 px-1.5 py-1 rounded-full bg-zinc-950/65 backdrop-blur-md backdrop-saturate-150 shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.22)] gap-1">
            {/* Play / Pause Button */}
            <button
              type="button"
              onClick={togglePlay}
              className="w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full inline-flex items-center justify-center text-white active:scale-95 transition-all cursor-pointer touch-manipulation group/btn shrink-0"
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-white text-white shrink-0 transition-all duration-200 group-hover/btn:drop-shadow-[0_0_8px_rgba(255,255,255,0.95)]" />
              ) : (
                <Play className="w-4 h-4 fill-white text-white ml-0.5 shrink-0 transition-all duration-200 group-hover/btn:drop-shadow-[0_0_8px_rgba(255,255,255,0.95)]" />
              )}
            </button>

            {/* Rewind 10s Button with SVG "10" */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSeekRelative(-10);
              }}
              className="hidden sm:inline-flex landscape:inline-flex w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full items-center justify-center text-zinc-300 hover:text-white active:scale-95 transition-all cursor-pointer touch-manipulation shrink-0 group/btn"
              title="Rewind 10s (←)"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4 shrink-0 transition-all duration-200 group-hover/btn:drop-shadow-[0_0_8px_rgba(255,255,255,0.95)]"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <text
                  x="12"
                  y="15.5"
                  textAnchor="middle"
                  fontSize="8"
                  stroke="none"
                  fill="currentColor"
                  fontWeight="bold"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  10
                </text>
              </svg>
            </button>

            {/* Skip / Forward 10s Button with SVG "10" */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSeekRelative(10);
              }}
              className="hidden sm:inline-flex landscape:inline-flex w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full items-center justify-center text-zinc-300 hover:text-white active:scale-95 transition-all cursor-pointer touch-manipulation shrink-0 group/btn"
              title="Forward 10s (→)"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4 shrink-0 transition-all duration-200 group-hover/btn:drop-shadow-[0_0_8px_rgba(255,255,255,0.95)]"
              >
                <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <text
                  x="12"
                  y="15.5"
                  textAnchor="middle"
                  fontSize="8"
                  stroke="none"
                  fill="currentColor"
                  fontWeight="bold"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  10
                </text>
              </svg>
            </button>

            {/* Volume Control Group */}
            <div className="relative hidden sm:inline-flex items-center group/volume transition-all duration-300 ease-out shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                className="w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full inline-flex items-center justify-center text-zinc-300 hover:text-white active:scale-95 transition-all cursor-pointer touch-manipulation shrink-0 group/btn"
                title={isMuted || volume === 0 ? "Unmute (M)" : "Mute (M)"}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-400 shrink-0 group-hover/btn:drop-shadow-[0_0_8px_rgba(248,113,113,0.9)]" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-4 h-4 text-white shrink-0 group-hover/btn:drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
                ) : (
                  <Volume2 className="w-4 h-4 text-white shrink-0 group-hover/btn:drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
                )}
              </button>

              <div className="w-0 opacity-0 group-hover/volume:w-16 sm:group-hover/volume:w-20 group-hover/volume:opacity-100 group-hover/volume:px-2 transition-all duration-300 ease-out flex items-center overflow-hidden h-8">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="w-full h-1 bg-white/25 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.6)] [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                />
              </div>
            </div>

            {/* Timestamp Display */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleTimeDisplay();
              }}
              className="px-2 py-0.5 text-xs font-semibold text-white/90 hover:text-white hover:bg-white/10 active:scale-95 rounded-full inline-flex items-center gap-1.5 select-none shrink-0 transition-all cursor-pointer touch-manipulation"
              title={showRemainingTime ? "Show elapsed time" : "Show remaining time"}
            >
              <span className="tracking-tight tabular-nums">
                {showRemainingTime
                  ? `-${formatSecondsToTime(Math.max(0, duration - currentTime))}`
                  : formatSecondsToTime(currentTime)}
              </span>
              <span className="text-white/40">/</span>
              <span className="text-white/70 tracking-tight tabular-nums">{formatSecondsToTime(duration)}</span>
            </button>
          </div>

          {/* Right Controls: Unified Apple Liquid Glass Pill Container */}
          <div className="flex items-center h-10 sm:h-10.5 px-1.5 py-1 rounded-full bg-zinc-950/65 backdrop-blur-md backdrop-saturate-150 shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.22)] gap-1">
            {/* Picture in Picture */}
            <button
              type="button"
              onClick={togglePiP}
              className="w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full inline-flex items-center justify-center text-zinc-400 hover:text-white active:scale-95 transition-all cursor-pointer touch-manipulation group/btn shrink-0"
              title="Picture in Picture"
            >
              <PictureInPicture2 className="w-4 h-4 shrink-0 transition-all duration-200 group-hover/btn:drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
            </button>

            {/* Subtitles Toggle Button */}
            <button
              type="button"
              onClick={toggleSubtitles}
              className="w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full inline-flex items-center justify-center active:scale-95 transition-all cursor-pointer touch-manipulation group/btn shrink-0"
              title={activeSubtitleTrack !== null ? "Turn off subtitles (C)" : "Turn on subtitles (C)"}
            >
              <Captions
                className={cn(
                  "w-4 h-4 shrink-0 transition-all duration-200",
                  activeSubtitleTrack !== null
                    ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.95)]"
                    : "text-zinc-400 group-hover/btn:text-white group-hover/btn:drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]"
                )}
              />
            </button>

            {/* Theater Mode Toggle */}
            {!isFullscreen && (
              <button
                type="button"
                onClick={() => setIsTheater(!isTheater)}
                className="hidden md:inline-flex w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full items-center justify-center active:scale-95 transition-all cursor-pointer touch-manipulation group/btn shrink-0"
                title="Theater mode (T)"
              >
                <Tv
                  className={cn(
                    "w-3.5 h-3.5 shrink-0 -translate-y-[1px] transition-all duration-200",
                    isTheater
                      ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.95)]"
                      : "text-zinc-400 group-hover/btn:text-white group-hover/btn:drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]"
                  )}
                />
              </button>
            )}

            {/* Settings Toggle Button */}
            <button
              ref={settingsButtonRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowSettingsMenu((prev) => {
                  const next = !prev;
                  if (next) {
                    setSettingsSubMenu("main");
                  }
                  return next;
                });
              }}
              className="w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full inline-flex items-center justify-center active:scale-95 transition-all cursor-pointer touch-manipulation group/btn shrink-0"
              title="Settings"
            >
              <Settings
                className={cn(
                  "w-4 h-4 shrink-0 transition-all duration-300",
                  showSettingsMenu
                    ? "text-white rotate-45 drop-shadow-[0_0_8px_rgba(255,255,255,0.95)]"
                    : "text-zinc-400 group-hover/btn:text-white group-hover/btn:drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]"
                )}
              />
            </button>

            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full inline-flex items-center justify-center text-zinc-400 hover:text-white active:scale-95 transition-all cursor-pointer touch-manipulation group/btn shrink-0"
              title={isFullscreen ? "Exit full screen (F)" : "Full screen (F)"}
            >
              <Minimize
                className={cn(
                  "w-4 h-4 shrink-0 transition-all duration-200 group-hover/btn:drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]",
                  !isFullscreen && "hidden"
                )}
              />
              <Maximize
                className={cn(
                  "w-4 h-4 shrink-0 transition-all duration-200 group-hover/btn:drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]",
                  isFullscreen && "hidden"
                )}
              />
            </button>
          </div>
        </div>

        {/* Settings Modal Card with Apple Liquid Glass styling, smooth slide-in and dynamic fluid height transition */}
        <div
          ref={settingsMenuRef}
          style={{
            height: menuHeight ? `${menuHeight}px` : undefined,
            maxHeight: menuMaxHeight ? `${menuMaxHeight}px` : undefined,
          }}
          className={cn(
            "absolute bottom-[78px] sm:bottom-[86px] right-3 sm:right-4 rounded-2xl bg-zinc-950/65 backdrop-blur-md backdrop-saturate-150 shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.22)] z-50 text-white transition-[height,transform,width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] origin-bottom-right overflow-hidden overscroll-contain",
            settingsSubMenu === "audio-subtitles" ? "w-[290px] sm:w-[325px]" : "w-[260px] sm:w-[285px]",
            menuMaxHeight && menuHeight && menuHeight > menuMaxHeight && "overflow-y-auto player-menu-scrollbar",
            showSettingsMenu ? "scale-100 translate-y-0 pointer-events-auto" : "scale-0 translate-y-4 pointer-events-none"
          )}
        >
          <div ref={settingsContentRef} className="p-2 overflow-hidden">
            {/* Main Settings Menu */}
            {settingsSubMenu === "main" && (
              <div className="space-y-0.5 animate-in fade-in duration-200">
                {/* 1. Server Route */}
                <button
                  type="button"
                  onClick={() => setSettingsSubMenu("server")}
                  className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-white/[0.08] flex items-center justify-center text-zinc-300 group-hover:text-white transition-colors">
                      <Server className="w-3 h-3" />
                    </div>
                    <span className="text-[11px] font-semibold text-white">Server Route</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-zinc-400 group-hover:text-zinc-200">
                    <span className="truncate max-w-[120px] font-medium">
                      {activeServerLabel}
                    </span>
                    <ChevronRight className="w-3 h-3 text-zinc-400" />
                  </div>
                </button>

                {/* 2. Audio & Subtitles */}
                <button
                  type="button"
                  onClick={() => setSettingsSubMenu("audio-subtitles")}
                  className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-white/[0.08] flex items-center justify-center text-zinc-300 group-hover:text-white transition-colors">
                      <Headphones className="w-3 h-3" />
                    </div>
                    <span className="text-[11px] font-semibold text-white">Audio & Subtitles</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-zinc-400 group-hover:text-zinc-200">
                    <span className="truncate max-w-[110px] font-medium">
                      {activeAudioLabel} • {activeSubLabel}
                    </span>
                    <ChevronRight className="w-3 h-3 text-zinc-400" />
                  </div>
                </button>

                {/* 3. Quality */}
                <button
                  type="button"
                  onClick={() => setSettingsSubMenu("quality")}
                  className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-white/[0.08] flex items-center justify-center text-zinc-300 group-hover:text-white transition-colors text-[9px] font-bold font-mono">
                      HD
                    </div>
                    <span className="text-[11px] font-semibold text-white">Quality</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-zinc-400 group-hover:text-zinc-200">
                    <span className="truncate max-w-[95px] font-medium">{currentQualityLabel}</span>
                    <ChevronRight className="w-3 h-3 text-zinc-400" />
                  </div>
                </button>

                {/* 4. Preferences (Speed, Volume Boost, Auto Skip) */}
                <button
                  type="button"
                  onClick={() => setSettingsSubMenu("preferences")}
                  className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-white/[0.08] flex items-center justify-center text-zinc-300 group-hover:text-white transition-colors">
                      <Sliders className="w-3 h-3" />
                    </div>
                    <span className="text-[11px] font-semibold text-white">Preferences</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-zinc-400 group-hover:text-zinc-200">
                    <span className="font-medium">
                      {playbackSpeed}x • {Math.round(volumeBoost * 100)}%
                    </span>
                    <ChevronRight className="w-3 h-3 text-zinc-400" />
                  </div>
                </button>
              </div>
            )}

            {/* Sub-menu: Server Route */}
            {settingsSubMenu === "server" && (
              <div className="animate-in fade-in duration-200">
                <div className="flex items-center gap-2 pb-2 border-b border-white/10 mb-1.5">
                  <button
                    type="button"
                    onClick={() => setSettingsSubMenu("main")}
                    className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 -translate-x-[0.5px]" />
                  </button>
                  <span className="text-[11px] font-semibold text-white">
                    {isAnimeContent ? "Server Route" : "Stream Servers"}
                  </span>
                </div>

                {isAnimeContent ? (
                  <div className="space-y-0.5">
                    {/* Sub Button */}
                    <button
                      type="button"
                      onClick={() => setSettingsSubMenu("server-sub")}
                      className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors group cursor-pointer text-left"
                    >
                      <span className="text-[11px] font-semibold text-white">Sub</span>
                      <div className="flex items-center gap-1 text-[11px] text-zinc-400 group-hover:text-zinc-200">
                        <span>
                          {nativeSubSources.length} {nativeSubSources.length === 1 ? "server" : "servers"}
                        </span>
                        <ChevronRight className="w-3 h-3 text-zinc-400" />
                      </div>
                    </button>

                    {/* Dub Button */}
                    <button
                      type="button"
                      onClick={() => setSettingsSubMenu("server-dub")}
                      disabled={nativeDubSources.length === 0}
                      className={cn(
                        "w-full flex items-center justify-between p-1.5 rounded-xl transition-colors group text-left",
                        nativeDubSources.length === 0
                          ? "opacity-40 cursor-not-allowed"
                          : "hover:bg-white/[0.08] active:bg-white/[0.12] cursor-pointer"
                      )}
                    >
                      <span className="text-[11px] font-semibold text-white">Dub</span>
                      <div className="flex items-center gap-1 text-[11px] text-zinc-400 group-hover:text-zinc-200">
                        <span>
                          {nativeDubSources.length} {nativeDubSources.length === 1 ? "server" : "servers"}
                        </span>
                        <ChevronRight className="w-3 h-3 text-zinc-400" />
                      </div>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-0.5 max-h-52 overflow-y-auto overflow-x-hidden pr-1.5 player-menu-scrollbar">
                    {vidlyServers.length === 0 ? (
                      <div className="py-4 px-2 text-center text-zinc-400 text-[11px]">
                        No servers available
                      </div>
                    ) : (
                      vidlyServers.map((src) => {
                        const isSelected = (activeSourceId || currentSource?.id) === src.id;
                        const name = formatServerRouteName(src);
                        const metaTag = formatServerRouteAudio(src);
                        return isSelected ? (
                          <div
                            key={src.id}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/10 text-[11px] font-semibold text-white shadow-sm"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Check className="w-3.5 h-3.5 text-white shrink-0" />
                              <span className="truncate">{name}</span>
                            </div>
                            <span className="text-[10px] font-medium text-zinc-400 shrink-0 ml-2">
                              {metaTag}
                            </span>
                          </div>
                        ) : (
                          <button
                            key={src.id}
                            type="button"
                            onClick={() => handleSelectSource(src)}
                            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/5 text-[11px] text-zinc-400 hover:text-white transition-colors pl-7 text-left cursor-pointer group"
                          >
                            <span className="truncate min-w-0">{name}</span>
                            <span className="text-[10px] font-medium text-zinc-500 group-hover:text-zinc-400 shrink-0 ml-2">
                              {metaTag}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Sub-menu: Sub Servers */}
            {settingsSubMenu === "server-sub" && (
              <div className="animate-in fade-in slide-in-from-right-3 duration-200">
                <div className="flex items-center gap-2 pb-2 border-b border-white/10 mb-1.5">
                  <button
                    type="button"
                    onClick={() => setSettingsSubMenu("server")}
                    className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 -translate-x-[0.5px]" />
                  </button>
                  <span className="text-[11px] font-semibold text-white">Sub Servers</span>
                </div>

                <div className="space-y-0.5 max-h-52 overflow-y-auto overflow-x-hidden pr-1.5 player-menu-scrollbar">
                  {nativeSubSources.length === 0 ? (
                    <div className="py-4 px-2 text-center text-zinc-400 text-[11px]">
                      No Sub servers available
                    </div>
                  ) : (
                    nativeSubSources.map((src) => {
                      const isSelected =
                        (activeSourceId || currentSource?.id) === src.id ||
                        (Boolean(currentSource) &&
                          currentSource!.type === src.type &&
                          getSourceProvider(currentSource!).toLowerCase() === getSourceProvider(src).toLowerCase());
                      const name = formatServerRouteName(src);
                      const audio = "Sub";
                      return isSelected ? (
                        <div
                          key={src.id}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/10 text-[11px] font-semibold text-white shadow-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Check className="w-3.5 h-3.5 text-white shrink-0" />
                            <span className="truncate">{name}</span>
                          </div>
                          <span className="text-[10px] font-medium text-zinc-400 shrink-0 ml-2">
                            {audio}
                          </span>
                        </div>
                      ) : (
                        <button
                          key={src.id}
                          type="button"
                          onClick={() => handleSelectSource(src)}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/5 text-[11px] text-zinc-400 hover:text-white transition-colors pl-7 text-left cursor-pointer group"
                        >
                          <span className="truncate min-w-0">{name}</span>
                          <span className="text-[10px] font-medium text-zinc-500 group-hover:text-zinc-400 shrink-0 ml-2">
                            {audio}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Sub-menu: Dub Servers */}
            {settingsSubMenu === "server-dub" && (
              <div className="animate-in fade-in slide-in-from-right-3 duration-200">
                <div className="flex items-center gap-2 pb-2 border-b border-white/10 mb-1.5">
                  <button
                    type="button"
                    onClick={() => setSettingsSubMenu("server")}
                    className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 -translate-x-[0.5px]" />
                  </button>
                  <span className="text-[11px] font-semibold text-white">Dub Servers</span>
                </div>

                <div className="space-y-0.5 max-h-52 overflow-y-auto overflow-x-hidden pr-1.5 player-menu-scrollbar">
                  {nativeDubSources.length === 0 ? (
                    <div className="py-4 px-2 text-center text-zinc-400 text-[11px]">
                      No Dub servers available for this episode
                    </div>
                  ) : (
                    nativeDubSources.map((src) => {
                      const isSelected =
                        (activeSourceId || currentSource?.id) === src.id ||
                        (Boolean(currentSource) &&
                          currentSource!.type === src.type &&
                          getSourceProvider(currentSource!).toLowerCase() === getSourceProvider(src).toLowerCase());
                      const name = formatServerRouteName(src);
                      const audio = "English Dub";
                      return isSelected ? (
                        <div
                          key={src.id}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/10 text-[11px] font-semibold text-white shadow-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Check className="w-3.5 h-3.5 text-white shrink-0" />
                            <span className="truncate">{name}</span>
                          </div>
                          <span className="text-[10px] font-medium text-zinc-400 shrink-0 ml-2">
                            {audio}
                          </span>
                        </div>
                      ) : (
                        <button
                          key={src.id}
                          type="button"
                          onClick={() => handleSelectSource(src)}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/5 text-[11px] text-zinc-400 hover:text-white transition-colors pl-7 text-left cursor-pointer group"
                        >
                          <span className="truncate min-w-0">{name}</span>
                          <span className="text-[10px] font-medium text-zinc-500 group-hover:text-zinc-400 shrink-0 ml-2">
                            {audio}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Sub-menu: Audio and Subtitles */}
            {settingsSubMenu === "audio-subtitles" && (
              <div className="animate-in fade-in slide-in-from-right-3 duration-200">
                <div className="flex items-center gap-2 pb-2 border-b border-white/10 mb-1.5">
                  <button
                    type="button"
                    onClick={() => setSettingsSubMenu("main")}
                    className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 -translate-x-[0.5px]" />
                  </button>
                  <span className="text-[11px] font-semibold text-white">Audio & Subtitles</span>
                </div>

                {/* Two-column layout: Left = Audio, Right = Subtitles */}
                <div className="grid grid-cols-2 divide-x divide-white/10 mb-1">
                  {/* Left Column: Audio Selection */}
                  <div className="flex flex-col min-w-0 pr-1.5">
                    <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 select-none">
                      Audio
                    </div>
                    <div className="max-h-[170px] overflow-y-auto overscroll-contain player-menu-scrollbar space-y-0.5 pr-0.5">
                      {combinedAudioTracks.map((audio) => {
                        const normActiveAudio = cleanAudioParam(activeAudioTrack);
                        const isSelected =
                          activeAudioTrack === audio.id ||
                          activeAudioTrack === audio.lang ||
                          activeAudioTrack.toLowerCase() === audio.name.toLowerCase() ||
                          normActiveAudio.code === audio.id;
                        return (
                          <button
                            key={audio.id}
                            type="button"
                            onClick={() => handleSelectAudioTrack(audio)}
                            className={cn(
                              "w-full flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] transition-colors text-left cursor-pointer group",
                              isSelected
                                ? "bg-white/10 border border-white/20 text-white font-medium shadow-xs"
                                : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
                            )}
                          >
                            {isSelected ? (
                              <Check className="w-3 h-3 text-white shrink-0" />
                            ) : (
                              <span className="w-3 shrink-0" />
                            )}
                            <LanguageFlag countryCode={audio.countryCode} flag={audio.flag} name={audio.name} />
                            <span className="truncate">{audio.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Column: Subtitles Selection */}
                  <div className="flex flex-col min-w-0 pl-1.5">
                    <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 select-none">
                      Subtitles
                    </div>
                    <div className="max-h-[170px] overflow-y-auto overscroll-contain player-menu-scrollbar space-y-0.5 pr-0.5">
                      {/* Off Option */}
                      <button
                        type="button"
                        onClick={() => setActiveSubtitleTrack(null)}
                        className={cn(
                          "w-full flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] transition-colors text-left cursor-pointer group",
                          activeSubtitleTrack === null
                            ? "bg-white/10 border border-white/20 text-white font-medium shadow-xs"
                            : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
                        )}
                      >
                        {activeSubtitleTrack === null ? (
                          <Check className="w-3 h-3 text-white shrink-0" />
                        ) : (
                          <span className="w-3 shrink-0" />
                        )}
                        <span className="w-[15px] h-[10px] flex items-center justify-center text-[9px] text-zinc-400 font-mono shrink-0 select-none">✕</span>
                        <span className="truncate">Off</span>
                      </button>

                      {/* Subtitle Tracks (1 per language) */}
                      {allAvailableSubtitles.map((sub, idx) => {
                        const isSelected = activeSubtitleTrack === (sub.id || sub.url);
                        const norm = normalizeLanguage(sub.language, sub.label);
                        const cCode = sub.countryCode || norm.countryCode;
                        const flag = sub.flag || norm.flag;
                        return (
                          <button
                            key={sub.id || idx}
                            type="button"
                            onClick={() => setActiveSubtitleTrack(sub.id || sub.url)}
                            className={cn(
                              "w-full flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] transition-colors text-left cursor-pointer group",
                              isSelected
                                ? "bg-white/10 border border-white/20 text-white font-medium shadow-xs"
                                : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
                            )}
                          >
                            {isSelected ? (
                              <Check className="w-3 h-3 text-white shrink-0" />
                            ) : (
                              <span className="w-3 shrink-0" />
                            )}
                            <LanguageFlag countryCode={cCode} flag={flag} name={sub.label} />
                            <span className="truncate">{sub.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Subtitle style link at bottom (Cleanly separated from the columns above) */}
                <div className="border-t border-white/10 mt-2 pt-1.5">
                  <button
                    type="button"
                    onClick={() => setSettingsSubMenu("subtitle-style")}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] text-zinc-300 hover:text-white hover:bg-white/[0.08] rounded-xl transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      <Settings className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-colors" />
                      <span>Subtitle style...</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-colors" />
                  </button>
                </div>
              </div>
            )}

            {/* Sub-menu: Subtitle Style */}
            {settingsSubMenu === "subtitle-style" && (
              <div className="animate-in fade-in slide-in-from-right-3 duration-200">
                <div className="flex items-center gap-2 pb-2 border-b border-white/10 mb-2">
                  <button
                    type="button"
                    onClick={() => setSettingsSubMenu("audio-subtitles")}
                    className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 -translate-x-[0.5px]" />
                  </button>
                  <span className="text-[11px] font-semibold text-white">Subtitle Style</span>
                </div>

                <div className="space-y-2.5 max-h-[168px] overflow-y-auto pr-1.5 text-[11px] player-menu-scrollbar overscroll-contain">
                  {/* Mini Live Preview */}
                  <div className="relative rounded-xl border border-white/15 bg-zinc-950 p-2 text-center overflow-hidden flex items-center justify-center min-h-[46px] shadow-inner">
                    <div className="absolute inset-0 bg-[radial-gradient(#444_1px,transparent_1px)] [background-size:12px_12px] opacity-35" />
                    <span
                      className={cn(
                        "relative inline-block px-2.5 py-0.5 rounded-md transition-all select-none text-center",
                        (subtitleStyles.background.includes("0.4") || subtitleStyles.background === "blur") &&
                          "backdrop-blur-md bg-black/50 border border-white/10"
                      )}
                      style={{
                        fontSize:
                          subtitleStyles.fontSize === "sm"
                            ? "11px"
                            : subtitleStyles.fontSize === "lg"
                            ? "15px"
                            : subtitleStyles.fontSize === "xl"
                            ? "17px"
                            : subtitleStyles.fontSize === "2xl"
                            ? "19px"
                            : "13px",
                        fontFamily: getSubtitleFontFamily(),
                        fontWeight: subtitleStyles.fontWeight === "normal" ? "normal" : "bold",
                        color: subtitleStyles.color,
                        backgroundColor:
                          subtitleStyles.background.includes("0.4") || subtitleStyles.background === "blur"
                            ? undefined
                            : subtitleStyles.background === "solid" || subtitleStyles.background === "rgba(0, 0, 0, 0.85)"
                            ? "rgba(0, 0, 0, 0.85)"
                            : subtitleStyles.background,
                        ...getSubtitleOutlineStyles(),
                      }}
                    >
                      Sample Subtitles
                    </span>
                  </div>

                  {/* Font Family */}
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider block mb-1">
                      Font
                    </span>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { label: "Sans", value: "sans", font: "sans-serif" },
                        { label: "Anime", value: "anime", font: '"Trebuchet MS", sans-serif' },
                        { label: "Serif", value: "serif", font: "Georgia, serif" },
                        { label: "Mono", value: "mono", font: "monospace" },
                      ].map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => {
                            const updated = { ...subtitleStyles, fontFamily: f.value as any };
                            setSubtitleStyles(updated);
                            try {
                              localStorage.setItem("anime_subtitle_styles", JSON.stringify(updated));
                            } catch {}
                          }}
                          style={{ fontFamily: f.font }}
                          className={cn(
                            "py-1 px-1 rounded-lg text-[10px] font-medium transition-all border text-center cursor-pointer",
                            (subtitleStyles.fontFamily || "sans") === f.value
                              ? "bg-white/20 border-white/30 text-white shadow-sm font-bold"
                              : "bg-white/[0.04] border-white/10 text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                          )}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Size */}
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider block mb-1">
                      Font Size
                    </span>
                    <div className="grid grid-cols-4 gap-1">
                      {(
                        [
                          { label: "S", value: "sm" },
                          { label: "M", value: "base" },
                          { label: "L", value: "lg" },
                          { label: "XL", value: "xl" },
                        ] as const
                      ).map((size) => (
                        <button
                          key={size.value}
                          type="button"
                          onClick={() => {
                            const updated = { ...subtitleStyles, fontSize: size.value };
                            setSubtitleStyles(updated);
                            try {
                              localStorage.setItem("anime_subtitle_styles", JSON.stringify(updated));
                            } catch {}
                          }}
                          className={cn(
                            "py-1 rounded-lg text-[10px] font-semibold transition-all border text-center cursor-pointer",
                            subtitleStyles.fontSize === size.value
                              ? "bg-white/20 border-white/30 text-white shadow-sm"
                              : "bg-white/[0.04] border-white/10 text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                          )}
                        >
                          {size.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Text Color */}
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider block mb-1">
                      Text Color
                    </span>
                    <div className="flex gap-1.5">
                      {[
                        { label: "White", value: "#ffffff" },
                        { label: "Yellow", value: "#facc15" },
                        { label: "Cyan", value: "#38bdf8" },
                        { label: "Lime", value: "#4ade80" },
                        { label: "Pink", value: "#f472b6" },
                      ].map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          title={c.label}
                          onClick={() => {
                            const updated = { ...subtitleStyles, color: c.value };
                            setSubtitleStyles(updated);
                            try {
                              localStorage.setItem("anime_subtitle_styles", JSON.stringify(updated));
                            } catch {}
                          }}
                          className={cn(
                            "flex-1 h-6 rounded-lg flex items-center justify-center border transition-all cursor-pointer",
                            subtitleStyles.color === c.value
                              ? "bg-white/25 border-white/40 ring-1 ring-white/50 shadow-sm"
                              : "bg-white/[0.04] border-white/10 hover:bg-white/[0.08]"
                          )}
                        >
                          <span
                            className="w-3 h-3 rounded-full border border-black/40 shadow-sm"
                            style={{ backgroundColor: c.value }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Background */}
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider block mb-1">
                      Background Box
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {[
                        { label: "None", value: "transparent" },
                        { label: "Blur", value: "rgba(0, 0, 0, 0.4)" },
                        { label: "Solid", value: "rgba(0, 0, 0, 0.85)" },
                      ].map((bg) => (
                        <button
                          key={bg.value}
                          type="button"
                          onClick={() => {
                            const updated = { ...subtitleStyles, background: bg.value };
                            setSubtitleStyles(updated);
                            try {
                              localStorage.setItem("anime_subtitle_styles", JSON.stringify(updated));
                            } catch {}
                          }}
                          className={cn(
                            "py-1 px-1 rounded-lg text-[10px] font-medium transition-all border text-center cursor-pointer",
                            subtitleStyles.background === bg.value
                              ? "bg-white/20 border-white/30 text-white shadow-sm font-semibold"
                              : "bg-white/[0.04] border-white/10 text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                          )}
                        >
                          {bg.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Outline / Shadow */}
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider block mb-1">
                      Outline / Shadow
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {[
                        { label: "Thick", value: "thick" },
                        { label: "Thin", value: "thin" },
                        { label: "Shadow", value: "none" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            const updated = {
                              ...subtitleStyles,
                              outline: opt.value as any,
                              shadow: true,
                            };
                            setSubtitleStyles(updated);
                            try {
                              localStorage.setItem("anime_subtitle_styles", JSON.stringify(updated));
                            } catch {}
                          }}
                          className={cn(
                            "py-1 px-1 rounded-lg text-[10px] font-medium transition-all border text-center cursor-pointer",
                            (subtitleStyles.outline || "thick") === opt.value
                              ? "bg-white/20 border-white/30 text-white shadow-sm"
                              : "bg-white/[0.04] border-white/10 text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-menu: Quality */}
            {settingsSubMenu === "quality" && (
              <div className="animate-in fade-in slide-in-from-right-3 duration-200">
                <div className="flex items-center gap-2 pb-2 border-b border-white/10 mb-1.5">
                  <button
                    type="button"
                    onClick={() => setSettingsSubMenu("main")}
                    className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 -translate-x-[0.5px]" />
                  </button>
                  <span className="text-[11px] font-semibold text-white">Quality</span>
                </div>

                <div className="space-y-0.5 max-h-52 overflow-y-auto pr-1.5 player-menu-scrollbar">
                  {/* Auto Quality Option */}
                  {selectedHlsLevel === -1 ? (
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/10 text-[11px] font-semibold text-white shadow-sm">
                      <div className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-white shrink-0" />
                        <span>Auto</span>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectQuality(-1);
                        setShowSettingsMenu(false);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/5 text-[11px] text-zinc-400 hover:text-white transition-colors pl-7 text-left cursor-pointer"
                    >
                      <span>Auto</span>
                    </button>
                  )}

                  {/* Quality levels sorted descending (1080p, 720p, 480p, 360p) */}
                  {sortedLevels.map((lvl) => {
                    const isSelected = selectedHlsLevel === lvl.index;
                    return isSelected ? (
                      <div
                        key={lvl.index}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/10 text-[11px] font-semibold text-white shadow-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-white shrink-0" />
                          <span>{lvl.name}</span>
                        </div>
                      </div>
                    ) : (
                      <button
                        key={lvl.index}
                        type="button"
                        onClick={() => {
                          handleSelectQuality(lvl.index);
                          setShowSettingsMenu(false);
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/5 text-[11px] text-zinc-400 hover:text-white transition-colors pl-7 text-left cursor-pointer"
                      >
                        <span>{lvl.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sub-menu: Preferences (Speed, Volume Boost, Auto Skip in ONE unified setting) */}
            {settingsSubMenu === "preferences" && (
              <div className="animate-in fade-in slide-in-from-right-3 duration-200">
                <div className="flex items-center gap-2 pb-2 border-b border-white/10 mb-2">
                  <button
                    type="button"
                    onClick={() => setSettingsSubMenu("main")}
                    className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 -translate-x-[0.5px]" />
                  </button>
                  <span className="text-[11px] font-semibold text-white">Preferences</span>
                </div>

                <div className="space-y-3 max-h-[300px] overflow-y-auto px-1 py-0.5 text-[11px] player-menu-scrollbar">
                  {/* 1. Playback Speed */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-zinc-300">
                      <span className="font-semibold text-[11px] flex items-center gap-1.5">
                        <PlayCircle className="w-3.5 h-3.5 text-zinc-400" />
                        Playback Speed
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono font-medium">
                        {playbackSpeed === 1 ? "Normal" : `${playbackSpeed}x`}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 pt-0.5">
                      {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((spd) => {
                        const isSelected = Math.abs(playbackSpeed - spd) < 0.01;
                        return (
                          <button
                            key={spd}
                            type="button"
                            onClick={() => {
                              if (videoRef.current) videoRef.current.playbackRate = spd;
                              setPlaybackSpeed(spd);
                            }}
                            className={cn(
                              "py-1 rounded-md text-[10px] font-medium transition-all text-center cursor-pointer",
                              isSelected
                                ? "bg-white text-black font-bold shadow-sm"
                                : "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12] hover:text-white"
                            )}
                          >
                            {spd}x
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="h-[1px] bg-white/10" />

                  {/* 2. Volume Boost */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-zinc-300">
                      <span className="font-semibold text-[11px] flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                        Volume Boost
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono font-medium">
                        {Math.round(volumeBoost * 100)}%
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-1 pt-0.5">
                      {[1.0, 1.25, 1.5, 1.75, 2.0].map((bst) => {
                        const isSelected = Math.abs(volumeBoost - bst) < 0.01;
                        return (
                          <button
                            key={bst}
                            type="button"
                            onClick={() => handleVolumeBoost(bst)}
                            className={cn(
                              "py-1 rounded-md text-[10px] font-medium transition-all text-center cursor-pointer",
                              isSelected
                                ? "bg-white text-black font-bold shadow-sm"
                                : "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12] hover:text-white"
                            )}
                          >
                            {Math.round(bst * 100)}%
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="h-[1px] bg-white/10" />

                  {/* 3. Auto Skip */}
                  <div className="space-y-2">
                    <span className="font-semibold text-[11px] text-zinc-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
                      Auto Skip
                    </span>

                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white/[0.04]">
                      <span className="text-[11px] font-medium text-white">Auto Skip Intro</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoSkipState}
                        onClick={() => setAutoSkipState((p) => !p)}
                        className={cn(
                          "relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer",
                          autoSkipState ? "bg-white" : "bg-[#202020] border border-white/[0.08]"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-2.5 w-2.5 rounded-full shadow-xs transition-transform duration-200",
                            autoSkipState ? "translate-x-3 bg-black" : "translate-x-0.5 bg-zinc-500"
                          )}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white/[0.04]">
                      <span className="text-[11px] font-medium text-white">Auto Skip Outro</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoSkipOutroState}
                        onClick={() => setAutoSkipOutroState((p) => !p)}
                        className={cn(
                          "relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer",
                          autoSkipOutroState ? "bg-white" : "bg-[#202020] border border-white/[0.08]"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-2.5 w-2.5 rounded-full shadow-xs transition-transform duration-200",
                            autoSkipOutroState ? "translate-x-3 bg-black" : "translate-x-0.5 bg-zinc-500"
                          )}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Subtitle Styling Dialog Modal */}
      <SubtitleSettingsDialog
        isOpen={showSubtitleStyling}
        onClose={() => setShowSubtitleStyling(false)}
        styles={subtitleStyles}
        onStylesChange={(updated) => {
          setSubtitleStyles(updated);
          try {
            localStorage.setItem("anime_subtitle_styles", JSON.stringify(updated));
          } catch {}
        }}
      />
    </div>
  );
}
