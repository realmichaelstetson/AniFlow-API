import React, { Suspense } from "react";
import { EmbedPageClient } from "@/components/player/embed-page-client";
import { ticketStore } from "@/lib/tickets";

interface PageProps {
  searchParams: {
    t?: string;
    ticket?: string;
    anilistId?: string;
    malId?: string;
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
  let episodeNumber: number = searchParams.episode ? parseInt(searchParams.episode, 10) : 1;
  let audio: "sub" | "dub" = (searchParams.audio === "dub" ? "dub" : "sub") as "sub" | "dub";

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
        anilistId={anilistId}
        malId={malId}
        episodeNumber={episodeNumber}
        audio={audio}
        ticket={ticketKey}
      />
    </Suspense>
  );
}
