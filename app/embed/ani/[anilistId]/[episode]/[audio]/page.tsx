import React, { Suspense } from "react";
import { EmbedPageClient } from "@/components/player/embed-page-client";
import { resolveAnimeAudioParam } from "@/lib/route-utils";

interface PageProps {
  params: {
    anilistId: string;
    episode: string;
    audio: string;
  };
}

export default function AniEmbedPage({ params }: PageProps) {
  const anilistId = parseInt(params.anilistId, 10);
  const episodeNumber = parseInt(params.episode, 10) || 1;
  const audio = resolveAnimeAudioParam(params.audio);

  return (
    <Suspense fallback={<div className="w-screen h-screen bg-black" />}>
      <EmbedPageClient
        anilistId={anilistId}
        episodeNumber={episodeNumber}
        audio={audio}
      />
    </Suspense>
  );
}
