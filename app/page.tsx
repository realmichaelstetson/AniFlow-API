"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Copy, Check, ExternalLink, ChevronDown, Download, Minus, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type DocTab = "endpoints" | "code" | "options" | "events" | "postmessage";

const DOC_TABS: { id: DocTab; name: string }[] = [
  { id: "endpoints", name: "Endpoints" },
  { id: "code", name: "Examples" },
  { id: "options", name: "Parameters" },
  { id: "events", name: "Events" },
  { id: "postmessage", name: "Commands" },
];

const SERVER_OPTIONS = [
  { id: "flow", name: "Flow" },
  { id: "kitty", name: "Kitty" },
  { id: "yuri", name: "Yuri" },
  { id: "zuri", name: "Zuri", subOnly: true },
  { id: "buzz", name: "Buzz" },
];

const QUALITY_OPTIONS = [
  { id: "0", name: "Best" },
  { id: "1080", name: "1080p" },
  { id: "720", name: "720p" },
  { id: "480", name: "480p" },
];

const EASE = [0.16, 1, 0.3, 1] as const;

const FEATURES: [string, string, string][] = [
  ["Five servers, one URL", "Flow, Kitty, Yuri, Zuri and Buzz behind a single route. If one source is down the API moves on to the next.", "server="],
  ["AniList and MAL IDs", "Address an anime by either database. IDs are cross-mapped and titles matched on the server.", "/ani · /mal"],
  ["Episode downloads", "Segments are fetched in parallel, decrypted and remuxed into a single MP4 with the audio track you asked for.", "/api/download"],
  ["Direct HLS", "A plain .m3u8 for hls.js, VLC, mpv, AVPlayer or ExoPlayer when you bring your own player.", "/meu8"],
  ["Intro and outro skip", "OP/ED timestamps from Re:ANIME and AniSkip, marked on the timeline and skipped automatically.", "autoskipIntro"],
  ["Real dubs only", "Providers that silently fall back to Japanese audio are dropped from the dub list.", "audio=dub"],
  ["postMessage bridge", "Progress, pause and end events go to the parent page; play, seek and volume commands come back.", "aniembed"],
];

const FAQS = [
  {
    q: "How do I embed the player?",
    a: "Add an <iframe> pointing at /embed/{ani|mal}/{id}/{episode}/{audio} with allow=\"autoplay; fullscreen; picture-in-picture\". That's the whole integration.",
  },
  {
    q: "How do episode downloads work?",
    a: "Request /api/download/ani/{anilistId}/{episode}/{audio} and the API streams back one MP4. Choose the source with ?server= and cap resolution with ?quality=720. A 24-minute 1080p episode is about 0.5–1 GB and usually takes one to two minutes.",
  },
  {
    q: "Why does a download need ffmpeg?",
    a: "Flow and Kitty deliver audio as a separate track, so it has to be merged with the video. ffmpeg only copies streams (no re-encoding). Without it on the host, Buzz and Yuri still download as .ts files.",
  },
  {
    q: "Which IDs can I use?",
    a: "AniList and MyAnimeList. Every route — embed, m3u8 and download — has an /ani and a /mal variant.",
  },
  {
    q: "Can I self-host it?",
    a: "Yes. It's an MIT-licensed Next.js 14 app with CORS headers and stream proxying already set up.",
  },
];

const STATUS_ROWS = ["API", "Downloads", "Flow", "Kitty", "Yuri", "Zuri", "Buzz", "Edge CDN"];

interface MediaInfo {
  title: string;
  banner: string | null;
  cover: string | null;
  episodes: number | null;
  meta: string;
  description: string;
  genres: string[];
}

const mediaCache = new Map<string, MediaInfo>();

/* ───────────── Building blocks ───────────── */

const TOKEN_RE =
  /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(const|let|function|return|await|async|if|new|export|import|from)\b|\b(\d+(?:\.\d+)?)\b/g;

function highlight(code: string) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const cls = m[1] ? "text-zinc-500" : m[2] ? "text-[#a8d4b0]" : m[3] ? "text-zinc-400" : "text-[#e8c48a]";
    out.push(
      <span key={m.index} className={cls}>
        {m[0]}
      </span>
    );
    last = m.index + m[0].length;
  }
  out.push(code.slice(last));
  return out;
}

