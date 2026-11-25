"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Copy, Check, ExternalLink, ChevronDown, Download, Minus, Plus, Loader2, Film, Tv as TvIcon, PlaySquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import * as CountryFlags from "country-flag-icons/react/3x2";
import { cleanAudioParam, normalizeLanguage } from "@/lib/vidly-lang";

function FlagIcon({ countryCode, className }: { countryCode?: string; className?: string }) {
  const code = (countryCode || "GB").toUpperCase();
  const FlagComponent = (CountryFlags as Record<string, any>)[code];
  if (FlagComponent) {
    return <FlagComponent className={cn("w-[16px] h-[11px] rounded-[2px] overflow-hidden shadow-xs shrink-0", className)} />;
  }
  return <span className="text-[10px] font-mono text-zinc-400 uppercase shrink-0">{code}</span>;
}

type MediaKind = "anime" | "movie" | "tv";
type DocTab = "endpoints" | "code" | "options" | "events" | "postmessage";

const MEDIA_KIND_OPTIONS: { id: MediaKind; name: string; icon: any }[] = [
  { id: "anime", name: "Anime", icon: PlaySquare },
  { id: "movie", name: "Movies", icon: Film },
  { id: "tv", name: "TV Shows", icon: TvIcon },
];

const DOC_TABS: { id: DocTab; name: string }[] = [
  { id: "endpoints", name: "Endpoints" },
  { id: "code", name: "Examples" },
  { id: "options", name: "Parameters" },
  { id: "events", name: "Events" },
  { id: "postmessage", name: "Commands" },
];

const ANIME_SERVERS = [
  { id: "katana", name: "Katana" },
  { id: "flow", name: "Flow" },
  { id: "kitty", name: "Kitty" },
  { id: "yuri", name: "Yuri" },
  { id: "zuri", name: "Zuri", subOnly: true },
  { id: "buzz", name: "Buzz" },
];

const TMDB_MOVIE_SERVERS = [
  { id: "singularity", name: "Edge (HD Multi-Audio)" },
  { id: "prism", name: "Prism (Multi)" },
  { id: "flux", name: "Flux (HD)" },
  { id: "nimbus", name: "Nimbus (HD)" },
  { id: "comet", name: "Comet (720p)" },
  { id: "citadel", name: "Citadel (Multi)" },
];

const TMDB_TV_SERVERS = [
  { id: "evion", name: "Edge (HD Multi-Audio)" },
  { id: "prism", name: "Prism (Multi)" },
  { id: "flux", name: "Flux (HD)" },
  { id: "nimbus", name: "Nimbus (HD)" },
  { id: "comet", name: "Comet (720p)" },
  { id: "citadel", name: "Citadel (Multi)" },
];

const ANIME_AUDIO_OPTIONS = [
  { id: "english", name: "English", countryCode: "GB" },
  { id: "japanese", name: "Japanese", countryCode: "JP" },
];

const TMDB_AUDIO_OPTIONS = [
  { id: "english", name: "English", countryCode: "GB" },
  { id: "japanese", name: "Japanese", countryCode: "JP" },
  { id: "polish", name: "Polish", countryCode: "PL" },
  { id: "spanish", name: "Spanish", countryCode: "ES" },
  { id: "french", name: "French", countryCode: "FR" },
  { id: "german", name: "German", countryCode: "DE" },
  { id: "italian", name: "Italian", countryCode: "IT" },
  { id: "hindi", name: "Hindi", countryCode: "IN" },
  { id: "portuguese", name: "Portuguese", countryCode: "BR" },
  { id: "arabic", name: "Arabic", countryCode: "SA" },
  { id: "russian", name: "Russian", countryCode: "RU" },
  { id: "turkish", name: "Turkish", countryCode: "TR" },
];

const QUALITY_OPTIONS = [
  { id: "0", name: "Best" },
  { id: "1080", name: "1080p" },
  { id: "720", name: "720p" },
  { id: "480", name: "480p" },
];

const EASE = [0.16, 1, 0.3, 1] as const;

const FEATURES: [string, string, string][] = [
  ["Anime, Movies & TV Shows", "Seamlessly embed Anime (AniList/MAL), Movies (TMDB) and TV series with automatic provider resolution.", "anime · movie · tv"],
  ["Audio track direct selection", "Directly select Japanese, English, Polish, Spanish, German, French, Hindi etc. right in the endpoint URL.", "audio=\"...\""],
  ["High-resolution video sources", "1080p, 720p and 480p adaptive HLS streams matched and adjusted per source server.", "Edge · Prism · Flux"],
  ["TMDB Movies & TV support", "Full multi-server support for movies and series with live multi-audio tracks and subtitles.", "/api/movie · /api/tv"],
  ["Episode & Movie downloads", "Segments downloaded in parallel, decrypted and remuxed into single MP4 attachments with chosen audio.", "/api/download"],
  ["Direct HLS playlists", "Proxied .m3u8 URLs configured with chosen audio track as default for VLC, mpv, or custom players.", "/meu8"],
  ["Intro & outro skip", "Automated timestamps marked on player timeline and skipped automatically for anime and TV.", "autoskipIntro"],
];

