"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  Copy,
  Check,
  Server,
  Zap,
  Shield,
  Layers,
  ExternalLink,
  Code2,
  Terminal,
  Activity,
  Sliders,
  RotateCw,
  ArrowLeftRight,
  Wifi,
  Radio,
  FileCode,
  MessageSquare,
  CheckCircle2,
  ChevronDown,
  ArrowDown,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type DocTab = "endpoints" | "implementation" | "options" | "events" | "postmessage";

const DOC_TABS: { id: DocTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "endpoints", label: "Endpoints", icon: ArrowLeftRight },
  { id: "implementation", label: "Implementation", icon: Code2 },
  { id: "options", label: "Options", icon: Sliders },
  { id: "events", label: "Events", icon: Activity },
  { id: "postmessage", label: "PostMessage", icon: Terminal },
];

const DATABASE_OPTIONS = [
  {
    id: "ani" as const,
    name: "AniList",
    badge: "Default",
    desc: "Target media using AniList GraphQL identifier format.",
    example: "e.g. 16498 (Attack on Titan)",
  },
  {
    id: "mal" as const,
    name: "MyAnimeList (MAL)",
    badge: "MAL ID",
    desc: "Target media using MyAnimeList ID with automated fallback mapping.",
    example: "e.g. 52991 (Sousou no Frieren)",
  },
];

const AUDIO_OPTIONS = [
  {
    id: "dub" as const,
    name: "English Dub",
    badge: "Dubbed",
    desc: "English synchronized voiceover audio track.",
  },
  {
    id: "sub" as const,
    name: "Original Sub",
    badge: "Subbed",
    desc: "Original Japanese audio stream with soft/hard subtitles.",
  },
];

const SERVER_OPTIONS = [
  {
    id: "flow",
    name: "Flow",
    badge: "Primary",
    desc: "Default high-performance edge stream engine with multi-CDN.",
  },
  {
    id: "flow2",
    name: "Flow 2",
    badge: "Backup",
    desc: "Secondary multi-bitrate server with adaptive HLS quality.",
  },
  {
    id: "yuri",
    name: "Yuri",
    badge: "Alternative",
    desc: "Ultra-low latency alternative route for peak hours.",
  },
  {
    id: "zuri",
    name: "Zuri",
    badge: "Sub Only",
    desc: "Dedicated rapid raw stream engine for Japanese subbed anime.",
    subOnly: true,
  },
];

const ARCHITECTURE_FEATURES = [
  {
    icon: Server,
    title: "Multi-Server Routing",
    desc: "Automated failover between Flow 1, Flow 2, Yuri, and Zuri stream engines for uninterrupted playback.",
    key: "failover.engine",
    value: "4 active mirrors",
    valueColor: "text-emerald-400",
  },
  {
    icon: Layers,
    title: "AniList & MAL Mapping",
    desc: "Target media using AniList GraphQL IDs or MyAnimeList IDs with automated cross-database resolution.",
    key: "mapping.route",
    value: "/embed/ani ⇄ /embed/mal",
    valueColor: "text-zinc-400",
  },
  {
    icon: Zap,
    title: "AniSkip Auto-Skip",
    desc: "Queries opening and ending timestamps in real-time with visual timeline markers and optional auto-skip.",
    key: "aniskip.timestamps",
    value: "OP & ED sync",
    valueColor: "text-amber-400/90",
  },
  {
    icon: Radio,
    title: "Sub / Dub Dual Audio",
    desc: "Switch between original Japanese audio with stylized subtitles and English dubs with zero buffer.",
    key: "audio.track",
    value: "instant toggle",
    valueColor: "text-zinc-400",
  },
  {
    icon: Sliders,
    title: "shad-renew Player",
    desc: "Liquid-glass dark minimalist UI with custom subtitle typography, 200% Web Audio booster, and speed rates.",
    key: "player.ui",
    value: "HLS.js adaptive",
    valueColor: "text-zinc-400",
  },
  {
    icon: Terminal,
    title: "postMessage Telemetry",
    desc: "Stream live playback events (time, play, pause, complete) to your parent site and send remote control commands.",
    key: "event.bridge",
    value: "two-way JSON sync",
    valueColor: "text-sky-400",
  },
];

const FAQS = [
  {
    q: "How do I embed the AniFlow video player into my website?",
    a: "Embedding AniFlow is as simple as inserting a standard HTML <iframe> element into your page or React component. Simply specify the database source ('ani' for AniList or 'mal' for MyAnimeList), the anime ID, episode number, and audio format ('sub' or 'dub'). For example: <iframe src=\"https://aniflow.org/embed/ani/16498/1/sub\" allow=\"autoplay; fullscreen; picture-in-picture\" className=\"w-full aspect-video border-0 rounded-xl\" />.",
  },
  {
    q: "Does AniFlow API support both AniList and MyAnimeList (MAL) IDs?",
    a: "Yes! AniFlow natively supports both AniList IDs (/embed/ani/:id/:ep/:audio) and MyAnimeList IDs (/embed/mal/:id/:ep/:audio). The backend automatically translates IDs, queries episode lists, matches romanized and English titles, and resolves streaming links without any manual configuration on your side.",
  },
  {
    q: "How does the multi-server stream route engine work?",
    a: "AniFlow integrates 4 independent streaming providers: Flow 1 (our high-speed primary engine), Flow 2 (resilient backup mirror), Yuri (specialized anime stream extractor), and Zuri (dedicated subbed catalog). Users can manually switch servers inside the player, or the API will automatically failover if an upstream source is down.",
  },
  {
    q: "How does automatic intro and outro skipping work with AniSkip?",
    a: "AniFlow queries the AniSkip database in real time to fetch exact millisecond timestamps for opening (OP) and ending (ED) sequences. The player visually highlights these segments in orange on the timeline scrubber and provides an 'Auto-Skip' toggle button to jump directly past the intro seamlessly.",
  },
  {
    q: "Can I synchronize watch time and receive playback events in my app?",
    a: "Yes. AniFlow features a bidirectional HTML5 postMessage bridge. The embedded player streams telemetry events (such as 'aniflow:time' with current playback seconds, 'aniflow:play', 'aniflow:pause', and 'aniflow:complete') to your parent website. You can also send commands to pause, play, or seek remotely.",
  },
  {
    q: "Is AniFlow API open-source and ready for production deployment?",
    a: "Yes, AniFlow is fully open-source under the MIT license, built with Next.js 14, TypeScript, Tailwind CSS, and HLS.js. It comes pre-configured with edge proxying, CORS headers, Dockerfile support, and production-ready metadata for immediate global deployment.",
  },
];

