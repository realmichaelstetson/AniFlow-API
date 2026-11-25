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
  known: boolean;
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
  isHevc?: boolean;
  audioTracks: VidlyAudioTrack[];
  subtitles: VidlySubtitle[];
  hasDub?: boolean;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  language?: string;
}

export interface VidlyMediaMeta {
  kind: "movie" | "tv";
  tmdbId: number;
  season?: number;
  episode?: number;
  title: string;
  subtitle?: string;
  year?: string;
  poster?: string | null;
  backdrop?: string | null;
  overview?: string;
  logo?: string;
  rating?: number;
  runtime?: number;
  certification?: string;
}

const vidlyCache = new Map<string, { data: VidlyKatanaSource[]; timestamp: number }>();
const vidlyMediaCache = new Map<string, { sources: VidlyKatanaSource[]; meta: VidlyMediaMeta | null; timestamp: number }>();
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

function detectKnownLanguage(lang?: string, label?: string): Omit<NormalizedLanguage, "known"> | null {
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

  // 34. Bulgarian
  if (l === "bg" || l === "bul" || l.startsWith("bg-") || /\b(bulgarian|български)\b/i.test(raw)) {
    return { code: "bg", name: "Bulgarian", countryCode: "bg", flag: "🇧🇬" };
  }

  // 35. Croatian
  if (l === "hr" || l === "hrv" || l.startsWith("hr-") || /\b(croatian|hrvatski)\b/i.test(raw)) {
    return { code: "hr", name: "Croatian", countryCode: "hr", flag: "🇭🇷" };
  }

  // 36. Serbian
  if (l === "sr" || l === "srp" || l.startsWith("sr-") || /\b(serbian|srpski)\b/i.test(raw)) {
    return { code: "sr", name: "Serbian", countryCode: "rs", flag: "🇷🇸" };
  }

  // 37. Slovak
  if (l === "sk" || l === "slk" || l === "slo" || l.startsWith("sk-") || /\b(slovak|slovenčina)\b/i.test(raw)) {
    return { code: "sk", name: "Slovak", countryCode: "sk", flag: "🇸🇰" };
  }

  // 38. Slovenian
  if (l === "sl" || l === "slv" || l.startsWith("sl-") || /\b(slovenian|slovenščina)\b/i.test(raw)) {
    return { code: "sl", name: "Slovenian", countryCode: "si", flag: "🇸🇮" };
  }

  // 39. Bengali
  if (l === "bn" || l === "ben" || l.startsWith("bn-") || /\b(bengali|bangla)\b/i.test(raw)) {
    return { code: "bn", name: "Bengali", countryCode: "bd", flag: "🇧🇩" };
  }

  // 40. Urdu
  if (l === "ur" || l === "urd" || l.startsWith("ur-") || /\b(urdu)\b/i.test(raw)) {
    return { code: "ur", name: "Urdu", countryCode: "pk", flag: "🇵🇰" };
  }

  // 41. Persian / Farsi
  if (l === "fa" || l === "fas" || l === "per" || l.startsWith("fa-") || /\b(persian|farsi)\b/i.test(raw)) {
    return { code: "fa", name: "Persian", countryCode: "ir", flag: "🇮🇷" };
  }

  // 42. Malay
  if (l === "ms" || l === "msa" || l === "may" || l.startsWith("ms-") || /\b(malay|melayu)\b/i.test(raw)) {
    return { code: "ms", name: "Malay", countryCode: "my", flag: "🇲🇾" };
  }

  // 43. Catalan
  if (l === "ca" || l === "cat" || l.startsWith("ca-") || /\b(catalan|català)\b/i.test(raw)) {
    return { code: "ca", name: "Catalan", countryCode: "es", flag: "🇪🇸" };
  }

  // 44. Lithuanian
  if (l === "lt" || l === "lit" || l.startsWith("lt-") || /\b(lithuanian|lietuvių)\b/i.test(raw)) {
    return { code: "lt", name: "Lithuanian", countryCode: "lt", flag: "🇱🇹" };
  }

  // 45. Latvian
  if (l === "lv" || l === "lav" || l.startsWith("lv-") || /\b(latvian|latviešu)\b/i.test(raw)) {
    return { code: "lv", name: "Latvian", countryCode: "lv", flag: "🇱🇻" };
  }

  // 46. Estonian
  if (l === "et" || l === "est" || l.startsWith("et-") || /\b(estonian|eesti)\b/i.test(raw)) {
    return { code: "et", name: "Estonian", countryCode: "ee", flag: "🇪🇪" };
  }

  // 47. Anime Dub / Sub aliases when explicit language wasn't matched
  if (l === "dub" || /\benglish\s+dub\b/i.test(raw)) {
    return { code: "en", name: "English", countryCode: "gb", flag: "🇬🇧" };
  }
  if (l === "sub") {
    return { code: "ja", name: "Japanese", countryCode: "jp", flag: "🇯🇵" };
  }

  return null;
}

