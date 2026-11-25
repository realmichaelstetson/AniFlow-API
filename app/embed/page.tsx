import React, { Suspense } from "react";
import { EmbedPageClient } from "@/components/player/embed-page-client";
import { ticketStore } from "@/lib/tickets";

interface PageProps {
  searchParams: {
    t?: string;
    ticket?: string;
    anilistId?: string;
    malId?: string;
    tmdb_id?: string;
    tmdbId?: string;
    type?: "anime" | "movie" | "tv";
    season?: string;
    episode?: string;
    audio?: string;
    server?: string;
    progress?: string;
    startAt?: string;
  };
}

export default function GeneralEmbedPage({ searchParams }: PageProps) {
  const ticketKey = searchParams.t || searchParams.ticket;
  let anilistId: number | null = searchParams.anilistId ? parseInt(searchParams.anilistId, 10) : null;
  let malId: number | null = searchParams.malId ? parseInt(searchParams.malId, 10) : null;
  let tmdbId: number | null = searchParams.tmdb_id || searchParams.tmdbId ? parseInt((searchParams.tmdb_id || searchParams.tmdbId)!, 10) : null;
  let seasonNumber: number = searchParams.season ? parseInt(searchParams.season, 10) : 1;
  let episodeNumber: number = searchParams.episode ? parseInt(searchParams.episode, 10) : 1;
  let audio: string = searchParams.audio || "english";
  let mediaType = searchParams.type || (tmdbId ? (searchParams.season ? "tv" : "movie") : "anime");

  if (ticketKey && ticketStore.has(ticketKey)) {
    const ticketData = ticketStore.get(ticketKey)!;
    if (ticketData.anilistId) anilistId = ticketData.anilistId;
    if (ticketData.malId) malId = ticketData.malId;
    episodeNumber = ticketData.episode;
    audio = ticketData.audio;
  }

  return (
    <Suspense fallback={<div className="w-screen h-screen bg-black" />}>
      <EmbedPageClient
        mediaType={mediaType}
        anilistId={anilistId}
        malId={malId}
        tmdbId={tmdbId}
        seasonNumber={seasonNumber}
        episodeNumber={episodeNumber}
        audio={audio}
        ticket={ticketKey}
      />
    </Suspense>
  );
}
