import axios from "axios";
import http from "http";
import https from "https";

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 30, timeout: 15000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 30, timeout: 15000 });
const vidlyAxios = axios.create({ httpAgent, httpsAgent, timeout: 12000 });

const TR_SECRET = "vY7#qL2!mZ9@wK4$";

export interface NormalizedLanguage {
  code: string;
  name: string;
  countryCode: string;
  flag: string;
}

export interface VidlyAudioTrack {
  id: string;
  name: string;
  label: string;
  lang: string;
  countryCode: string;
  flag: string;
  default?: boolean;
}

export interface VidlySubtitle {
  id: string;
  language: string;
  label: string;
  url: string;
  direct_url: string;
  countryCode: string;
  flag: string;
  default?: boolean;
}

export interface VidlyKatanaSource {
  id: string;
  server: string;
  name: string;
  serverName: string;
  type: "SUB" | "DUB";
  audio: "sub" | "dub";
  videoUrl: string;
  m3u8: string;
  directUrl: string;
  quality: string;
  isHls: boolean;
  audioTracks: VidlyAudioTrack[];
  subtitles: VidlySubtitle[];
  hasDub?: boolean;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
}

const vidlyCache = new Map<string, { data: VidlyKatanaSource[]; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export function unsealVidlyPayload(payload: string): any {
  if (!payload || !payload.startsWith("v1.")) {
    throw new Error("Invalid Vidly payload format");
  }

  const base64 = payload.slice(3).replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = Buffer.from(padded, "base64");
  const t = new Uint8Array(raw);
  const s = t.subarray(0, 12);
  const n = t.slice(12);

  (function (bytes: Uint8Array, keyBytes: Uint8Array) {
    let [sVal, nVal, lVal, aVal] = (function (kb: Uint8Array) {
      const arr: number[] = [];
      for (let i = 0; i < 4; i++) {
        let h = (0x811c9dc5 ^ (0x9e3779b9 * i)) >>> 0;
        for (let j = 0; j < TR_SECRET.length; j++) {
          h = Math.imul(h ^ TR_SECRET.charCodeAt(j), 0x1000193) >>> 0;
        }
        for (let j = 0; j < kb.length; j++) {
          h = Math.imul(h ^ kb[j], 0x1000193) >>> 0;
        }
        arr.push(h);
      }
      return arr;
    })(keyBytes);

    let r = 0;
    for (let i = 0; i < bytes.length; i++) {
      if ((3 & i) === 0) {
        lVal >>>= 0;
        aVal >>>= 0;
        let tmp = ((sVal >>>= 0) + (nVal >>>= 0)) | 0;
        sVal = nVal ^ (nVal >>> 9);
        nVal = (lVal + (lVal << 3)) | 0;
        lVal = ((lVal = (lVal << 21) | (lVal >>> 11)) + (tmp = (tmp + (aVal = (aVal + 1) | 0)) | 0)) | 0;
        r = tmp >>> 0;
      }
      bytes[i] ^= (r >>> ((3 & i) * 8)) & 255;
    }
  })(n, s);

  return JSON.parse(new TextDecoder().decode(n));
}

export function normalizeLanguage(lang?: string, label?: string): NormalizedLanguage {
  const l = (lang || "").toLowerCase().trim();
  const raw = `${lang || ""} ${label || ""}`.toLowerCase().trim();

  // 1. Japanese (Check FIRST to prevent any accidental substring match on "es" or "ja")
  if (
    l === "ja" ||
    l === "jpn" ||
    l === "jp" ||
    l.startsWith("ja-") ||
    /\b(japanese|nihongo|japan|jpn|ja)\b/i.test(raw)
  ) {
    return { code: "ja", name: "Japanese", countryCode: "jp", flag: "🇯🇵" };
  }

  // 2. English
  if (
    l === "en" ||
    l === "eng" ||
    l.startsWith("en-") ||
    /\b(english|eng)\b/i.test(raw)
  ) {
    return { code: "en", name: "English", countryCode: "gb", flag: "🇬🇧" };
  }

  // 3. Spanish (word boundaries strictly enforced)
  if (
    l === "es" ||
    l === "spa" ||
    l.startsWith("es-") ||
    /\b(spanish|español|espanol|castellano|latino|latin)\b/i.test(raw)
  ) {
    return { code: "es", name: "Spanish", countryCode: "es", flag: "🇪🇸" };
  }

  // 4. French
  if (
    l === "fr" ||
    l === "fre" ||
    l === "fra" ||
    l.startsWith("fr-") ||
    /\b(french|français|francais)\b/i.test(raw)
  ) {
    return { code: "fr", name: "French", countryCode: "fr", flag: "🇫🇷" };
  }

  // 5. German
  if (
    l === "de" ||
    l === "ger" ||
    l === "deu" ||
    l.startsWith("de-") ||
    /\b(german|deutsch)\b/i.test(raw)
  ) {
    return { code: "de", name: "German", countryCode: "de", flag: "🇩🇪" };
  }

  // 6. Italian
  if (
    l === "it" ||
    l === "ita" ||
    l.startsWith("it-") ||
    /\b(italian|italiano)\b/i.test(raw)
  ) {
    return { code: "it", name: "Italian", countryCode: "it", flag: "🇮🇹" };
  }

  // 7. Portuguese
  if (
    l === "pt" ||
    l === "por" ||
    l.startsWith("pt-") ||
    /\b(portuguese|português|portugues|brazil|brasil)\b/i.test(raw)
  ) {
    return { code: "pt", name: "Portuguese", countryCode: "br", flag: "🇧🇷" };
  }

  // 8. Arabic
  if (
    l === "ar" ||
    l === "ara" ||
    l.startsWith("ar-") ||
    /\b(arabic|arab|عربي)\b/i.test(raw)
  ) {
    return { code: "ar", name: "Arabic", countryCode: "sa", flag: "🇸🇦" };
  }

  // 9. Russian
  if (
    l === "ru" ||
    l === "rus" ||
    l.startsWith("ru-") ||
    /\b(russian|русский)\b/i.test(raw)
  ) {
    return { code: "ru", name: "Russian", countryCode: "ru", flag: "🇷🇺" };
  }

  // 10. Polish
  if (
    l === "pl" ||
    l === "pol" ||
    l.startsWith("pl-") ||
    /\b(polish|polski)\b/i.test(raw)
  ) {
    return { code: "pl", name: "Polish", countryCode: "pl", flag: "🇵🇱" };
  }

  // 11. Chinese
  if (
    l === "zh" ||
    l === "chi" ||
    l === "zho" ||
    l.startsWith("zh-") ||
    /\b(chinese|mandarin|cantonese|中文)\b/i.test(raw)
  ) {
    return { code: "zh", name: "Chinese", countryCode: "cn", flag: "🇨🇳" };
  }

  // 12. Korean
  if (
    l === "ko" ||
    l === "kor" ||
    l.startsWith("ko-") ||
    /\b(korean|한국어)\b/i.test(raw)
  ) {
    return { code: "ko", name: "Korean", countryCode: "kr", flag: "🇰🇷" };
  }

  // 13. Hindi
  if (
    l === "hi" ||
    l === "hin" ||
    l.startsWith("hi-") ||
    /\b(hindi|हिन्दी)\b/i.test(raw)
  ) {
    return { code: "hi", name: "Hindi", countryCode: "in", flag: "🇮🇳" };
  }

  // 14. Tamil
  if (
    l === "ta" ||
    l === "tam" ||
    l.startsWith("ta-") ||
    /\b(tamil)\b/i.test(raw)
  ) {
    return { code: "ta", name: "Tamil", countryCode: "in", flag: "🇮🇳" };
  }

  // 15. Telugu
  if (
    l === "te" ||
    l === "tel" ||
    l.startsWith("te-") ||
    /\b(telugu)\b/i.test(raw)
  ) {
    return { code: "te", name: "Telugu", countryCode: "in", flag: "🇮🇳" };
  }

  // 16. Malayalam
  if (
    l === "ml" ||
    l === "mal" ||
    l.startsWith("ml-") ||
    /\b(malayalam)\b/i.test(raw)
  ) {
    return { code: "ml", name: "Malayalam", countryCode: "in", flag: "🇮🇳" };
  }

  // 17. Kannada
  if (
    l === "kn" ||
    l === "kan" ||
    l.startsWith("kn-") ||
    /\b(kannada)\b/i.test(raw)
  ) {
    return { code: "kn", name: "Kannada", countryCode: "in", flag: "🇮🇳" };
  }

  // 18. Indonesian
  if (
    l === "id" ||
    l === "ind" ||
    l.startsWith("id-") ||
    /\b(indonesian|indonesia|bahasa)\b/i.test(raw)
  ) {
    return { code: "id", name: "Indonesian", countryCode: "id", flag: "🇮🇩" };
  }

  // 19. Turkish
  if (
    l === "tr" ||
    l === "tur" ||
    l.startsWith("tr-") ||
    /\b(turkish|türkçe|turkce)\b/i.test(raw)
  ) {
    return { code: "tr", name: "Turkish", countryCode: "tr", flag: "🇹🇷" };
  }

  // 20. Thai
  if (
    l === "th" ||
    l === "tha" ||
    l.startsWith("th-") ||
    /\b(thai|ไทย)\b/i.test(raw)
  ) {
    return { code: "th", name: "Thai", countryCode: "th", flag: "🇹🇭" };
  }

  // 21. Vietnamese
  if (
    l === "vi" ||
    l === "vie" ||
    l.startsWith("vi-") ||
    /\b(vietnamese|tiếng việt)\b/i.test(raw)
  ) {
    return { code: "vi", name: "Vietnamese", countryCode: "vn", flag: "🇻🇳" };
  }

  // 22. Dutch
  if (
    l === "nl" ||
    l === "dut" ||
    l.startsWith("nl-") ||
    /\b(dutch|nederlands)\b/i.test(raw)
  ) {
    return { code: "nl", name: "Dutch", countryCode: "nl", flag: "🇳🇱" };
  }

  // 23. Filipino / Tagalog
  if (
    l === "tl" ||
    l === "fil" ||
    l.startsWith("tl-") ||
    l.startsWith("fil-") ||
    /\b(tagalog|filipino)\b/i.test(raw)
  ) {
    return { code: "tl", name: "Filipino", countryCode: "ph", flag: "🇵🇭" };
  }

  // 24. Swedish
  if (
    l === "sv" ||
    l === "swe" ||
    l.startsWith("sv-") ||
    /\b(swedish|svenska)\b/i.test(raw)
  ) {
    return { code: "sv", name: "Swedish", countryCode: "se", flag: "🇸🇪" };
  }

  // 25. Norwegian
  if (
    l === "no" ||
    l === "nor" ||
    l === "nb" ||
    l === "nn" ||
    /\b(norwegian|norsk)\b/i.test(raw)
  ) {
    return { code: "no", name: "Norwegian", countryCode: "no", flag: "🇳🇴" };
  }

  // 26. Danish
  if (
    l === "da" ||
    l === "dan" ||
    /\b(danish|dansk)\b/i.test(raw)
  ) {
    return { code: "da", name: "Danish", countryCode: "dk", flag: "🇩🇰" };
  }

  // 27. Finnish
  if (
    l === "fi" ||
    l === "fin" ||
    /\b(finnish|suomi)\b/i.test(raw)
  ) {
    return { code: "fi", name: "Finnish", countryCode: "fi", flag: "🇫🇮" };
  }

  // 28. Greek
  if (
    l === "el" ||
    l === "gre" ||
    l === "ell" ||
    /\b(greek|ελληνικά)\b/i.test(raw)
  ) {
    return { code: "el", name: "Greek", countryCode: "gr", flag: "🇬🇷" };
  }

  // 29. Hebrew
  if (
    l === "he" ||
    l === "heb" ||
    /\b(hebrew|עברית)\b/i.test(raw)
  ) {
    return { code: "he", name: "Hebrew", countryCode: "il", flag: "🇮🇱" };
  }

  // 30. Czech
  if (
    l === "cs" ||
    l === "ces" ||
    l === "cze" ||
    /\b(czech|čeština)\b/i.test(raw)
  ) {
    return { code: "cs", name: "Czech", countryCode: "cz", flag: "🇨🇿" };
  }

  // 31. Hungarian
  if (
    l === "hu" ||
    l === "hun" ||
    /\b(hungarian|magyar)\b/i.test(raw)
  ) {
    return { code: "hu", name: "Hungarian", countryCode: "hu", flag: "🇭🇺" };
  }

  // 32. Romanian
  if (
    l === "ro" ||
    l === "ron" ||
    l === "rum" ||
    /\b(romanian|română)\b/i.test(raw)
  ) {
    return { code: "ro", name: "Romanian", countryCode: "ro", flag: "🇷🇴" };
  }

  // 33. Ukrainian
  if (
    l === "uk" ||
    l === "ukr" ||
    /\b(ukrainian|українська)\b/i.test(raw)
  ) {
    return { code: "uk", name: "Ukrainian", countryCode: "ua", flag: "🇺🇦" };
  }

  const cleanCode = (l || label || "other").replace(/[^a-z0-9]/gi, "").substring(0, 4).toLowerCase();
  const cleanName = label || lang || "Other";
  return { code: cleanCode || "other", name: cleanName, countryCode: cleanCode || "un", flag: "🌐" };
}

export function deduplicateSubtitles(subtitles: any[]): VidlySubtitle[] {
  const seenLanguages = new Map<string, VidlySubtitle>();

  // Prioritize cleaner, shorter labels
  const sorted = [...subtitles].sort((a, b) => (a.label || "").length - (b.label || "").length);

  for (const sub of sorted) {
    const rawUrl = sub.url || sub.file || sub.direct_url || "";
    if (!rawUrl) continue;

    const norm = normalizeLanguage(sub.lang || sub.language, sub.label);
    if (!seenLanguages.has(norm.code)) {
      const proxyUrl = rawUrl.startsWith("/api/proxy")
        ? rawUrl
        : `/api/proxy/subtitles?url=${encodeURIComponent(rawUrl)}`;

      seenLanguages.set(norm.code, {
        id: `sub-${norm.code}`,
        language: norm.code,
        label: norm.name,
        countryCode: norm.countryCode,
        flag: norm.flag,
        url: proxyUrl,
        direct_url: rawUrl,
        default: norm.code === "en",
      });
    }
  }

  return Array.from(seenLanguages.values());
}

export function parseAudioTracksFromM3u8(m3u8Content: string): VidlyAudioTrack[] {
  const tracks: VidlyAudioTrack[] = [];
  const lines = m3u8Content.split("\n");
  const seenCodes = new Set<string>();

  for (const line of lines) {
    if (line.startsWith("#EXT-X-MEDIA:") && line.includes("TYPE=AUDIO")) {
      const nameMatch = line.match(/NAME="([^"]+)"/);
      const langMatch = line.match(/LANGUAGE="([^"]+)"/);
      const defaultMatch = line.match(/DEFAULT=(YES|NO)/i);
      const name = nameMatch ? nameMatch[1] : "Audio";
      const lang = langMatch ? langMatch[1] : name.toLowerCase();
      const isDefault = defaultMatch ? defaultMatch[1].toUpperCase() === "YES" : false;
      const norm = normalizeLanguage(lang, name);

      if (!seenCodes.has(norm.code)) {
        seenCodes.add(norm.code);
        tracks.push({
          id: norm.code,
          name: norm.name,
          label: norm.name,
          lang: norm.code,
          countryCode: norm.countryCode,
          flag: norm.flag,
          default: isDefault,
        });
      }
    }
  }

  // Ensure default audio representation if none found in manifest
  if (tracks.length === 0) {
    tracks.push(
      { id: "ja", name: "Japanese", label: "Japanese", lang: "ja", countryCode: "jp", flag: "🇯🇵", default: true },
      { id: "en", name: "English", label: "English", lang: "en", countryCode: "gb", flag: "🇬🇧", default: false }
    );
  }

  return tracks;
}