export function normalizeLanguage(lang?: string, label?: string): NormalizedLanguage {
  const matched = detectKnownLanguage(lang, label);
  if (matched) {
    return { ...matched, known: true };
  }

  const l = (lang || "").toLowerCase().trim();
  const cleanCode = (l || label || "other").replace(/[^a-z0-9]/gi, "").substring(0, 4).toLowerCase();
  const cleanName = label || lang || "Other";
  return { code: cleanCode || "other", name: cleanName, countryCode: "un", flag: "🌐", known: false };
}

export function cleanAudioParam(raw?: string | null): { code: string; name: string } {
  if (!raw) return { code: "en", name: "English" };
  let str = String(raw).trim();
  try {
    str = decodeURIComponent(str).trim();
  } catch {}
  str = str.replace(/^["']+|["']+$/g, "").trim();
  if (str.toLowerCase().startsWith("audio=")) {
    str = str.slice(6).trim();
    str = str.replace(/^["']+|["']+$/g, "").trim();
  }
  if (!str) return { code: "en", name: "English" };
  const lower = str.toLowerCase();
  if (lower === "dub" || lower === "english" || lower === "en" || lower === "eng") {
    return { code: "en", name: "English" };
  }
  if (lower === "sub" || lower === "japanese" || lower === "ja" || lower === "jp" || lower === "jpn") {
    return { code: "ja", name: "Japanese" };
  }
  const norm = normalizeLanguage(str, str);
  return { code: norm.code, name: norm.name };
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
      if (!norm.known) continue;

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

  return tracks;
}

export function parseSubtitlesFromM3u8(m3u8Content: string, masterUrl: string): Array<{ url: string; language: string; label: string; default?: boolean }> {
  const subs: Array<{ url: string; language: string; label: string; default?: boolean }> = [];
  const lines = m3u8Content.split("\n");

  for (const line of lines) {
    if (line.startsWith("#EXT-X-MEDIA:") && line.includes("TYPE=SUBTITLES")) {
      const nameMatch = line.match(/NAME="([^"]+)"/);
      const langMatch = line.match(/LANGUAGE="([^"]+)"/);
      const uriMatch = line.match(/URI="([^"]+)"/);
      const defaultMatch = line.match(/DEFAULT=(YES|NO)/i);
      if (!uriMatch || !uriMatch[1]) continue;

      let absUri = uriMatch[1];
      try {
        absUri = new URL(uriMatch[1], masterUrl).href;
      } catch {}

      const name = nameMatch ? nameMatch[1] : langMatch ? langMatch[1] : "Subtitle";
      const lang = langMatch ? langMatch[1] : name.toLowerCase();
      const isDefault = defaultMatch ? defaultMatch[1].toUpperCase() === "YES" : false;

      subs.push({
        url: absUri,
        language: lang,
        label: name,
        default: isDefault,
      });
    }
  }

  return subs;
}

export async function fetchVidlyKatanaSource(
  anilistId: number,
  episode: number,
  audio: "sub" | "dub"
): Promise<VidlyKatanaSource | null> {
  const res = await getVidlyKatanaSources(anilistId, episode);
  if (audio === "dub") {
    const dubMatch =
      res.sources.find((s) => s.type === "DUB") ||
      res.sources.find((s) => s.audioTracks?.some((a) => a.id === "en"));
    if (!dubMatch) return null;
    if (!dubMatch.videoUrl.includes("audio=dub") && !dubMatch.videoUrl.includes("audio=en")) {
      const updatedUrl = dubMatch.videoUrl.replace(/([?&])audio=[^&]*/i, "$1audio=en");
      return { ...dubMatch, videoUrl: updatedUrl, m3u8: updatedUrl };
    }
    return dubMatch;
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
        const proxyM3u8 = `/api/proxy/m3u8?url=${encodeURIComponent(directUrl)}&audio=${isDub ? "en" : "ja"}`;

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
          if (audioTracks.length === 0) {
            audioTracks = isDub
              ? [{ id: "en", name: "English", label: "English", lang: "en", countryCode: "gb", flag: "🇬🇧", default: true }]
              : [{ id: "ja", name: "Japanese", label: "Japanese", lang: "ja", countryCode: "jp", flag: "🇯🇵", default: true }];
          }
        } catch {
          audioTracks = isDub
            ? [{ id: "en", name: "English", label: "English", lang: "en", countryCode: "gb", flag: "🇬🇧", default: true }]
            : isMulti
            ? [
                { id: "en", name: "English", label: "English", lang: "en", countryCode: "gb", flag: "🇬🇧", default: true },
                { id: "ja", name: "Japanese", label: "Japanese", lang: "ja", countryCode: "jp", flag: "🇯🇵", default: false },
              ]
            : [{ id: "ja", name: "Japanese", label: "Japanese", lang: "ja", countryCode: "jp", flag: "🇯🇵", default: true }];
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

export function extractVidlyMeta(
  html: string,
  kind: "movie" | "tv",
  tmdbId: number,
  season?: number,
  episode?: number
): VidlyMediaMeta {
  let title = "";
  let year = "";
  let poster = "";
  let backdrop = "";
  let overview = "";
  let subtitle = "";

  const titleTagMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleTagMatch) {
    const raw = titleTagMatch[1].replace(/·\s*Vidly/i, "").trim();
    const ym = raw.match(/^(.*?)(?:\s*\((19\d\d|20\d\d)\))?$/);
    if (ym) {
      title = ym[1].trim();
      if (ym[2]) year = ym[2];
    } else {
      title = raw;
    }
  }

  const mediaMetaMatch = html.match(/\\?"media\\?":\s*\{[^}]*},\s*\\?"meta\\?":\s*\{([^}]+)\}/);
  if (mediaMetaMatch) {
    const body = mediaMetaMatch[1];
    const getField = (f: string) => {
      const m = body.match(new RegExp(`\\\\?"${f}\\\\?":\\\\?"([^"\\\\]+)\\\\?"`));
      return m ? m[1] : "";
    };
    if (getField("title")) title = getField("title");
    if (getField("year")) year = getField("year");
    if (getField("poster")) poster = getField("poster");
    if (getField("backdrop")) backdrop = getField("backdrop");
    if (getField("overview")) overview = getField("overview");
    if (getField("subtitle")) subtitle = getField("subtitle");
  }

  if (!title) {
    title = kind === "movie" ? `Movie ${tmdbId}` : `TV Show ${tmdbId}`;
  }

  return {
    kind,
    tmdbId,
    season,
    episode,
    title,
    subtitle: subtitle || (season && episode ? `S${season} · E${episode}` : undefined),
    year: year || undefined,
    poster: poster || null,
    backdrop: backdrop || null,
    overview: overview || undefined,
  };
}