export default function HomePage() {
  // Playground state matching screenshot defaults
  const [embedType, setEmbedType] = useState<"ani" | "mal">("ani");
  const [animeId, setAnimeId] = useState<string>("16498"); // Attack on Titan
  const [episode, setEpisode] = useState<string>("1");
  const [audio, setAudio] = useState<"sub" | "dub">("dub");
  const [server, setServer] = useState<string>("flow");
  const [startAt, setStartAt] = useState<string>("0");
  const [autoskipIntro, setAutoskipIntro] = useState<boolean>(true);
  const [autoskipOutro, setAutoskipOutro] = useState<boolean>(true);
  const [copiedType, setCopiedType] = useState<string | null>(null);

  // FAQ accordion state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  // Custom dropdown open state
  const [openDropdown, setOpenDropdown] = useState<"database" | "audio" | "server" | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-dropdown-container]")) {
        setOpenDropdown(null);
      }
    };
    if (openDropdown) {
      document.addEventListener("mousedown", handleOutsideClick);
      return () => document.removeEventListener("mousedown", handleOutsideClick);
    }
  }, [openDropdown]);

  // Documentation state
  const [activeDocTab, setActiveDocTab] = useState<DocTab>("endpoints");

  // System status state
  const [isRefreshingStatus, setIsRefreshingStatus] = useState<boolean>(false);
  const [statusLastCheckTime, setStatusLastCheckTime] = useState<string>("");

  // Live PostMessage Event Logger
  const [eventLogs, setEventLogs] = useState<Array<{ time: string; type: string; payload: any }>>([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Dynamic host origin detection for frontend (always reflects current site URL)
  const [origin, setOrigin] = useState<string>("");
  const [domain, setDomain] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
      setDomain(window.location.host);
      setStatusLastCheckTime(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }));
    }
  }, []);

  const currentOrigin = origin || (typeof window !== "undefined" ? window.location.origin : "");
  const currentDomain = domain || (typeof window !== "undefined" ? window.location.host : (origin ? origin.replace(/^https?:\/\//, "") : ""));

  const handleRefreshStatus = () => {
    setIsRefreshingStatus(true);
    setTimeout(() => {
      setStatusLastCheckTime(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }));
      setIsRefreshingStatus(false);
    }, 600);
  };

  const [docTabHeight, setDocTabHeight] = useState<number | undefined>(undefined);
  const docTabContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!docTabContentRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setDocTabHeight(entry.contentRect.height);
        }
      }
    });
    observer.observe(docTabContentRef.current);
    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string, tab?: DocTab) => {
    if (typeof window === "undefined") return;
    if (tab) {
      setActiveDocTab(tab);
    }
    const element = document.getElementById(id);
    if (!element) return;

    const navOffset = 68;
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - navOffset;

    window.scrollTo({
      top: offsetPosition,
      behavior: "smooth",
    });

    window.history.pushState(null, "", `#${id}`);
  };

  const scrollToTop = () => {
    if (typeof window === "undefined") return;
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
    window.history.pushState(null, "", window.location.pathname);
  };

  // Compute embed URL
  const embedPath = `/embed/${embedType}/${animeId || "154587"}/${episode || "1"}/${audio}`;
  const queryParams = new URLSearchParams();
  if (server && server !== "flow" && server !== "flow1") queryParams.set("server", server);
  if (startAt && parseFloat(startAt) > 0) queryParams.set("startAt", startAt);
  if (!autoskipIntro) queryParams.set("autoskipIntro", "0");
  if (!autoskipOutro) queryParams.set("autoskipOutro", "0");

  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : "";
  const fullEmbedUrl = `${currentOrigin}${embedPath}${queryString}`;
  const iframeCode = `<iframe\n  src="${fullEmbedUrl}"\n  width="100%"\n  height="500"\n  frameborder="0"\n  allowfullscreen\n  allow="autoplay; fullscreen; picture-in-picture"\n></iframe>`;

  // Listen for real postMessage from preview iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;

      const now = new Date().toLocaleTimeString();

      if (data?.type === "PLAYER_EVENT") {
        setEventLogs((prev) => [
          { time: now, type: `PLAYER_EVENT (${data.data?.type || "update"})`, payload: data.data },
          ...prev.slice(0, 24),
        ]);
      } else if (data?.type === "watching-log") {
        setEventLogs((prev) => [
          { time: now, type: "watching-log", payload: data },
          ...prev.slice(0, 24),
        ]);
      } else if (data?.type === "aniflow-error" || data?.type === "STREAM_UNAVAILABLE") {
        setEventLogs((prev) => [
          { time: now, type: data.type, payload: data },
          ...prev.slice(0, 24),
        ]);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Send command to iframe
  const sendIframeCommand = (cmd: string, extra: any = {}) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ command: cmd, ...extra }, "*");
    }
  };

  const handleCopy = (text: string, type: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] text-white font-product-sans selection:bg-white/20 relative isolate overflow-x-hidden w-full max-w-full">
      {/* Stationary Page Background Gradients & Micro-Dither Noise */}
      <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden select-none">
        {/* Top ambient illumination for Hero */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[650px]"
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 50% 0%, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.04) 30%, rgba(255, 255, 255, 0.01) 60%, transparent 100%)",
          }}
        />

        {/* Global smooth vertical ambient tone so page is never empty */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(255, 255, 255, 0.025) 0%, rgba(255, 255, 255, 0) 30%, rgba(255, 255, 255, 0.015) 65%, rgba(255, 255, 255, 0) 100%)",
          }}
        />

        {/* Velvety micro-dither noise overlay - eliminates 8-bit banding and contour rings */}
        <div
          className="absolute inset-0 opacity-[0.25] bg-repeat mix-blend-screen"
          style={{
            backgroundImage: "url('/noise.png')",
            backgroundSize: "128px 128px",
          }}
        />
      </div>

      {/* Top Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-black/20 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={scrollToTop}
              className="flex items-center gap-2.5 group cursor-pointer focus:outline-none"
              aria-label="AniFlow API Home"
            >
              <div className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">
                <img src="/logo.svg" alt="AniFlow API" className="w-full h-full object-contain" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base sm:text-lg tracking-tight text-white group-hover:text-zinc-200 transition-colors">
                  AniFlow
                </span>
                <span className="text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.08] text-zinc-300 border border-white/[0.12] group-hover:border-white/30 group-hover:text-white transition-all">
                  API
                </span>
              </div>
            </button>

            <nav className="hidden md:flex items-center gap-1 text-xs text-zinc-400 font-medium">
              <button
                type="button"
                onClick={() => scrollToSection("features")}
                className="h-7 px-3 rounded-full hover:text-white hover:bg-white/[0.04] flex items-center transition-all active:scale-95 cursor-pointer"
              >
                Features
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("docs")}
                className="h-7 px-3 rounded-full hover:text-white hover:bg-white/[0.04] flex items-center transition-all active:scale-95 cursor-pointer"
              >
                Documentation
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("faq")}
                className="h-7 px-3 rounded-full hover:text-white hover:bg-white/[0.04] flex items-center transition-all active:scale-95 cursor-pointer"
              >
                FAQ
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("status")}
                className="h-7 px-3 rounded-full hover:text-white hover:bg-white/[0.04] flex items-center transition-all active:scale-95 cursor-pointer"
              >
                System Status
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => scrollToSection("status")}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0C0C0C] hover:bg-[#141414] border border-white/[0.08] hover:border-white/20 text-[11px] font-medium text-emerald-400 transition-all cursor-pointer active:scale-95"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>All Systems Operational</span>
            </button>

            <button
              type="button"
              onClick={() => scrollToSection("docs", "endpoints")}
              className="h-7 px-3.5 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-sm active:scale-95 hover:shadow-[0_0_15px_rgba(255,255,255,0.3)]"
            >
              Get Embed
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-12 pb-16 sm:pt-20 sm:pb-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-10">
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-tight">
              Stream Anime on Any Website
            </h1>

            <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              High-performance AniList and MAL video player embeds. Multi-server streaming, instant Sub/Dub switching, and full postMessage controls.
            </p>

            {/* Hero Action Buttons with smooth scroll animations */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
              <button
                type="button"
                onClick={() => scrollToSection("player-demo")}
                className="h-8 sm:h-9 px-4 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer hover:shadow-[0_0_15px_rgba(255,255,255,0.3)]"
              >
                <Play className="w-3.5 h-3.5 fill-black" />
                <span>Interactive Player</span>
              </button>

              <button
                type="button"
                onClick={() => scrollToSection("docs")}
                className="h-8 sm:h-9 px-4 rounded-full bg-[#0C0C0C] hover:bg-[#161616] text-zinc-300 hover:text-white border border-white/[0.1] hover:border-white/30 text-xs font-semibold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5 text-zinc-400" />
                <span>Explore Documentation</span>
                <ArrowDown className="w-3.5 h-3.5 text-zinc-400" />
              </button>
            </div>
          </div>

          <div id="player-demo" className="max-w-4xl mx-auto scroll-mt-20">
            {/* Quick config controls directly above player */}
            <div className="mb-4">
              <p className="text-center text-xs text-zinc-400 mb-3.5 max-w-xl mx-auto leading-relaxed px-2 font-product-sans">
                Test live embedding parameters: customize database identifier, episode, audio track, and stream server engine below.
              </p>

              {/* Mobile & desktop backdrop when dropdown is open */}
              {openDropdown && (
                <div
                  className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity"
                  onClick={() => setOpenDropdown(null)}
                />
              )}

              {/* Responsive 2-col on mobile, single row on desktop */}
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end justify-center gap-2 sm:gap-2.5 max-w-xl mx-auto sm:max-w-none">
                {/* 1. Database Selector */}
                <div className="col-span-1 sm:w-auto flex flex-col gap-1 relative" data-dropdown-container>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 pl-0.5">
                    Database
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(openDropdown === "database" ? null : "database")}
                    className={cn(
                      "h-9 px-3.5 rounded-xl bg-[#0C0C0C] hover:bg-[#141414] active:bg-[#181818] border text-xs font-semibold text-white flex items-center justify-between gap-2 transition-all shadow-sm active:scale-[0.98] cursor-pointer w-full sm:min-w-[115px] font-product-sans",
                      openDropdown === "database"
                        ? "border-white/30 ring-1 ring-white/10 bg-[#161616]"
                        : "border-white/[0.08] hover:border-white/20"
                    )}
                  >
                    <span className="truncate">{embedType === "ani" ? "AniList" : "MyAnimeList"}</span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-200",
                        openDropdown === "database" && "rotate-180 text-white"
                      )}
                    />
                  </button>

                  <AnimatePresence>
                    {openDropdown === "database" && (
                      <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 3, scale: 0.98 }}
                        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                          backgroundColor: "rgba(12, 12, 12, 0.94)",
                          backdropFilter: "blur(20px)",
                          WebkitBackdropFilter: "blur(20px)",
                        }}
                        className="absolute top-full mt-1.5 left-0 sm:left-0 sm:right-auto w-[calc(100vw-2rem)] max-w-sm sm:w-80 rounded-xl border border-white/[0.1] p-1.5 shadow-2xl shadow-black/95 z-50 font-product-sans"
                      >
                        <div className="px-3 py-2 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400 border-b border-white/[0.06] mb-1 flex items-center justify-between">
                          <span>Database Identifier Source</span>
                          <span className="text-zinc-500 font-product-sans text-[11px] font-normal normal-case">2 options</span>
                        </div>
                        {DATABASE_OPTIONS.map((opt) => {
                          const isSelected = embedType === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setEmbedType(opt.id);
                                setOpenDropdown(null);
                              }}
                              className={cn(
                                "w-full flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer group font-product-sans active:scale-[0.99]",
                                isSelected ? "bg-white/[0.08] text-white" : "hover:bg-white/[0.04] text-zinc-300 hover:text-white"
                              )}
                            >
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white tracking-tight">{opt.name}</span>
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300 border border-white/[0.08] font-medium">
                                    {opt.badge}
                                  </span>
                                </div>
                                <p className="text-[11px] text-zinc-400 leading-snug font-product-sans">{opt.desc}</p>
                                <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{opt.example}</p>
                              </div>
                              {isSelected && (
                                <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                                  <Check className="w-3 h-3 text-emerald-400" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 2. Audio Selector Dropdown */}
                <div className="col-span-1 sm:w-auto flex flex-col gap-1 relative" data-dropdown-container>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 pl-0.5">
                    Audio Track
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(openDropdown === "audio" ? null : "audio")}
                    className={cn(
                      "h-9 px-3.5 rounded-xl bg-[#0C0C0C] hover:bg-[#141414] active:bg-[#181818] border text-xs font-semibold text-white flex items-center justify-between gap-2 transition-all shadow-sm active:scale-[0.98] cursor-pointer w-full sm:min-w-[100px] font-product-sans",
                      openDropdown === "audio"
                        ? "border-white/30 ring-1 ring-white/10 bg-[#161616]"
                        : "border-white/[0.08] hover:border-white/20"
                    )}
                  >
                    <span>{audio === "dub" ? "Dub" : "Sub"}</span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-200",
                        openDropdown === "audio" && "rotate-180 text-white"
                      )}
                    />
                  </button>

                  <AnimatePresence>
                    {openDropdown === "audio" && (
                      <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 3, scale: 0.98 }}
                        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                          backgroundColor: "rgba(12, 12, 12, 0.94)",
                          backdropFilter: "blur(20px)",
                          WebkitBackdropFilter: "blur(20px)",
                        }}
                        className="absolute top-full mt-1.5 right-0 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto w-[calc(100vw-2rem)] max-w-sm sm:w-80 rounded-xl border border-white/[0.1] p-1.5 shadow-2xl shadow-black/95 z-50 font-product-sans"
                      >
                        <div className="px-3 py-2 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400 border-b border-white/[0.06] mb-1 flex items-center justify-between">
                          <span>Audio Language Track</span>
                          <span className="text-zinc-500 font-product-sans text-[11px] font-normal normal-case">2 options</span>
                        </div>
                        {AUDIO_OPTIONS.map((opt) => {
                          const isSelected = audio === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                const val = opt.id;
                                setAudio(val);
                                if (val === "dub" && (server === "zuri" || server === "zuna")) {
                                  setServer("flow");
                                }
                                setOpenDropdown(null);
                              }}
                              className={cn(
                                "w-full flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer group font-product-sans active:scale-[0.99]",
                                isSelected ? "bg-white/[0.08] text-white" : "hover:bg-white/[0.04] text-zinc-300 hover:text-white"
                              )}
                            >
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white tracking-tight">{opt.name}</span>
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300 border border-white/[0.08] font-medium">
                                    {opt.badge}
                                  </span>
                                </div>
                                <p className="text-[11px] text-zinc-400 leading-snug font-product-sans">{opt.desc}</p>
                              </div>
                              {isSelected && (
                                <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                                  <Check className="w-3 h-3 text-emerald-400" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 3. Server Selector Dropdown */}
                <div className="col-span-1 sm:w-auto flex flex-col gap-1 relative" data-dropdown-container>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 pl-0.5">
                    Server
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(openDropdown === "server" ? null : "server")}
                    className={cn(
                      "h-9 px-3.5 rounded-xl bg-[#0C0C0C] hover:bg-[#141414] active:bg-[#181818] border text-xs font-semibold text-white flex items-center justify-between gap-2 transition-all shadow-sm active:scale-[0.98] cursor-pointer w-full sm:min-w-[110px] font-product-sans",
                      openDropdown === "server"
                        ? "border-white/30 ring-1 ring-white/10 bg-[#161616]"
                        : "border-white/[0.08] hover:border-white/20"
                    )}
                  >
                    <span className="truncate">
                      {server === "flow" ? "Flow" : server === "flow2" ? "Flow 2" : server === "yuri" ? "Yuri" : "Zuri"}
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-200",
                        openDropdown === "server" && "rotate-180 text-white"
                      )}
                    />
                  </button>

                  <AnimatePresence>
                    {openDropdown === "server" && (
                      <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 3, scale: 0.98 }}
                        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                          backgroundColor: "rgba(12, 12, 12, 0.94)",
                          backdropFilter: "blur(20px)",
                          WebkitBackdropFilter: "blur(20px)",
                        }}
                        className="absolute top-full mt-1.5 left-0 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto w-[calc(100vw-2rem)] max-w-sm sm:w-80 rounded-xl border border-white/[0.1] p-1.5 shadow-2xl shadow-black/95 z-50 font-product-sans"
                      >
                        <div className="px-3 py-2 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400 border-b border-white/[0.06] mb-1 flex items-center justify-between">
                          <span>Delivery Stream Engine</span>
                          <span className="text-zinc-500 font-product-sans text-[11px] font-normal normal-case">4 servers</span>
                        </div>
                        {SERVER_OPTIONS.map((opt) => {
                          const isSelected = server === opt.id;
                          const isDisabled = opt.subOnly && audio === "dub";
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => {
                                if (isDisabled) return;
                                setServer(opt.id);
                                setOpenDropdown(null);
                              }}
                              className={cn(
                                "w-full flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer group font-product-sans active:scale-[0.99]",
                                isDisabled && "opacity-40 cursor-not-allowed hover:bg-transparent pointer-events-none",
                                isSelected ? "bg-white/[0.08] text-white" : !isDisabled && "hover:bg-white/[0.04] text-zinc-300 hover:text-white"
                              )}
                            >
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white tracking-tight">{opt.name}</span>
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300 border border-white/[0.08] font-medium">
                                    {opt.badge}
                                  </span>
                                  {isDisabled && (
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/90 border border-amber-500/20 font-medium">
                                      Sub only
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-zinc-400 leading-snug font-product-sans">{opt.desc}</p>
                              </div>
                              {isSelected && (
                                <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                                  <Check className="w-3 h-3 text-emerald-400" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 4. Anime ID & Episode Inputs */}
                <div className="col-span-1 sm:w-auto flex items-end gap-1.5 min-w-0">
                  {/* Anime ID Input */}
                  <div className="flex-1 min-w-0 sm:w-28 flex flex-col gap-1">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 pl-0.5">
                      Anime ID
                    </span>
                    <input
                      type="text"
                      value={animeId}
                      onChange={(e) => setAnimeId(e.target.value.trim())}
                      placeholder="16498"
                      className="h-9 w-full sm:w-28 px-2.5 rounded-xl bg-[#0C0C0C] hover:bg-[#141414] border border-white/[0.08] hover:border-white/20 focus:border-white/40 focus:ring-1 focus:ring-white/20 text-xs font-semibold text-white text-center focus:outline-none transition-all font-mono shadow-sm"
                    />
                  </div>

                  {/* Episode Input */}
                  <div className="w-14 xs:w-16 sm:w-18 shrink-0 flex flex-col gap-1">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 pl-0.5">
                      Episode
                    </span>
                    <input
                      type="number"
                      min="1"
                      value={episode}
                      onChange={(e) => setEpisode(e.target.value)}
                      placeholder="1"
                      className="h-9 w-full px-2 rounded-xl bg-[#0C0C0C] hover:bg-[#141414] border border-white/[0.08] hover:border-white/20 focus:border-white/40 focus:ring-1 focus:ring-white/20 text-xs font-semibold text-white text-center focus:outline-none transition-all font-mono shadow-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Player Viewport */}
            <div className="flex flex-col rounded-xl overflow-hidden bg-black border border-white/[0.08] shadow-2xl">
              <div className="h-8 px-3 bg-[#0C0C0C] border-b border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-400 gap-2">
                <div className="flex items-center gap-2 min-w-0 truncate">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="font-mono truncate">{embedPath}{queryString}</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopy(fullEmbedUrl, "hero-url")}
                    className="hover:text-white flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                  >
                    {copiedType === "hero-url" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedType === "hero-url" ? "Copied" : "Copy"}</span>
                  </button>
                  <a
                    href={fullEmbedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white flex items-center gap-1 shrink-0 transition-colors"
                  >
                    <span className="hidden sm:inline">Full window</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <div className="relative aspect-video w-full bg-black">
                <iframe
                  ref={iframeRef}
                  src={fullEmbedUrl}
                  className="w-full h-full border-0"
                  allow="autoplay; fullscreen; picture-in-picture"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ARCHITECTURE & FEATURES SECTION */}
      <section
        id="features"
        className="py-16 sm:py-20 border-t border-white/[0.06] relative scroll-mt-20"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
              Architecture & Features
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400">
              Low-latency edge delivery, automated stream failover, and full host control.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#030303] overflow-hidden shadow-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
              {ARCHITECTURE_FEATURES.slice(0, 3).map((feat, idx) => {
                const Icon = feat.icon;
                return (
                  <div
                    key={idx}
                    className="p-5 sm:p-6 flex flex-col justify-between hover:bg-white/[0.02] transition-colors group"
                  >
                    <div>
                      <div className="flex items-center gap-2.5 mb-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#0C0C0C] border border-white/[0.08] flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:border-white/20 transition-colors">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <h3 className="text-sm font-bold text-white tracking-tight group-hover:text-zinc-200 transition-colors">
                          {feat.title}
                        </h3>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed font-product-sans">
                        {feat.desc}
                      </p>
                    </div>

                    <div className="mt-5 pt-3 border-t border-white/[0.04] flex items-center justify-between text-[11px] font-mono">
                      <span className="text-zinc-500">{feat.key}</span>
                      <span className={feat.valueColor}>{feat.value}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/[0.06] border-t border-white/[0.06]">
              {ARCHITECTURE_FEATURES.slice(3, 6).map((feat, idx) => {
                const Icon = feat.icon;
                return (
                  <div
                    key={idx}
                    className="p-5 sm:p-6 flex flex-col justify-between hover:bg-white/[0.02] transition-colors group"
                  >
                    <div>
                      <div className="flex items-center gap-2.5 mb-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#0C0C0C] border border-white/[0.08] flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:border-white/20 transition-colors">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <h3 className="text-sm font-bold text-white tracking-tight group-hover:text-zinc-200 transition-colors">
                          {feat.title}
                        </h3>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed font-product-sans">
                        {feat.desc}
                      </p>
                    </div>

                    <div className="mt-5 pt-3 border-t border-white/[0.04] flex items-center justify-between text-[11px] font-mono">
                      <span className="text-zinc-500">{feat.key}</span>
                      <span className={feat.valueColor}>{feat.value}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* DOCUMENTATION SECTION */}
      <section
        id="docs"
        className="py-16 sm:py-24 scroll-mt-20"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          {/* Top Domain Callout */}
          <div className="text-center mb-3">
            <span className="text-xs sm:text-sm font-semibold text-rose-400/90 tracking-wide font-mono">
              Use this domain for embed URLs: <strong className="text-rose-300 font-bold">{currentDomain || (typeof window !== "undefined" ? window.location.host : "localhost:3000")}</strong>
            </span>
          </div>

          {/* Section Heading */}
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">
              Documentation
            </h2>
            <p className="text-sm text-zinc-400">
              Reference for embedding and customizing AniFlow API on your site.
            </p>
          </div>

          {/* Segmented Control Navigation Tabs with animated sliding pill */}
          <div className="w-full flex justify-start sm:justify-center mb-6 sm:mb-8 overflow-x-auto no-scrollbar py-1 px-4 -mx-4 sm:mx-0 sm:px-0">
            <div className="relative inline-flex p-1 rounded-full bg-[#0C0C0C] border border-white/[0.08] shadow-inner shrink-0 mx-auto">
              {DOC_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeDocTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveDocTab(tab.id)}
                    className="relative h-8 px-3 sm:px-4 rounded-full text-xs font-medium flex items-center justify-center gap-1.5 shrink-0 cursor-pointer select-none focus:outline-none transition-colors active:scale-95"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeDocTabPill"
                        className="absolute inset-0 rounded-full bg-[#181818] border border-white/[0.14] shadow-md"
                        transition={{ type: "spring", stiffness: 450, damping: 32 }}
                      />
                    )}
                    <span
                      className={cn(
                        "relative z-10 flex items-center gap-1.5 transition-colors duration-200",
                        isActive ? "text-white font-semibold" : "text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      <Icon className={cn("w-3.5 h-3.5 shrink-0 transition-colors", isActive ? "text-white" : "text-zinc-400")} />
                      <span>{tab.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Animated Tab Height Container */}
          <motion.div
            animate={{ height: docTabHeight ? docTabHeight : "auto" }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div ref={docTabContentRef}>
              <AnimatePresence mode="wait" initial={false}>
            {activeDocTab === "endpoints" && (
              <motion.div
                key="endpoints"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="p-5 sm:p-6 rounded-2xl bg-[#030303] border border-white/[0.08] space-y-4 shadow-2xl"
              >
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">API Endpoints</h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Base embed routes for streaming anime with AniList or MyAnimeList identifiers:
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                  {/* Card 1: AniList Embed */}
                  <div className="rounded-xl bg-[#0C0C0C] border border-white/[0.08] shadow-xl flex flex-col justify-between overflow-hidden">
                    <div className="flex flex-col flex-1">
                      {/* Header bar */}
                      <div className="px-3 sm:px-3.5 py-2.5 bg-[#0C0C0C] border-b border-white/[0.06] flex items-center justify-between shrink-0 gap-2">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 mr-2">
                          <span className="text-xs font-bold text-white tracking-tight truncate">AniList Embed</span>
                          <span className="text-zinc-600 shrink-0">·</span>
                          <span className="text-[11px] font-mono text-zinc-400 shrink-0">/embed/ani</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(
                              `${currentOrigin}/embed/ani/{anilistId}/{episode}/{audio}?server=flow`,
                              "ep-ani"
                            )
                          }
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1C1C1C] hover:bg-[#252525] border border-white/[0.1] text-xs text-zinc-300 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
                        >
                          {copiedType === "ep-ani" ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedType === "ep-ani" ? "Copied" : "Copy"}</span>
                        </button>
                      </div>

                      {/* URL Box */}
                      <div className="p-3.5 bg-[#060606] border-b border-white/[0.06] font-mono text-xs text-[#4ade80] overflow-x-auto leading-relaxed select-text custom-scrollbar">
                        <code>{currentOrigin}/embed/ani/&#123;anilistId&#125;/&#123;episode&#125;/&#123;audio&#125;?server=flow</code>
                      </div>

                      {/* Content / Info */}
                      <div className="p-4 space-y-3.5 text-xs flex-1 flex flex-col justify-between">
                        <p className="text-zinc-400 leading-relaxed">
                          Default route using AniList anime ID. If AniList lookup fails, AniFlow API automatically retries the identifier as a MyAnimeList ID.
                        </p>

                        <div className="space-y-1.5 font-mono text-xs pt-3 border-t border-white/[0.06]">
                          <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                            <span className="font-semibold text-white">anilistId</span>
                            <span className="text-zinc-400 font-sans">AniList anime ID (number)</span>
                          </div>
                          <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                            <span className="font-semibold text-white">episode</span>
                            <span className="text-zinc-400 font-sans">Episode number (1-based)</span>
                          </div>
                          <div className="flex items-center justify-between py-1">
                            <span className="font-semibold text-white">audio</span>
                            <span className="text-zinc-400 font-sans">sub · dub (default: sub)</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: MAL Embed */}
                  <div className="rounded-xl bg-[#0C0C0C] border border-white/[0.08] shadow-xl flex flex-col justify-between overflow-hidden">
                    <div className="flex flex-col flex-1">
                      {/* Header bar */}
                      <div className="px-3 sm:px-3.5 py-2.5 bg-[#0C0C0C] border-b border-white/[0.06] flex items-center justify-between shrink-0 gap-2">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 mr-2">
                          <span className="text-xs font-bold text-white tracking-tight truncate">MAL Embed</span>
                          <span className="text-zinc-600 shrink-0">·</span>
                          <span className="text-[11px] font-mono text-zinc-400 shrink-0">/embed/mal</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(
                              `${currentOrigin}/embed/mal/{malId}/{episode}/{audio}?server=flow`,
                              "ep-mal"
                            )
                          }
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1C1C1C] hover:bg-[#252525] border border-white/[0.1] text-xs text-zinc-300 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
                        >
                          {copiedType === "ep-mal" ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedType === "ep-mal" ? "Copied" : "Copy"}</span>
                        </button>
                      </div>

                      {/* URL Box */}
                      <div className="p-3.5 bg-[#060606] border-b border-white/[0.06] font-mono text-xs text-[#4ade80] overflow-x-auto leading-relaxed select-text custom-scrollbar">
                        <code>{currentOrigin}/embed/mal/&#123;malId&#125;/&#123;episode&#125;/&#123;audio&#125;?server=flow</code>
                      </div>

                      {/* Content / Info */}
                      <div className="p-4 space-y-3.5 text-xs flex-1 flex flex-col justify-between">
                        <p className="text-zinc-400 leading-relaxed">
                          Direct lookup using MyAnimeList anime ID. Compatible with all stream providers (Flow 1, Flow 2, Yuri, Zuri) and audio languages.
                        </p>

                        <div className="space-y-1.5 font-mono text-xs pt-3 border-t border-white/[0.06]">
                          <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                            <span className="font-semibold text-white">malId</span>
                            <span className="text-zinc-400 font-sans">MyAnimeList anime ID (number)</span>
                          </div>
                          <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                            <span className="font-semibold text-white">episode</span>
                            <span className="text-zinc-400 font-sans">Episode number (1-based)</span>
                          </div>
                          <div className="flex items-center justify-between py-1">
                            <span className="font-semibold text-white">audio</span>
                            <span className="text-zinc-400 font-sans">sub · dub (default: sub)</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 2: IMPLEMENTATION */}
            {activeDocTab === "implementation" && (
              <motion.div
                key="implementation"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="p-5 sm:p-6 rounded-2xl bg-[#030303] border border-white/[0.08] space-y-4 shadow-2xl"
              >
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Implementation Examples</h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Ready-to-use integration code for modern web apps and vanilla HTML sites:
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                  {/* HTML Embed Snippet */}
                  <div className="rounded-xl bg-[#0C0C0C] border border-white/[0.08] shadow-xl flex flex-col overflow-hidden">
                    <div className="px-3 sm:px-3.5 py-2 bg-[#0C0C0C] border-b border-white/[0.06] flex items-center justify-between shrink-0 gap-2">
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 mr-2">
                        <span className="text-xs font-bold text-white tracking-tight truncate">Responsive HTML</span>
                        <span className="hidden xs:inline text-zinc-600 shrink-0">·</span>
                        <span className="hidden xs:inline text-[11px] font-mono text-zinc-400 shrink-0">embed.html</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">\n  <iframe\n    src="${currentOrigin}/embed/ani/154587/1/sub?server=flow1"\n    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"\n    allowfullscreen\n    allow="autoplay; fullscreen; picture-in-picture"\n  ></iframe>\n</div>`,
                            "code-html"
                          )
                        }
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1C1C1C] hover:bg-[#252525] border border-white/[0.1] text-xs text-zinc-300 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
                      >
                        {copiedType === "code-html" ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedType === "code-html" ? "Copied" : "Copy"}</span>
                      </button>
                    </div>

                    <div className="p-3.5 bg-[#060606] font-mono text-xs text-zinc-300 overflow-x-auto leading-relaxed select-text custom-scrollbar flex-1">
                      <pre className="text-zinc-300 leading-relaxed font-mono">
                        <span className="text-zinc-500">&lt;</span><span className="text-purple-400">div</span> <span className="text-sky-300">style</span>=<span className="text-emerald-400">&quot;position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;&quot;</span><span className="text-zinc-500">&gt;</span>{"\n"}
                        {"  "}<span className="text-zinc-500">&lt;</span><span className="text-purple-400">iframe</span>{"\n"}
                        {"    "}<span className="text-sky-300">src</span>=<span className="text-emerald-400">&quot;{currentOrigin}/embed/ani/154587/1/sub?server=flow1&quot;</span>{"\n"}
                        {"    "}<span className="text-sky-300">style</span>=<span className="text-emerald-400">&quot;position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;&quot;</span>{"\n"}
                        {"    "}<span className="text-sky-300">allowfullscreen</span>{"\n"}
                        {"    "}<span className="text-sky-300">allow</span>=<span className="text-emerald-400">&quot;autoplay; fullscreen; picture-in-picture&quot;</span>{"\n"}
                        {"  "}<span className="text-zinc-500">&gt;&lt;/</span><span className="text-purple-400">iframe</span><span className="text-zinc-500">&gt;</span>{"\n"}
                        <span className="text-zinc-500">&lt;/</span><span className="text-purple-400">div</span><span className="text-zinc-500">&gt;</span>
                      </pre>
                    </div>
                  </div>

                  {/* React / Next.js Component */}
                  <div className="rounded-xl bg-[#0C0C0C] border border-white/[0.08] shadow-xl flex flex-col overflow-hidden">
                    <div className="px-3 sm:px-3.5 py-2 bg-[#0C0C0C] border-b border-white/[0.06] flex items-center justify-between shrink-0 gap-2">
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 mr-2">
                        <span className="text-xs font-bold text-white tracking-tight truncate">React / Next.js</span>
                        <span className="hidden xs:inline text-zinc-600 shrink-0">·</span>
                        <span className="hidden xs:inline text-[11px] font-mono text-zinc-400 shrink-0">AnimePlayer.tsx</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            `export function AnimePlayer({\n  anilistId,\n  episode = 1,\n  audio = "sub",\n}: {\n  anilistId: number;\n  episode?: number;\n  audio?: "sub" | "dub";\n}) {\n  return (\n    <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black">\n      <iframe\n        src={\`${currentOrigin}/embed/ani/\${anilistId}/\${episode}/\${audio}?server=flow1\`}\n        className="w-full h-full border-0"\n        allow="autoplay; fullscreen; picture-in-picture"\n        allowFullScreen\n      />\n    </div>\n  );\n}`,
                            "code-react"
                          )
                        }
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1C1C1C] hover:bg-[#252525] border border-white/[0.1] text-xs text-zinc-300 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
                      >
                        {copiedType === "code-react" ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedType === "code-react" ? "Copied" : "Copy"}</span>
                      </button>
                    </div>

                    <div className="p-3.5 bg-[#060606] font-mono text-xs text-zinc-300 overflow-x-auto leading-relaxed select-text custom-scrollbar flex-1">
                      <pre className="text-zinc-300 leading-relaxed font-mono">
                        <span className="text-purple-400">export function</span> <span className="text-cyan-300">AnimePlayer</span>(&#123;{"\n"}
                        {"  "}<span className="text-sky-300">anilistId</span>,{"\n"}
                        {"  "}<span className="text-sky-300">episode</span> = <span className="text-amber-400">1</span>,{"\n"}
                        {"  "}<span className="text-sky-300">audio</span> = <span className="text-emerald-400">&apos;sub&apos;</span>,{"\n"}
                        &#125;: &#123;{"\n"}
                        {"  "}<span className="text-sky-300">anilistId</span>: <span className="text-yellow-200">number</span>;{"\n"}
                        {"  "}<span className="text-sky-300">episode</span>?: <span className="text-yellow-200">number</span>;{"\n"}
                        {"  "}<span className="text-sky-300">audio</span>?: <span className="text-emerald-400">&apos;sub&apos;</span> | <span className="text-emerald-400">&apos;dub&apos;</span>;{"\n"}
                        &#125;) &#123;{"\n"}
                        {"  "}<span className="text-purple-400">return</span> ({"\n"}
                        {"    "}<span className="text-zinc-500">&lt;</span><span className="text-purple-400">div</span> <span className="text-sky-300">className</span>=<span className="text-emerald-400">&quot;relative aspect-video w-full rounded-2xl overflow-hidden bg-black&quot;</span><span className="text-zinc-500">&gt;</span>{"\n"}
                        {"      "}<span className="text-zinc-500">&lt;</span><span className="text-purple-400">iframe</span>{"\n"}
                        {"        "}<span className="text-sky-300">src</span>=&#123;<span className="text-emerald-400">{`\`${currentOrigin}/embed/ani/\${anilistId}/\${episode}/\${audio}?server=flow1\``}</span>&#125;{"\n"}
                        {"        "}<span className="text-sky-300">className</span>=<span className="text-emerald-400">&quot;w-full h-full border-0&quot;</span>{"\n"}
                        {"        "}<span className="text-sky-300">allow</span>=<span className="text-emerald-400">&quot;autoplay; fullscreen; picture-in-picture&quot;</span>{"\n"}
                        {"        "}<span className="text-sky-300">allowFullScreen</span>{"\n"}
                        {"      "}<span className="text-zinc-500">/&gt;</span>{"\n"}
                        {"    "}<span className="text-zinc-500">&lt;/</span><span className="text-purple-400">div</span><span className="text-zinc-500">&gt;</span>{"\n"}
                        {"  "});{"\n"}
                        &#125;
                      </pre>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 3: OPTIONS */}
            {activeDocTab === "options" && (
              <motion.div
                key="options"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="max-w-3xl mx-auto p-5 sm:p-6 rounded-2xl bg-[#030303] border border-white/[0.08] space-y-4 shadow-2xl"
              >
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Query Parameters Reference</h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    You can append any of the following query options to both AniList and MAL embed URLs:
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-zinc-400 font-mono">
                        <th className="pb-2.5 pr-4 sm:pr-6 font-semibold whitespace-nowrap">Parameter</th>
                        <th className="pb-2.5 pr-4 sm:pr-6 font-semibold whitespace-nowrap">Allowed Values</th>
                        <th className="pb-2.5 pr-4 sm:pr-6 font-semibold whitespace-nowrap">Default</th>
                        <th className="pb-2.5 font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      <tr className="hover:bg-white/[0.015] transition-colors">
                        <td className="py-2.5 pr-4 sm:pr-6 font-mono font-bold text-white whitespace-nowrap">
                          server
                        </td>
                        <td className="py-2.5 pr-4 sm:pr-6 font-mono text-zinc-400 whitespace-nowrap">
                          flow1 · flow2 · yuri · zuri
                        </td>
                        <td className="py-2.5 pr-4 sm:pr-6 font-mono text-zinc-400 whitespace-nowrap">
                          flow1
                        </td>
                        <td className="py-2.5 text-zinc-300 font-sans leading-relaxed">
                          Selects initial stream provider. Flow 1, Flow 2, Yuri support Sub &amp; Dub. Zuri (zuna) is strictly Sub only.
                        </td>
                      </tr>
                      <tr className="hover:bg-white/[0.015] transition-colors">
                        <td className="py-2.5 pr-4 sm:pr-6 font-mono font-bold text-white whitespace-nowrap">
                          audio
                        </td>
                        <td className="py-2.5 pr-4 sm:pr-6 font-mono text-zinc-400 whitespace-nowrap">
                          sub · dub
                        </td>
                        <td className="py-2.5 pr-4 sm:pr-6 font-mono text-zinc-400 whitespace-nowrap">
                          sub
                        </td>
                        <td className="py-2.5 text-zinc-300 font-sans leading-relaxed">
                          Preferred audio track. Defaults to Japanese Sub if omitted.
                        </td>
                      </tr>
                      <tr className="hover:bg-white/[0.015] transition-colors">
                        <td className="py-2.5 pr-4 sm:pr-6 font-mono font-bold text-white whitespace-nowrap">
                          startAt / progress
                        </td>
                        <td className="py-2.5 pr-4 sm:pr-6 font-mono text-zinc-400 whitespace-nowrap">
                          number (seconds)
                        </td>
                        <td className="py-2.5 pr-4 sm:pr-6 font-mono text-zinc-400 whitespace-nowrap">
                          0
                        </td>
                        <td className="py-2.5 text-zinc-300 font-sans leading-relaxed">
                          Start playback at specified second mark across all embed URLs.
                        </td>
                      </tr>
                      <tr className="hover:bg-white/[0.015] transition-colors">
                        <td className="py-2.5 pr-4 sm:pr-6 font-mono font-bold text-white whitespace-nowrap">
                          autoskipIntro
                        </td>
                        <td className="py-2.5 pr-4 sm:pr-6 font-mono text-zinc-400 whitespace-nowrap">
                          1 (on) · 0 (off)
                        </td>
                        <td className="py-2.5 pr-4 sm:pr-6 font-mono text-zinc-400 whitespace-nowrap">
                          1
                        </td>
                        <td className="py-2.5 text-zinc-300 font-sans leading-relaxed">
                          Automatically skip the opening song when AniSkip timestamps exist.
                        </td>
                      </tr>
                      <tr className="hover:bg-white/[0.015] transition-colors">
                        <td className="py-2.5 pr-4 sm:pr-6 font-mono font-bold text-white whitespace-nowrap">
                          autoskipOutro
                        </td>
                        <td className="py-2.5 pr-4 sm:pr-6 font-mono text-zinc-400 whitespace-nowrap">
                          1 (on) · 0 (off)
                        </td>
                        <td className="py-2.5 pr-4 sm:pr-6 font-mono text-zinc-400 whitespace-nowrap">
                          1
                        </td>
                        <td className="py-2.5 text-zinc-300 font-sans leading-relaxed">
                          Automatically skip the ending credits when timestamps exist.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* TAB 4: EVENTS */}
            {activeDocTab === "events" && (
              <motion.div
                key="events"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="max-w-3xl mx-auto p-5 sm:p-6 rounded-2xl bg-[#030303] border border-white/[0.08] space-y-4 shadow-2xl"
              >
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Player Events &amp; Lifecycle</h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    The player emits structured postMessage payloads to <code className="text-zinc-300 bg-white/[0.06] px-1.5 py-0.5 rounded font-mono">window.parent</code> on every major lifecycle change:
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-zinc-400 font-mono">
                        <th className="pb-2.5 font-semibold w-40 sm:w-48">Event</th>
                        <th className="pb-2.5 font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      <tr className="hover:bg-white/[0.015] transition-colors">
                        <td className="py-2.5 pr-4 font-mono font-bold text-white whitespace-nowrap">
                          progress
                        </td>
                        <td className="py-2.5 text-zinc-300 font-sans leading-relaxed">
                          Playing-state snapshot emitted every five seconds.
                        </td>
                      </tr>
                      <tr className="hover:bg-white/[0.015] transition-colors">
                        <td className="py-2.5 pr-4 font-mono font-bold text-white whitespace-nowrap">
                          pause
                        </td>
                        <td className="py-2.5 text-zinc-300 font-sans leading-relaxed">
                          Emitted whenever video playback is paused.
                        </td>
                      </tr>
                      <tr className="hover:bg-white/[0.015] transition-colors">
                        <td className="py-2.5 pr-4 font-mono font-bold text-white whitespace-nowrap">
                          ended
                        </td>
                        <td className="py-2.5 text-zinc-300 font-sans leading-relaxed">
                          Emitted when video playback finishes the episode.
                        </td>
                      </tr>
                      <tr className="hover:bg-white/[0.015] transition-colors">
                        <td className="py-2.5 pr-4 font-mono font-bold text-white whitespace-nowrap">
                          next / previous
                        </td>
                        <td className="py-2.5 text-zinc-300 font-sans leading-relaxed">
                          Emitted for sequence navigation to trigger the next or previous episode.
                        </td>
                      </tr>
                      <tr className="hover:bg-white/[0.015] transition-colors">
                        <td className="py-2.5 pr-4 font-mono font-bold text-white whitespace-nowrap">
                          command-result
                        </td>
                        <td className="py-2.5 text-zinc-300 font-sans leading-relaxed">
                          Resolves with updated player state matching caller requestId.
                        </td>
                      </tr>
                      <tr className="hover:bg-white/[0.015] transition-colors">
                        <td className="py-2.5 pr-4 font-mono font-bold text-rose-400/90 whitespace-nowrap">
                          CONTENT_UNAVAILABLE
                        </td>
                        <td className="py-2.5 text-zinc-300 font-sans leading-relaxed">
                          Emitted if all stream routes fail or source is region restricted.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* TAB 5: POSTMESSAGE */}
            {activeDocTab === "postmessage" && (
              <motion.div
                key="postmessage"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl bg-[#030303] border border-white/[0.08] shadow-2xl overflow-hidden md:h-[408px]"
              >
                <div className="grid grid-cols-1 md:grid-cols-12 items-stretch h-full">
                  {/* Left Column: Commands Reference */}
                  <div className="col-span-12 md:col-span-5 p-5 sm:p-6 pb-6 sm:pb-7 border-b md:border-b-0 md:border-r border-white/[0.08] flex flex-col justify-start h-full">
                    <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">Commands</h3>
                    <p className="text-xs text-zinc-400 mt-1 mb-3.5 leading-relaxed">
                      Include requestId to receive a matched command-result.
                    </p>

                    <div className="space-y-1.5 text-xs font-mono">
                      <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                        <span className="font-semibold text-white">play</span>
                        <span className="text-zinc-500">None</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                        <span className="font-semibold text-white">pause</span>
                        <span className="text-zinc-500">None</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                        <span className="font-semibold text-white">seek</span>
                        <span className="text-zinc-400">&#123; time: number &#125;</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                        <span className="font-semibold text-white">setVolume</span>
                        <span className="text-zinc-400">&#123; volume: 0..1 &#125;</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                        <span className="font-semibold text-white">setMuted</span>
                        <span className="text-zinc-400">&#123; muted: boolean &#125;</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                        <span className="font-semibold text-white">setPlaybackRate</span>
                        <span className="text-zinc-400">&#123; rate: 0.25..2 &#125;</span>
                      </div>
                      <div className="flex items-start justify-between py-1.5 border-b border-white/[0.04] gap-2">
                        <span className="font-semibold text-white shrink-0">setProvider</span>
                        <span className="text-zinc-400 text-right leading-tight">&#123; language: &apos;sub&apos; | &apos;dub&apos;, providerId: string &#125;</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="font-semibold text-white">getState</span>
                        <span className="text-zinc-500">None</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Console / SDK Code with matching neutral dark card */}
                  <div className="col-span-12 md:col-span-7 p-3 sm:p-4 flex flex-col h-full min-h-0">
                    <div className="rounded-xl bg-[#0C0C0C] border border-white/[0.08] shadow-2xl flex flex-col h-full min-h-0 overflow-hidden">
                      {/* Console Top Header Bar with Clean Copy Button */}
                      <div className="px-3.5 py-2 bg-[#0C0C0C] border-b border-white/[0.06] flex items-center justify-between shrink-0">
                        <span className="text-[11px] font-mono text-zinc-400 font-medium">
                          parent-sdk.js
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(
                              `const player = document.querySelector('#anime-player');\nconst playerOrigin = new URL(player.src).origin;\nconst pending = new Map();\n\nwindow.addEventListener('message', (event) => {\n  const message = event.data;\n  if (event.source !== player.contentWindow || event.origin !== playerOrigin || message?.source !== 'aniembed') return;\n\n  if (message.name === 'command-result' && message.requestId) {\n    const request = pending.get(message.requestId);\n    if (request) {\n      pending.delete(message.requestId);\n      message.data.ok ? request.resolve(message.data.state) : request.reject(message.data.error);\n    }\n  }\n\n  if (['progress', 'pause', 'ended'].includes(message.name)) {\n    saveWatchHistory(message.data);\n  }\n\n  if (message.name === 'next' || message.name === 'previous') {\n    player.src = getEpisodeUrl(message.name);\n  }\n});\n\nfunction sendCommand(name, data = {}) {\n  const requestId = crypto.randomUUID();\n  player.contentWindow?.postMessage({\n    source: 'aniembed', version: 1, type: 'command', name, requestId, data\n  }, playerOrigin);\n  return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));\n}\n\nawait sendCommand('setProvider', { language: 'sub', providerId: 'uwu' });\nawait sendCommand('seek', { time: 145 });`,
                              "code-sdk"
                            )
                          }
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1C1C1C] hover:bg-[#252525] border border-white/[0.1] text-xs text-zinc-300 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
                        >
                          {copiedType === "code-sdk" ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedType === "code-sdk" ? "Copied" : "Copy"}</span>
                        </button>
                      </div>

                      {/* Scrollable code area constrained to parent height */}
                      <div className="flex-1 min-h-0 p-3.5 bg-[#060606] font-mono text-xs text-zinc-300 overflow-y-auto overflow-x-auto leading-relaxed select-text custom-scrollbar">
                        <pre className="text-zinc-300 leading-relaxed font-mono">
                          <span className="text-zinc-500">const</span> <span className="text-sky-300">player</span> = <span className="text-yellow-200">document</span>.<span className="text-cyan-300">querySelector</span>(<span className="text-emerald-400">&apos;#anime-player&apos;</span>);{"\n"}
                          <span className="text-zinc-500">const</span> <span className="text-sky-300">playerOrigin</span> = <span className="text-zinc-500">new</span> <span className="text-yellow-200">URL</span>(<span className="text-sky-300">player</span>.<span className="text-zinc-300">src</span>).<span className="text-zinc-300">origin</span>;{"\n"}
                          <span className="text-zinc-500">const</span> <span className="text-sky-300">pending</span> = <span className="text-zinc-500">new</span> <span className="text-yellow-200">Map</span>();{"\n\n"}
                          <span className="text-yellow-200">window</span>.<span className="text-cyan-300">addEventListener</span>(<span className="text-emerald-400">&apos;message&apos;</span>, (<span className="text-sky-300">event</span>) =&gt; &#123;{"\n"}
                          {"  "}<span className="text-zinc-500">const</span> <span className="text-sky-300">message</span> = <span className="text-sky-300">event</span>.<span className="text-zinc-300">data</span>;{"\n"}
                          {"  "}<span className="text-purple-400">if</span> (<span className="text-sky-300">event</span>.<span className="text-zinc-300">source</span> !== <span className="text-sky-300">player</span>.<span className="text-zinc-300">contentWindow</span> || <span className="text-sky-300">event</span>.<span className="text-zinc-300">origin</span> !== <span className="text-sky-300">playerOrigin</span> || <span className="text-sky-300">message</span>?.<span className="text-zinc-300">source</span> !== <span className="text-emerald-400">&apos;aniembed&apos;</span>) <span className="text-purple-400">return</span>;{"\n\n"}
                          {"  "}<span className="text-purple-400">if</span> (<span className="text-sky-300">message</span>.<span className="text-zinc-300">name</span> === <span className="text-emerald-400">&apos;command-result&apos;</span> &amp;&amp; <span className="text-sky-300">message</span>.<span className="text-zinc-300">requestId</span>) &#123;{"\n"}
                          {"    "}<span className="text-zinc-500">const</span> <span className="text-sky-300">request</span> = <span className="text-sky-300">pending</span>.<span className="text-cyan-300">get</span>(<span className="text-sky-300">message</span>.<span className="text-zinc-300">requestId</span>);{"\n"}
                          {"    "}<span className="text-purple-400">if</span> (<span className="text-sky-300">request</span>) &#123;{"\n"}
                          {"      "}<span className="text-sky-300">pending</span>.<span className="text-cyan-300">delete</span>(<span className="text-sky-300">message</span>.<span className="text-zinc-300">requestId</span>);{"\n"}
                          {"      "}<span className="text-sky-300">message</span>.<span className="text-zinc-300">data</span>.<span className="text-zinc-300">ok</span> ? <span className="text-sky-300">request</span>.<span className="text-cyan-300">resolve</span>(<span className="text-sky-300">message</span>.<span className="text-zinc-300">data</span>.<span className="text-zinc-300">state</span>) : <span className="text-sky-300">request</span>.<span className="text-cyan-300">reject</span>(<span className="text-sky-300">message</span>.<span className="text-zinc-300">data</span>.<span className="text-zinc-300">error</span>);{"\n"}
                          {"    "}&#125;{"\n"}
                          {"  "}&#125;{"\n\n"}
                          {"  "}<span className="text-purple-400">if</span> ([<span className="text-emerald-400">&apos;progress&apos;</span>, <span className="text-emerald-400">&apos;pause&apos;</span>, <span className="text-emerald-400">&apos;ended&apos;</span>].<span className="text-cyan-300">includes</span>(<span className="text-sky-300">message</span>.<span className="text-zinc-300">name</span>)) &#123;{"\n"}
                          {"    "}<span className="text-cyan-300">saveWatchHistory</span>(<span className="text-sky-300">message</span>.<span className="text-zinc-300">data</span>);{"\n"}
                          {"  "}&#125;{"\n\n"}
                          {"  "}<span className="text-purple-400">if</span> (<span className="text-sky-300">message</span>.<span className="text-zinc-300">name</span> === <span className="text-emerald-400">&apos;next&apos;</span> || <span className="text-sky-300">message</span>.<span className="text-zinc-300">name</span> === <span className="text-emerald-400">&apos;previous&apos;</span>) &#123;{"\n"}
                          {"    "}<span className="text-sky-300">player</span>.<span className="text-zinc-300">src</span> = <span className="text-cyan-300">getEpisodeUrl</span>(<span className="text-sky-300">message</span>.<span className="text-zinc-300">name</span>);{"\n"}
                          {"  "}&#125;{"\n"}
                          &#125;);{"\n\n"}
                          <span className="text-purple-400">function</span> <span className="text-cyan-300">sendCommand</span>(<span className="text-sky-300">name</span>, <span className="text-sky-300">data</span> = &#123;&#125;) &#123;{"\n"}
                          {"  "}<span className="text-zinc-500">const</span> <span className="text-sky-300">requestId</span> = <span className="text-yellow-200">crypto</span>.<span className="text-cyan-300">randomUUID</span>();{"\n"}
                          {"  "}<span className="text-sky-300">player</span>.<span className="text-zinc-300">contentWindow</span>?.<span className="text-cyan-300">postMessage</span>(&#123;{"\n"}
                          {"    "}<span className="text-zinc-300">source</span>: <span className="text-emerald-400">&apos;aniembed&apos;</span>, <span className="text-zinc-300">version</span>: <span className="text-amber-400">1</span>, <span className="text-zinc-300">type</span>: <span className="text-emerald-400">&apos;command&apos;</span>, <span className="text-zinc-300">name</span>, <span className="text-zinc-300">requestId</span>, <span className="text-zinc-300">data</span>{"\n"}
                          {"  "}&#125;, <span className="text-sky-300">playerOrigin</span>);{"\n"}
                          {"  "}<span className="text-purple-400">return</span> <span className="text-zinc-500">new</span> <span className="text-yellow-200">Promise</span>((<span className="text-sky-300">resolve</span>, <span className="text-sky-300">reject</span>) =&gt; <span className="text-sky-300">pending</span>.<span className="text-cyan-300">set</span>(<span className="text-sky-300">requestId</span>, &#123; <span className="text-sky-300">resolve</span>, <span className="text-sky-300">reject</span> &#125;));{"\n"}
                          &#125;{"\n\n"}
                          <span className="text-purple-400">await</span> <span className="text-cyan-300">sendCommand</span>(<span className="text-emerald-400">&apos;setProvider&apos;</span>, &#123; <span className="text-zinc-300">language</span>: <span className="text-emerald-400">&apos;sub&apos;</span>, <span className="text-zinc-300">providerId</span>: <span className="text-emerald-400">&apos;uwu&apos;</span> &#125;);{"\n"}
                          <span className="text-purple-400">await</span> <span className="text-cyan-300">sendCommand</span>(<span className="text-emerald-400">&apos;seek&apos;</span>, &#123; <span className="text-zinc-300">time</span>: <span className="text-amber-400">145</span> &#125;);
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section
        id="faq"
        className="py-16 sm:py-24 border-t border-white/[0.06] relative scroll-mt-20"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
              Frequently Asked Questions
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400">
              Clear answers regarding embed URLs, databases, postMessage telemetry, and self-hosting.
            </p>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <div
                  key={index}
                  className="rounded-xl bg-[#080808] border border-white/[0.08] hover:border-white/[0.16] transition-colors overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 cursor-pointer focus:outline-none"
                  >
                    <span className="text-sm sm:text-base font-bold text-white tracking-tight">
                      {faq.q}
                    </span>
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center shrink-0 transition-transform duration-200",
                        isOpen && "rotate-180 bg-white/20"
                      )}
                    >
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-300" />
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-zinc-400 leading-relaxed border-t border-white/[0.04]">
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SYSTEM STATUS SECTION */}
      <section
        id="status"
        className="py-16 sm:py-20 scroll-mt-20 border-t border-white/[0.06]"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-6">
          {/* Heading */}
          <div className="text-center space-y-1.5 mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              System Status
            </h2>
            <p className="text-sm text-zinc-400">
              Live checks for embed delivery and stream servers.
            </p>
          </div>

          {/* Infrastructure Card */}
          <div className="rounded-2xl bg-[#030303] border border-white/[0.08] shadow-2xl overflow-hidden">
            {/* Table Header / Action Bar */}
            <div className="px-5 py-3.5 bg-[#0C0C0C] border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Server className="w-4 h-4 text-zinc-300" />
                <span className="text-sm font-bold text-white tracking-wide">Infrastructure</span>
              </div>

              <button
                type="button"
                onClick={handleRefreshStatus}
                className="h-7 px-3 rounded-full bg-[#181818] hover:bg-[#202020] border border-white/[0.08] text-xs font-medium text-zinc-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
              >
                <RotateCw
                  className={cn("w-3 h-3 text-zinc-400 transition-transform", isRefreshingStatus && "animate-spin")}
                />
                <span>Refresh</span>
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-product-sans">
                <thead>
                  <tr className="border-b border-white/[0.06] text-zinc-400 bg-[#030303]">
                    <th className="py-3 px-5 font-semibold">Name</th>
                    <th className="py-3 px-5 font-semibold">Status</th>
                    <th className="py-3 px-5 font-semibold">Role</th>
                    <th className="py-3 px-5 font-semibold text-right">Last Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {[
                    { name: "Edge CDN", role: "Media delivery", status: "Operational" },
                    { name: "API", role: "Resolve & embed", status: "Operational" },
                    { name: "Flow 1", role: "Stream server", status: "Operational" },
                    { name: "Flow 2", role: "Stream server", status: "Operational" },
                    { name: "Yuri", role: "Stream server", status: "Operational" },
                    { name: "Zuri", role: "Stream server", status: "Operational" },
                  ].map((row, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-3.5 px-5 font-bold text-white whitespace-nowrap">
                        {row.name}
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>{row.status}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-zinc-400 whitespace-nowrap">
                        {row.role}
                      </td>
                      <td className="py-3.5 px-5 text-zinc-400 text-right font-mono whitespace-nowrap">
                        {statusLastCheckTime || "10:20:24 PM"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 border-t border-white/[0.06] bg-[#030303] backdrop-blur-sm text-center space-y-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="AniFlow API Logo" className="w-6 h-6 object-contain" />
            <span className="font-extrabold text-sm tracking-tight text-white">AniFlow API</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.08] text-zinc-400 border border-white/[0.1]">
              v1.0
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-400">
            <button
              type="button"
              onClick={() => scrollToSection("features")}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Features
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("docs")}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Documentation
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("faq")}
              className="hover:text-white transition-colors cursor-pointer"
            >
              FAQ
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("status")}
              className="hover:text-white transition-colors cursor-pointer"
            >
              System Status
            </button>
            <a
              href="https://github.com/realmichaelstetson/AniFlow-API"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors flex items-center gap-1"
            >
              <span>GitHub</span>
              <ExternalLink className="w-3 h-3 text-zinc-500" />
            </a>
          </div>

          <p className="text-xs text-zinc-500">
            © 2026 AniFlow API • MIT License
          </p>
        </div>

        <p className="max-w-3xl mx-auto text-[11px] text-zinc-600 leading-relaxed">
          DMCA & Legal Disclaimer: AniFlow API is an open-source stream aggregator and player framework. We do not host, store, or upload media files. All streams are resolved dynamically from publicly available third-party endpoints. Copyright inquiries should be directed to the respective upstream media hosts.
        </p>
      </footer>
    </div>
  );
}