const FAQS = [
  {
    q: "How do I embed Anime, Movies or TV shows?",
    a: "Point an <iframe> at /embed/anime/{ani|mal}/{id}/{episode}/audio=\"english\", /embed/movie/{tmdb_id}/audio=\"english\", or /embed/tv/{tmdb_id}/{episode}/audio=\"english\". You can also select Japanese, Polish, Spanish, etc.",
  },
  {
    q: "How do I select audio language in the endpoints?",
    a: "Use the audio segment in the URL or query parameter. For example, /embed/movie/550/audio=\"japanese\", /meu8/movie/550/audio=\"english\", or /api/movie/play?tmdb_id=550&audio=ja. It sets that audio track as default automatically.",
  },
  {
    q: "Where do movie and TV video sources come from?",
    a: "Movie and series sources are resolved across multiple high-speed servers (Edge, Prism, Flux, Nimbus, Comet, Citadel) with TMDB metadata, adaptive resolutions (1080p, 720p), multi-language audio tracks, and subtitles.",
  },
  {
    q: "How do downloads work for movies and series?",
    a: "Request /api/download/movie/{tmdb_id}/audio=\"english\" or /api/download/tv/{tmdb_id}/{episode}/audio=\"english\" to stream back an MP4 with the selected audio track remuxed in.",
  },
  {
    q: "Which IDs can I use?",
    a: "AniList and MyAnimeList IDs for anime; TMDB IDs for Movies and TV shows. Every endpoint has full support across embed, download, meu8 and play APIs.",
  },
];

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
  options: { id: string; name: string; flag?: string; countryCode?: string }[];
  onChange: (id: string) => void;
  layoutId: string;
  size?: "md" | "sm";
}) {
  return (
    <div className="glass-inset inline-flex p-[3px] rounded-full max-w-full overflow-x-auto no-scrollbar">
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "relative rounded-full font-medium cursor-pointer select-none whitespace-nowrap flex items-center gap-1.5",
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
            <span className={cn("relative transition-colors flex items-center gap-1.5", active ? "text-white" : "text-zinc-400 hover:text-zinc-200")}>
              {opt.countryCode ? <FlagIcon countryCode={opt.countryCode} /> : opt.flag ? <span className="text-[12px]">{opt.flag}</span> : null}
              {opt.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ServerSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ id: string; name: string; subOnly?: boolean }>;
  onChange: (id: string) => void;
}) {
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
        className="glass-btn h-9 pl-3.5 pr-2.5 rounded-full text-[13px] font-medium text-white flex items-center gap-1.5 cursor-pointer max-w-[160px] truncate"
      >
        <span className="truncate">{options.find((o) => o.id === value)?.name || value}</span>
        <ChevronDown className={cn("w-4 h-4 text-zinc-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
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
                className="glass-menu fixed w-56 rounded-2xl p-1 z-[60] origin-top-right"
              >
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChange(opt.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 h-9 text-[13px] rounded-xl transition-colors",
                      value === opt.id
                        ? "bg-white/[0.12] text-white cursor-pointer"
                        : "text-zinc-200 hover:bg-white/[0.08] hover:text-white cursor-pointer"
                    )}
                  >
                    <span className="truncate">{opt.name}</span>
                    {value === opt.id && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

function AudioSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ id: string; name: string; countryCode: string }>;
  onChange: (id: string) => void;
}) {
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
      if (!(e.target as HTMLElement).closest("[data-audio-select]")) setOpen(false);
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

  const currentOpt = options.find((o) => o.id === value) || options[0];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-audio-select
        onClick={() => setOpen(!open)}
        className="glass-btn h-9 pl-3 pr-2.5 rounded-full text-[13px] font-medium text-white flex items-center gap-2 cursor-pointer max-w-[165px]"
      >
        {currentOpt && <FlagIcon countryCode={currentOpt.countryCode} />}
        <span className="truncate">{currentOpt?.name || value}</span>
        <ChevronDown className={cn("w-4 h-4 text-zinc-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && anchor && (
              <motion.div
                data-audio-select
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.16, ease: EASE }}
                style={{ top: anchor.top, right: anchor.right }}
                className="glass-menu fixed w-52 max-h-72 overflow-y-auto custom-scrollbar rounded-2xl p-1 z-[60] origin-top-right"
              >
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChange(opt.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 h-9 text-[13px] rounded-xl transition-colors",
                      value === opt.id
                        ? "bg-white/[0.12] text-white cursor-pointer"
                        : "text-zinc-200 hover:bg-white/[0.08] hover:text-white cursor-pointer"
                    )}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <FlagIcon countryCode={opt.countryCode} />
                      <span className="truncate">{opt.name}</span>
                    </span>
                    {value === opt.id && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                ))}
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
          <span className="text-white truncate font-medium">{path}</span>
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