function finalizeVidlyMediaSources(
  rawSources: VidlyKatanaSource[],
  normPref: { code: string; name: string } | null,
  primaryServerId: string
): VidlyKatanaSource[] {
  const bestFallbackSubs =
    rawSources.find((s) => s.subtitles && s.subtitles.length > 0)?.subtitles || [];

  const cloned = rawSources.map((s) => {
    const hasPref = Boolean(normPref && s.audioTracks.some((t) => t.id === normPref.code));
    const audioCode = hasPref
      ? normPref!.code
      : s.audioTracks.find((t) => t.default)?.id || s.audioTracks[0]?.id || "en";
    const proxyM3u8 = `/api/proxy/m3u8?url=${encodeURIComponent(s.directUrl)}&audio=${encodeURIComponent(audioCode)}`;
    const subs = s.subtitles && s.subtitles.length > 0 ? s.subtitles : bestFallbackSubs;
    return {
      ...s,
      videoUrl: proxyM3u8,
      m3u8: proxyM3u8,
      subtitles: subs,
    };
  });

  cloned.sort((a, b) => {
    if (normPref) {
      const aHas = a.audioTracks.some((t) => t.id === normPref.code);
      const bHas = b.audioTracks.some((t) => t.id === normPref.code);
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
    }
    const aHevc = a.isHevc ? 1 : 0;
    const bHevc = b.isHevc ? 1 : 0;
    if (aHevc !== bHevc) return aHevc - bHevc;
    if (a.id === primaryServerId && b.id !== primaryServerId) return -1;
    if (b.id === primaryServerId && a.id !== primaryServerId) return 1;
    return 0;
  });

  return cloned;
}

