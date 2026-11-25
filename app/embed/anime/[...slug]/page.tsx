import React, { Suspense } from "react";
import { EmbedPageClient } from "@/components/player/embed-page-client";
import { parseAnimeSlug } from "@/lib/route-utils";

interface PageProps {
  params: {
    slug?: string[];
  };
  searchParams?: { [key: string]: string | string[] | undefined };
}

export default function AnimeEmbedPage({ params, searchParams }: PageProps) {
  const sp = new URLSearchParams();
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (typeof v === "string") sp.set(k, v);
    }
  }

  const parsed = parseAnimeSlug(params.slug, sp);
  const anilistId = parsed && parsed.idType === "ani" ? parsed.id : null;
  const malId = parsed && parsed.idType === "mal" ? parsed.id : null;
  const episode = parsed ? parsed.episode : 1;
  const audio = parsed ? parsed.audio : (sp.get("audio") || "english");

  return (
    <Suspense fallback={<div className="w-screen h-screen bg-black" />}>
      <EmbedPageClient
        mediaType="anime"
        anilistId={anilistId}
        malId={malId}
        episodeNumber={episode}
        audio={audio}
      />
    </Suspense>
  );
}
