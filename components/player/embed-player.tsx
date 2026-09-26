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
} from "lucide-react";
import { formatSecondsToTime, cn } from "@/lib/utils";
import { SubtitleSettingsDialog, SubtitleStyles } from "./subtitle-settings-dialog";

export interface SubtitleTrack {
  id?: string;
  language: string;
  label: string;
  url: string;
  default?: boolean;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
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
  const [volume, setVolume] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const v = localStorage.getItem("anime_player_volume");
        if (v) return Math.min(1, Math.max(0, parseFloat(v)));
      } catch {}
    }
    return 1;
  });
  const [isMuted, setIsMuted] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("anime_player_muted") === "true";
      } catch {}
    }
    return false;
  });
  const [showRemainingTime, setShowRemainingTime] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volumeBoost, setVolumeBoost] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPortraitFs, setIsPortraitFs] = useState(false);
  const [isTheater, setIsTheater] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);

  // Server & Audio options
  const [selectedType, setSelectedType] = useState<"sub" | "dub">(initialAudio);
  const [server, setServer] = useState<string>(initialServer.toLowerCase());
  const [autoSkipState, setAutoSkipState] = useState<boolean>(autoskipIntro);
  const [autoSkipOutroState, setAutoSkipOutroState] = useState<boolean>(autoskipOutro);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [animeTitle, setAnimeTitle] = useState<string>(initialTitle || "Anime");

  // HLS & Qualities
  const [hlsLevels, setHlsLevels] = useState<{ index: number; name: string; height: number }[]>([]);
  const [selectedHlsLevel, setSelectedHlsLevel] = useState<number>(-1);

  // Subtitles
  const [allAvailableSubtitles, setAllAvailableSubtitles] = useState<SubtitleTrack[]>([]);
  const [activeSubtitleTrack, setActiveSubtitleTrack] = useState<string | null>("en");
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [currentSubtitleText, setCurrentSubtitleText] = useState<string>("");
  const [showSubtitleStyling, setShowSubtitleStyling] = useState(false);
  const [subtitleStyles, setSubtitleStyles] = useState<SubtitleStyles>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("anime_subtitle_styles");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return {
      fontSize: "base",
      fontFamily: "sans",
      fontWeight: "bold",
      color: "#ffffff",
      background: "transparent",
      shadow: true,
      outline: "thick",
    };
  });

  // Skip Times
  const [skipTimes, setSkipTimes] = useState<{
    intro: { start: number; end: number } | null;
    outro: { start: number; end: number } | null;
  }>({ intro: null, outro: null });

  // Timeline hover
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);

  // Settings Menu
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [settingsSubMenu, setSettingsSubMenu] = useState<
    "main" | "server" | "subtitles" | "subtitle-style" | "quality" | "speed" | "boost"
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
  const isSwitchingServerRef = useRef<boolean>(false);
  const preserveTimeRef = useRef<number>(startAt || 0);
  const hasAutoSkippedIntroRef = useRef<boolean>(false);
  const hasAutoSkippedOutroRef = useRef<boolean>(false);
  const lastTouchTimeRef = useRef<number>(0);
  const singleTapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const seekFeedbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const connectedVideoRef = useRef<HTMLVideoElement | null>(null);

  // Broadcast to parent page via PostMessage
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

  // Activity detection & Auto-hide Controls
  const handleUserActivity = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    if (isPlayingRef.current) {
      hideControlsTimer.current = setTimeout(() => {
        if (!showSettingsMenu) {
          setShowControls(false);
        }
      }, 3000);
    }
  }, [showSettingsMenu]);

  // Load Skip Times
  useEffect(() => {
    let cancelled = false;
    async function loadSkipTimes() {
      try {
        const idParam = anilistId ? `anilistId=${anilistId}` : `malId=${malId}`;
        const res = await fetch(`/api/anime/skip-times?${idParam}&episode=${episodeNumber}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setSkipTimes({ intro: data.intro || null, outro: data.outro || null });
        }
      } catch {}
    }
    loadSkipTimes();
    return () => {
      cancelled = true;
    };
  }, [anilistId, malId, episodeNumber]);

  // Fetch Stream from /api/play
  useEffect(() => {
    let cancelled = false;
    async function loadStream() {
      setIsLoading(true);
      setFatalError(null);
      try {
        const params = new URLSearchParams();
        if (anilistId) params.set("anilistId", anilistId.toString());
        if (malId) params.set("malId", malId.toString());
        params.set("episode", episodeNumber.toString());
        params.set("audio", selectedType);
        params.set("server", server);

        const res = await fetch(`/api/play?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Failed to load stream (status: ${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;

        if (!data.streamUrl) {
          throw new Error(data.error || "No playable stream returned from server.");
        }

        setStreamUrl(data.streamUrl);
        if (data.title) setAnimeTitle(data.title);

        if (Array.isArray(data.subtitles)) {
          setAllAvailableSubtitles(data.subtitles);
          const defaultSub =
            data.subtitles.find((s: SubtitleTrack) => s.default) ||
            data.subtitles.find((s: SubtitleTrack) => s.language?.toLowerCase().startsWith("en")) ||
            data.subtitles[0];
          if (defaultSub) {
            setActiveSubtitleTrack(defaultSub.id || defaultSub.url);
          }
        }

        postToParent("PLAYER_EVENT", {
          type: "ready",
          server,
          audio: selectedType,
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
  }, [anilistId, malId, episodeNumber, selectedType, server, postToParent]);

  // HLS player setup & Native fallback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const startPos = preserveTimeRef.current || startAt || 0;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setIsLoading(false);
        const levels = data.levels.map((lvl, index) => ({
          index,
          name: lvl.height ? `${lvl.height}p` : `Level ${index + 1}`,
          height: lvl.height || 0,
        }));
        setHlsLevels(levels);

        if (startPos > 0) {
          video.currentTime = startPos;
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
              setFatalError("Fatal playback error on stream");
              setIsLoading(false);
              break;
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
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, startAt]);

  // Subtitle cues fetching & parsing (.vtt / .ass / .srt)
  useEffect(() => {
    if (activeSubtitleTrack === null) {
      setCues([]);
      setCurrentSubtitleText("");
      return;
    }

    const currentSub =
      allAvailableSubtitles.find((s) => s.id === activeSubtitleTrack || s.url === activeSubtitleTrack) ||
      allAvailableSubtitles[0];

    if (!currentSub || !currentSub.url) {
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
    const fetchUrl = currentSub.url.startsWith("/api/proxy")
      ? currentSub.url
      : `/api/proxy/subtitles?url=${encodeURIComponent(currentSub.url)}`;

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

    // Post to parent & Watch progress sync
    postToParent("PLAYER_EVENT", {
      type: "time",
      currentTime: current,
      duration: dur,
      buffered,
      percentage: dur > 0 ? (current / dur) * 100 : 0,
    });

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

  // Fullscreen toggler
  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    const isFs = Boolean(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement
    );

    if (!isFs) {
      const requestFs =
        el.requestFullscreen ||
        (el as any).webkitRequestFullscreen ||
        (el as any).mozRequestFullScreen ||
        (el as any).msRequestFullscreen;

      if (requestFs) {
        requestFs.call(el).catch(() => {});
      }
      setIsFullscreen(true);
    } else {
      const exitFs =
        document.exitFullscreen ||
        (document as any).webkitExitFullscreen ||
        (document as any).mozCancelFullScreen ||
        (document as any).msExitFullscreen;

      if (exitFs) {
        exitFs.call(document).catch(() => {});
      }
      setIsFullscreen(false);
      setIsPortraitFs(false);
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

  // Double tap on mobile
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    lastTouchTimeRef.current = Date.now();
    const touch = e.changedTouches[0];
    if (!touch || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const width = rect.width;

    if (x < width * 0.42) {
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

    if (x > width * 0.58) {
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

    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      setShowControls((prev) => !prev);
      singleTapTimerRef.current = null;
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

  // Listen to postMessage from parent iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data) return;
      const cmd = typeof data === "string" ? data : data.command || data.action || data.type;
      switch (cmd) {
        case "play":
          videoRef.current?.play().catch(() => {});
          break;
        case "pause":
          videoRef.current?.pause();
          break;
        case "seek":
          if (typeof data.time === "number" || typeof data.seconds === "number") {
            handleSeek(data.time ?? data.seconds);
          }
          break;
        case "getStatus":
          postToParent("PLAYER_EVENT", {
            type: "status",
            currentTime,
            duration,
            isPlaying,
            isMuted,
            volume,
          });
          break;
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [currentTime, duration, isPlaying, isMuted, volume, postToParent]);

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
        const isPortrait = window.innerHeight > window.innerWidth;
        setIsPortraitFs(isPortrait);
      } else {
        setIsPortraitFs(false);
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

  return (
    <div
      ref={containerRef}
      onMouseMove={handleUserActivity}
      onClick={handleScreenClick}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        ...(isPortraitFs
          ? {
              position: "fixed",
              top: "50%",
              left: "50%",
              width: "100vh",
              height: "100vw",
              transform: "translate(-50%, -50%) rotate(90deg)",
              transformOrigin: "center center",
              zIndex: 99999,
              maxWidth: "none",
              maxHeight: "none",
            }
          : {}),
      }}
      className={cn(
        "relative w-full bg-black overflow-hidden shadow-2xl group select-none transition-all duration-300 touch-manipulation",
        !showControls ? "cursor-none [&_*]:!cursor-none" : "cursor-default",
        isFullscreen || isPortraitFs
          ? "fixed inset-0 z-[99999] w-screen h-screen rounded-none border-0 max-h-none"
          : cn(
              "rounded-xl sm:rounded-2xl border border-white/10",
              isTheater ? "aspect-[21/9] max-h-[85vh]" : "aspect-video max-h-[78vh]"
            )
      )}
    >
      {/* HTML5 / HLS Video Element */}
      <video
        ref={videoRef}
        onError={(e) => {
          console.warn("HTML5 video error:", e);
          setIsLoading(false);
          setFatalError("Playback error on this server.");
        }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => {
          if (videoRef.current) setDuration(videoRef.current.duration);
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
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md z-30 p-6 text-center space-y-4 animate-in fade-in duration-200">
          <div className="w-14 h-14 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-amber-400 shadow-2xl">
            <Tv className="w-7 h-7" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h4 className="text-sm font-semibold text-white">Stream Unavailable</h4>
            <p className="text-xs text-zinc-400">{fatalError}</p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setServer((prev) => (prev === "flow" ? "zuri" : "flow"));
              }}
              className="px-4 py-2 rounded-full bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-all shadow-lg active:scale-95 cursor-pointer"
            >
              Switch to {server === "flow" ? "Zuri" : "Flow"}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFatalError(null);
                setIsLoading(true);
                if (videoRef.current) {
                  videoRef.current.load();
                }
                if (hlsRef.current && streamUrl) {
                  hlsRef.current.loadSource(streamUrl);
                  if (hlsRef.current.media !== videoRef.current && videoRef.current) {
                    hlsRef.current.attachMedia(videoRef.current);
                  }
                }
              }}
              className="px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition-all border border-white/10 active:scale-95 cursor-pointer"
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
                isFullscreen || isPortraitFs ? "w-16 h-16" : "w-14 h-14",
                showControls || !isPlaying ? "scale-100 pointer-events-auto" : "scale-0 pointer-events-none"
              )}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause
                  className={cn(
                    "fill-white text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]",
                    isFullscreen || isPortraitFs ? "w-7 h-7" : "w-6 h-6"
                  )}
                />
              ) : (
                <Play
                  className={cn(
                    "fill-white text-white ml-0.5 drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]",
                    isFullscreen || isPortraitFs ? "w-7 h-7" : "w-6 h-6"
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
          showControls ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Bottom Controls Bar */}
      <div
        data-controls-bar="true"
        onDoubleClick={(e) => e.stopPropagation()}
        className={cn(
          "absolute bottom-0 left-0 right-0 px-3 py-2.5 sm:px-5 sm:py-4 z-30 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
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
          <div className="flex items-center h-10 sm:h-10.5 px-1.5 py-1 rounded-full bg-zinc-950/65 backdrop-blur-md backdrop-saturate-150 shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.22)] border border-white/10 gap-1">
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
          <div className="flex items-center h-10 sm:h-10.5 px-1.5 py-1 rounded-full bg-zinc-950/65 backdrop-blur-md backdrop-saturate-150 shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.22)] border border-white/10 gap-1">
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
                setShowSettingsMenu((prev) => !prev);
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

        {/* Settings Modal Card with Apple Liquid Glass styling */}
        <div
          ref={settingsMenuRef}
          style={{
            height: menuHeight ? `${menuHeight}px` : undefined,
            maxHeight: menuMaxHeight ? `${menuMaxHeight}px` : undefined,
          }}
          className={cn(
            "absolute bottom-[78px] sm:bottom-[86px] right-3 sm:right-4 w-[260px] sm:w-[285px] rounded-2xl bg-zinc-950/65 backdrop-blur-md backdrop-saturate-150 shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.22)] border border-white/10 z-50 text-white transition-[height,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] origin-bottom-right overflow-hidden overscroll-contain",
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
                    <span className="truncate max-w-[110px] font-medium uppercase">
                      {server} ({selectedType})
                    </span>
                    <ChevronRight className="w-3 h-3 text-zinc-400" />
                  </div>
                </button>

                {/* 2. Subtitles */}
                <button
                  type="button"
                  onClick={() => setSettingsSubMenu("subtitles")}
                  className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-white/[0.08] flex items-center justify-center text-zinc-300 group-hover:text-white transition-colors">
                      <Captions className="w-3 h-3" />
                    </div>
                    <span className="text-[11px] font-semibold text-white">Subtitles</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-zinc-400 group-hover:text-zinc-200">
                    <span className="truncate max-w-[95px] font-medium">{activeSubLabel}</span>
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

                {/* 4. Playback Speed */}
                <button
                  type="button"
                  onClick={() => setSettingsSubMenu("speed")}
                  className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-white/[0.08] flex items-center justify-center text-zinc-300 group-hover:text-white transition-colors">
                      <PlayCircle className="w-3 h-3" />
                    </div>
                    <span className="text-[11px] font-semibold text-white">Playback Speed</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-zinc-400 group-hover:text-zinc-200">
                    <span className="font-medium">
                      {playbackSpeed === 1 ? "Normal" : `${playbackSpeed}x`}
                    </span>
                    <ChevronRight className="w-3 h-3 text-zinc-400" />
                  </div>
                </button>

                {/* 5. Volume Boost */}
                <button
                  type="button"
                  onClick={() => setSettingsSubMenu("boost")}
                  className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-white/[0.08] flex items-center justify-center text-zinc-300 group-hover:text-white transition-colors">
                      <Volume2 className="w-3 h-3" />
                    </div>
                    <span className="text-[11px] font-semibold text-white">Volume Boost</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-zinc-400 group-hover:text-zinc-200">
                    <span className="font-medium">{Math.round(volumeBoost * 100)}%</span>
                    <ChevronRight className="w-3 h-3 text-zinc-400" />
                  </div>
                </button>

                {/* 6. Auto-skip Intro Toggle */}
                <div className="border-t border-white/10 pt-1 mt-1">
                  <div className="flex items-center justify-between p-1.5 rounded-xl hover:bg-white/[0.08] transition-colors">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[11px] font-medium text-white">Auto Skip Intro</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAutoSkipState((p) => !p)}
                      className={cn(
                        "w-8 h-4.5 rounded-full transition-colors relative cursor-pointer",
                        autoSkipState ? "bg-amber-400" : "bg-white/20"
                      )}
                    >
                      <div
                        className={cn(
                          "w-3.5 h-3.5 rounded-full bg-black shadow transition-transform absolute top-0.5",
                          autoSkipState ? "left-4" : "left-0.5"
                        )}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-xl hover:bg-white/[0.08] transition-colors">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[11px] font-medium text-white">Auto Skip Outro</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAutoSkipOutroState((p) => !p)}
                      className={cn(
                        "w-8 h-4.5 rounded-full transition-colors relative cursor-pointer",
                        autoSkipOutroState ? "bg-amber-400" : "bg-white/20"
                      )}
                    >
                      <div
                        className={cn(
                          "w-3.5 h-3.5 rounded-full bg-black shadow transition-transform absolute top-0.5",
                          autoSkipOutroState ? "left-4" : "left-0.5"
                        )}
                      />
                    </button>
                  </div>
                </div>
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
                  <span className="text-[11px] font-bold text-white tracking-wide">Server Route</span>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-bold text-zinc-400 px-2 py-0.5">Stream Source</div>
                  {[
                    { id: "flow", name: "Flow (ReAnime)", desc: "Flixcloud multi-server HLS" },
                    { id: "zuri", name: "Zuri (AniEmbed)", desc: "Animex provider HLS" },
                  ].map((srv) => {
                    const isSelected = server === srv.id;
                    return (
                      <button
                        key={srv.id}
                        type="button"
                        onClick={() => {
                          const cur = videoRef.current ? videoRef.current.currentTime : currentTime;
                          preserveTimeRef.current = cur;
                          setServer(srv.id);
                          setShowSettingsMenu(false);
                          showToast("success", `Switched to ${srv.name}`);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-all text-left cursor-pointer",
                          isSelected ? "bg-white/15 text-white" : "hover:bg-white/5 text-zinc-400 hover:text-white"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                          <span className={cn("text-[11px] font-semibold", !isSelected && "pl-5")}>{srv.name}</span>
                        </div>
                      </button>
                    );
                  })}

                  <div className="text-[10px] uppercase font-bold text-zinc-400 px-2 pt-2 pb-0.5">Audio Track</div>
                  {[
                    { id: "sub", label: "Sub (Japanese audio + English subtitles)" },
                    { id: "dub", label: "Dub (English audio)" },
                  ].map((aud) => {
                    const isSelected = selectedType === aud.id;
                    return (
                      <button
                        key={aud.id}
                        type="button"
                        onClick={() => {
                          const cur = videoRef.current ? videoRef.current.currentTime : currentTime;
                          preserveTimeRef.current = cur;
                          setSelectedType(aud.id as "sub" | "dub");
                          setShowSettingsMenu(false);
                          showToast("success", `Audio: ${aud.id.toUpperCase()}`);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-all text-left cursor-pointer",
                          isSelected ? "bg-white/15 text-white" : "hover:bg-white/5 text-zinc-400 hover:text-white"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                          <span className={cn("text-[11px] font-semibold", !isSelected && "pl-5")}>{aud.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sub-menu: Subtitles */}
            {settingsSubMenu === "subtitles" && (
              <div className="animate-in fade-in slide-in-from-right-3 duration-200">
                <div className="flex items-center gap-2 pb-2 border-b border-white/10 mb-1.5">
                  <button
                    type="button"
                    onClick={() => setSettingsSubMenu("main")}
                    className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 -translate-x-[0.5px]" />
                  </button>
                  <span className="text-[11px] font-bold text-white tracking-wide">Subtitles</span>
                </div>

                <div className="space-y-0.5 max-h-52 overflow-y-auto pr-1.5 player-menu-scrollbar">
                  {/* Off Option */}
                  {activeSubtitleTrack === null ? (
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/15 text-[11px] font-semibold text-white shadow-sm">
                      <div className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-white shrink-0" />
                        <span>Off</span>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSubtitleTrack(null);
                        setShowSettingsMenu(false);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/5 text-[11px] text-zinc-400 hover:text-white transition-colors pl-7 text-left cursor-pointer"
                    >
                      <span>Off</span>
                    </button>
                  )}

                  {/* Subtitle Tracks */}
                  {allAvailableSubtitles.map((sub, idx) => {
                    const isSelected = activeSubtitleTrack === (sub.id || sub.url);
                    return isSelected ? (
                      <div
                        key={sub.id || idx}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/15 text-[11px] font-semibold text-white shadow-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Check className="w-3.5 h-3.5 text-white shrink-0" />
                          <span className="truncate">{sub.label}</span>
                        </div>
                      </div>
                    ) : (
                      <button
                        key={sub.id || idx}
                        type="button"
                        onClick={() => {
                          setActiveSubtitleTrack(sub.id || sub.url);
                          setShowSettingsMenu(false);
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/5 text-[11px] text-zinc-400 hover:text-white transition-colors pl-7 text-left cursor-pointer"
                      >
                        <span className="truncate">{sub.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="border-t border-white/10 pt-1.5 mt-1.5">
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
                    onClick={() => setSettingsSubMenu("subtitles")}
                    className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 -translate-x-[0.5px]" />
                  </button>
                  <span className="text-[11px] font-bold text-white tracking-wide">Subtitle Style</span>
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
                  <span className="text-[11px] font-bold text-white tracking-wide">Quality</span>
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

                  {/* HLS Levels if available */}
                  {hlsLevels.map((lvl) => {
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

            {/* Sub-menu: Playback Speed */}
            {settingsSubMenu === "speed" && (
              <div className="animate-in fade-in slide-in-from-right-3 duration-200">
                <div className="flex items-center gap-2 pb-2 border-b border-white/10 mb-2">
                  <button
                    type="button"
                    onClick={() => setSettingsSubMenu("main")}
                    className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 -translate-x-[0.5px]" />
                  </button>
                  <span className="text-[11px] font-bold text-white tracking-wide">Playback Speed</span>
                </div>

                <div className="px-1 py-0.5 space-y-2 text-[11px]">
                  <div className="space-y-1">
                    {(() => {
                      const SPEED_STEPS = [
                        { value: 0.25, percent: 0, label: "0.25x" },
                        { value: 0.5, percent: 25, label: "0.5x" },
                        { value: 1.0, percent: 50, label: "1.0x" },
                        { value: 1.25, percent: 67, label: "1.25x" },
                        { value: 1.5, percent: 83, label: "1.5x" },
                        { value: 2.0, percent: 100, label: "2.0x" },
                      ];
                      const activeStep =
                        SPEED_STEPS.find((s) => Math.abs(s.value - playbackSpeed) < 0.01) || SPEED_STEPS[2];
                      const currentPercent = activeStep.percent;

                      return (
                        <>
                          <div className="relative w-full flex items-center pt-0.5 pb-1">
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={currentPercent}
                              onChange={(e) => {
                                const raw = parseFloat(e.target.value);
                                const closest = SPEED_STEPS.reduce((prev, curr) =>
                                  Math.abs(curr.percent - raw) < Math.abs(prev.percent - raw) ? curr : prev
                                );
                                if (videoRef.current) videoRef.current.playbackRate = closest.value;
                                setPlaybackSpeed(closest.value);
                              }}
                              style={{
                                background: `linear-gradient(to right, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.9) ${currentPercent}%, rgba(255,255,255,0.15) ${currentPercent}%, rgba(255,255,255,0.15) 100%)`,
                              }}
                              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-white [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(0,0,0,0.5)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/60 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-white/60 [&::-moz-range-thumb]:cursor-pointer"
                            />
                          </div>

                          <div className="relative text-[10px] text-zinc-400 font-medium select-none h-4">
                            {SPEED_STEPS.map((step) => {
                              const isSelected = Math.abs(playbackSpeed - step.value) < 0.01;
                              return (
                                <button
                                  key={step.value}
                                  type="button"
                                  onClick={() => {
                                    if (videoRef.current) videoRef.current.playbackRate = step.value;
                                    setPlaybackSpeed(step.value);
                                  }}
                                  className={cn(
                                    "absolute top-0 -translate-x-1/2 cursor-pointer transition-colors whitespace-nowrap",
                                    step.percent === 0 && "!translate-x-0",
                                    step.percent === 100 && "!-translate-x-full",
                                    isSelected
                                      ? "text-white font-bold drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]"
                                      : "text-zinc-500 hover:text-zinc-300"
                                  )}
                                  style={{ left: `${step.percent}%` }}
                                >
                                  {step.label}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Sub-menu: Volume Boost */}
            {settingsSubMenu === "boost" && (
              <div className="animate-in fade-in slide-in-from-right-3 duration-200">
                <div className="flex items-center gap-2 pb-2 border-b border-white/10 mb-2">
                  <button
                    type="button"
                    onClick={() => setSettingsSubMenu("main")}
                    className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 -translate-x-[0.5px]" />
                  </button>
                  <span className="text-[11px] font-bold text-white tracking-wide">Volume Boost</span>
                </div>

                <div className="px-1 py-0.5 space-y-2 text-[11px]">
                  <div className="space-y-1">
                    {(() => {
                      const BOOST_STEPS = [
                        { value: 0.5, percent: 0, label: "50%" },
                        { value: 0.75, percent: 17, label: "75%" },
                        { value: 1.0, percent: 33, label: "100%" },
                        { value: 1.25, percent: 50, label: "125%" },
                        { value: 1.5, percent: 67, label: "150%" },
                        { value: 1.75, percent: 83, label: "175%" },
                        { value: 2.0, percent: 100, label: "200%" },
                      ];
                      const activeStep =
                        BOOST_STEPS.find((s) => Math.abs(s.value - volumeBoost) < 0.01) || BOOST_STEPS[2];
                      const currentPercent = activeStep.percent;

                      return (
                        <>
                          <div className="relative w-full flex items-center pt-0.5 pb-1">
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={currentPercent}
                              onChange={(e) => {
                                const raw = parseFloat(e.target.value);
                                const closest = BOOST_STEPS.reduce((prev, curr) =>
                                  Math.abs(curr.percent - raw) < Math.abs(prev.percent - raw) ? curr : prev
                                );
                                handleVolumeBoost(closest.value);
                              }}
                              style={{
                                background: `linear-gradient(to right, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.9) ${currentPercent}%, rgba(255,255,255,0.15) ${currentPercent}%, rgba(255,255,255,0.15) 100%)`,
                              }}
                              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-white [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(0,0,0,0.5)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/60 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-white/60 [&::-moz-range-thumb]:cursor-pointer"
                            />
                          </div>

                          <div className="relative text-[9.5px] sm:text-[10px] text-zinc-400 font-medium select-none h-4">
                            {BOOST_STEPS.map((step) => {
                              const isSelected = Math.abs(volumeBoost - step.value) < 0.01;
                              return (
                                <button
                                  key={step.value}
                                  type="button"
                                  onClick={() => handleVolumeBoost(step.value)}
                                  className={cn(
                                    "absolute top-0 -translate-x-1/2 cursor-pointer transition-colors whitespace-nowrap",
                                    step.percent === 0 && "!translate-x-0",
                                    step.percent === 100 && "!-translate-x-full",
                                    isSelected
                                      ? "text-white font-bold drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]"
                                      : "text-zinc-500 hover:text-zinc-300"
                                  )}
                                  style={{ left: `${step.percent}%` }}
                                >
                                  {step.label}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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