async function buildVidlyMediaStreamSource(
  srv: { id: string; label: string; tag?: string },
  st: any,
  idx: number,
  totalStreams: number,
  unsealedSubtitles: any[],
  normPref: { code: string; name: string } | null
): Promise<VidlyKatanaSource | null> {
  const directUrl = st?.url;
  if (!directUrl) return null;

  const parsedLang = st.language ? normalizeLanguage(st.language, st.label) : null;
  const langObj = parsedLang && parsedLang.known ? parsedLang : null;
  const isHevcUrl = /[_-]h265[_-]|[_-]hevc[_-]/i.test(directUrl);
  let hasH265Codec = false;

  let m3u8AudioTracks: VidlyAudioTrack[] = [];
  let m3u8Subs: Array<{ url: string; language: string; label: string; default?: boolean }> = [];
  try {
    const m3u8Res = await vidlyAxios.get(directUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Referer: "https://vidly.pro/",
      },
      timeout: totalStreams === 1 ? 5000 : 3500,
      responseType: "text",
      validateStatus: () => true,
    });
    if (m3u8Res.status >= 400) {
      return null;
    }
    if (typeof m3u8Res.data === "string") {
      const cleanData = m3u8Res.data.replace(/^\uFEFF/, "");
      if (cleanData.trimStart().startsWith("#EXTM3U")) {
        m3u8AudioTracks = parseAudioTracksFromM3u8(cleanData);
        m3u8Subs = parseSubtitlesFromM3u8(cleanData, directUrl);
        hasH265Codec = /CODECS="[^"]*(hvc1|hev1)/i.test(cleanData);
      } else {
        const lowerHead = cleanData.trimStart().slice(0, 120).toLowerCase();
        if (
          lowerHead.startsWith("<") ||
          lowerHead.startsWith("{") ||
          lowerHead.includes("upstream manifest") ||
          lowerHead.includes("not found") ||
          lowerHead.includes("error")
        ) {
          return null;
        }
      }
    }
  } catch {}

  const audioTracks: VidlyAudioTrack[] =
    m3u8AudioTracks.length > 0
      ? m3u8AudioTracks
      : langObj
      ? [
          {
            id: langObj.code,
            name: langObj.name,
            label: langObj.name,
            lang: langObj.code,
            countryCode: langObj.countryCode,
            flag: langObj.flag,
            default: true,
          },
        ]
      : [{ id: "en", name: "English", label: "English", lang: "en", countryCode: "gb", flag: "🇬🇧", default: true }];

  const srvName = `${srv.label}${totalStreams > 1 ? ` #${idx + 1}` : ""}${langObj ? ` (${langObj.name})` : ""}`;
  const srvId = `${srv.id}${totalStreams > 1 ? `-${idx + 1}` : ""}`;
  const hasPref = Boolean(normPref && audioTracks.some((a) => a.id === normPref.code));
  const targetAudioCode = hasPref ? normPref!.code : audioTracks[0]?.id || "en";
  const proxyM3u8 = `/api/proxy/m3u8?url=${encodeURIComponent(directUrl)}&audio=${encodeURIComponent(targetAudioCode)}`;

  const dedupedSubs = deduplicateSubtitles([
    ...(st.subtitles || []),
    ...(unsealedSubtitles || []),
    ...m3u8Subs,
  ]);

  const primaryCode = audioTracks[0]?.id || "en";
  return {
    id: srvId,
    server: srv.label,
    name: srvName,
    serverName: srvName,
    type: primaryCode === "ja" ? "SUB" : "DUB",
    audio: primaryCode === "ja" ? "sub" : "dub",
    videoUrl: proxyM3u8,
    m3u8: proxyM3u8,
    directUrl,
    quality: st.quality || "1080p",
    isHls: true,
    isHevc: isHevcUrl || hasH265Codec,
    audioTracks,
    subtitles: dedupedSubs,
    hasDub: audioTracks.some((a) => a.id !== "ja"),
    language: langObj?.name || audioTracks[0]?.name,
  };
}

