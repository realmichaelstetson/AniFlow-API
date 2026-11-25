import React, { Suspense } from "react";
import { EmbedPageClient } from "@/components/player/embed-page-client";
import { parseTvSlug } from "@/lib/route-utils";

interface PageProps {
  params: {
    slug?: string[];
  };
  searchParams?: { [key: string]: string | string[] | undefined };
}

export default function TvEmbedPage({ params, searchParams }: PageProps) {
  const sp = new URLSearchParams();
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (typeof v === "string") sp.set(k, v);
    }
  }

  const parsed = parseTvSlug(params.slug, sp);
  const tmdbId = parsed ? parsed.tmdbId : (parseInt(sp.get("tmdb_id") || sp.get("tmdbId") || "", 10) || null);
  const season = parsed ? parsed.season : (parseInt(sp.get("season") || sp.get("s") || "1", 10) || 1);
  const episode = parsed ? parsed.episode : (parseInt(sp.get("episode") || sp.get("ep") || sp.get("e") || "1", 10) || 1);
  const audio = parsed ? parsed.audio : (sp.get("audio") || "english");

  return (
    <Suspense fallback={<div className="w-screen h-screen bg-black" />}>
      <EmbedPageClient
        mediaType="tv"
        tmdbId={tmdbId}
        seasonNumber={season}
        episodeNumber={episode}
        audio={audio}
      />
    </Suspense>
  );
}
