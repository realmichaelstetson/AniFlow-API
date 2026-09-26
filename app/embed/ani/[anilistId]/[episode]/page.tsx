import React, { Suspense } from "react";
import { EmbedPageClient } from "@/components/player/embed-page-client";

interface PageProps {
  params: {
    anilistId: string;
    episode: string;
  };
}

export default function AniEmbedDefaultAudioPage({ params }: PageProps) {
  const anilistId = parseInt(params.anilistId, 10);
  const episodeNumber = parseInt(params.episode, 10) || 1;

  return (
    <Suspense fallback={<div className="w-screen h-screen bg-black" />}>
      <EmbedPageClient
        anilistId={anilistId}
        episodeNumber={episodeNumber}
        audio="sub"
      />
    </Suspense>
  );
}