export async function getVidlyMovieSources(
  tmdbId: number,
  preferredAudio?: string,
  options?: { forceRefresh?: boolean }
): Promise<{ sources: VidlyKatanaSource[]; meta: VidlyMediaMeta | null }> {
  const normPref = preferredAudio ? cleanAudioParam(preferredAudio) : null;
  const cacheKey = `movie_${tmdbId}`;
  const cached = !options?.forceRefresh ? vidlyMediaCache.get(cacheKey) : undefined;
  if (cached && Date.now() - cached.timestamp < CACHE_TTL && cached.sources.length > 0) {
    return {
      sources: finalizeVidlyMediaSources(cached.sources, normPref, "singularity"),
      meta: cached.meta,
    };
  }
  let meta: VidlyMediaMeta | null = null;

  const targetUrl = `https://vidly.pro/movie/${tmdbId}`;
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
      return { sources: [], meta: null };
    }

    meta = extractVidlyMeta(html, "movie", tmdbId);

    const tokenMatch = html.match(/\\"token\\":\\"([^"\\]+)\\"/) || html.match(/"token":"([^"]+)"/);
    const token = tokenMatch ? tokenMatch[1] : "";

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

    const serverList: Array<{ id: string; label: string; tag?: string }> = initialData?.servers || [
      { id: "singularity", label: "Edge", tag: "HD" },
      { id: "prism", label: "Prism", tag: "MULTI" },
      { id: "flux", label: "Flux", tag: "HD" },
      { id: "nimbus", label: "Nimbus", tag: "HD" },
      { id: "comet", label: "Comet", tag: "HD" },
      { id: "citadel", label: "Citadel", tag: "MULTI" },
    ];

    const sources: VidlyKatanaSource[] = [];

    // 1. Process initial stream if available (usually Edge / singularity)
    if (initialData?.streams?.[0]) {
      const stream = initialData.streams[0];
      const directUrl = stream.url;
      const srvName = initialData.provider?.label || "Edge";
      const srvId = initialData.provider?.id || "singularity";
      const proxyM3u8 = `/api/proxy/m3u8?url=${encodeURIComponent(directUrl)}&audio=${encodeURIComponent(
        normPref ? normPref.code : "en"
      )}`;

      let audioTracks: VidlyAudioTrack[] = [];
      let m3u8Subs: Array<{ url: string; language: string; label: string; default?: boolean }> = [];
      let initialDead = false;
      let hasH265Codec = /[_-]h265[_-]|[_-]hevc[_-]/i.test(directUrl);
      try {
        const m3u8Res = await vidlyAxios.get(directUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            Referer: "https://vidly.pro/",
          },
          timeout: 6000,
          responseType: "text",
          validateStatus: () => true,
        });
        if (m3u8Res.status >= 400) {
          initialDead = true;
        } else if (typeof m3u8Res.data === "string") {
          const cleanData = m3u8Res.data.replace(/^\uFEFF/, "");
          if (cleanData.trimStart().startsWith("#EXTM3U")) {
            audioTracks = parseAudioTracksFromM3u8(cleanData);
            m3u8Subs = parseSubtitlesFromM3u8(cleanData, directUrl);
            if (/CODECS="[^"]*(hvc1|hev1)/i.test(cleanData)) hasH265Codec = true;
          } else {
            const lowerHead = cleanData.trimStart().slice(0, 120).toLowerCase();
            if (lowerHead.startsWith("<") || lowerHead.startsWith("{") || lowerHead.includes("error")) {
              initialDead = true;
            }
          }
        }
      } catch {}

      if (!initialDead) {
        if (audioTracks.length === 0) {
          audioTracks = [
            { id: "en", name: "English", label: "English", lang: "en", countryCode: "gb", flag: "🇬🇧", default: true },
          ];
        }

        const dedupedSubs = deduplicateSubtitles([
          ...(stream.subtitles || []),
          ...(initialData.subtitles || []),
          ...m3u8Subs,
        ]);

        sources.push({
          id: srvId,
          server: srvName,
          name: srvName,
          serverName: srvName,
          type: "SUB",
          audio: "sub",
          videoUrl: proxyM3u8,
          m3u8: proxyM3u8,
          directUrl,
          quality: stream.quality || "1080p",
          isHls: true,
          isHevc: hasH265Codec,
          audioTracks,
          subtitles: dedupedSubs,
          hasDub: audioTracks.some((a) => a.id !== "ja"),
        });
      }
    }

    // 2. Query remaining providers in parallel
    const queryPromises = serverList.map(async (srv) => {
      if (srv.id === initialData?.provider?.id) return [];
      if (!token) return [];

      try {
        const apiUrl = `https://vidly.pro/api/sources?kind=movie&provider=${srv.id}&t=${encodeURIComponent(
          token
        )}&tmdb=${tmdbId}`;
        const apiRes = await vidlyAxios.get(apiUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            Referer: targetUrl,
          },
          timeout: 9000,
        });

        if (typeof apiRes.data === "string" && apiRes.data.startsWith("v1.")) {
          const unsealed = unsealVidlyPayload(apiRes.data);
          if (unsealed.streams && Array.isArray(unsealed.streams) && unsealed.streams.length > 0) {
            const built = await Promise.all(
              unsealed.streams.map((st: any, idx: number) =>
                buildVidlyMediaStreamSource(
                  srv,
                  st,
                  idx,
                  unsealed.streams.length,
                  unsealed.subtitles || [],
                  normPref
                )
              )
            );
            return built.filter((s): s is VidlyKatanaSource => s !== null);
          }
        }
      } catch (err: any) {}
      return [];
    });

    const otherSourcesNested = await Promise.all(queryPromises);
    for (const nested of otherSourcesNested) {
      sources.push(...nested);
    }

    if (sources.length > 0) {
      vidlyMediaCache.set(cacheKey, { sources, meta, timestamp: Date.now() });
    }

    return {
      sources: finalizeVidlyMediaSources(sources, normPref, "singularity"),
      meta,
    };
  } catch (err: any) {
    console.warn(`[vidly] Failed to fetch movie sources for tmdb ${tmdbId}:`, err?.message || err);
    return { sources: [], meta };
  }
}