/* ───────────── Main Page ───────────── */

export default function HomePage() {
  const [mediaKind, setMediaKind] = useState<MediaKind>("anime");
  
  // Anime state
  const [embedType, setEmbedType] = useState<"ani" | "mal">("ani");
  const [animeId, setAnimeId] = useState("16498");
  const [episode, setEpisode] = useState(1);
  const [animeAudio, setAnimeAudio] = useState("english");
  const [animeServer, setAnimeServer] = useState("katana");

  // Movie state
  const [movieId, setMovieId] = useState("550");
  const [movieAudio, setMovieAudio] = useState("english");
  const [movieServer, setMovieServer] = useState("singularity");
  const [movieSources, setMovieSources] = useState<any[]>([]);

  // TV state
  const [tvId, setTvId] = useState("1399");
  const [tvSeason, setTvSeason] = useState(1);
  const [tvEpisode, setTvEpisode] = useState(1);
  const [tvAudio, setTvAudio] = useState("english");
  const [tvServer, setTvServer] = useState("evion");
  const [tvSources, setTvSources] = useState<any[]>([]);

  const [quality, setQuality] = useState("0");
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [downloadStarting, setDownloadStarting] = useState(false);
  const [downloadHint, setDownloadHint] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeDocTab, setActiveDocTab] = useState<DocTab>("endpoints");
  const [origin, setOrigin] = useState("https://api.aniflow.cc");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Fetch Anime details
  useEffect(() => {
    if (mediaKind !== "anime") return;
    const id = parseInt(animeId, 10);
    if (!id) return;
    const cacheKey = `anime:${embedType}:${id}`;
    const cached = mediaCache.get(cacheKey);
    if (cached) {
      setMedia(cached);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
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
        setMedia(info);
      } catch {}
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [animeId, embedType, mediaKind]);

  // Fetch Movie details
  useEffect(() => {
    if (mediaKind !== "movie") return;
    const id = parseInt(movieId, 10);
    if (!id) return;
    const cacheKey = `movie:${id}`;
    const cached = mediaCache.get(cacheKey);
    if (cached) {
      setMedia(cached);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/movie/play?tmdb_id=${id}&audio=${movieAudio}`, { signal: ctrl.signal });
        if (res.ok) {
          const d = await res.json();
          if (d.success) {
            if (Array.isArray(d.sources) && d.sources.length > 0) {
              setMovieSources(d.sources);
            }
            const info: MediaInfo = {
              title: d.title,
              banner: d.backdrop || d.poster || null,
              cover: d.poster || null,
              episodes: 1,
              meta: ["Movie", d.year, d.runtime ? `${d.runtime} min` : null].filter(Boolean).join(" · "),
              description: d.overview || "High-performance Movie streaming with TMDB metadata.",
              genres: ["Movie", "TMDB", "HD"],
            };
            mediaCache.set(cacheKey, info);
            setMedia(info);
          }
        }
      } catch {}
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [movieId, movieAudio, mediaKind]);

  // Fetch TV Show details
  useEffect(() => {
    if (mediaKind !== "tv") return;
    const id = parseInt(tvId, 10);
    if (!id) return;
    const cacheKey = `tv:${id}:s${tvSeason}:e${tvEpisode}`;
    const cached = mediaCache.get(cacheKey);
    if (cached) {
      setMedia(cached);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tv/play?tmdb_id=${id}&season=${tvSeason}&episode=${tvEpisode}&audio=${tvAudio}`, { signal: ctrl.signal });
        if (res.ok) {
          const d = await res.json();
          if (d.success) {
            if (Array.isArray(d.sources) && d.sources.length > 0) {
              setTvSources(d.sources);
            }
            const info: MediaInfo = {
              title: d.title,
              banner: d.backdrop || d.poster || null,
              cover: d.poster || null,
              episodes: d.seasons ? d.seasons.reduce((acc: number, s: any) => acc + (s.episode_count || 0), 0) : null,
              meta: ["TV Series", d.year, d.subtitle || `S${tvSeason} · E${tvEpisode}`].filter(Boolean).join(" · "),
              description: d.overview || "High-performance TV series streaming with TMDB metadata.",
              genres: ["TV Show", "TMDB", "Series"],
            };
            mediaCache.set(cacheKey, info);
            setMedia(info);
          }
        }
      } catch {}
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [tvId, tvSeason, tvEpisode, tvAudio, mediaKind]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
  };

  const buildDynamicAudioOptions = (sources: any[]) => {
    const map = new Map<string, { id: string; name: string; countryCode: string }>();
    for (const s of sources) {
      if (Array.isArray(s.audioTracks)) {
        for (const t of s.audioTracks) {
          const name = (t.name || t.label || "").trim();
          const id = name.toLowerCase();
          const cc = (t.countryCode || "").trim();
          if (
            id &&
            id !== "unknown" &&
            id !== "other" &&
            !id.includes("unknown") &&
            /^[a-z]{2}$/i.test(cc) &&
            cc.toLowerCase() !== "un" &&
            !map.has(id)
          ) {
            map.set(id, { id, name, countryCode: cc.toUpperCase() });
          }
        }
      }
      if (s.language) {
        const norm = normalizeLanguage(s.language, s.language);
        const id = norm.name.toLowerCase();
        if (norm.known && /^[a-z]{2}$/i.test(norm.countryCode) && !map.has(id)) {
          map.set(id, { id, name: norm.name, countryCode: norm.countryCode.toUpperCase() });
        }
      }
    }
    if (map.size === 0) {
      return TMDB_AUDIO_OPTIONS;
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.id === "english") return -1;
      if (b.id === "english") return 1;
      return a.name.localeCompare(b.name);
    });
  };

  const movieAudioOptions = useMemo(() => buildDynamicAudioOptions(movieSources), [movieSources]);
  const tvAudioOptions = useMemo(() => buildDynamicAudioOptions(tvSources), [tvSources]);

  const movieServerOptions = useMemo(() => {
    if (movieSources.length > 0) {
      return movieSources.map((s) => ({
        id: s.id,
        name: s.name || s.serverName || s.server || s.id,
      }));
    }
    return TMDB_MOVIE_SERVERS;
  }, [movieSources]);

  const tvServerOptions = useMemo(() => {
    if (tvSources.length > 0) {
      return tvSources.map((s) => ({
        id: s.id,
        name: s.name || s.serverName || s.server || s.id,
      }));
    }
    return TMDB_TV_SERVERS;
  }, [tvSources]);

  const pickBestServerForAudio = (sources: any[], currentSrv: string, newAudio: string): string | null => {
    if (sources.length === 0) return null;
    const norm = cleanAudioParam(newAudio);
    const hasAudio = (s: any) =>
      (Array.isArray(s.audioTracks) &&
        s.audioTracks.some(
          (t: any) =>
            t.id === norm.code ||
            t.lang === norm.code ||
            cleanAudioParam(t.lang || t.id || t.name).code === norm.code
        )) ||
      Boolean(s.language && cleanAudioParam(s.language).code === norm.code);
    const cur = sources.find((s) => s.id === currentSrv);
    if (cur && hasAudio(cur)) return cur.id;
    const matching = sources.find(hasAudio);
    return matching ? matching.id : null;
  };

  const handleMovieAudioChange = (newAudio: string) => {
    setMovieAudio(newAudio);
    const best = pickBestServerForAudio(movieSources, movieServer, newAudio);
    if (best && best !== movieServer) setMovieServer(best);
  };

  const handleTvAudioChange = (newAudio: string) => {
    setTvAudio(newAudio);
    const best = pickBestServerForAudio(tvSources, tvServer, newAudio);
    if (best && best !== tvServer) setTvServer(best);
  };

  // Derive Endpoint URLs based on current media kind
  let embedPath = "";
  let downloadPath = "";
  let meu8Path = "";
  let playApiPath = "";

  if (mediaKind === "anime") {
    const safeId = animeId || "16498";
    embedPath = `/embed/anime/${embedType}/${safeId}/${episode}/audio="${animeAudio}"`;
    meu8Path = `/meu8/anime/${embedType}/${safeId}/${episode}/audio="${animeAudio}"`;
    const dlQ = new URLSearchParams({ server: animeServer });
    if (quality !== "0") dlQ.set("quality", quality);
    downloadPath = `/api/download/anime/${embedType}/${safeId}/${episode}/audio="${animeAudio}"?${dlQ}`;
    playApiPath = `/api/anime/play?anilistId=${safeId}&episode=${episode}&audio=${animeAudio === "english" ? "en" : "jp"}`;
  } else if (mediaKind === "movie") {
    const safeId = movieId || "550";
    const srvParam = movieServer ? `?server=${encodeURIComponent(movieServer)}` : "";
    embedPath = `/embed/movie/${safeId}/audio="${movieAudio}"${srvParam}`;
    meu8Path = `/meu8/movie/${safeId}/audio="${movieAudio}"${srvParam}`;
    const dlQ = new URLSearchParams();
    if (movieServer) dlQ.set("server", movieServer);
    if (quality !== "0") dlQ.set("quality", quality);
    const dlStr = dlQ.toString();
    downloadPath = `/api/download/movie/${safeId}/audio="${movieAudio}"${dlStr ? `?${dlStr}` : ""}`;
    playApiPath = `/api/movie/play?tmdb_id=${safeId}&audio=${movieAudio}${movieServer ? `&server=${encodeURIComponent(movieServer)}` : ""}`;
  } else {
    const safeId = tvId || "1399";
    const tvQ = new URLSearchParams({ season: String(tvSeason) });
    if (tvServer) tvQ.set("server", tvServer);
    embedPath = `/embed/tv/${safeId}/${tvEpisode}/audio="${tvAudio}"?${tvQ}`;
    meu8Path = `/meu8/tv/${safeId}/${tvEpisode}/audio="${tvAudio}"?${tvQ}`;
    const dlQ = new URLSearchParams({ season: String(tvSeason) });
    if (tvServer) dlQ.set("server", tvServer);
    if (quality !== "0") dlQ.set("quality", quality);
    downloadPath = `/api/download/tv/${safeId}/${tvEpisode}/audio="${tvAudio}"?${dlQ}`;
    playApiPath = `/api/tv/play?tmdb_id=${safeId}&season=${tvSeason}&episode=${tvEpisode}&audio=${tvAudio}${tvServer ? `&server=${encodeURIComponent(tvServer)}` : ""}`;
  }

  const fullEmbedUrl = `${origin}${embedPath}`;
  const maxEp = media?.episodes || 9999;

  const startDownload = () => {
    setDownloadStarting(true);
    setDownloadHint(true);
    setTimeout(() => setDownloadStarting(false), 6000);
  };

  return (
    <div className="lg-canvas min-h-screen text-zinc-100 font-product-sans relative isolate overflow-x-clip">
      {/* Blurred Key Art Backdrop */}
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
            High-Performance Streaming
            <br />
            for Anime, Movies & TV.
          </h1>
          <p className="mt-5 text-[16px] sm:text-[17px] text-zinc-300/80 leading-relaxed max-w-xl mx-auto">
            Embed with one iframe, pull clean HLS .m3u8 manifests, or download whole video files. Full TMDB & AniList support, adaptive HLS streams, multi-audio selection & subtitles.
          </p>
        </div>

        {/* Media Kind Selector Tabs */}
        <div className="flex justify-center mt-8">
          <div className="glass p-1.5 rounded-full inline-flex gap-1 shadow-lg ring-1 ring-white/10">
            {MEDIA_KIND_OPTIONS.map((item) => {
              const Icon = item.icon;
              const active = mediaKind === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMediaKind(item.id)}
                  className={cn(
                    "relative h-10 px-5 rounded-full text-[13.5px] font-semibold flex items-center gap-2 transition-colors cursor-pointer",
                    active ? "text-white" : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="media-kind-pill"
                      className="absolute inset-0 bg-white/[0.18] rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    />
                  )}
                  <Icon className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Interactive Playground */}
        <div
          id="player-demo"
          className="glass rounded-[30px] p-2 sm:p-2.5 mt-6 grid grid-cols-1 lg:grid-cols-[310px_minmax(0,1fr)] gap-2.5"
        >
          {/* Controls Sidebar */}
          <aside className="flex flex-col gap-5 p-3 sm:p-4 min-w-0">
            <div className="flex gap-4">
              <div className="w-[72px] h-[102px] rounded-xl overflow-hidden bg-white/5 shrink-0 ring-1 ring-white/10 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)]">
                {media?.cover ? (
                  <img src={media.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600">
                    <Film className="w-6 h-6" />
                  </div>
                )}
              </div>
              <div className="min-w-0 pt-0.5">
                <h2 className="text-[17px] leading-snug font-semibold text-white line-clamp-2">
                  {media?.title || (mediaKind === "anime" ? "Anime" : mediaKind === "movie" ? "Movie" : "TV Show")}
                </h2>
                <p className="text-[12px] text-zinc-400 mt-1">{media?.meta}</p>
                {media?.genres?.length ? (
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
              {/* ANIME CONTROLS */}
              {mediaKind === "anime" && (
                <>
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
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-zinc-400">Audio</span>
                    <Segmented
                      size="sm"
                      value={animeAudio}
                      options={ANIME_AUDIO_OPTIONS}
                      onChange={setAnimeAudio}
                      layoutId="seg-anime-audio"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-zinc-400">Server</span>
                    <ServerSelect value={animeServer} options={ANIME_SERVERS} onChange={setAnimeServer} />
                  </div>
                </>
              )}

              {/* MOVIE CONTROLS */}
              {mediaKind === "movie" && (
                <>
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-zinc-400">TMDB ID</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        value={movieId}
                        onChange={(e) => setMovieId(e.target.value.replace(/\D/g, "").slice(0, 8))}
                        inputMode="numeric"
                        placeholder="550"
                        className="glass-inset w-[108px] h-9 px-3.5 rounded-full text-[13px] font-mono text-white text-right placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/25"
                      />
                    </div>
                  </label>

                  {/* Quick movie picks */}
                  <div className="flex items-center gap-1.5 justify-end">
                    {[
                      { id: "550", name: "Fight Club" },
                      { id: "299536", name: "Avengers" },
                      { id: "157336", name: "Interstellar" },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setMovieId(p.id)}
                        className="text-[10.5px] px-2 py-0.5 rounded-full bg-white/[0.06] hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-zinc-400">Audio</span>
                    <AudioSelect
                      value={movieAudio}
                      options={movieAudioOptions}
                      onChange={handleMovieAudioChange}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-zinc-400">Server</span>
                    <ServerSelect value={movieServer} options={movieServerOptions} onChange={setMovieServer} />
                  </div>
                </>
              )}

              {/* TV SHOW CONTROLS */}
              {mediaKind === "tv" && (
                <>
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-zinc-400">TMDB ID</span>
                    <input
                      value={tvId}
                      onChange={(e) => setTvId(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      inputMode="numeric"
                      placeholder="1399"
                      className="glass-inset w-[108px] h-9 px-3.5 rounded-full text-[13px] font-mono text-white text-right placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/25"
                    />
                  </label>

                  {/* Quick TV picks */}
                  <div className="flex items-center gap-1.5 justify-end">
                    {[
                      { id: "1399", name: "Game of Thrones" },
                      { id: "66732", name: "Stranger Things" },
                      { id: "1396", name: "Breaking Bad" },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setTvId(p.id);
                          setTvSeason(1);
                          setTvEpisode(1);
                        }}
                        className="text-[10.5px] px-2 py-0.5 rounded-full bg-white/[0.06] hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-zinc-400">Season</span>
                    <div className="glass-inset h-9 rounded-full flex items-center px-1">
                      <button
                        type="button"
                        onClick={() => setTvSeason(Math.max(1, tvSeason - 1))}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-300 hover:bg-white/10 cursor-pointer disabled:opacity-30"
                        disabled={tvSeason <= 1}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-12 text-center text-[13px] text-white font-medium tabular-nums">
                        S{tvSeason}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTvSeason(tvSeason + 1)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-300 hover:bg-white/10 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-zinc-400">Episode</span>
                    <div className="glass-inset h-9 rounded-full flex items-center px-1">
                      <button
                        type="button"
                        onClick={() => setTvEpisode(Math.max(1, tvEpisode - 1))}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-300 hover:bg-white/10 cursor-pointer disabled:opacity-30"
                        disabled={tvEpisode <= 1}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-12 text-center text-[13px] text-white font-medium tabular-nums">
                        E{tvEpisode}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTvEpisode(tvEpisode + 1)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-300 hover:bg-white/10 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-zinc-400">Audio</span>
                    <AudioSelect
                      value={tvAudio}
                      options={tvAudioOptions}
                      onChange={handleTvAudioChange}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-zinc-400">Server</span>
                    <ServerSelect value={tvServer} options={tvServerOptions} onChange={setTvServer} />
                  </div>
                </>
              )}
            </div>
          </aside>

          {/* Player Display & URLs */}
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

            {/* Bottom Actions Bar */}
            <div className="flex flex-col xl:flex-row xl:items-center gap-3 px-1.5 sm:px-2 pt-3 pb-1">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <code className="text-[12px] font-mono text-zinc-400 truncate bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">{embedPath}</code>
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
                  Download MP4
                </a>
              </div>
            </div>

            {/* Sub-bar for M3U8 and Play API URLs */}
            <div className="flex flex-wrap items-center gap-2 px-1.5 sm:px-2 pt-1 pb-1 text-[11.5px] font-mono text-zinc-400">
              <span className="text-zinc-500">M3U8:</span>
              <a href={`${origin}${meu8Path}`} target="_blank" rel="noreferrer" className="hover:text-white underline truncate max-w-[260px]">
                {meu8Path}
              </a>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-500">JSON:</span>
              <a href={`${origin}${playApiPath}`} target="_blank" rel="noreferrer" className="hover:text-white underline truncate max-w-[260px]">
                {playApiPath}
              </a>
            </div>

            <AnimatePresence>
              {downloadHint && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-2 pb-1 text-[12px] text-zinc-400 overflow-hidden xl:text-right"
                >
                  The MP4 is streamed and remuxed on-the-fly with the selected audio track.
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
            <h2 className="text-[28px] font-bold tracking-[-0.02em] text-white">Docs & Endpoints</h2>
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
                {/* Embed endpoints */}
                <div className="pt-3 pb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">Embed Endpoints</span>
                </div>
                <Endpoint
                  path="/embed/anime/{ani|mal}/{id}/{episode}/audio=&quot;english&quot; | &quot;japanese&quot;"
                  desc="Embed player for Anime. Directly set audio to 'english', 'japanese', or query ?audio=... Pick source with ?server=."
                  example={`${origin}/embed/anime/ani/16498/1/audio="english"`}
                />
                <Endpoint
                  path="/embed/movie/{tmdb_id}/audio=&quot;english&quot; | &quot;japanese&quot;"
                  desc="Embed player for Movies via TMDB ID. Supports audio='english', 'japanese', 'polish', 'spanish', etc."
                  example={`${origin}/embed/movie/550/audio="english"`}
                />
                <Endpoint
                  path="/embed/tv/{tmdb_id}/{episode}/audio=&quot;english&quot; | &quot;japanese&quot;"
                  desc="Embed player for TV Shows. Supports season either in path (/embed/tv/{tmdb_id}/{season}/{episode}/...) or as ?season=n."
                  example={`${origin}/embed/tv/1399/1/audio="english"?season=1`}
                />

                {/* Download endpoints */}
                <div className="pt-5 pb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">Download Endpoints</span>
                </div>
                <Endpoint
                  path="/api/download/anime/{ani|mal}/{id}/{episode}/audio=&quot;english&quot; | &quot;japanese&quot;"
                  desc="Stream MP4 download of an anime episode with selected audio track. Supports ?quality=1080|720|480."
                  example={`${origin}/api/download/anime/ani/16498/1/audio="english"`}
                />
                <Endpoint
                  path="/api/download/movie/{tmdb_id}/audio=&quot;english&quot; | &quot;japanese&quot;"
                  desc="Stream MP4 download of a movie by TMDB ID with chosen audio track remuxed in."
                  example={`${origin}/api/download/movie/550/audio="english"`}
                />
                <Endpoint
                  path="/api/download/tv/{tmdb_id}/{episode}/audio=&quot;english&quot; | &quot;japanese&quot;"
                  desc="Stream MP4 download of a TV episode by TMDB ID with chosen audio track. Supports ?season=n."
                  example={`${origin}/api/download/tv/1399/1/audio="english"?season=1`}
                />

                {/* Meu8 endpoints */}
                <div className="pt-5 pb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">Direct HLS (Meu8 / M3u8) Endpoints</span>
                </div>
                <Endpoint
                  path="/meu8/anime/{ani|mal}/{id}/{episode}/audio=&quot;english&quot; | &quot;japanese&quot;"
                  desc="Proxied .m3u8 master playlist with requested audio set as primary default track for VLC, mpv, ExoPlayer."
                  example={`${origin}/meu8/anime/ani/16498/1/audio="english"`}
                />
                <Endpoint
                  path="/meu8/movie/{tmdb_id}/audio=&quot;english&quot; | &quot;japanese&quot;"
                  desc="Direct HLS playlist for movies with selected audio track as default."
                  example={`${origin}/meu8/movie/550/audio="english"`}
                />
                <Endpoint
                  path="/meu8/tv/{tmdb_id}/{episode}/audio=&quot;english&quot; | &quot;japanese&quot;"
                  desc="Direct HLS playlist for TV shows with selected audio track as default. Supports ?season=n."
                  example={`${origin}/meu8/tv/1399/1/audio="english"?season=1`}
                />

                {/* Play API endpoints */}
                <div className="pt-5 pb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">JSON Play APIs</span>
                </div>
                <Endpoint
                  path="/api/anime/play?anilistId={id}&episode={n}&audio={en|jp}"
                  desc="JSON response with resolved video streams, audio tracks, subtitles and skip timestamps."
                  example={`${origin}/api/anime/play?anilistId=16498&episode=1&audio=en`}
                />
                <Endpoint
                  path="/api/movie/play?tmdb_id={id}&audio={en|jp}"
                  desc="JSON response with all movie video sources (Edge, Prism, Flux, Nimbus, Comet, Citadel), subtitles, and audio tracks."
                  example={`${origin}/api/movie/play?tmdb_id=550&audio=en`}
                />
                <Endpoint
                  path="/api/tv/play?tmdb_id={id}&episode={n}&season={s}&audio={en|jp}"
                  desc="JSON response with TV stream sources, subtitles, audio tracks, and episode metadata."
                  example={`${origin}/api/tv/play?tmdb_id=1399&season=1&episode=1&audio=en`}
                />
              </motion.div>
            )}

            {activeDocTab === "code" && (
              <motion.div key="code" {...tabMotion} className="grid grid-cols-1 lg:grid-cols-2 gap-3 py-5">
                <CodeBlock
                  title="iframe-embed.html"
                  code={`<!-- Anime Embed -->
<iframe
  src="${origin}/embed/anime/ani/16498/1/audio=\\"english\\""
  style="width: 100%; aspect-ratio: 16 / 9; border: 0;"
  allow="autoplay; fullscreen; picture-in-picture"
  allowfullscreen
></iframe>

<!-- Movie Embed (TMDB 550) with English audio -->
<iframe
  src="${origin}/embed/movie/550/audio=\\"english\\""
  style="width: 100%; aspect-ratio: 16 / 9; border: 0;"
  allow="autoplay; fullscreen; picture-in-picture"
  allowfullscreen
></iframe>

<!-- TV Show Embed (Game of Thrones S1E1) -->
<iframe
  src="${origin}/embed/tv/1399/1/audio=\\"english\\"?season=1"
  style="width: 100%; aspect-ratio: 16 / 9; border: 0;"
  allow="autoplay; fullscreen; picture-in-picture"
  allowfullscreen
></iframe>`}
                />
                <CodeBlock
                  title="UniversalPlayer.tsx"
                  code={`export function UniversalPlayer({ kind, id, episode = 1, season = 1, audio = "english" }) {
  let src = "";
  if (kind === "anime") {
    src = \`${origin}/embed/anime/ani/\${id}/\${episode}/audio="\${audio}"\`;
  } else if (kind === "movie") {
    src = \`${origin}/embed/movie/\${id}/audio="\${audio}"\`;
  } else {
    src = \`${origin}/embed/tv/\${id}/\${episode}/audio="\${audio}"?season=\${season}\`;
  }

  return (
    <iframe
      src={src}
      className="aspect-video w-full border-0 rounded-2xl"
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
    />
  );
}`}
                />
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
                      ["audio", "english, japanese, polish, spanish, german, french, hindi, sub, dub", "english (all routes)", "all embed, download, meu8, play routes"],
                      ["server", "singularity (Edge), prism, flux, nimbus, comet, citadel, katana, flow, kitty", "singularity (movie) / evion (tv) / katana (anime)", "all routes"],
                      ["quality", "1080, 720, 480", "best", "/api/download"],
                      ["season", "integer (e.g. 1, 2...)", "1", "TV routes"],
                      ["format", "json, m3u8, sources", "json", "/api/play, /api/movie/play, /api/tv/play"],
                      ["startAt", "seconds (progress)", "0", "all /embed routes"],
                      ["autoskipIntro", "1, 0", "1", "all /embed routes"],
                      ["autoskipOutro", "1, 0", "1", "all /embed routes"],
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
                  ["progress", "Playback progress snapshot, sent every five seconds."],
                  ["pause", "Playback was paused."],
                  ["ended", "The media ended."],
                  ["next / previous", "Viewer navigated to adjacent episode."],
                  ["command-result", "Reply to parent postMessage command."],
                  ["CONTENT_UNAVAILABLE", "No stream source could provide playback."],
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
                <CodeBlock
                  title="parent.js"
                  code={`const player = document.querySelector("#my-player");
player.contentWindow?.postMessage({
  source: "aniembed",
  version: 1,
  type: "command",
  name: "seek",
  data: { time: 120 }
}, "*");`}
                  className="max-h-[440px]"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-6xl mx-auto px-4 sm:px-6 pt-28 sm:pt-36 scroll-mt-20">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 lg:gap-16">
          <div>
            <h2 className="text-[28px] font-bold tracking-[-0.02em] text-white lg:sticky lg:top-28">Frequently asked questions</h2>
          </div>
          <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {FAQS.map((item, idx) => (
              <div key={idx} className="py-5">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between text-left font-semibold text-[16px] text-white cursor-pointer"
                >
                  {item.q}
                  <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform", openFaq === idx && "rotate-180")} />
                </button>
                <AnimatePresence>
                  {openFaq === idx && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-[14px] text-zinc-400 leading-relaxed mt-2.5 overflow-hidden"
                    >
                      {item.a}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-16 mt-20 border-t border-white/[0.07] flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-zinc-500">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="" className="w-5 h-5 opacity-70" />
          <span>AniFlow API — Anime, Movies & TV Streaming</span>
        </div>
        <div>MIT License · Self-hostable Next.js 14 Service</div>
      </footer>
    </div>
  );
}