export async function fetchVidlyKatanaSource(
  anilistId: number,
  episode: number,
  audio: "sub" | "dub"
): Promise<VidlyKatanaSource | null> {
  const res = await getVidlyKatanaSources(anilistId, episode);
  if (audio === "dub") {
    return res.sources.find((s) => s.type === "DUB") || res.sources.find((s) => s.hasDub) || res.sources[0] || null;
  }
  return res.sources.find((s) => s.id === "katana-sub") || res.sources.find((s) => s.type === "SUB") || res.sources[0] || null;
}

export async function getVidlyKatanaSources(
  anilistId: number,
  episode: number
): Promise<{ sources: VidlyKatanaSource[]; hasDub: boolean }> {
  const cacheKey = `katana_${anilistId}_ep${episode}`;
  const cached = vidlyCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    const hasDub = cached.data.some((s) => s.type === "DUB" || s.hasDub);
    return { sources: cached.data, hasDub };
  }

  const targetUrl = `https://vidly.pro/anime/${anilistId}/${episode}/sub`;
  try {
    const res = await vidlyAxios.get(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Referer: "https://vidly.pro/",
      },
    });

    const html = res.data;
    if (typeof html !== "string") {
      return { sources: [], hasDub: false };
    }

    const tokenMatch = html.match(/\\"token\\":\\"([^"\\]+)\\"/) || html.match(/"token":"([^"]+)"/);
    const token = tokenMatch ? tokenMatch[1] : "";

    // Check if initial SSR has streams
    let initialData: any = null;
    const v1Matches = [...html.matchAll(/v1\.[a-zA-Z0-9_-]+/g)];
    for (const m of v1Matches) {
      try {
        const parsed = unsealVidlyPayload(m[0]);
        if (parsed.streams && parsed.streams.length > 0 && !parsed.error) {
          initialData = parsed;
          break;
        }
      } catch {}
    }

    const providersToFetch = ["katana-sub", "katana-dub", "katana-multi"];

    const streamResults = await Promise.all(
      providersToFetch.map(async (prov): Promise<VidlyKatanaSource | null> => {
        let streamData: any = null;
        if (initialData && (initialData.provider?.id === prov || (prov === "katana-sub" && !initialData.provider?.id))) {
          streamData = initialData;
        } else if (token) {
          // Fetch via api/sources with retry if 503 or busy
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const apiUrl = `https://vidly.pro/api/sources?kind=anime&provider=${prov}&t=${encodeURIComponent(token)}&anilist=${anilistId}&e=${episode}&audio=sub`;
              const apiRes = await vidlyAxios.get(apiUrl, {
                headers: {
                  "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                  Referer: targetUrl,
                },
              });
              if (typeof apiRes.data === "string" && apiRes.data.startsWith("v1.")) {
                const unsealed = unsealVidlyPayload(apiRes.data);
                if (unsealed.streams && unsealed.streams.length > 0 && !unsealed.error) {
                  streamData = unsealed;
                  break;
                }
              }
            } catch {
              if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
            }
          }
        }

        if (!streamData?.streams?.[0]) return null;
        const stream = streamData.streams[0];
        const directUrl = stream.url;
        if (!directUrl) return null;

        const isDub = prov === "katana-dub";
        const isMulti = prov === "katana-multi";
        const serverName = isMulti ? "Katana Multi" : isDub ? "Katana Dub" : "Katana Sub";
        const audioType: "sub" | "dub" = isDub ? "dub" : "sub";
        const proxyM3u8 = `/api/proxy/m3u8?url=${encodeURIComponent(directUrl)}&audio=${audioType}`;

        let audioTracks: VidlyAudioTrack[] = [];
        try {
          const m3u8Res = await vidlyAxios.get(directUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
              Referer: "https://vidly.pro/",
            },
            timeout: 8000,
            responseType: "text",
          });
          if (typeof m3u8Res.data === "string") {
            audioTracks = parseAudioTracksFromM3u8(m3u8Res.data);
          }
        } catch {
          audioTracks = [
            { id: "ja", name: "Japanese", label: "Japanese", lang: "ja", countryCode: "jp", flag: "🇯🇵", default: !isDub },
            { id: "en", name: "English", label: "English", lang: "en", countryCode: "gb", flag: "🇬🇧", default: isDub },
          ];
        }

        const dedupedSubs = deduplicateSubtitles(stream.subtitles || []);

        return {
          id: prov,
          server: serverName,
          name: serverName,
          serverName,
          type: isDub ? "DUB" : "SUB",
          audio: audioType,
          videoUrl: proxyM3u8,
          m3u8: proxyM3u8,
          directUrl,
          quality: stream.quality || "1080p",
          isHls: true,
          audioTracks,
          subtitles: dedupedSubs,
          hasDub: isDub || audioTracks.some((a) => a.id !== "ja"),
        };
      })
    );

    const sources: VidlyKatanaSource[] = streamResults.filter((s): s is VidlyKatanaSource => s !== null);
    const hasDub = sources.some((s) => s.type === "DUB" || s.hasDub);

    if (sources.length > 0) {
      vidlyCache.set(cacheKey, { data: sources, timestamp: Date.now() });
    }

    return { sources, hasDub };
  } catch (err: any) {
    console.warn(`[vidly] Failed to fetch Katana sources for anilist ${anilistId} ep ${episode}:`, err?.message || err);
    return { sources: [], hasDub: false };
  }
}