export async function getVidlyTvSources(
  tmdbId: number,
  season: number,
  episode: number,
  preferredAudio?: string,
  options?: { forceRefresh?: boolean }
): Promise<{ sources: VidlyKatanaSource[]; meta: VidlyMediaMeta | null }> {
  const normPref = preferredAudio ? cleanAudioParam(preferredAudio) : null;
  const cacheKey = `tv_${tmdbId}_s${season}_e${episode}`;
  const cached = !options?.forceRefresh ? vidlyMediaCache.get(cacheKey) : undefined;
  if (cached && Date.now() - cached.timestamp < CACHE_TTL && cached.sources.length > 0) {
    return {
      sources: finalizeVidlyMediaSources(cached.sources, normPref, "evion"),
      meta: cached.meta,
    };
  }
  let meta: VidlyMediaMeta | null = null;

  const targetUrl = `https://vidly.pro/tv/${tmdbId}/${season}/${episode}`;
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
      return { sources: [], meta: null };
    }

    meta = extractVidlyMeta(html, "tv", tmdbId, season, episode);

    const tokenMatch = html.match(/\\"token\\":\\"([^"\\]+)\\"/) || html.match(/"token":"([^"]+)"/);
    const token = tokenMatch ? tokenMatch[1] : "";

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

    const serverList: Array<{ id: string; label: string; tag?: string }> = initialData?.servers || [
      { id: "evion", label: "Edge", tag: "HD" },
      { id: "prism", label: "Prism", tag: "MULTI" },
      { id: "flux", label: "Flux", tag: "HD" },
      { id: "nimbus", label: "Nimbus", tag: "HD" },
      { id: "comet", label: "Comet", tag: "HD" },
      { id: "citadel", label: "Citadel", tag: "MULTI" },
    ];

    const sources: VidlyKatanaSource[] = [];

    // 1. Process initial stream if available (usually Edge / evion)
    if (initialData?.streams?.[0]) {
      const stream = initialData.streams[0];
      const directUrl = stream.url;
      const srvName = initialData.provider?.label || "Edge";
      const srvId = initialData.provider?.id || "evion";
      const proxyM3u8 = `/api/proxy/m3u8?url=${encodeURIComponent(directUrl)}&audio=${encodeURIComponent(
        normPref ? normPref.code : "en"
      )}`;

      let audioTracks: VidlyAudioTrack[] = [];
      let m3u8Subs: Array<{ url: string; language: string; label: string; default?: boolean }> = [];
      let initialDead = false;
      let hasH265Codec = /[_-]h265[_-]|[_-]hevc[_-]/i.test(directUrl);
      try {
        const m3u8Res = await vidlyAxios.get(directUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            Referer: "https://vidly.pro/",
          },
          timeout: 6000,
          responseType: "text",
          validateStatus: () => true,
        });
        if (m3u8Res.status >= 400) {
          initialDead = true;
        } else if (typeof m3u8Res.data === "string") {
          const cleanData = m3u8Res.data.replace(/^\uFEFF/, "");
          if (cleanData.trimStart().startsWith("#EXTM3U")) {
            audioTracks = parseAudioTracksFromM3u8(cleanData);
            m3u8Subs = parseSubtitlesFromM3u8(cleanData, directUrl);
            if (/CODECS="[^"]*(hvc1|hev1)/i.test(cleanData)) hasH265Codec = true;
          } else {
            const lowerHead = cleanData.trimStart().slice(0, 120).toLowerCase();
            if (lowerHead.startsWith("<") || lowerHead.startsWith("{") || lowerHead.includes("error")) {
              initialDead = true;
            }
          }
        }
      } catch {}

      if (!initialDead) {
        if (audioTracks.length === 0) {
          audioTracks = [
            { id: "en", name: "English", label: "English", lang: "en", countryCode: "gb", flag: "🇬🇧", default: true },
          ];
        }

        const dedupedSubs = deduplicateSubtitles([
          ...(stream.subtitles || []),
          ...(initialData.subtitles || []),
          ...m3u8Subs,
        ]);

        sources.push({
          id: srvId,
          server: srvName,
          name: srvName,
          serverName: srvName,
          type: "SUB",
          audio: "sub",
          videoUrl: proxyM3u8,
          m3u8: proxyM3u8,
          directUrl,
          quality: stream.quality || "1080p",
          isHls: true,
          isHevc: hasH265Codec,
          audioTracks,
          subtitles: dedupedSubs,
          hasDub: audioTracks.some((a) => a.id !== "ja"),
        });
      }
    }

    // 2. Query remaining providers in parallel
    const queryPromises = serverList.map(async (srv) => {
      if (srv.id === initialData?.provider?.id) return [];
      if (!token) return [];

      try {
        const apiUrl = `https://vidly.pro/api/sources?kind=tv&provider=${srv.id}&t=${encodeURIComponent(
          token
        )}&tmdb=${tmdbId}&s=${season}&e=${episode}`;
        const apiRes = await vidlyAxios.get(apiUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            Referer: targetUrl,
          },
          timeout: 9000,
        });

        if (typeof apiRes.data === "string" && apiRes.data.startsWith("v1.")) {
          const unsealed = unsealVidlyPayload(apiRes.data);
          if (unsealed.streams && Array.isArray(unsealed.streams) && unsealed.streams.length > 0) {
            const built = await Promise.all(
              unsealed.streams.map((st: any, idx: number) =>
                buildVidlyMediaStreamSource(
                  srv,
                  st,
                  idx,
                  unsealed.streams.length,
                  unsealed.subtitles || [],
                  normPref
                )
              )
            );
            return built.filter((s): s is VidlyKatanaSource => s !== null);
          }
        }
      } catch (err: any) {}
      return [];
    });

    const otherSourcesNested = await Promise.all(queryPromises);
    for (const nested of otherSourcesNested) {
      sources.push(...nested);
    }

    if (sources.length > 0) {
      vidlyMediaCache.set(cacheKey, { sources, meta, timestamp: Date.now() });
    }

    return {
      sources: finalizeVidlyMediaSources(sources, normPref, "evion"),
      meta,
    };
  } catch (err: any) {
    console.warn(`[vidly] Failed to fetch TV sources for tmdb ${tmdbId} s${season} e${episode}:`, err?.message || err);
    return { sources: [], meta };
  }
}