function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className={cn(
        "glass-btn h-8 px-3 rounded-full text-[12px] font-medium text-zinc-200 hover:text-white flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95",
        className
      )}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function CodeBlock({ title, code, className }: { title: string; code: string; className?: string }) {
  return (
    <div className={cn("glass-inset rounded-2xl overflow-hidden flex flex-col min-h-0", className)}>
      <div className="h-11 pl-4 pr-1.5 flex items-center justify-between border-b border-white/[0.06]">
        <span className="text-[12px] font-mono text-zinc-400">{title}</span>
        <CopyButton text={code} />
      </div>
      <pre className="flex-1 min-h-0 p-4 text-[12.5px] leading-[1.7] font-mono text-zinc-200 overflow-auto custom-scrollbar">
        {highlight(code)}
      </pre>
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
  layoutId,
  size = "md",
}: {
  value: string;
  options: { id: string; name: string }[];
  onChange: (id: string) => void;
  layoutId: string;
  size?: "md" | "sm";
}) {
  return (
    <div className="glass-inset inline-flex p-[3px] rounded-full">
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "relative rounded-full font-medium cursor-pointer select-none",
              size === "md" ? "h-8 px-3.5 text-[13px]" : "h-7 px-3 text-[12px]"
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-white/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className={cn("relative transition-colors", active ? "text-white" : "text-zinc-400 hover:text-zinc-200")}>
              {opt.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ServerSelect({ value, audio, onChange }: { value: string; audio: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (r) setAnchor({ top: r.bottom + 8, right: document.documentElement.clientWidth - r.right });
    };
    const close = (e: MouseEvent | TouchEvent) => {
      if (!(e.target as HTMLElement).closest("[data-server-select]")) setOpen(false);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-server-select
        onClick={() => setOpen(!open)}
        className="glass-btn h-9 pl-3.5 pr-2.5 rounded-full text-[13px] font-medium text-white flex items-center gap-1.5 cursor-pointer"
      >
        {SERVER_OPTIONS.find((o) => o.id === value)?.name}
        <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>
      {/* Portaled to <body>: inside the glass card the card's own backdrop-filter would
          stop this menu from blurring anything outside the card */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && anchor && (
          <motion.div
            data-server-select
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.16, ease: EASE }}
            style={{ top: anchor.top, right: anchor.right }}
            className="glass-menu fixed w-48 rounded-2xl p-1 z-[60] origin-top-right"
          >
            {SERVER_OPTIONS.map((opt) => {
              const disabled = Boolean(opt.subOnly && audio === "dub");
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 h-9 text-[13px] rounded-xl transition-colors",
                    disabled
                      ? "text-zinc-500 cursor-not-allowed"
                      : value === opt.id
                      ? "bg-white/[0.12] text-white cursor-pointer"
                      : "text-zinc-200 hover:bg-white/[0.08] hover:text-white cursor-pointer"
                  )}
                >
                  {opt.name}
                  {disabled ? <span className="text-[11px]">sub only</span> : value === opt.id && <Check className="w-4 h-4" />}
                </button>
              );
            })}
          </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

function Endpoint({ method = "GET", path, desc, example }: { method?: string; path: string; desc: string; example: string }) {
  return (
    <div className="py-5 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-x-6 gap-y-2 items-start">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 font-mono text-[13px] min-w-0">
          <span className="text-[10px] font-semibold tracking-wider text-zinc-500">{method}</span>
          <span className="text-white truncate">{path}</span>
        </div>
        <p className="text-[14px] text-zinc-400 mt-1.5 leading-relaxed max-w-2xl">{desc}</p>
      </div>
      <CopyButton text={example} label="Copy URL" className="md:mt-0.5 self-start" />
    </div>
  );
}

const tabMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.2, ease: EASE },
};

/* ───────────── Page ───────────── */

