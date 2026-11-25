"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { EmbedPlayer } from "./embed-player";
import { cleanAudioParam } from "@/lib/vidly-lang";

export interface EmbedPageClientProps {
  mediaType?: "anime" | "movie" | "tv";
  anilistId?: number | null;
  malId?: number | null;
  tmdbId?: number | null;
  seasonNumber?: number;
  episodeNumber?: number;
  audio?: string;
  ticket?: string | null;
}

export function EmbedPageClient({
  mediaType: propMediaType,
  anilistId: propAnilistId,
  malId: propMalId,
  tmdbId: propTmdbId,
  seasonNumber: propSeason,
  episodeNumber: propEpisode,
  audio: propAudio,
  ticket: propTicket,
}: EmbedPageClientProps) {
  const searchParams = useSearchParams();

  const queryMediaType = searchParams.get("type") as "anime" | "movie" | "tv" | null;
  const effectiveMediaType = propMediaType || queryMediaType || (propTmdbId || searchParams.get("tmdb_id") || searchParams.get("tmdbId") ? (searchParams.get("season") || propSeason ? "tv" : "movie") : "anime");

  // Check query audio override if present (default to English for anime, movies, and TV)
  const queryAudio = searchParams.get("audio");
  const rawEffectiveAudio = (queryAudio || propAudio || "english").trim();
  const normEffectiveAudio = cleanAudioParam(rawEffectiveAudio);
  const effectiveAudio =
    normEffectiveAudio.code === "ja"
      ? "japanese"
      : normEffectiveAudio.code === "en"
      ? "english"
      : normEffectiveAudio.code;

  // Query parameter overrides
  const isJa = normEffectiveAudio.code === "ja";
  let server =
    searchParams.get("server") ||
    (effectiveMediaType === "anime"
      ? isJa
        ? "katana-sub"
        : "katana-dub"
      : effectiveMediaType === "movie"
      ? "singularity"
      : "evion");
  const startAtRaw = searchParams.get("startAt") || searchParams.get("progress") || "0";
  const startAt = parseFloat(startAtRaw) || 0;
  const parentHost = searchParams.get("parentHost") || null;

  // autoskipIntro / skipIntro: 1 on (default), 0 off
  const introParam = searchParams.get("autoskipIntro") ?? searchParams.get("skipIntro");
  const autoskipIntro = introParam === "0" || introParam === "off" || introParam === "false" ? false : true;

  // autoskipOutro / skipOutro: 1 on (default), 0 off
  const outroParam = searchParams.get("autoskipOutro") ?? searchParams.get("skipOutro");
  const autoskipOutro = outroParam === "0" || outroParam === "off" || outroParam === "false" ? false : true;

  const effectiveAnilistId = propAnilistId
    ? propAnilistId
    : searchParams.get("anilistId")
    ? parseInt(searchParams.get("anilistId")!, 10)
    : null;

  const effectiveMalId = propMalId
    ? propMalId
    : searchParams.get("malId")
    ? parseInt(searchParams.get("malId")!, 10)
    : null;

  const effectiveTmdbId = propTmdbId
    ? propTmdbId
    : searchParams.get("tmdb_id")
    ? parseInt(searchParams.get("tmdb_id")!, 10)
    : searchParams.get("tmdbId")
    ? parseInt(searchParams.get("tmdbId")!, 10)
    : null;

  const effectiveSeason = propSeason
    ? propSeason
    : searchParams.get("season")
    ? parseInt(searchParams.get("season")!, 10)
    : 1;

  const effectiveEpisode = propEpisode !== undefined && propEpisode !== null
    ? propEpisode
    : searchParams.get("episode")
    ? parseInt(searchParams.get("episode")!, 10)
    : 1;

  return (
    <main className="fixed inset-0 w-full h-full bg-black overflow-hidden m-0 p-0">
      <EmbedPlayer
        mediaType={effectiveMediaType}
        anilistId={effectiveAnilistId}
        malId={effectiveMalId}
        tmdbId={effectiveTmdbId}
        seasonNumber={effectiveSeason}
        episodeNumber={effectiveEpisode}
        initialAudio={effectiveAudio}
        initialServer={searchParams.get("server") || (effectiveMediaType === "anime" ? server : undefined)}
        startAt={startAt}
        autoskipIntro={autoskipIntro}
        autoskipOutro={autoskipOutro}
        parentHost={parentHost}
      />
    </main>
  );
}
