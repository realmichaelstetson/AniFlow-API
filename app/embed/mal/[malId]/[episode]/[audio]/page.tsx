import React, { Suspense } from "react";
import { EmbedPageClient } from "@/components/player/embed-page-client";

interface PageProps {
  params: {
    malId: string;
    episode: string;
    audio: string;
  };
}

export default function MalEmbedPage({ params }: PageProps) {
  const malId = parseInt(params.malId, 10);
  const episodeNumber = parseInt(params.episode, 10) || 1;
  const audio = params.audio?.toLowerCase() === "dub" ? "dub" : "sub";

  return (
    <Suspense fallback={<div className="w-screen h-screen bg-black" />}>
      <EmbedPageClient
        malId={malId}
        episodeNumber={episodeNumber}
        audio={audio}
      />
    </Suspense>
  );
}
