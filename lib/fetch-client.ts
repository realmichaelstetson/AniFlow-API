/**
 * Resilient HTTP fetch helper with browser User-Agent and timeout support.
 * Prevents Cloudflare and WAF 403 blocks on Vercel/datacenter IPs.
 */

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function safeFetch(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 8000, headers, ...rest } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const customHeaders: Record<string, string> = {
    "User-Agent": BROWSER_USER_AGENT,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
  };

  if (url.includes("anilist.co")) {
    customHeaders["Origin"] = "https://anilist.co";
    customHeaders["Referer"] = "https://anilist.co/";
  } else if (url.includes("reanime.to")) {
    customHeaders["Origin"] = "https://reanime.to";
    customHeaders["Referer"] = "https://reanime.to/";
    customHeaders["Sec-Fetch-Dest"] = "empty";
    customHeaders["Sec-Fetch-Mode"] = "cors";
    customHeaders["Sec-Fetch-Site"] = "same-origin";
  } else if (url.includes("animeschedule.net")) {
    customHeaders["Origin"] = "https://animeschedule.net";
    customHeaders["Referer"] = "https://animeschedule.net/";
  }

  if (headers) {
    if (headers instanceof Headers) {
      headers.forEach((val, key) => {
        customHeaders[key] = val;
      });
    } else if (Array.isArray(headers)) {
      for (const [k, v] of headers) {
        customHeaders[k] = v;
      }
    } else {
      Object.assign(customHeaders, headers);
    }
  }

  try {
    const response = await fetch(url, {
      ...rest,
      headers: customHeaders,
      signal: options.signal || controller.signal,
    });
    return response;
  } catch (fetchErr: any) {
    if (fetchErr.name === "AbortError") {
      console.warn(`[safeFetch] Timeout (${timeoutMs}ms) reached for ${url}`);
    } else {
      console.warn(`[safeFetch] Network error for ${url}:`, fetchErr.message || fetchErr);
    }
    throw fetchErr;
  } finally {
    clearTimeout(timer);
  }
}
