export interface NormalizedLanguage {
  code: string;
  name: string;
  countryCode: string;
  flag: string;
  known: boolean;
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
