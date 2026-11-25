import React, { Suspense } from "react";
import { EmbedPageClient } from "@/components/player/embed-page-client";
import { parseMovieSlug } from "@/lib/route-utils";

interface PageProps {
  params: {
    slug?: string[];
  };
  searchParams?: { [key: string]: string | string[] | undefined };
}

export default function MovieEmbedPage({ params, searchParams }: PageProps) {
  const sp = new URLSearchParams();
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (typeof v === "string") sp.set(k, v);
    }
  }

  const parsed = parseMovieSlug(params.slug, sp);
  const tmdbId = parsed ? parsed.tmdbId : (parseInt(sp.get("tmdb_id") || sp.get("tmdbId") || "", 10) || null);
  const audio = parsed ? parsed.audio : (sp.get("audio") || "english");

  return (
    <Suspense fallback={<div className="w-screen h-screen bg-black" />}>
      <EmbedPageClient
        mediaType="movie"
        tmdbId={tmdbId}
        episodeNumber={1}
        audio={audio}
      />
    </Suspense>
  );
}
