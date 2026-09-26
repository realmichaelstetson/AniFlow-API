"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { EmbedPlayer } from "./embed-player";

export interface EmbedPageClientProps {
  anilistId?: number | null;
  malId?: number | null;
  episodeNumber: number;
  audio?: "sub" | "dub";
  ticket?: string | null;
}

export function EmbedPageClient({
  anilistId: propAnilistId,
  malId: propMalId,
  episodeNumber: propEpisode,
  audio: propAudio,
  ticket: propTicket,
}: EmbedPageClientProps) {
  const searchParams = useSearchParams();

  // Query parameter overrides
  const server = searchParams.get("server") || "flow";
  const startAtRaw = searchParams.get("startAt") || searchParams.get("progress") || "0";
  const startAt = parseFloat(startAtRaw) || 0;
  const parentHost = searchParams.get("parentHost") || null;

  // autoskipIntro / skipIntro: 1 on (default), 0 off
  const introParam = searchParams.get("autoskipIntro") ?? searchParams.get("skipIntro");
  const autoskipIntro = introParam === "0" || introParam === "off" || introParam === "false" ? false : true;

  // autoskipOutro / skipOutro: 1 on (default), 0 off
  const outroParam = searchParams.get("autoskipOutro") ?? searchParams.get("skipOutro");
  const autoskipOutro = outroParam === "0" || outroParam === "off" || outroParam === "false" ? false : true;

  // Check query audio override if present
  const queryAudio = searchParams.get("audio");
  const effectiveAudio = (queryAudio === "dub" || propAudio === "dub" ? "dub" : "sub") as "sub" | "dub";

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

  const effectiveEpisode = propEpisode
    ? propEpisode
    : searchParams.get("episode")
    ? parseInt(searchParams.get("episode")!, 10)
    : 1;

  return (
    <main className="fixed inset-0 w-screen h-screen bg-[#000000] overflow-hidden m-0 p-0">
      <EmbedPlayer
        anilistId={effectiveAnilistId}
        malId={effectiveMalId}
        episodeNumber={effectiveEpisode}
        initialAudio={effectiveAudio}
        initialServer={server}
        startAt={startAt}
        autoskipIntro={autoskipIntro}
        autoskipOutro={autoskipOutro}
        parentHost={parentHost}
      />
    </main>
  );
}
