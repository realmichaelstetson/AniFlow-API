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
  Sparkles,
  ExternalLink,
  Code2,
  Terminal,
  Activity,
  Sliders,
  Tv,
  Film,
  RotateCw,
  ArrowLeftRight,
  Wifi,
  Radio,
  FileCode,
  MessageSquare,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

type DocTab = "endpoints" | "implementation" | "options" | "events" | "postmessage";

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
    <div className="min-h-screen bg-[#000000] text-white font-product-sans selection:bg-white/20">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-[#000000]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <a href="#" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-full bg-[#181818] border border-white/[0.1] flex items-center justify-center p-1.5 shadow-inner group-hover:border-white/30 transition-colors">
                <img src="/logo.svg" alt="aniflow logo" className="w-full h-full object-contain" />
              </div>
              <span className="font-bold text-base sm:text-lg tracking-tight text-white">
                aniflow
              </span>
            </a>

            <nav className="hidden md:flex items-center gap-1 text-xs text-zinc-400 font-medium">
              <a
                href="#docs"
                className="h-7 px-3 rounded-full hover:text-white hover:bg-white/[0.04] flex items-center transition-colors"
              >
                Documentation
              </a>
              <a
                href="#status"
                className="h-7 px-3 rounded-full hover:text-white hover:bg-white/[0.04] flex items-center transition-colors"
              >
                System Status
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0C0C0C] border border-white/[0.08] text-[11px] font-medium text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>All Systems Operational</span>
            </div>

            <a
              href="#docs"
              className="h-7 px-3.5 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-sm active:scale-95"
            >
              Get Embed
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-12 pb-16 sm:pt-20 sm:pb-24 overflow-hidden border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-10">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0C0C0C] border border-white/[0.08] text-xs font-medium text-zinc-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Flow 1, Flow 2, Yuri & Zuri Stream Engine</span>
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-tight">
              Developer-First Anime Embedding
            </h1>

            <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              Integrate lightning-fast AniList and MAL video players directly into your website. Multi-server streaming, instant Sub/Dub flipping, and two-way postMessage synchronization.
            </p>

            {/* Quick feature tags */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs font-medium text-zinc-400">
              <span className="px-3 py-1 rounded-full bg-[#030303] border border-white/[0.06]">Flow 1 &amp; Flow 2</span>
              <span className="px-3 py-1 rounded-full bg-[#030303] border border-white/[0.06]">Yuri &amp; Zuri</span>
              <span className="px-3 py-1 rounded-full bg-[#030303] border border-white/[0.06]">Sub &amp; Dub</span>
              <span className="px-3 py-1 rounded-full bg-[#030303] border border-white/[0.06]">Auto-Skip Intro / Outro</span>
              <span className="px-3 py-1 rounded-full bg-[#030303] border border-white/[0.06]">Two-Way postMessage</span>
            </div>
          </div>

          <div className="max-w-4xl mx-auto">
            {/* Quick config controls directly above player */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 mb-3.5">
              {/* 1. Database Selector (AniList / MAL) */}
              <div className="relative">
                <select
                  value={embedType}
                  onChange={(e) => {
                    const val = e.target.value as "ani" | "mal";
                    setEmbedType(val);
                  }}
                  className="h-8 pl-3 pr-7 rounded-lg bg-[#0C0C0C] hover:bg-[#141414] border border-white/[0.12] hover:border-white/30 text-xs font-semibold text-white appearance-none cursor-pointer transition-colors focus:outline-none focus:border-white/40 shadow-sm"
                >
                  <option value="ani" className="bg-[#0C0C0C] text-white">AniList</option>
                  <option value="mal" className="bg-[#0C0C0C] text-white">MAL</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* 2. Anime ID Input */}
              <input
                type="text"
                value={animeId}
                onChange={(e) => setAnimeId(e.target.value.trim())}
                placeholder="16498"
                className="h-8 w-24 sm:w-28 px-3 rounded-lg bg-[#0C0C0C] hover:bg-[#141414] border border-white/[0.12] hover:border-white/30 text-xs font-semibold text-white text-center focus:outline-none focus:border-white/40 transition-colors font-mono shadow-sm"
              />

              {/* 3. Episode Input */}
              <input
                type="number"
                min="1"
                value={episode}
                onChange={(e) => setEpisode(e.target.value)}
                placeholder="1"
                className="h-8 w-16 sm:w-18 px-2.5 rounded-lg bg-[#0C0C0C] hover:bg-[#141414] border border-white/[0.12] hover:border-white/30 text-xs font-semibold text-white text-center focus:outline-none focus:border-white/40 transition-colors font-mono shadow-sm"
              />

              {/* 4. Audio Selector (Dub / Sub) */}
              <div className="relative">
                <select
                  value={audio}
                  onChange={(e) => {
                    const val = e.target.value as "sub" | "dub";
                    setAudio(val);
                    if (val === "dub" && (server === "zuri" || server === "zuna")) {
                      setServer("flow");
                    }
                  }}
                  className="h-8 pl-3 pr-7 rounded-lg bg-[#0C0C0C] hover:bg-[#141414] border border-white/[0.12] hover:border-white/30 text-xs font-semibold text-white appearance-none cursor-pointer transition-colors focus:outline-none focus:border-white/40 shadow-sm"
                >
                  <option value="dub" className="bg-[#0C0C0C] text-white">Dub</option>
                  <option value="sub" className="bg-[#0C0C0C] text-white">Sub</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* 5. Server Selector (Flow / Flow 1 / Flow 2 / Yuri / Zuri - Zuri is Sub only) */}
              <div className="relative">
                <select
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  className="h-8 pl-3 pr-7 rounded-lg bg-[#0C0C0C] hover:bg-[#141414] border border-white/[0.12] hover:border-white/30 text-xs font-semibold text-white appearance-none cursor-pointer transition-colors focus:outline-none focus:border-white/40 shadow-sm"
                >
                  <option value="flow" className="bg-[#0C0C0C] text-white">Flow</option>
                  <option value="flow2" className="bg-[#0C0C0C] text-white">Flow 2</option>
                  <option value="yuri" className="bg-[#0C0C0C] text-white">Yuri</option>
                  {audio === "sub" && <option value="zuri" className="bg-[#0C0C0C] text-white">Zuri</option>}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Player Viewport */}
            <div className="flex flex-col rounded-xl overflow-hidden bg-black border border-white/[0.08] shadow-2xl">
              <div className="h-8 px-3 bg-[#0C0C0C] border-b border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-400">
                <div className="flex items-center gap-2 truncate">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-mono truncate">{embedPath}{queryString}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleCopy(fullEmbedUrl, "hero-url")}
                    className="hover:text-white flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                  >
                    {copiedType === "hero-url" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedType === "hero-url" ? "Copied" : "Copy URL"}</span>
                  </button>
                  <a
                    href={fullEmbedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white flex items-center gap-1 shrink-0 transition-colors"
                  >
                    <span>Full window</span>
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

      {/* DOCUMENTATION SECTION (Matches Image 1 layout & shad-renew aesthetic) */}
      <section id="docs" className="py-16 sm:py-24 border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          {/* Top Domain Callout (Red Notice from Screenshot) */}
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
              Reference for embedding and customizing aniflow on your site.
            </p>
          </div>

          {/* Segmented Control Navigation Tabs */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex p-1 rounded-full bg-[#0C0C0C] border border-white/[0.08] shadow-inner max-w-full overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveDocTab("endpoints")}
                className={cn(
                  "h-7 px-3 sm:px-4 rounded-full text-xs font-medium transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer",
                  activeDocTab === "endpoints"
                    ? "bg-[#181818] text-white shadow-sm font-semibold"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                <span>Endpoints</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveDocTab("implementation")}
                className={cn(
                  "h-7 px-3 sm:px-4 rounded-full text-xs font-medium transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer",
                  activeDocTab === "implementation"
                    ? "bg-[#181818] text-white shadow-sm font-semibold"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                <Code2 className="w-3.5 h-3.5 shrink-0" />
                <span>Implementation</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveDocTab("options")}
                className={cn(
                  "h-7 px-3 sm:px-4 rounded-full text-xs font-medium transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer",
                  activeDocTab === "options"
                    ? "bg-[#181818] text-white shadow-sm font-semibold"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                <Sliders className="w-3.5 h-3.5 shrink-0" />
                <span>Options</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveDocTab("events")}
                className={cn(
                  "h-7 px-3 sm:px-4 rounded-full text-xs font-medium transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer",
                  activeDocTab === "events"
                    ? "bg-[#181818] text-white shadow-sm font-semibold"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                <Activity className="w-3.5 h-3.5 shrink-0" />
                <span>Events</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveDocTab("postmessage")}
                className={cn(
                  "h-7 px-3 sm:px-4 rounded-full text-xs font-medium transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer",
                  activeDocTab === "postmessage"
                    ? "bg-[#181818] text-white shadow-sm font-semibold"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                <Terminal className="w-3.5 h-3.5 shrink-0" />
                <span>PostMessage</span>
              </button>
            </div>
          </div>

          {/* TAB 1: ENDPOINTS (Matches Screenshot layout exactly) */}
          {activeDocTab === "endpoints" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-200">
              {/* Card 1: AniList Embed */}
              <div className="p-5 sm:p-6 rounded-2xl bg-[#030303] border border-white/[0.08] shadow-xl flex flex-col justify-between space-y-5">
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#0C0C0C] border border-white/[0.08] flex items-center justify-center text-zinc-300">
                      <Film className="w-4 h-4 text-zinc-300" />
                    </div>
                    <h3 className="text-base font-bold text-white tracking-wide">AniList Embed</h3>
                  </div>

                  {/* Endpoint section */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
                      <span>Endpoint</span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            `${currentOrigin}/embed/ani/{anilistId}/{episode}/{audio}?server=flow`,
                            "ep-ani"
                          )
                        }
                        className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      >
                        {copiedType === "ep-ani" ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedType === "ep-ani" ? "Copied" : "Copy"}</span>
                      </button>
                    </div>

                    <div className="p-3 rounded-xl bg-[#0C0C0C] border border-white/[0.08] font-mono text-xs text-[#4ade80] overflow-x-auto leading-relaxed">
                      <code>{currentOrigin}/embed/ani/&#123;anilistId&#125;/&#123;episode&#125;/&#123;audio&#125;?server=flow</code>
                    </div>
                  </div>

                  {/* Description note */}
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Flow is the default when omitted. If AniList fails, aniflow auto-retries the same number as a MAL id.
                  </p>
                </div>

                {/* Required parameters */}
                <div className="space-y-2 pt-3 border-t border-white/[0.06]">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                    Required
                  </span>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2 py-0.5 rounded-md bg-amber-400/10 text-amber-300 border border-amber-400/20 font-mono font-semibold">
                        anilistId
                      </span>
                      <span className="text-zinc-300">AniList anime id</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="px-2 py-0.5 rounded-md bg-amber-400/10 text-amber-300 border border-amber-400/20 font-mono font-semibold">
                        episode
                      </span>
                      <span className="text-zinc-300">Episode number</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: MAL Embed */}
              <div className="p-5 sm:p-6 rounded-2xl bg-[#030303] border border-white/[0.08] shadow-xl flex flex-col justify-between space-y-5">
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#0C0C0C] border border-white/[0.08] flex items-center justify-center text-zinc-300">
                      <Tv className="w-4 h-4 text-zinc-300" />
                    </div>
                    <h3 className="text-base font-bold text-white tracking-wide">MAL Embed (Flow / Gojo)</h3>
                  </div>

                  {/* Endpoint section */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
                      <span>Endpoint</span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            `${currentOrigin}/embed/mal/{malId}/{episode}/{audio}?server=flow`,
                            "ep-mal"
                          )
                        }
                        className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      >
                        {copiedType === "ep-mal" ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedType === "ep-mal" ? "Copied" : "Copy"}</span>
                      </button>
                    </div>

                    <div className="p-3 rounded-xl bg-[#0C0C0C] border border-white/[0.08] font-mono text-xs text-[#4ade80] overflow-x-auto leading-relaxed">
                      <code>{currentOrigin}/embed/mal/&#123;malId&#125;/&#123;episode&#125;/&#123;audio&#125;?server=flow</code>
                    </div>
                  </div>

                  {/* Description note */}
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Flow and Zuri work on both AniList and MAL paths (IDs are mapped).
                  </p>
                </div>

                {/* Optional query parameters */}
                <div className="space-y-2 pt-3 border-t border-white/[0.06]">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                    Optional query
                  </span>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 font-mono font-semibold">
                        server
                      </span>
                      <span className="text-zinc-400 font-mono">flow1 · flow2 · yuri · zuri</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 font-mono font-semibold">
                        startAt
                      </span>
                      <span className="text-zinc-400">or</span>
                      <span className="px-2 py-0.5 rounded-md bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 font-mono font-semibold">
                        progress
                      </span>
                      <span className="text-zinc-400">— start at N seconds</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: IMPLEMENTATION */}
          {activeDocTab === "implementation" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* HTML Embed Snippet */}
              <div className="p-5 sm:p-6 rounded-2xl bg-[#030303] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-bold text-white">Responsive HTML Iframe</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;">\n  <iframe\n    src="${currentOrigin}/embed/ani/154587/1/sub?server=flow1"\n    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"\n    allowfullscreen\n    allow="autoplay; fullscreen; picture-in-picture"\n  ></iframe>\n</div>`,
                        "code-html"
                      )
                    }
                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {copiedType === "code-html" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedType === "code-html" ? "Copied" : "Copy"}</span>
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0C0C0C] border border-white/[0.08] font-mono text-xs text-zinc-300 overflow-x-auto leading-relaxed">
                  <pre>{`<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
  <iframe
    src="${currentOrigin}/embed/ani/154587/1/sub?server=flow1"
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
    allowfullscreen
    allow="autoplay; fullscreen; picture-in-picture"
  ></iframe>
</div>`}</pre>
                </div>
              </div>

              {/* React / Next.js Component */}
              <div className="p-5 sm:p-6 rounded-2xl bg-[#030303] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-bold text-white">React / Next.js Component</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        `export function AnimePlayer({ anilistId, episode = 1, audio = "sub" }: { anilistId: number; episode?: number; audio?: "sub" | "dub" }) {\n  return (\n    <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black">\n      <iframe\n        src={\`${currentOrigin}/embed/ani/\${anilistId}/\${episode}/\${audio}?server=flow1\`}\n        className="w-full h-full border-0"\n        allow="autoplay; fullscreen; picture-in-picture"\n        allowFullScreen\n      />\n    </div>\n  );\n}`,
                        "code-react"
                      )
                    }
                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {copiedType === "code-react" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedType === "code-react" ? "Copied" : "Copy"}</span>
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0C0C0C] border border-white/[0.08] font-mono text-xs text-zinc-300 overflow-x-auto leading-relaxed">
                  <pre>{`export function AnimePlayer({ anilistId, episode = 1, audio = "sub" }: {
  anilistId: number;
  episode?: number;
  audio?: "sub" | "dub";
}) {
  return (
    <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black">
      <iframe
        src={\`${currentOrigin}/embed/ani/\${anilistId}/\${episode}/\${audio}?server=flow1\`}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}`}</pre>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: OPTIONS */}
          {activeDocTab === "options" && (
            <div className="p-5 sm:p-6 rounded-2xl bg-[#030303] border border-white/[0.08] space-y-4 animate-in fade-in duration-200">
              <h3 className="text-base font-bold text-white">Query Parameters Reference</h3>
              <p className="text-xs text-zinc-400">
                You can append any of the following query options to both AniList and MAL embed URLs:
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-zinc-400">
                      <th className="pb-2.5 font-semibold">Parameter</th>
                      <th className="pb-2.5 font-semibold">Allowed Values</th>
                      <th className="pb-2.5 font-semibold">Default</th>
                      <th className="pb-2.5 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] text-zinc-300">
                    <tr>
                      <td className="py-2.5 font-bold text-white">server</td>
                      <td className="py-2.5 text-zinc-400">flow1 · flow2 · yuri · zuri</td>
                      <td className="py-2.5 text-zinc-400">flow1</td>
                      <td className="py-2.5">Selects initial stream provider. Flow 1, Flow 2, Yuri support Sub &amp; Dub. Zuri (zuna) is strictly Sub only.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-bold text-white">audio</td>
                      <td className="py-2.5 text-zinc-400">sub · dub</td>
                      <td className="py-2.5 text-zinc-400">sub</td>
                      <td className="py-2.5">Preferred audio track. Defaults to Japanese Sub if omitted.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-bold text-white">startAt / progress</td>
                      <td className="py-2.5 text-zinc-400">number (seconds)</td>
                      <td className="py-2.5 text-zinc-400">0</td>
                      <td className="py-2.5">Start playback at specified second mark across all embed URLs.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-bold text-white">autoskipIntro</td>
                      <td className="py-2.5 text-zinc-400">1 (on) · 0 (off)</td>
                      <td className="py-2.5 text-zinc-400">1</td>
                      <td className="py-2.5">Automatically skip the opening song when AniSkip timestamps exist.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-bold text-white">autoskipOutro</td>
                      <td className="py-2.5 text-zinc-400">1 (on) · 0 (off)</td>
                      <td className="py-2.5 text-zinc-400">1</td>
                      <td className="py-2.5">Automatically skip the ending credits when timestamps exist.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-bold text-white">parentHost</td>
                      <td className="py-2.5 text-zinc-400">domain string</td>
                      <td className="py-2.5 text-zinc-400">-</td>
                      <td className="py-2.5">Explicit host declaration when parent frame strips HTTP Referer headers.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: EVENTS */}
          {activeDocTab === "events" && (
            <div className="p-5 sm:p-6 rounded-2xl bg-[#030303] border border-white/[0.08] space-y-4 animate-in fade-in duration-200">
              <h3 className="text-base font-bold text-white">Player Events &amp; Lifecycle</h3>
              <p className="text-xs text-zinc-400">
                The player emits structured postMessage payloads to `window.parent` on every major lifecycle change:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-[#0C0C0C] border border-white/[0.08] space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="font-bold text-white font-mono">PLAYER_EVENT (time)</span>
                  </div>
                  <p className="text-zinc-400">Emitted every 1 second while playing with current playback position, total duration, and percent.</p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0C0C0C] border border-white/[0.08] space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    <span className="font-bold text-white font-mono">PLAYER_EVENT (play / pause)</span>
                  </div>
                  <p className="text-zinc-400">Emitted whenever the user starts or pauses playback.</p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0C0C0C] border border-white/[0.08] space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="font-bold text-white font-mono">watching-log</span>
                  </div>
                  <p className="text-zinc-400">Sync payload for watch history persistence on your custom database backend.</p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0C0C0C] border border-white/[0.08] space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    <span className="font-bold text-white font-mono">CONTENT_UNAVAILABLE</span>
                  </div>
                  <p className="text-zinc-400">Emitted if all stream routes fail or source is region restricted.</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: POSTMESSAGE */}
          {activeDocTab === "postmessage" && (
            <div className="p-5 sm:p-6 rounded-2xl bg-[#030303] border border-white/[0.08] space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">Two-Way postMessage API</h3>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      `// 1. Listen for playback events\nwindow.addEventListener("message", (event) => {\n  const data = event.data;\n  if (data?.type === "PLAYER_EVENT") {\n    console.log("Player state:", data.data);\n  }\n});\n\n// 2. Control iframe remotely\niframe.contentWindow.postMessage({ command: "play" }, "*");\niframe.contentWindow.postMessage({ command: "pause" }, "*");\niframe.contentWindow.postMessage({ command: "seek", time: 90 }, "*");`,
                      "code-pm"
                    )
                  }
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  {copiedType === "code-pm" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedType === "code-pm" ? "Copied" : "Copy"}</span>
                </button>
              </div>

              <div className="p-4 rounded-xl bg-[#0C0C0C] border border-white/[0.08] font-mono text-xs text-zinc-300 overflow-x-auto leading-relaxed">
                <pre>{`// 1. Listen for playback events in parent page
window.addEventListener("message", (event) => {
  const data = event.data;
  if (data?.type === "PLAYER_EVENT") {
    // Current payload: { type: "time"|"play"|"pause"|"complete"|"error", currentTime, duration }
    console.log("Player event:", data.data);
  }
});

// 2. Control the embedded player iframe from parent window
const iframe = document.getElementById("aniflow-embed");
iframe.contentWindow.postMessage({ command: "play" }, "*");
iframe.contentWindow.postMessage({ command: "pause" }, "*");
iframe.contentWindow.postMessage({ command: "seek", time: 120 }, "*");
iframe.contentWindow.postMessage({ command: "getStatus" }, "*");`}</pre>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* SYSTEM STATUS SECTION (Matches Image 2 exactly) */}
      <section id="status" className="py-16 sm:py-20 border-b border-white/[0.06] bg-[#000000]">
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

      {/* Ready to embed CTA */}
      <section className="py-16 sm:py-20 text-center border-b border-white/[0.06] bg-[#030303]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-4">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-white">
            Ready to embed with aniflow?
          </h2>
          <p className="text-sm text-zinc-400">
            One iframe. Flow 1, Flow 2, Yuri &amp; Zuri. High-performance HLS that keeps bandwidth off your servers.
          </p>
          <div className="pt-2">
            <a
              href="#docs"
              className="inline-flex h-9 px-5 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-bold items-center justify-center transition-all shadow-lg active:scale-95 cursor-pointer"
            >
              Explore Documentation
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 text-center text-xs text-zinc-500 bg-[#000000] space-y-3">
        <p>© 2026 aniflow. All rights reserved.</p>
        <p className="max-w-2xl mx-auto text-[11px] text-zinc-600 leading-relaxed">
          DMCA Disclaimer: aniflow aggregates publicly available stream sources for embedding. We do not host video files. Copyright claims should be directed to the upstream providers.
        </p>
      </footer>
    </div>
  );
}