export default function HomePage() {
  const [embedType, setEmbedType] = useState<"ani" | "mal">("ani");
  const [animeId, setAnimeId] = useState("16498");
  const [episode, setEpisode] = useState(1);
  const [audio, setAudio] = useState<"sub" | "dub">("sub");
  const [server, setServer] = useState("flow");
  const [quality, setQuality] = useState("0");
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [downloadStarting, setDownloadStarting] = useState(false);
  const [downloadHint, setDownloadHint] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeDocTab, setActiveDocTab] = useState<DocTab>("endpoints");
  const [origin, setOrigin] = useState("https://api.aniflow.cc");
  const [checkedAt, setCheckedAt] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    setCheckedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
  }, []);

  // Sub-only servers (Zuri) can't serve a dub
  useEffect(() => {
    if (audio === "dub" && SERVER_OPTIONS.find((o) => o.id === server)?.subOnly) setServer("flow");
  }, [audio, server]);

  // Title, artwork and episode count for the selected anime; the artwork is what the glass refracts
  useEffect(() => {
    const id = parseInt(animeId, 10);
    if (!id) return;
    const cacheKey = `${embedType}:${id}`;
    const cached = mediaCache.get(cacheKey);
    if (cached) {
      setMedia(cached);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      // AniList answers 429 when an IP is busy; retry a few times and keep the current
      // details on failure rather than flashing "Unknown title"
      for (let attempt = 0; attempt < 4 && !ctrl.signal.aborted; attempt++) {
        try {
          const res = await fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            signal: ctrl.signal,
            body: JSON.stringify({
              query: `query ($id: Int, $mal: Int) { Media(id: $id, idMal: $mal, type: ANIME) {
                title { english romaji } bannerImage coverImage { extraLarge } episodes format seasonYear
                description(asHtml: false) genres } }`,
              variables: embedType === "ani" ? { id } : { mal: id },
            }),
          });
          if (res.status === 429 || res.status >= 500) {
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            continue;
          }
          const m = (await res.json())?.data?.Media;
          if (!m) return setMedia(null);
          const info: MediaInfo = {
            title: m.title.english || m.title.romaji,
            banner: m.bannerImage || m.coverImage?.extraLarge || null,
            cover: m.coverImage?.extraLarge || null,
            episodes: m.episodes || null,
            meta: [m.format?.replace("_", " "), m.seasonYear, m.episodes ? `${m.episodes} episodes` : null].filter(Boolean).join(" · "),
            description: (m.description || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
            genres: (m.genres || []).slice(0, 3),
          };
          mediaCache.set(cacheKey, info);
          return setMedia(info);
        } catch {
          return;
        }
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [animeId, embedType]);

  useEffect(() => {
    setDownloadHint(false);
  }, [embedType, animeId, episode, audio, server, quality]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
  };

  const safeId = animeId || "16498";
  const maxEp = media?.episodes || 9999;

  const embedQs = server !== "flow" ? `?server=${server}` : "";
  const embedPath = `/embed/${embedType}/${safeId}/${episode}/${audio}${embedQs}`;
  const fullEmbedUrl = `${origin}${embedPath}`;

  const dlQuery = new URLSearchParams({ server });
  if (quality !== "0") dlQuery.set("quality", quality);
  const downloadPath = `/api/download/${embedType}/${safeId}/${episode}/${audio}?${dlQuery}`;

  const startDownload = () => {
    setDownloadStarting(true);
    setDownloadHint(true);
    setTimeout(() => setDownloadStarting(false), 6000);
  };

  const htmlSnippet = `<iframe
  src="${origin}/embed/ani/16498/1/sub"
  style="width: 100%; aspect-ratio: 16 / 9; border: 0;"
  allow="autoplay; fullscreen; picture-in-picture"
  allowfullscreen
></iframe>`;

  const reactSnippet = `export function AnimePlayer({ anilistId, episode = 1, audio = "sub" }) {
  return (
    <iframe
      src={\`${origin}/embed/ani/\${anilistId}/\${episode}/\${audio}\`}
      className="aspect-video w-full border-0"
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
    />
  );
}`;

  const downloadSnippet = `# whole episode as MP4, filename taken from the response
curl -OJ "${origin}/api/download/ani/16498/1/sub?server=flow"

# 720p, English dub, by MyAnimeList ID
curl -OJ "${origin}/api/download/mal/16498/1/dub?quality=720"`;

  const sdkSnippet = `const player = document.querySelector("#anime-player");
const playerOrigin = new URL(player.src).origin;
const pending = new Map();

window.addEventListener("message", (event) => {
  const message = event.data;
  if (event.source !== player.contentWindow || message?.source !== "aniembed") return;

  if (message.name === "command-result" && message.requestId) {
    const request = pending.get(message.requestId);
    pending.delete(message.requestId);
    message.data.ok ? request?.resolve(message.data.state) : request?.reject(message.data.error);
  }

  if (["progress", "pause", "ended"].includes(message.name)) {
    saveWatchHistory(message.data);
  }
});

function sendCommand(name, data = {}) {
  const requestId = crypto.randomUUID();
  player.contentWindow?.postMessage(
    { source: "aniembed", version: 1, type: "command", name, requestId, data },
    playerOrigin
  );
  return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
}

await sendCommand("seek", { time: 145 });`;

  return (
    <div className="lg-canvas min-h-screen text-zinc-100 font-product-sans relative isolate overflow-x-clip">
      {/* Backdrop: the selected anime's key art, heavily blurred, fading into the page */}
      <div className="absolute inset-x-0 top-0 h-[1100px] -z-10 pointer-events-none overflow-hidden" aria-hidden>
        <AnimatePresence>
          {media?.banner && (
            <motion.div
              key={media.banner}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.55 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2 }}
              className="absolute -inset-20 bg-cover bg-center"
              style={{ backgroundImage: `url(${media.banner})`, filter: "blur(70px) saturate(1.4)" }}
            />
          )}
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0b]/40 to-[#0a0a0b]" />
        <div
          className="absolute inset-0 opacity-[0.12] mix-blend-overlay"
          style={{ backgroundImage: "url('/noise.png')", backgroundSize: "128px 128px" }}
        />
      </div>

      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 px-3 sm:px-6 pt-3">
        <div className="glass glass-nav max-w-6xl mx-auto h-[52px] rounded-full pl-4 pr-1.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-2 cursor-pointer"
          >
            <img src="/logo.svg" alt="" className="w-6 h-6" />
            <span className="font-bold text-[15px] tracking-tight text-white">AniFlow API</span>
          </button>
          <nav className="hidden md:flex items-center text-[13px] text-zinc-400">
            {[
              ["features", "Features"],
              ["docs", "Docs"],
              ["faq", "FAQ"],
              ["status", "Status"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollTo(id)}
                className="h-9 px-3.5 rounded-full hover:text-white transition-colors cursor-pointer"
              >
                {label}
              </button>
            ))}
            <a
              href="https://github.com/realmichaelstetson/AniFlow-API"
              target="_blank"
              rel="noreferrer"
              className="h-9 px-3.5 rounded-full hover:text-white transition-colors flex items-center"
            >
              GitHub
            </a>
          </nav>
          <button
            type="button"
            onClick={() => scrollTo("docs")}
            className="btn-solid h-10 px-4 rounded-full text-[13px] font-semibold cursor-pointer active:scale-95"
          >
            Get started
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-32 sm:pt-40">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-[40px] sm:text-[56px] leading-[1.04] font-bold tracking-[-0.035em] text-white">
            An anime player
            <br />
            for any website.
          </h1>
          <p className="mt-5 text-[16px] sm:text-[17px] text-zinc-300/80 leading-relaxed max-w-xl mx-auto">
            Embed it with one iframe, pull the raw HLS stream, or download an episode as an MP4. AniList and MyAnimeList
            IDs, five stream servers, sub and dub.
          </p>
        </div>

        {/* Playground: anime details and controls on the left, the live embed on the right */}
        <div
          id="player-demo"
          className="glass rounded-[30px] p-2 sm:p-2.5 mt-10 sm:mt-12 grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-2.5"
        >
          <aside className="flex flex-col gap-5 p-3 sm:p-4 min-w-0">
            <div className="flex gap-4">
              <div className="w-[72px] h-[102px] rounded-xl overflow-hidden bg-white/5 shrink-0 ring-1 ring-white/10 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)]">
                {media?.cover && <img src={media.cover} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 pt-0.5">
                <h2 className="text-[17px] leading-snug font-semibold text-white line-clamp-2">{media?.title || "Unknown title"}</h2>
                <p className="text-[12px] text-zinc-400 mt-1">{media?.meta}</p>
                {media?.genres.length ? (
                  <div className="flex flex-wrap gap-1 mt-2.5">
                    {media.genres.map((g) => (
                      <span key={g} className="h-5 px-2 rounded-full bg-white/[0.07] text-[10.5px] text-zinc-300 flex items-center">
                        {g}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {media?.description && (
              <p className="text-[13px] leading-relaxed text-zinc-400 line-clamp-3" title={media.description}>
                {media.description}
              </p>
            )}

            <div className="border-t border-white/[0.07] pt-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-zinc-400">Database</span>
                <Segmented
                  size="sm"
                  value={embedType}
                  options={[
                    { id: "ani", name: "AniList" },
                    { id: "mal", name: "MAL" },
                  ]}
                  onChange={(id) => setEmbedType(id as "ani" | "mal")}
                  layoutId="seg-db"
                />
              </div>

              <label className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-zinc-400">Anime ID</span>
                <input
                  value={animeId}
                  onChange={(e) => setAnimeId(e.target.value.replace(/\D/g, "").slice(0, 7))}
                  inputMode="numeric"
                  placeholder="16498"
                  className="glass-inset w-[108px] h-9 px-3.5 rounded-full text-[13px] font-mono text-white text-right placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/25"
                />
              </label>

              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-zinc-400">Episode</span>
                <div className="glass-inset h-9 rounded-full flex items-center px-1">
                  <button
                    type="button"
                    onClick={() => setEpisode(Math.max(1, episode - 1))}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-300 hover:bg-white/10 cursor-pointer disabled:opacity-30"
                    disabled={episode <= 1}
                    aria-label="Previous episode"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-12 text-center text-[13px] text-white font-medium tabular-nums">
                    {episode}
                    {media?.episodes ? <span className="text-zinc-500 font-normal">/{media.episodes}</span> : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEpisode(Math.min(maxEp, episode + 1))}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-300 hover:bg-white/10 cursor-pointer disabled:opacity-30"
                    disabled={episode >= maxEp}
                    aria-label="Next episode"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-zinc-400">Audio</span>
                <Segmented
                  size="sm"
                  value={audio}
                  options={[
                    { id: "sub", name: "Sub" },
                    { id: "dub", name: "Dub" },
                  ]}
                  onChange={(id) => setAudio(id as "sub" | "dub")}
                  layoutId="seg-audio"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-zinc-400">Server</span>
                <ServerSelect value={server} audio={audio} onChange={setServer} />
              </div>
            </div>
          </aside>

          <div className="min-w-0 flex flex-col">
            <div className="relative aspect-video w-full rounded-[22px] overflow-hidden bg-black ring-1 ring-white/[0.08]">
              <iframe
                src={fullEmbedUrl}
                className="absolute inset-0 w-full h-full border-0"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                title="AniFlow player"
              />
            </div>

            <div className="flex flex-col xl:flex-row xl:items-center gap-3 px-1.5 sm:px-2 pt-3 pb-1">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <code className="text-[12px] font-mono text-zinc-400 truncate">{embedPath}</code>
                <CopyButton text={fullEmbedUrl} label="Copy embed" className="hidden sm:flex" />
                <a
                  href={fullEmbedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="glass-btn w-8 h-8 rounded-full hidden sm:flex items-center justify-center text-zinc-300 hover:text-white shrink-0"
                  aria-label="Open player in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Segmented size="sm" value={quality} options={QUALITY_OPTIONS} onChange={setQuality} layoutId="seg-quality" />
                <a
                  href={downloadPath}
                  download
                  onClick={startDownload}
                  className="btn-solid h-9 px-4 rounded-full text-[13px] font-semibold flex items-center gap-2 shrink-0 active:scale-95"
                >
                  {downloadStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Download
                </a>
              </div>
            </div>
            <AnimatePresence>
              {downloadHint && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-2 pb-1 text-[12px] text-zinc-400 overflow-hidden xl:text-right"
                >
                  The MP4 is built while it downloads, so your browser shows no total size. Expect 1–2 minutes per episode.
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 pt-28 sm:pt-36 scroll-mt-20">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 lg:gap-16">
          <div>
            <h2 className="text-[28px] font-bold tracking-[-0.02em] text-white lg:sticky lg:top-28">What&apos;s included</h2>
          </div>
          <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {FEATURES.map(([title, desc, tag]) => (
              <div key={title} className="py-5 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-x-8 gap-y-1.5">
                <div>
                  <h3 className="text-[15px] font-semibold text-white">{title}</h3>
                  <p className="text-[14px] text-zinc-400 leading-relaxed mt-1 max-w-xl">{desc}</p>
                </div>
                <code className="text-[12px] font-mono text-zinc-500 sm:pt-0.5">{tag}</code>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Docs */}
      <section id="docs" className="max-w-6xl mx-auto px-4 sm:px-6 pt-28 sm:pt-36 scroll-mt-20">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-6">
          <div>
            <h2 className="text-[28px] font-bold tracking-[-0.02em] text-white">Docs</h2>
            <p className="text-[15px] text-zinc-400 mt-1">
              Base URL <code className="font-mono text-zinc-200">{origin}</code>
            </p>
          </div>
          <div className="overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
            <Segmented value={activeDocTab} options={DOC_TABS} onChange={(id) => setActiveDocTab(id as DocTab)} layoutId="seg-docs" />
          </div>
        </div>

        <div className="glass rounded-[26px] px-5 sm:px-7 py-2 min-h-[320px]">
          <AnimatePresence mode="wait" initial={false}>
            {activeDocTab === "endpoints" && (
              <motion.div key="endpoints" {...tabMotion} className="divide-y divide-white/[0.07]">
                <Endpoint
                  path="/embed/{ani|mal}/{id}/{episode}/{audio}"
                  desc="The player, ready for an iframe. audio is sub or dub; add ?server= to pick the starting source."
                  example={`${origin}/embed/ani/16498/1/sub`}
                />
                <Endpoint
                  path="/api/download/{ani|mal}/{id}/{episode}/{audio}"
                  desc="The whole episode as one MP4 attachment, named after the anime. Supports ?server= and ?quality=1080|720|480."
                  example={`${origin}/api/download/ani/16498/1/sub?server=flow`}
                />
                <Endpoint
                  path="/meu8/{ani|mal}/{id}/{episode}/{audio}"
                  desc="Redirects to a proxied .m3u8 playlist for hls.js, VLC, mpv or native players."
                  example={`${origin}/meu8/ani/16498/1/sub`}
                />
                <Endpoint
                  path="/api/play?anilistId={id}&episode={n}&audio={sub|dub}"
                  desc="JSON with the resolved stream, subtitles, intro/outro timestamps and every available server."
                  example={`${origin}/api/play?anilistId=16498&episode=1&audio=sub`}
                />
              </motion.div>
            )}

            {activeDocTab === "code" && (
              <motion.div key="code" {...tabMotion} className="grid grid-cols-1 lg:grid-cols-2 gap-3 py-5">
                <CodeBlock title="index.html" code={htmlSnippet} />
                <CodeBlock title="AnimePlayer.tsx" code={reactSnippet} />
                <CodeBlock title="download.sh" code={downloadSnippet} className="lg:col-span-2" />
              </motion.div>
            )}

            {activeDocTab === "options" && (
              <motion.div key="options" {...tabMotion} className="overflow-x-auto custom-scrollbar py-3">
                <table className="w-full text-left text-[13.5px]">
                  <thead>
                    <tr className="text-[12px] text-zinc-500">
                      <th className="py-3 pr-6 font-medium">Parameter</th>
                      <th className="py-3 pr-6 font-medium">Values</th>
                      <th className="py-3 pr-6 font-medium">Default</th>
                      <th className="py-3 font-medium">Applies to</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.07]">
                    {[
                      ["server", "flow, kitty, yuri, zuri, buzz", "flow", "all routes (zuri is sub only)"],
                      ["audio", "sub, dub", "sub", "all routes"],
                      ["quality", "1080, 720, 480", "best", "/api/download"],
                      ["startAt", "seconds", "0", "/embed"],
                      ["autoskipIntro", "1, 0", "1", "/embed"],
                      ["autoskipOutro", "1, 0", "1", "/embed"],
                      ["format", "json, m3u8, sources", "json", "/api/play"],
                    ].map(([p, v, d, a]) => (
                      <tr key={p}>
                        <td className="py-3 pr-6 font-mono text-white whitespace-nowrap">{p}</td>
                        <td className="py-3 pr-6 font-mono text-zinc-300 whitespace-nowrap">{v}</td>
                        <td className="py-3 pr-6 font-mono text-zinc-500 whitespace-nowrap">{d}</td>
                        <td className="py-3 text-zinc-400 whitespace-nowrap">{a}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            )}

            {activeDocTab === "events" && (
              <motion.div key="events" {...tabMotion} className="divide-y divide-white/[0.07]">
                {[
                  ["progress", "Playback snapshot, every five seconds."],
                  ["pause", "Playback was paused."],
                  ["ended", "The episode finished."],
                  ["next / previous", "The viewer asked for another episode."],
                  ["command-result", "Reply to a command, matched by requestId."],
                  ["CONTENT_UNAVAILABLE", "No server could provide the stream."],
                ].map(([name, desc]) => (
                  <div key={name} className="py-4 grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-1">
                    <code className="font-mono text-[13px] text-white">{name}</code>
                    <span className="text-[14px] text-zinc-400">{desc}</span>
                  </div>
                ))}
              </motion.div>
            )}

            {activeDocTab === "postmessage" && (
              <motion.div key="postmessage" {...tabMotion} className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-6 py-5">
                <div className="divide-y divide-white/[0.07] text-[13px]">
                  {[
                    ["play", ""],
                    ["pause", ""],
                    ["seek", "{ time }"],
                    ["setVolume", "{ volume: 0–1 }"],
                    ["setMuted", "{ muted }"],
                    ["setPlaybackRate", "{ rate: 0.25–2 }"],
                    ["setProvider", "{ language, providerId }"],
                    ["getState", ""],
                  ].map(([cmd, args]) => (
                    <div key={cmd} className="flex items-center justify-between gap-3 py-2.5 font-mono">
                      <span className="text-white">{cmd}</span>
                      <span className="text-zinc-500">{args}</span>
                    </div>
                  ))}
                </div>
                <CodeBlock title="parent.js" code={sdkSnippet} className="max-h-[440px]" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-6xl mx-auto px-4 sm:px-6 pt-28 sm:pt-36 scroll-mt-20">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 lg:gap-16">
          <h2 className="text-[28px] font-bold tracking-[-0.02em] text-white">FAQ</h2>
          <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {FAQS.map((faq, i) => {
              const open = openFaq === i;
              return (
                <div key={faq.q}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                    className="w-full py-5 flex items-center justify-between gap-6 text-left cursor-pointer group"
                  >
                    <span className="text-[15px] font-medium text-white">{faq.q}</span>
                    <Plus className={cn("w-4 h-4 text-zinc-500 group-hover:text-white shrink-0 transition-transform duration-300", open && "rotate-45")} />
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <p className="pb-5 pr-10 text-[14px] text-zinc-400 leading-relaxed">{faq.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Status */}
      <section id="status" className="max-w-6xl mx-auto px-4 sm:px-6 pt-28 sm:pt-36 scroll-mt-20">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 lg:gap-16">
          <div>
            <h2 className="text-[28px] font-bold tracking-[-0.02em] text-white">Status</h2>
            <p className="text-[14px] text-zinc-500 mt-1" suppressHydrationWarning>
              {checkedAt ? `Checked at ${checkedAt}` : ""}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {STATUS_ROWS.map((name) => (
              <div key={name} className="glass-inset rounded-2xl px-4 py-3.5">
                <div className="text-[14px] font-medium text-white">{name}</div>
                <div className="flex items-center gap-1.5 mt-1 text-[12px] text-zinc-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Operational
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 pt-28 pb-10">
        <div className="border-t border-white/[0.07] pt-6 flex flex-col sm:flex-row justify-between gap-4 text-[13px] text-zinc-500">
          <span>© 2026 AniFlow API · MIT License</span>
          <a
            href="https://github.com/realmichaelstetson/AniFlow-API"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white transition-colors"
          >
            github.com/realmichaelstetson/AniFlow-API
          </a>
        </div>
        <p className="mt-6 max-w-3xl text-[12px] text-zinc-600 leading-relaxed">
          AniFlow API is an open-source stream aggregator and player framework. It does not host, store or upload media;
          all streams are resolved from publicly available third-party endpoints. Copyright inquiries should be directed to
          the respective upstream hosts.
        </p>
      </footer>
    </div>
  );
}
