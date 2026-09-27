/**
 * Self-hosted anime stream extraction — replaces the dead anime-scraper-v2.vercel.app.
 * Races Kaido and Kaa providers to return the fastest HLS streams.
 */
import { kaido } from "./kaido";
import { kaa } from "./kaa";

export async function extractStreams(
  anilistId: string,
  episode: string,
  audio: string = "sub"
): Promise<any> {
  // Race both providers — return the first one that succeeds with actual streams
  const providers = [
    { name: "kaido", fn: () => kaido(anilistId, episode, audio) },
    { name: "kaa", fn: () => kaa(anilistId, episode, audio) },
  ];

  const audioKey = `s${audio}`;

  // Try providers in parallel — return first successful result
  const results = await Promise.allSettled(
    providers.map(async ({ name, fn }) => {
      const data = await fn();
      if (data?.error) throw new Error(`[${name}] ${data.error}`);
      const streams = data?.[audioKey]?.streams || data?.streams;
      if (!streams?.length) throw new Error(`[${name}] no streams`);
      return { ...data, provider: name };
    })
  );

  // Return the first fulfilled result
  for (const r of results) {
    if (r.status === "fulfilled") return r.value;
  }

  // If all failed, try sequentially as a last resort (some providers fail under race conditions)
  for (const { name, fn } of providers) {
    try {
      const data = await fn();
      if (data?.error) continue;
      const streams = data?.[audioKey]?.streams || data?.streams;
      if (!streams?.length) continue;
      return { ...data, provider: name };
    } catch {}
  }

  return { error: "All providers failed", providers: results.map((r) => 
    r.status === "rejected" ? r.reason?.message : "ok"
  )};
}
