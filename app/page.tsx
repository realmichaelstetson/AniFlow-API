"use client";

import React, { useState, useEffect, useRef } from "react";
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
  Activity,
  Terminal,
  ChevronRight,
  Radio,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function HomePage() {
  // Playground state
  const [embedType, setEmbedType] = useState<"ani" | "mal">("ani");
  const [animeId, setAnimeId] = useState<string>("154587"); // Frieren
  const [episode, setEpisode] = useState<string>("1");
  const [audio, setAudio] = useState<"sub" | "dub">("sub");
  const [server, setServer] = useState<"flow" | "zuri">("flow");
  const [startAt, setStartAt] = useState<string>("0");
  const [autoskipIntro, setAutoskipIntro] = useState<boolean>(true);
  const [autoskipOutro, setAutoskipOutro] = useState<boolean>(true);
  const [copiedType, setCopiedType] = useState<string | null>(null);

  // Live PostMessage Event Logger
  const [eventLogs, setEventLogs] = useState<Array<{ time: string; type: string; payload: any }>>([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Compute embed URL
  const [origin, setOrigin] = useState<string>("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const embedPath = `/embed/${embedType}/${animeId || "154587"}/${episode || "1"}/${audio}`;
  const queryParams = new URLSearchParams();
  if (server !== "flow") queryParams.set("server", server);
  if (startAt && parseFloat(startAt) > 0) queryParams.set("startAt", startAt);
  if (!autoskipIntro) queryParams.set("autoskipIntro", "0");
  if (!autoskipOutro) queryParams.set("autoskipOutro", "0");

  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : "";
  const fullEmbedUrl = `${origin}${embedPath}${queryString}`;
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
      } else if (data?.type === "vidhawk-error" || data?.type === "STREAM_UNAVAILABLE") {
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
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#000000] text-white font-product-sans selection:bg-white/20">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-[#000000]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <a href="#" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-full bg-[#181818] border border-white/[0.1] flex items-center justify-center text-white shadow-inner group-hover:border-white/30 transition-colors">
                <span className="text-sm font-black tracking-tighter">VH</span>
              </div>
              <span className="font-bold text-base sm:text-lg tracking-tight text-white">
                VidHawk
              </span>
            </a>

            <nav className="hidden md:flex items-center gap-1 text-xs text-zinc-400 font-medium">
              <a href="#features" className="h-7 px-3 rounded-full hover:text-white hover:bg-white/[0.04] flex items-center transition-colors">
                Features
              </a>
              <a href="#playground" className="h-7 px-3 rounded-full hover:text-white hover:bg-white/[0.04] flex items-center transition-colors">
                Playground
              </a>
              <a href="#status" className="h-7 px-3 rounded-full hover:text-white hover:bg-white/[0.04] flex items-center transition-colors">
                Status
              </a>
              <a href="#docs" className="h-7 px-3 rounded-full hover:text-white hover:bg-white/[0.04] flex items-center transition-colors">
                Documentation
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0C0C0C] border border-white/[0.08] text-[11px] font-medium text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>All Systems Operational</span>
            </div>

            <a
              href="#playground"
              className="h-7 px-3.5 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-sm active:scale-95"
            >
              Get Embed
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-12 pb-16 sm:pt-20 sm:pb-24 overflow-hidden border-b border-white/[0.06]">
        {/* Subtle background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-white/[0.02] rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-10">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0C0C0C] border border-white/[0.08] text-xs font-medium text-zinc-300">
              <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
              <span>Flow, Zuri & AniList v2.4 Embedding API</span>
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-tight">
              Seamless Anime Embedding
            </h1>

            <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              Elevate your site with high-performance AniList & MAL embeds. Flow and Zuri servers, Sub/Dub switching, and edge HLS — built for developers.
            </p>

            {/* Quick feature tags */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs font-medium text-zinc-400">
              <span className="px-3 py-1 rounded-full bg-[#030303] border border-white/[0.06]">Flow & Zuri</span>
              <span className="px-3 py-1 rounded-full bg-[#030303] border border-white/[0.06]">Sub & Dub</span>
              <span className="px-3 py-1 rounded-full bg-[#030303] border border-white/[0.06]">Auto-Skip Intro/Outro</span>
              <span className="px-3 py-1 rounded-full bg-[#030303] border border-white/[0.06]">Edge Proxied HLS</span>
              <span className="px-3 py-1 rounded-full bg-[#030303] border border-white/[0.06]">Two-way PostMessage</span>
            </div>
          </div>

          {/* Live Embed Demo + PostMessage Inspector */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#030303] shadow-2xl p-2 sm:p-3 max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
              {/* Iframe Viewport */}
              <div className="lg:col-span-8 flex flex-col rounded-xl overflow-hidden bg-black border border-white/[0.06]">
                <div className="h-8 px-3 bg-[#0C0C0C] border-b border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-400">
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-mono truncate">{embedPath}{queryString}</span>
                  </div>
                  <a
                    href={fullEmbedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white flex items-center gap-1 shrink-0"
                  >
                    <span>Full window</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
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

              {/* PostMessage Command & Event Console */}
              <div className="lg:col-span-4 flex flex-col rounded-xl bg-[#0C0C0C] border border-white/[0.06] p-3 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] mb-2.5">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="font-bold text-white tracking-wide">Parent postMessage Relay</span>
                  </div>
                  <button
                    onClick={() => setEventLogs([])}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300"
                  >
                    Clear
                  </button>
                </div>

                {/* Commands Trigger Bar */}
                <div className="grid grid-cols-2 gap-1.5 mb-3">
                  <button
                    onClick={() => sendIframeCommand("play")}
                    className="h-7 rounded-lg bg-[#181818] hover:bg-[#202020] border border-white/[0.08] text-[11px] font-medium text-zinc-200 flex items-center justify-center gap-1 transition-all"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>play</span>
                  </button>
                  <button
                    onClick={() => sendIframeCommand("pause")}
                    className="h-7 rounded-lg bg-[#181818] hover:bg-[#202020] border border-white/[0.08] text-[11px] font-medium text-zinc-200 flex items-center justify-center gap-1 transition-all"
                  >
                    <Pause className="w-3 h-3 fill-current" />
                    <span>pause</span>
                  </button>
                  <button
                    onClick={() => sendIframeCommand("seek", { time: 30 })}
                    className="h-7 rounded-lg bg-[#181818] hover:bg-[#202020] border border-white/[0.08] text-[11px] font-medium text-zinc-200 flex items-center justify-center gap-1 transition-all"
                  >
                    <span>seek(30s)</span>
                  </button>
                  <button
                    onClick={() => sendIframeCommand("getStatus")}
                    className="h-7 rounded-lg bg-[#181818] hover:bg-[#202020] border border-white/[0.08] text-[11px] font-medium text-zinc-200 flex items-center justify-center gap-1 transition-all"
                  >
                    <span>getStatus</span>
                  </button>
                </div>

                {/* Logs Stream */}
                <div className="flex-1 min-h-[160px] max-h-[220px] overflow-y-auto space-y-1.5 font-mono text-[10.5px] pr-1">
                  {eventLogs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-zinc-500 text-[11px] italic py-8">
                      Listening for incoming events...
                    </div>
                  ) : (
                    eventLogs.map((log, idx) => (
                      <div
                        key={idx}
                        className="p-1.5 rounded-lg bg-[#030303] border border-white/[0.04] text-zinc-300"
                      >
                        <div className="flex items-center justify-between text-[9.5px] text-zinc-500 pb-0.5">
                          <span className="text-emerald-400 font-semibold">{log.type}</span>
                          <span>{log.time}</span>
                        </div>
                        <div className="truncate text-zinc-400">
                          {JSON.stringify(log.payload)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Embed Builder / Playground */}
      <section id="playground" className="py-16 sm:py-20 border-b border-white/[0.06] bg-[#030303]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
              Embed Builder
            </h2>
            <p className="text-sm text-zinc-400">
              Customize query parameters and instantly generate ready-to-use iframe and API calls.
            </p>
          </div>

          <div className="max-w-4xl mx-auto rounded-2xl bg-[#0C0C0C] border border-white/[0.08] p-4 sm:p-6 shadow-xl space-y-6">
            {/* Quick Sample Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                Quick Presets
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { name: "Frieren: Beyond Journey's End", ani: "154587", mal: "52991", ep: "1" },
                  { name: "Solo Leveling", ani: "151807", mal: "52299", ep: "1" },
                  { name: "Dandadan", ani: "171018", mal: "57334", ep: "1" },
                  { name: "Attack on Titan", ani: "16498", mal: "16498", ep: "1" },
                ].map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => {
                      setAnimeId(embedType === "ani" ? preset.ani : preset.mal);
                      setEpisode(preset.ep);
                    }}
                    className={cn(
                      "h-7 px-3 rounded-full text-xs font-medium border transition-all cursor-pointer",
                      animeId === (embedType === "ani" ? preset.ani : preset.mal)
                        ? "bg-[#181818] border-white/20 text-white font-bold"
                        : "bg-[#030303] border-white/[0.06] text-zinc-400 hover:text-white hover:bg-[#141414]"
                    )}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Config Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
              {/* Source Mode */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Database Source</label>
                <div className="flex h-[36px] p-0.5 rounded-full bg-[#030303] border border-white/[0.08]">
                  <button
                    onClick={() => {
                      setEmbedType("ani");
                      if (animeId === "52991") setAnimeId("154587");
                    }}
                    className={cn(
                      "flex-1 h-full rounded-full text-xs font-medium transition-all flex items-center justify-center",
                      embedType === "ani" ? "bg-[#181818] text-white shadow-sm font-semibold" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    AniList
                  </button>
                  <button
                    onClick={() => {
                      setEmbedType("mal");
                      if (animeId === "154587") setAnimeId("52991");
                    }}
                    className={cn(
                      "flex-1 h-full rounded-full text-xs font-medium transition-all flex items-center justify-center",
                      embedType === "mal" ? "bg-[#181818] text-white shadow-sm font-semibold" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    MyAnimeList (MAL)
                  </button>
                </div>
              </div>

              {/* Anime ID */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  {embedType === "ani" ? "AniList ID" : "MAL ID"}
                </label>
                <input
                  type="text"
                  value={animeId}
                  onChange={(e) => setAnimeId(e.target.value.trim())}
                  placeholder="e.g. 154587"
                  className="w-full h-[36px] px-3.5 rounded-full bg-[#030303] border border-white/[0.08] text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-white/30"
                />
              </div>

              {/* Episode Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Episode Number</label>
                <input
                  type="number"
                  min="1"
                  value={episode}
                  onChange={(e) => setEpisode(e.target.value)}
                  className="w-full h-[36px] px-3.5 rounded-full bg-[#030303] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-white/30"
                />
              </div>

              {/* Audio Track */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Default Audio Track</label>
                <div className="flex h-[36px] p-0.5 rounded-full bg-[#030303] border border-white/[0.08]">
                  <button
                    onClick={() => setAudio("sub")}
                    className={cn(
                      "flex-1 h-full rounded-full text-xs font-medium transition-all flex items-center justify-center",
                      audio === "sub" ? "bg-[#181818] text-white shadow-sm font-semibold" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    Japanese (Sub)
                  </button>
                  <button
                    onClick={() => setAudio("dub")}
                    className={cn(
                      "flex-1 h-full rounded-full text-xs font-medium transition-all flex items-center justify-center",
                      audio === "dub" ? "bg-[#181818] text-white shadow-sm font-semibold" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    English (Dub)
                  </button>
                </div>
              </div>

              {/* Server Route */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Stream Server</label>
                <div className="flex h-[36px] p-0.5 rounded-full bg-[#030303] border border-white/[0.08]">
                  <button
                    onClick={() => setServer("flow")}
                    className={cn(
                      "flex-1 h-full rounded-full text-xs font-medium transition-all flex items-center justify-center",
                      server === "flow" ? "bg-[#181818] text-white shadow-sm font-semibold" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    Flow (Default)
                  </button>
                  <button
                    onClick={() => setServer("zuri")}
                    className={cn(
                      "flex-1 h-full rounded-full text-xs font-medium transition-all flex items-center justify-center",
                      server === "zuri" ? "bg-[#181818] text-white shadow-sm font-semibold" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    Zuri
                  </button>
                </div>
              </div>

              {/* Start At / Progress */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Start At / Progress (seconds)</label>
                <input
                  type="number"
                  min="0"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  placeholder="0"
                  className="w-full h-[36px] px-3.5 rounded-full bg-[#030303] border border-white/[0.08] text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-white/30"
                />
              </div>
            </div>

            {/* Micro Toggles for Auto Skip */}
            <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-white/[0.06]">
              {/* Skip Intro */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAutoskipIntro(!autoskipIntro)}
                  className={cn(
                    "relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer",
                    autoskipIntro ? "bg-white" : "bg-[#202020] border border-white/[0.08]"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-2.5 w-2.5 rounded-full shadow-xs transition-transform duration-200",
                      autoskipIntro ? "translate-x-3 bg-black" : "translate-x-0.5 bg-zinc-500"
                    )}
                  />
                </button>
                <span className="text-xs font-medium text-zinc-300">Auto-skip Intro (default ON)</span>
              </div>

              {/* Skip Outro */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAutoskipOutro(!autoskipOutro)}
                  className={cn(
                    "relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer",
                    autoskipOutro ? "bg-white" : "bg-[#202020] border border-white/[0.08]"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-2.5 w-2.5 rounded-full shadow-xs transition-transform duration-200",
                      autoskipOutro ? "translate-x-3 bg-black" : "translate-x-0.5 bg-zinc-500"
                    )}
                  />
                </button>
                <span className="text-xs font-medium text-zinc-300">Auto-skip Outro (default ON)</span>
              </div>
            </div>

            {/* Generated Code Snippet */}
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400">Generated Embed Code</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopy(fullEmbedUrl, "url")}
                    className="h-7 px-3 rounded-full bg-[#181818] hover:bg-[#202020] border border-white/[0.08] text-[11px] font-medium text-zinc-200 flex items-center gap-1.5 transition-all"
                  >
                    {copiedType === "url" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedType === "url" ? "Copied URL" : "Copy URL"}</span>
                  </button>
                  <button
                    onClick={() => handleCopy(iframeCode, "iframe")}
                    className="h-7 px-3 rounded-full bg-white hover:bg-zinc-200 text-black text-[11px] font-bold flex items-center gap-1.5 transition-all"
                  >
                    {copiedType === "iframe" ? <Check className="w-3 h-3 text-black" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedType === "iframe" ? "Copied iframe" : "Copy iframe Code"}</span>
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#030303] border border-white/[0.08] font-mono text-xs text-zinc-300 overflow-x-auto">
                <pre>{iframeCode}</pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Premium Features Section */}
      <section id="features" className="py-16 sm:py-24 border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
              Premium Features
            </h2>
            <p className="text-sm text-zinc-400">
              Everything you need to deliver exceptional anime embeds directly to your audience.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: Layers,
                title: "Seamless Embedding",
                desc: "AniList or MAL id, episode, audio — one single iframe with zero configuration needed.",
              },
              {
                icon: Sparkles,
                title: "High-Quality Streaming",
                desc: "Adaptive HLS delivered from the edge for bufferless, buttery smooth playback.",
              },
              {
                icon: Zap,
                title: "Lightning Fast",
                desc: "Warm Sub/Dub buffers and pre-cached segments for instant audio flips without reloads.",
              },
              {
                icon: Shield,
                title: "Protected Streams",
                desc: "Direct CDN links stay completely hidden — all media and decryption keys are proxied safely.",
              },
              {
                icon: Server,
                title: "Flow · Zuri Servers",
                desc: "Switch streaming sources live with ?server=flow|zuri, automatically mapped across AniList and MAL.",
              },
              {
                icon: Sliders,
                title: "Captions & Skips",
                desc: "Soft subs, custom .vtt/.srt uploads, subtitle sync (+/- 0.5s), and auto opening/ending skips.",
              },
            ].map((f, i) => (
              <div
                key={i}
                className="p-5 rounded-2xl bg-[#030303] border border-white/[0.08] hover:border-white/[0.16] transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-[#0C0C0C] border border-white/[0.08] flex items-center justify-center text-zinc-300 mb-4 group-hover:text-white transition-colors">
                  <f.icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white mb-1.5">{f.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* System Status Section */}
      <section id="status" className="py-16 border-b border-white/[0.06] bg-[#030303]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">System Status</h2>
              <p className="text-xs text-zinc-400">Live health checks for embed delivery and stream pipelines.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-xs font-semibold text-emerald-400">99.98% System Uptime</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { name: "Flow Server (HLS Edge)", status: "Operational", ping: "84ms" },
              { name: "Zuri Server (Animex)", status: "Operational", ping: "108ms" },
              { name: "Proxy & Key Pipeline", status: "Operational", ping: "42ms" },
              { name: "AniSkip Timestamp Sync", status: "Synchronized", ping: "115ms" },
            ].map((s, i) => (
              <div key={i} className="p-3.5 rounded-xl bg-[#0C0C0C] border border-white/[0.08] flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white mb-0.5">{s.name}</div>
                  <div className="text-[10px] text-zinc-500">{s.ping} response latency</div>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{s.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Documentation Section */}
      <section id="docs" className="py-16 sm:py-24 border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-12">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
              Documentation
            </h2>
            <p className="text-sm text-zinc-400">
              Reference for embedding and customizing VidHawk on your site.
            </p>
          </div>

          {/* 1. AniList Embed */}
          <div className="rounded-2xl bg-[#030303] border border-white/[0.08] p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-[#181818] border border-white/[0.08] text-[11px] font-mono font-bold text-zinc-300">
                GET
              </span>
              <h3 className="text-base font-bold text-white">AniList Embed Endpoint</h3>
            </div>

            <div className="p-3 rounded-xl bg-[#0C0C0C] border border-white/[0.08] font-mono text-xs text-white overflow-x-auto flex items-center justify-between">
              <code>https://vidhawk.buzz/embed/ani/&#123;anilistId&#125;/&#123;episode&#125;/&#123;audio&#125;?server=flow</code>
              <button
                onClick={() => handleCopy("https://vidhawk.buzz/embed/ani/{anilistId}/{episode}/{audio}?server=flow", "doc1")}
                className="text-zinc-400 hover:text-white pl-2"
              >
                {copiedType === "doc1" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Flow is the default when omitted. If AniList fails, VidHawk auto-retries the same number as a MAL id.
            </p>
          </div>

          {/* 2. MAL Embed */}
          <div className="rounded-2xl bg-[#030303] border border-white/[0.08] p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-[#181818] border border-white/[0.08] text-[11px] font-mono font-bold text-zinc-300">
                GET
              </span>
              <h3 className="text-base font-bold text-white">MAL Embed Endpoint</h3>
            </div>

            <div className="p-3 rounded-xl bg-[#0C0C0C] border border-white/[0.08] font-mono text-xs text-white overflow-x-auto flex items-center justify-between">
              <code>https://vidhawk.buzz/embed/mal/&#123;malId&#125;/&#123;episode&#125;/&#123;audio&#125;?server=flow</code>
              <button
                onClick={() => handleCopy("https://vidhawk.buzz/embed/mal/{malId}/{episode}/{audio}?server=flow", "doc2")}
                className="text-zinc-400 hover:text-white pl-2"
              >
                {copiedType === "doc2" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Flow and Zuri work on both AniList and MAL paths (IDs are automatically mapped).
            </p>
          </div>

          {/* 3. Ticket Embed */}
          <div className="rounded-2xl bg-[#030303] border border-white/[0.08] p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-[#181818] border border-white/[0.08] text-[11px] font-mono font-bold text-zinc-300">
                POST
              </span>
              <h3 className="text-base font-bold text-white">Ticket Embed &amp; Mint API</h3>
            </div>

            <div className="p-3 rounded-xl bg-[#0C0C0C] border border-white/[0.08] font-mono text-xs text-white overflow-x-auto flex items-center justify-between">
              <code>POST /api/play &rarr; returns &#123; ticket, embedUrl &#125; &rarr; /embed?t=&#123;ticket&#125;&amp;progress=90</code>
              <button
                onClick={() => handleCopy("POST /api/play", "doc3")}
                className="text-zinc-400 hover:text-white pl-2"
              >
                {copiedType === "doc3" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Mint a temporary playback ticket or use direct path embeds. Without startAt / progress, the player automatically resumes from per-browser watch history.
            </p>
          </div>

          {/* 4. Query Options Reference Table */}
          <div className="rounded-2xl bg-[#030303] border border-white/[0.08] p-5 sm:p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Query Parameters</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/[0.08] text-zinc-400">
                    <th className="pb-2 font-semibold">Parameter</th>
                    <th className="pb-2 font-semibold">Options</th>
                    <th className="pb-2 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-zinc-300">
                  <tr>
                    <td className="py-2.5 font-bold text-white">server</td>
                    <td className="py-2.5 text-zinc-400">flow | zuri</td>
                    <td className="py-2.5">Stream source (flow default; both map AniList and MAL)</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-bold text-white">startAt / progress</td>
                    <td className="py-2.5 text-zinc-400">seconds (number)</td>
                    <td className="py-2.5">Start playback at N seconds on all embed URLs</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-bold text-white">parentHost</td>
                    <td className="py-2.5 text-zinc-400">your-site.com</td>
                    <td className="py-2.5">Used when the parent frame strips the Referer header</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-bold text-white">autoskipIntro / skipIntro</td>
                    <td className="py-2.5 text-zinc-400">1 (on) | 0 (off)</td>
                    <td className="py-2.5">Auto-skip opening when timestamps exist (default on)</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-bold text-white">autoskipOutro / skipOutro</td>
                    <td className="py-2.5 text-zinc-400">1 (on) | 0 (off)</td>
                    <td className="py-2.5">Auto-skip ending outro (default on)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. Parent postMessage Integration Guide */}
          <div className="rounded-2xl bg-[#030303] border border-white/[0.08] p-5 sm:p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Player Events (Parent Page Integration)</h3>
            <p className="text-xs text-zinc-400">
              The embed posts real-time progress to the parent via `postMessage`. Use this to sync watch history on your own site.
            </p>

            <div className="p-4 rounded-xl bg-[#0C0C0C] border border-white/[0.08] font-mono text-xs text-zinc-300 overflow-x-auto">
              <pre>{`window.addEventListener("message", (event) => {
  const data = event.data;

  // Modern structured player event
  if (data?.type === "PLAYER_EVENT") {
    // progress / time / complete / play / pause / seeked / playerstatus / error
    console.log("Player Event:", data.data);
  }

  // Legacy-friendly watch progress payload
  if (data?.type === "watching-log") {
    console.log("Watch Progress:", data);
  }
});`}</pre>
            </div>

            <div className="space-y-2 text-xs text-zinc-400">
              <p>
                <strong className="text-white">error</strong> — Emitted when content is unavailable on any server (`code: "CONTENT_UNAVAILABLE"` and `available: false`). Also emitted as `vidhawk-error` and `STREAM_UNAVAILABLE`.
              </p>
              <p>
                <strong className="text-white">progress / time</strong> — Posted about every 1s while playing. Server watch history via `POST /api/progress` saves about every 4s.
              </p>
              <p>
                <strong className="text-white">complete</strong> — Episode finished with payload:
              </p>
              <div className="p-2.5 rounded-lg bg-[#0C0C0C] font-mono text-[11px] text-zinc-300">
                &#123; currentTime, duration, percent, anilistId, malId, episode, audio, completed &#125;
              </div>
            </div>

            <h4 className="text-sm font-bold text-white pt-2">PostMessage Commands (Control the iframe)</h4>
            <div className="p-4 rounded-xl bg-[#0C0C0C] border border-white/[0.08] font-mono text-xs text-zinc-300 overflow-x-auto">
              <pre>{`// Control playback from parent window
iframe.contentWindow.postMessage({ command: "play" }, "*");
iframe.contentWindow.postMessage({ command: "pause" }, "*");
iframe.contentWindow.postMessage({ command: "seek", time: 120 }, "*");
iframe.contentWindow.postMessage({ command: "getStatus" }, "*");`}</pre>
            </div>
          </div>
        </div>
      </section>

      {/* Ready to embed CTA */}
      <section className="py-16 sm:py-20 text-center border-b border-white/[0.06] bg-[#030303]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-4">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-white">
            Ready to embed anime?
          </h2>
          <p className="text-sm text-zinc-400">
            One iframe. Flow and Zuri. Edge HLS that keeps bandwidth off your origin.
          </p>
          <div className="pt-2">
            <a
              href="#playground"
              className="inline-flex h-9 px-5 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-bold items-center justify-center transition-all shadow-lg active:scale-95 cursor-pointer"
            >
              Start Embedding Now
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 text-center text-xs text-zinc-500 bg-[#000000] space-y-3">
        <p>© 2026 VidHawk. All rights reserved.</p>
        <p className="max-w-2xl mx-auto text-[11px] text-zinc-600 leading-relaxed">
          DMCA Disclaimer: VidHawk aggregates publicly available stream sources for embedding. We do not host video files. Copyright claims should be directed to the upstream providers.
        </p>
      </footer>
    </div>
  );
}
