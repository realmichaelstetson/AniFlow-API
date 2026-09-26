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
  Settings,
  Captions,
  PictureInPicture2,
  Check,
  Server,
  Upload,
  Clock,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Loader2,
  FastForward,
} from "lucide-react";
import { formatSecondsToTime, cn } from "@/lib/utils";

export interface SubtitleTrack {
  id?: string;
  language: string;
  label: string;
  url: string;
  default?: boolean;
}

export interface EmbedPlayerProps {
  anilistId?: number | null;
  malId?: number | null;
  episodeNumber: number;
  initialAudio?: "sub" | "dub";
  initialServer?: string;
  startAt?: number;
  autoskipIntro?: boolean;
  autoskipOutro?: boolean;
  parentHost?: string | null;
  title?: string;
}

export function EmbedPlayer({
  anilistId,
  malId,
  episodeNumber,
  initialAudio = "sub",
  initialServer = "flow",
  startAt = 0,
  autoskipIntro = true,
  autoskipOutro = true,
  parentHost,
  title: initialTitle,
}: EmbedPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // States
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedTime, setBufferedTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showControls, setShowControls] = useState(true);

  // Playback settings
  const [audio, setAudio] = useState<"sub" | "dub">(initialAudio);
  const [server, setServer] = useState<string>(initialServer.toLowerCase());
  const [autoSkipOp, setAutoSkipOp] = useState<boolean>(autoskipIntro);
  const [autoSkipEd, setAutoSkipEd] = useState<boolean>(autoskipOutro);

  // Streams & Metadata
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [activeSubTrack, setActiveSubTrack] = useState<string | null>("en");
  const [subOffset, setSubOffset] = useState<number>(0); // in seconds
  const [cueText, setCueText] = useState<string>("");
  const [hlsLevels, setHlsLevels] = useState<{ id: number; name: string }[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<number>(-1); // -1 = Auto
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [animeTitle, setAnimeTitle] = useState<string>(initialTitle || "Anime");

  // Skip intervals
  const [skipTimes, setSkipTimes] = useState<{
    intro: { start: number; end: number } | null;
    outro: { start: number; end: number } | null;
  }>({ intro: null, outro: null });

  // Popups & Menus
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSubMenu, setSettingsSubMenu] = useState<
    "main" | "server" | "audio" | "quality" | "subtitles" | "speed" | "skips"
  >("main");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Refs for tracking
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProgressPostRef = useRef<number>(0);
  const isSeekingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const customCuesRef = useRef<Array<{ start: number; end: number; text: string }>>([]);

  // PostMessage Target Origin helper
  const postToParent = useCallback(
    (type: string, data: any) => {
      if (typeof window === "undefined" || window.parent === window) return;
      try {
        window.parent.postMessage({ type, data }, "*");
        if (type === "PLAYER_EVENT" && data?.type === "time") {
          window.parent.postMessage({ type: "watching-log", ...data }, "*");
        }
      } catch {}
    },
    []
  );

  // Show Toast
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // 1. Fetch Skip Times
  useEffect(() => {
    async function loadSkipTimes() {
      try {
        const idParam = anilistId ? `anilistId=${anilistId}` : `malId=${malId}`;
        const res = await fetch(`/api/anime/skip-times?${idParam}&episode=${episodeNumber}`);
        if (res.ok) {
          const data = await res.json();
          setSkipTimes({ intro: data.intro || null, outro: data.outro || null });
        }
      } catch {}
    }
    loadSkipTimes();
  }, [anilistId, malId, episodeNumber]);

  // 2. Fetch Stream from /api/play
  useEffect(() => {
    let cancelled = false;
    async function loadStream() {
      setIsBuffering(true);
      setErrorMsg(null);
      try {
        const params = new URLSearchParams();
        if (anilistId) params.set("anilistId", String(anilistId));
        if (malId) params.set("malId", String(malId));
        params.set("episode", String(episodeNumber));
        params.set("audio", audio);
        params.set("server", server);

        const res = await fetch(`/api/play?${params.toString()}`);
        if (cancelled) return;

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const code = errData.code || "CONTENT_UNAVAILABLE";
          setErrorMsg(errData.error || "Content unavailable on selected server");
          postToParent("PLAYER_EVENT", {
            type: "error",
            code,
            available: false,
            anilistId,
            malId,
            episode: episodeNumber,
          });
          postToParent("vidhawk-error", { code, available: false });
          postToParent("STREAM_UNAVAILABLE", { available: false });
          setIsBuffering(false);
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        if (data.m3u8) {
          setStreamUrl(data.m3u8);
          if (data.title) setAnimeTitle(data.title);
          if (data.subtitles && Array.isArray(data.subtitles)) {
            setSubtitles(data.subtitles);
            if (data.subtitles.length > 0 && audio === "sub") {
              setActiveSubTrack(data.subtitles[0].url);
            }
          }
        } else {
          throw new Error("No playable stream url returned");
        }
      } catch (err: any) {
        if (cancelled) return;
        setErrorMsg("Failed to connect to stream server");
        postToParent("PLAYER_EVENT", {
          type: "error",
          code: "CONTENT_UNAVAILABLE",
          available: false,
        });
        postToParent("vidhawk-error", { code: "CONTENT_UNAVAILABLE", available: false });
        postToParent("STREAM_UNAVAILABLE", { available: false });
        setIsBuffering(false);
      }
    }

    loadStream();
    return () => {
      cancelled = true;
    };
  }, [anilistId, malId, episodeNumber, audio, server, postToParent]);

  // 3. Initialize Hls.js
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setIsBuffering(false);
        const levels = data.levels.map((lvl, index) => ({
          id: index,
          name: `${lvl.height}p`,
        }));
        setHlsLevels(levels);

        // Resume progress or startAt
        let resumeTime = startAt;
        if (!resumeTime) {
          try {
            const saved = localStorage.getItem(
              `vh_progress_${anilistId || malId}_${episodeNumber}_${audio}`
            );
            if (saved) {
              const parsed = parseFloat(saved);
              if (parsed > 5) resumeTime = parsed;
            }
          } catch {}
        }
        if (resumeTime > 0) {
          video.currentTime = resumeTime;
        }

        video.play().catch(() => {
          setIsPlaying(false);
        });
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              setErrorMsg("Playback error encountered");
              break;
          }
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      video.addEventListener("loadedmetadata", () => {
        setIsBuffering(false);
        if (startAt > 0) video.currentTime = startAt;
        video.play().catch(() => setIsPlaying(false));
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, startAt, anilistId, malId, episodeNumber, audio]);

  // 4. Custom Subtitle Loader (VTT parser)
  useEffect(() => {
    if (!activeSubTrack || activeSubTrack === "off") {
      customCuesRef.current = [];
      setCueText("");
      return;
    }

    let isMounted = true;
    async function loadVtt() {
      try {
        const res = await fetch(activeSubTrack!);
        if (!res.ok) return;
        const text = await res.text();
        if (!isMounted) return;

        // Parse VTT format into cues
        const lines = text.replace(/\r\n/g, "\n").split("\n");
        const cues: Array<{ start: number; end: number; text: string }> = [];

        const parseTime = (str: string) => {
          const parts = str.trim().split(":");
          if (parts.length === 2) {
            return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
          } else if (parts.length === 3) {
            return (
              parseFloat(parts[0]) * 3600 +
              parseFloat(parts[1]) * 60 +
              parseFloat(parts[2])
            );
          }
          return 0;
        };

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.includes("-->")) {
            const [startStr, endStr] = line.split("-->");
            const start = parseTime(startStr);
            const end = parseTime(endStr);
            let cueContent = "";
            let j = i + 1;
            while (j < lines.length && lines[j].trim() !== "" && !lines[j].includes("-->")) {
              cueContent += (cueContent ? "\n" : "") + lines[j].trim();
              j++;
            }
            if (cueContent) {
              cues.push({
                start,
                end,
                text: cueContent.replace(/<[^>]*>/g, ""),
              });
            }
            i = j - 1;
          }
        }
        customCuesRef.current = cues;
      } catch {}
    }

    loadVtt();
    return () => {
      isMounted = false;
    };
  }, [activeSubTrack]);

  // 5. Video Event Listeners (Progress, Auto-skip, PostMessage)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      setIsPlaying(true);
      postToParent("PLAYER_EVENT", {
        type: "play",
        currentTime: video.currentTime,
        duration: video.duration || 0,
        anilistId,
        malId,
        episode: episodeNumber,
        audio,
      });
    };

    const onPause = () => {
      setIsPlaying(false);
      postToParent("PLAYER_EVENT", {
        type: "pause",
        currentTime: video.currentTime,
        duration: video.duration || 0,
        anilistId,
        malId,
        episode: episodeNumber,
        audio,
      });
    };

    const onTimeUpdate = () => {
      const cur = video.currentTime;
      const dur = video.duration || 0;
      setCurrentTime(cur);

      // Intro auto-skip check
      if (autoSkipOp && skipTimes.intro) {
        if (cur >= skipTimes.intro.start && cur < skipTimes.intro.end - 1) {
          video.currentTime = skipTimes.intro.end;
          showToast("Skipped Opening");
          return;
        }
      }

      // Outro auto-skip check
      if (autoSkipEd && skipTimes.outro) {
        if (cur >= skipTimes.outro.start && cur < skipTimes.outro.end - 1) {
          video.currentTime = skipTimes.outro.end;
          showToast("Skipped Ending");
          return;
        }
      }

      // Subtitle display update
      if (customCuesRef.current.length > 0) {
        const adjustedTime = cur - subOffset;
        const matching = customCuesRef.current.find(
          (c) => adjustedTime >= c.start && adjustedTime <= c.end
        );
        setCueText(matching ? matching.text : "");
      }

      // Buffer state
      if (video.buffered.length > 0) {
        setBufferedTime(video.buffered.end(video.buffered.length - 1));
      }

      // PostMessage progress every ~1s
      const now = Date.now();
      if (now - lastProgressPostRef.current >= 1000) {
        lastProgressPostRef.current = now;
        const percent = dur > 0 ? (cur / dur) * 100 : 0;
        postToParent("PLAYER_EVENT", {
          type: "time",
          currentTime: cur,
          duration: dur,
          percent,
          anilistId,
          malId,
          episode: episodeNumber,
          audio,
        });

        // Save local history
        try {
          localStorage.setItem(
            `vh_progress_${anilistId || malId}_${episodeNumber}_${audio}`,
            cur.toString()
          );
        } catch {}
      }
    };

    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);

    const onEnded = () => {
      setIsPlaying(false);
      const dur = video.duration || 0;
      postToParent("PLAYER_EVENT", {
        type: "complete",
        currentTime: dur,
        duration: dur,
        percent: 100,
        anilistId,
        malId,
        episode: episodeNumber,
        audio,
        completed: true,
      });
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("ended", onEnded);
    };
  }, [
    autoSkipOp,
    autoSkipEd,
    skipTimes,
    subOffset,
    anilistId,
    malId,
    episodeNumber,
    audio,
    postToParent,
    showToast,
  ]);

  // 6. Server watch progress sync POST /api/progress every ~4s
  useEffect(() => {
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended || video.currentTime < 1) return;

      const cur = video.currentTime;
      const dur = video.duration || 0;
      const percent = dur > 0 ? (cur / dur) * 100 : 0;

      fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentTime: cur,
          duration: dur,
          percent,
          anilistId,
          malId,
          episode: episodeNumber,
          audio,
          completed: false,
        }),
      }).catch(() => {});
    }, 4000);

    return () => clearInterval(timer);
  }, [anilistId, malId, episodeNumber, audio]);

  // 7. PostMessage Command Listener (parent -> iframe)
  useEffect(() => {
    const handleCommand = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;
      const video = videoRef.current;
      if (!video) return;

      if (data.command === "play" || data === "play") {
        video.play().catch(() => {});
      } else if (data.command === "pause" || data === "pause") {
        video.pause();
      } else if (data.command === "seek" && typeof data.time === "number") {
        video.currentTime = Math.max(0, Math.min(video.duration || 0, data.time));
      } else if (data.command === "getStatus") {
        postToParent("PLAYER_EVENT", {
          type: "playerstatus",
          currentTime: video.currentTime,
          duration: video.duration || 0,
          isPlaying: !video.paused,
          volume: video.volume,
          audio,
          server,
          anilistId,
          malId,
          episode: episodeNumber,
        });
      }
    };

    window.addEventListener("message", handleCommand);
    return () => window.removeEventListener("message", handleCommand);
  }, [audio, server, anilistId, malId, episodeNumber, postToParent]);

  // Controls auto-hide on mouse movement
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !showSettings) {
        setShowControls(false);
      }
    }, 3000);
  };

  // Play / Pause toggle
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  // Seek helper
  const handleSeekRelative = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
  };

  // Timeline scrub
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const timeline = timelineRef.current;
    const video = videoRef.current;
    if (!timeline || !video || !duration) return;

    const rect = timeline.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = pos * duration;
  };

  // Toggle Mute
  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  // Volume Change
  const handleVolumeChange = (newVol: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = newVol;
    setVolume(newVol);
    video.muted = newVol === 0;
    setIsMuted(newVol === 0);
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Speed Change
  const handleSpeedChange = (speed: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackSpeed(speed);
    showToast(`Speed: ${speed}x`);
  };

  // Quality Change
  const handleQualityChange = (levelId: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelId;
      setSelectedQuality(levelId);
      const lvl = hlsLevels.find((l) => l.id === levelId);
      showToast(`Quality: ${lvl ? lvl.name : "Auto"}`);
    }
  };

  // Custom subtitle file upload (.vtt, .srt)
  const handleUploadSubtitle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const blob = new Blob([content], { type: "text/vtt" });
      const blobUrl = URL.createObjectURL(blob);

      const customTrack: SubtitleTrack = {
        label: file.name.replace(/\.[^/.]+$/, ""),
        language: "custom",
        url: blobUrl,
      };

      setSubtitles((prev) => [customTrack, ...prev]);
      setActiveSubTrack(blobUrl);
      showToast(`Loaded: ${file.name}`);
    };
    reader.readAsText(file);
  };

  // Is inside intro or outro?
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

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative w-full h-full bg-[#000000] text-white overflow-hidden select-none font-product-sans group"
      style={{ minHeight: "260px" }}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        playsInline
        onClick={togglePlay}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        className="w-full h-full object-contain cursor-pointer"
      />

      {/* Loading Spinner */}
      {isBuffering && !errorMsg && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none z-20">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-10 h-10 animate-spin text-white/90" />
            <span className="text-xs text-zinc-300 font-medium tracking-wide">
              Loading stream...
            </span>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {errorMsg && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#000000]/95 p-4 z-40 text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">Content Unavailable</h3>
          <p className="text-xs text-zinc-400 max-w-sm mb-4">{errorMsg}</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setServer(server === "flow" ? "zuri" : "flow");
              }}
              className="h-8 px-4 rounded-full bg-[#181818] hover:bg-[#202020] border border-white/[0.08] text-xs font-medium text-white transition-all flex items-center gap-1.5"
            >
              <Server className="w-3.5 h-3.5" />
              Switch to {server === "flow" ? "Zuri" : "Flow"}
            </button>
            <button
              onClick={() => {
                setAudio(audio === "sub" ? "dub" : "sub");
              }}
              className="h-8 px-4 rounded-full bg-[#181818] hover:bg-[#202020] border border-white/[0.08] text-xs font-medium text-white transition-all"
            >
              Try {audio === "sub" ? "Dub" : "Sub"}
            </button>
          </div>
        </div>
      )}

      {/* Subtitle Display */}
      {cueText && (
        <div className="absolute bottom-16 sm:bottom-20 left-0 right-0 flex justify-center pointer-events-none px-4 z-20">
          <div className="px-3.5 py-1.5 rounded-lg bg-black/75 backdrop-blur-sm text-center text-white text-sm sm:text-base md:text-lg font-medium shadow-lg max-w-[85%] whitespace-pre-line border border-white/[0.08]">
            {cueText}
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="h-7 px-3 rounded-full bg-[#181818]/90 border border-white/[0.1] backdrop-blur-md shadow-xl flex items-center gap-2 text-xs font-medium text-white">
            <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Manual Skip Intro/Outro Pill Button */}
      {(isInsideIntro || isInsideOutro) && (
        <div className="absolute bottom-20 right-4 z-30 animate-in fade-in duration-200">
          <button
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              if (isInsideIntro && skipTimes.intro) {
                video.currentTime = skipTimes.intro.end;
                showToast("Skipped Opening");
              } else if (isInsideOutro && skipTimes.outro) {
                video.currentTime = skipTimes.outro.end;
                showToast("Skipped Ending");
              }
            }}
            className="h-[36px] px-4 rounded-full bg-[#0C0C0C]/90 hover:bg-[#181818] border border-white/[0.12] backdrop-blur-md text-xs font-bold text-white shadow-2xl transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
          >
            <FastForward className="w-3.5 h-3.5" />
            <span>{isInsideIntro ? "Skip Opening" : "Skip Ending"}</span>
          </button>
        </div>
      )}

      {/* Big Center Play Button when Paused */}
      {!isPlaying && !isBuffering && !errorMsg && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center z-10 cursor-pointer bg-black/20"
        >
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#0C0C0C]/80 border border-white/[0.1] backdrop-blur-md shadow-2xl flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all">
            <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-white translate-x-0.5" />
          </div>
        </div>
      )}

      {/* Top Bar (Anime Title, Server & Audio Badge) */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-b from-black/80 via-black/30 to-transparent flex items-center justify-between z-30 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs sm:text-sm font-semibold truncate text-white">
            {animeTitle}
          </span>
          <span className="text-xs text-zinc-400 font-medium shrink-0">
            EP {episodeNumber}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Server Badge */}
          <div className="h-6 px-2 rounded-full bg-[#0C0C0C]/90 border border-white/[0.08] flex items-center gap-1 text-[11px] font-semibold text-zinc-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="uppercase">{server}</span>
          </div>

          {/* Audio Badge */}
          <button
            onClick={() => setAudio(audio === "sub" ? "dub" : "sub")}
            className="h-6 px-2.5 rounded-full bg-[#181818] hover:bg-[#202020] border border-white/[0.1] text-[11px] font-bold text-white transition-all uppercase cursor-pointer"
            title="Toggle Sub / Dub"
          >
            {audio}
          </button>
        </div>
      </div>

      {/* Bottom Controls Bar (shad-renew aesthetic) */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 px-3 py-3 sm:px-4 sm:py-3.5 bg-gradient-to-t from-black/95 via-black/50 to-transparent z-30 transition-opacity duration-300 flex flex-col gap-2",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {/* Timeline Scrubber */}
        <div
          ref={timelineRef}
          onClick={handleTimelineClick}
          className="relative w-full h-1.5 sm:h-2 rounded-full bg-white/[0.12] cursor-pointer group/timeline flex items-center"
        >
          {/* Buffer Bar */}
          <div
            className="absolute top-0 bottom-0 left-0 rounded-full bg-white/25 pointer-events-none"
            style={{
              width: `${duration > 0 ? (bufferedTime / duration) * 100 : 0}%`,
            }}
          />

          {/* Intro highlight on timeline */}
          {skipTimes.intro && duration > 0 && (
            <div
              className="absolute top-0 bottom-0 bg-amber-400/40 rounded-sm pointer-events-none"
              style={{
                left: `${(skipTimes.intro.start / duration) * 100}%`,
                width: `${((skipTimes.intro.end - skipTimes.intro.start) / duration) * 100}%`,
              }}
            />
          )}

          {/* Outro highlight on timeline */}
          {skipTimes.outro && duration > 0 && (
            <div
              className="absolute top-0 bottom-0 bg-blue-400/40 rounded-sm pointer-events-none"
              style={{
                left: `${(skipTimes.outro.start / duration) * 100}%`,
                width: `${((skipTimes.outro.end - skipTimes.outro.start) / duration) * 100}%`,
              }}
            />
          )}

          {/* Played Progress Bar */}
          <div
            className="absolute top-0 bottom-0 left-0 rounded-full bg-white pointer-events-none"
            style={{
              width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
            }}
          />

          {/* Scrubber Knob */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md scale-0 group-hover/timeline:scale-100 transition-transform pointer-events-none"
            style={{
              left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
            }}
          />
        </div>

        {/* Unified Bottom Control Track */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {/* Left Controls: Play, Rewind, Forward, Volume, Time */}
          <div className="flex items-center h-[36px] px-1 rounded-full bg-[#0C0C0C]/85 border border-white/[0.08] backdrop-blur-md gap-0.5 sm:gap-1">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer"
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current translate-x-0.5" />
              )}
            </button>

            {/* Rewind 10s */}
            <button
              onClick={() => handleSeekRelative(-10)}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer"
              title="Rewind 10s"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Forward 10s */}
            <button
              onClick={() => handleSeekRelative(10)}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer"
              title="Forward 10s"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            {/* Volume Control */}
            <div className="flex items-center group/vol">
              <button
                onClick={toggleMute}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-red-400" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-3.5 h-3.5" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>

              <div className="w-0 overflow-hidden group-hover/vol:w-16 transition-all duration-200 flex items-center pl-1 pr-1.5">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-white"
                />
              </div>
            </div>

            {/* Time Stamp */}
            <div className="px-2 text-xs font-medium text-zinc-300 tabular-nums flex items-center gap-1 select-none">
              <span>{formatSecondsToTime(currentTime)}</span>
              <span className="text-zinc-500">/</span>
              <span className="text-zinc-400">{formatSecondsToTime(duration)}</span>
            </div>
          </div>

          {/* Right Controls: PiP, Settings, Fullscreen */}
          <div className="flex items-center h-[36px] px-1 rounded-full bg-[#0C0C0C]/85 border border-white/[0.08] backdrop-blur-md gap-0.5 sm:gap-1">
            {/* Picture in Picture */}
            <button
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                if (document.pictureInPictureElement) {
                  document.exitPictureInPicture().catch(() => {});
                } else if (document.pictureInPictureEnabled) {
                  video.requestPictureInPicture().catch(() => {});
                }
              }}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer"
              title="Picture in Picture"
            >
              <PictureInPicture2 className="w-3.5 h-3.5" />
            </button>

            {/* Captions Toggle */}
            <button
              onClick={() => {
                setActiveSubTrack(activeSubTrack === "off" ? (subtitles[0]?.url || null) : "off");
              }}
              className={cn(
                "w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all cursor-pointer",
                activeSubTrack && activeSubTrack !== "off"
                  ? "text-white bg-white/10"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.06]"
              )}
              title="Toggle Captions"
            >
              <Captions className="w-3.5 h-3.5" />
            </button>

            {/* Settings Trigger */}
            <button
              onClick={() => {
                setShowSettings((prev) => !prev);
                setSettingsSubMenu("main");
              }}
              className={cn(
                "w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all cursor-pointer",
                showSettings
                  ? "text-white bg-white/15 rotate-45"
                  : "text-zinc-300 hover:text-white hover:bg-white/[0.06]"
              )}
              title="Settings"
            >
              <Settings className="w-3.5 h-3.5 transition-transform" />
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer"
              title="Fullscreen (F)"
            >
              {isFullscreen ? (
                <Minimize className="w-3.5 h-3.5" />
              ) : (
                <Maximize className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Frosted Glass Settings Menu (shad-renew spec) */}
      {showSettings && (
        <div
          style={{
            backgroundColor: "rgba(12, 12, 12, 0.88)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
          className="absolute bottom-16 sm:bottom-20 right-3 sm:right-4 w-[260px] sm:w-[280px] rounded-xl border border-white/[0.1] p-1.5 shadow-2xl shadow-black/95 z-50 text-white font-product-sans animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Main Menu */}
          {settingsSubMenu === "main" && (
            <div className="space-y-0.5">
              {/* Server Route */}
              <button
                onClick={() => setSettingsSubMenu("server")}
                className="w-full flex items-center justify-between gap-2.5 px-3 py-2 text-xs rounded-lg font-medium hover:bg-white/[0.05] transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-2 text-zinc-300">
                  <Server className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Server</span>
                </div>
                <div className="flex items-center gap-1 text-zinc-400">
                  <span className="capitalize">{server}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>

              {/* Audio Route */}
              <button
                onClick={() => setSettingsSubMenu("audio")}
                className="w-full flex items-center justify-between gap-2.5 px-3 py-2 text-xs rounded-lg font-medium hover:bg-white/[0.05] transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-2 text-zinc-300">
                  <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Audio</span>
                </div>
                <div className="flex items-center gap-1 text-zinc-400">
                  <span className="uppercase">{audio}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>

              {/* Quality */}
              <button
                onClick={() => setSettingsSubMenu("quality")}
                className="w-full flex items-center justify-between gap-2.5 px-3 py-2 text-xs rounded-lg font-medium hover:bg-white/[0.05] transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-2 text-zinc-300">
                  <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Quality</span>
                </div>
                <div className="flex items-center gap-1 text-zinc-400">
                  <span>
                    {selectedQuality === -1
                      ? "Auto"
                      : hlsLevels.find((l) => l.id === selectedQuality)?.name || "Auto"}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>

              {/* Captions */}
              <button
                onClick={() => setSettingsSubMenu("subtitles")}
                className="w-full flex items-center justify-between gap-2.5 px-3 py-2 text-xs rounded-lg font-medium hover:bg-white/[0.05] transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-2 text-zinc-300">
                  <Captions className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Captions</span>
                </div>
                <div className="flex items-center gap-1 text-zinc-400">
                  <span>{activeSubTrack === "off" || !activeSubTrack ? "Off" : "On"}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>

              {/* Speed */}
              <button
                onClick={() => setSettingsSubMenu("speed")}
                className="w-full flex items-center justify-between gap-2.5 px-3 py-2 text-xs rounded-lg font-medium hover:bg-white/[0.05] transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-2 text-zinc-300">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Speed</span>
                </div>
                <div className="flex items-center gap-1 text-zinc-400">
                  <span>{playbackSpeed}x</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>

              {/* Auto Skip Settings */}
              <button
                onClick={() => setSettingsSubMenu("skips")}
                className="w-full flex items-center justify-between gap-2.5 px-3 py-2 text-xs rounded-lg font-medium hover:bg-white/[0.05] transition-colors cursor-pointer text-left border-t border-white/[0.06] pt-2"
              >
                <div className="flex items-center gap-2 text-zinc-300">
                  <FastForward className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Auto Skip</span>
                </div>
                <div className="flex items-center gap-1 text-zinc-400">
                  <span>{autoSkipOp ? "Intro ON" : "Off"}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>
          )}

          {/* Submenu: Server */}
          {settingsSubMenu === "server" && (
            <div>
              <div className="flex items-center gap-2 pb-2 mb-1.5 border-b border-white/[0.08]">
                <button
                  onClick={() => setSettingsSubMenu("main")}
                  className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-semibold">Select Server</span>
              </div>
              <div className="space-y-1">
                {[
                  { id: "flow", name: "Flow", desc: "Default edge HLS" },
                  { id: "zuri", name: "Zuri", desc: "Fast backup stream" },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setServer(s.id);
                      setShowSettings(false);
                      showToast(`Switched server to ${s.name}`);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg font-medium transition-colors cursor-pointer",
                      server === s.id ? "bg-white/10 text-white" : "hover:bg-white/[0.04] text-zinc-400"
                    )}
                  >
                    <div className="flex flex-col text-left">
                      <span className="font-semibold text-white">{s.name}</span>
                      <span className="text-[10px] text-zinc-500">{s.desc}</span>
                    </div>
                    {server === s.id && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Submenu: Audio */}
          {settingsSubMenu === "audio" && (
            <div>
              <div className="flex items-center gap-2 pb-2 mb-1.5 border-b border-white/[0.08]">
                <button
                  onClick={() => setSettingsSubMenu("main")}
                  className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-semibold">Audio Track</span>
              </div>
              <div className="space-y-1">
                {[
                  { id: "sub", label: "Japanese (Sub)" },
                  { id: "dub", label: "English (Dub)" },
                ].map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setAudio(a.id as any);
                      setShowSettings(false);
                      showToast(`Audio set to ${a.label}`);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg font-medium transition-colors cursor-pointer",
                      audio === a.id ? "bg-white/10 text-white" : "hover:bg-white/[0.04] text-zinc-400"
                    )}
                  >
                    <span>{a.label}</span>
                    {audio === a.id && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Submenu: Quality */}
          {settingsSubMenu === "quality" && (
            <div>
              <div className="flex items-center gap-2 pb-2 mb-1.5 border-b border-white/[0.08]">
                <button
                  onClick={() => setSettingsSubMenu("main")}
                  className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-semibold">Stream Quality</span>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                <button
                  onClick={() => {
                    handleQualityChange(-1);
                    setShowSettings(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-1.5 text-xs rounded-lg font-medium transition-colors cursor-pointer",
                    selectedQuality === -1 ? "bg-white/10 text-white" : "hover:bg-white/[0.04] text-zinc-400"
                  )}
                >
                  <span>Auto (Adaptive)</span>
                  {selectedQuality === -1 && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
                {hlsLevels.map((lvl) => (
                  <button
                    key={lvl.id}
                    onClick={() => {
                      handleQualityChange(lvl.id);
                      setShowSettings(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-1.5 text-xs rounded-lg font-medium transition-colors cursor-pointer",
                      selectedQuality === lvl.id ? "bg-white/10 text-white" : "hover:bg-white/[0.04] text-zinc-400"
                    )}
                  >
                    <span>{lvl.name}</span>
                    {selectedQuality === lvl.id && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Submenu: Captions (Upload & Sync) */}
          {settingsSubMenu === "subtitles" && (
            <div>
              <div className="flex items-center gap-2 pb-2 mb-1.5 border-b border-white/[0.08]">
                <button
                  onClick={() => setSettingsSubMenu("main")}
                  className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-semibold">Captions</span>
              </div>
              <div className="space-y-1 max-h-44 overflow-y-auto">
                <button
                  onClick={() => {
                    setActiveSubTrack("off");
                    setShowSettings(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-1.5 text-xs rounded-lg font-medium transition-colors cursor-pointer",
                    activeSubTrack === "off" ? "bg-white/10 text-white" : "hover:bg-white/[0.04] text-zinc-400"
                  )}
                >
                  <span>Off</span>
                  {activeSubTrack === "off" && <Check className="w-3.5 h-3.5 text-white" />}
                </button>

                {subtitles.map((sub, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setActiveSubTrack(sub.url);
                      setShowSettings(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-1.5 text-xs rounded-lg font-medium transition-colors cursor-pointer",
                      activeSubTrack === sub.url ? "bg-white/10 text-white" : "hover:bg-white/[0.04] text-zinc-400"
                    )}
                  >
                    <span className="truncate">{sub.label || sub.language}</span>
                    {activeSubTrack === sub.url && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>

              {/* Subtitle Offset & Upload */}
              <div className="border-t border-white/[0.08] pt-2 mt-2 space-y-2">
                <div className="flex items-center justify-between px-1 text-[11px] text-zinc-400">
                  <span>Sync Offset:</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSubOffset((p) => p - 0.5)}
                      className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white font-mono"
                    >
                      -0.5s
                    </button>
                    <span className="w-12 text-center text-white font-mono">{subOffset.toFixed(1)}s</span>
                    <button
                      onClick={() => setSubOffset((p) => p + 0.5)}
                      className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white font-mono"
                    >
                      +0.5s
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/[0.08] text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload .vtt / .srt</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".vtt,.srt"
                  onChange={handleUploadSubtitle}
                  className="hidden"
                />
              </div>
            </div>
          )}

          {/* Submenu: Speed */}
          {settingsSubMenu === "speed" && (
            <div>
              <div className="flex items-center gap-2 pb-2 mb-1.5 border-b border-white/[0.08]">
                <button
                  onClick={() => setSettingsSubMenu("main")}
                  className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-semibold">Playback Speed</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((sp) => (
                  <button
                    key={sp}
                    onClick={() => {
                      handleSpeedChange(sp);
                      setShowSettings(false);
                    }}
                    className={cn(
                      "py-1.5 text-xs rounded-lg font-medium transition-colors text-center cursor-pointer",
                      playbackSpeed === sp ? "bg-white text-black font-bold" : "hover:bg-white/10 text-zinc-300"
                    )}
                  >
                    {sp}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Submenu: Auto Skip Toggles (Micro Toggles per shad-renew spec) */}
          {settingsSubMenu === "skips" && (
            <div>
              <div className="flex items-center gap-2 pb-2 mb-1.5 border-b border-white/[0.08]">
                <button
                  onClick={() => setSettingsSubMenu("main")}
                  className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-semibold">Auto Skip Options</span>
              </div>
              <div className="space-y-2.5 p-1">
                {/* Auto Skip Intro Toggle */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex flex-col">
                    <span className="font-medium text-white">Auto Skip Intro</span>
                    <span className="text-[10px] text-zinc-500">Skip opening animation</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoSkipOp(!autoSkipOp)}
                    className={cn(
                      "relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer",
                      autoSkipOp ? "bg-white" : "bg-[#202020] border border-white/[0.08]"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-2.5 w-2.5 rounded-full shadow-xs transition-transform duration-200",
                        autoSkipOp ? "translate-x-3 bg-black" : "translate-x-0.5 bg-zinc-500"
                      )}
                    />
                  </button>
                </div>

                {/* Auto Skip Outro Toggle */}
                <div className="flex items-center justify-between text-xs border-t border-white/[0.06] pt-2">
                  <div className="flex flex-col">
                    <span className="font-medium text-white">Auto Skip Outro</span>
                    <span className="text-[10px] text-zinc-500">Skip ending animation</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoSkipEd(!autoSkipEd)}
                    className={cn(
                      "relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer",
                      autoSkipEd ? "bg-white" : "bg-[#202020] border border-white/[0.08]"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-2.5 w-2.5 rounded-full shadow-xs transition-transform duration-200",
                        autoSkipEd ? "translate-x-3 bg-black" : "translate-x-0.5 bg-zinc-500"
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
