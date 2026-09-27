import { load } from "cheerio";
import { decrypt } from "./decrypt";

const BASE = "https://kaido.to";
const AJAX = `${BASE}/ajax`;
const KEYS_URL =
  "https://raw.githubusercontent.com/AimDev1/keys/refs/heads/main/e6";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchKeys(): Promise<[string, string] | null> {
  try {
    const res = await fetch(KEYS_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getEpisodes(animeId: string) {
  const res = await fetch(`${AJAX}/episode/list/${animeId}`, {
    headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const $ = load(data.html);
  const episodes: { id: string; number: string; title: string }[] = [];
  $("a.ep-item").each((_, el) => {
    episodes.push({
      id: $(el).attr("data-id") || "",
      number: $(el).attr("data-number") || "",
      title: $(el).attr("title") || "",
    });
  });
  return episodes;
}

async function getServers(epId: string, type = "sub") {
  const res = await fetch(`${AJAX}/episode/servers?episodeId=${epId}`, {
    headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const $ = load(data.html);
  const servers: { id: string; name: string; type: string }[] = [];
  $(`.servers-${type} .server-item`).each((_, el) => {
    servers.push({
      id: $(el).attr("data-id") || "",
      name: $(el).text().trim(),
      type: $(el).attr("data-type") || type,
    });
  });
  return servers;
}

async function getSource(serverId: string) {
  const res = await fetch(`${AJAX}/episode/sources?id=${serverId}`, {
    headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  return res.json();
}

async function extractMegacloud(sourceUrl: string) {
  const id = sourceUrl.split("/").pop()?.split("?")[0];
  if (!id) return null;

  const srcRes = await fetch(
    `https://megacloud.blog/embed/a/ajax/e-1/getSources?id=${id}`,
    {
      headers: {
        Referer: sourceUrl,
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": UA,
      },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!srcRes.ok) return null;
  const srcData = await srcRes.json();

  if (srcData.encrypted) {
    const keys = await fetchKeys();
    if (keys) {
      try {
        const decrypted = decrypt(srcData.sources, keys);
        srcData.sources = JSON.parse(decrypted);
      } catch {}
    }
  }

  return srcData;
}

export async function kaido(
  anilistId: string,
  epNum: string,
  audio = "sub"
): Promise<any> {
  try {
    const mapRes = await fetch(
      `https://raw.githubusercontent.com/bal-mackup/mal-backup/master/anilist/anime/${anilistId}.json`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!mapRes.ok) return { error: "Could not map AniList ID" };
    const mapData = await mapRes.json();
    const site = mapData.Sites?.Kaido;
    if (!site) return { error: "Not found on Kaido" };

    const kaidoId = Object.keys(site)[0];
    const kaidoUrl = site[kaidoId]?.url;
    const kaidoSlug = kaidoUrl?.split("/").pop()?.split("?")[0];
    if (!kaidoSlug) return { error: "Could not resolve Kaido slug" };

    const slugParts = kaidoSlug.split("-");
    const numericId = slugParts[slugParts.length - 1];

    const episodes = await getEpisodes(numericId);
    const ep = episodes.find((e) => String(e.number) === String(epNum));
    if (!ep) return { error: `Episode ${epNum} not found on Kaido` };

    const servers = await getServers(ep.id, audio);
    const results: any[] = [];

    for (const server of servers) {
      try {
        const source = await getSource(server.id);
        if (source?.link) {
          const extracted = await extractMegacloud(source.link);
          if (extracted?.sources) {
            const streams = Array.isArray(extracted.sources)
              ? extracted.sources
              : [extracted.sources];
            results.push({
              server: server.name,
              streams: streams.map((s: any) => ({
                url: s.file || s.url,
                type: s.type || "hls",
              })),
              subtitles: extracted.tracks || [],
            });
          }
        }
      } catch {}
    }

    return {
      [`s${audio}`]: {
        streams:
          results.flatMap((r) =>
            r.streams.map((s: any) => ({
              url: s.url,
              type: s.type,
              server: r.server,
            }))
          ) || [],
        subtitles:
          results[0]?.subtitles?.filter((t: any) => t.kind === "captions") ||
          [],
      },
    };
  } catch (e: any) {
    return { error: e.message };
  }
}
