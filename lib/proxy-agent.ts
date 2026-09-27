import http from "http";
import https from "https";
import axios, { AxiosRequestConfig } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

/**
 * Global Outbound Proxy Configuration
 * Supports:
 * - HTTP_PROXY / HTTPS_PROXY / PROXY_URL / OUTBOUND_PROXY_URL
 * - ScraperAPI (premium proxy for bypassing Cloudflare)
 * - FlareSolverr (self-hosted headless browser for Cloudflare challenge solving)
 */

const OUTBOUND_PROXY_URL =
  process.env.OUTBOUND_PROXY_URL ||
  process.env.PROXY_URL ||
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  "";

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || "";
const SCRAPER_API_URL = "https://api.scraperapi.com";
const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || "";

let proxyAgent: HttpsProxyAgent | null = null;
if (OUTBOUND_PROXY_URL) {
  try {
    proxyAgent = new HttpsProxyAgent(OUTBOUND_PROXY_URL);
    console.log(`[ProxyAgent] Initialized outbound proxy agent with: ${OUTBOUND_PROXY_URL.replace(/:\/\/[^@]+@/, "://***@")}`);
  } catch (err: any) {
    console.warn(`[ProxyAgent] Failed to initialize proxy agent:`, err?.message || err);
  }
}

const defaultHttpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 15000,
});

const defaultHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 15000,
});

export function getOutboundHttpsAgent(): https.Agent | HttpsProxyAgent {
  return proxyAgent || defaultHttpsAgent;
}

export function getOutboundHttpAgent(): http.Agent | HttpsProxyAgent {
  return proxyAgent || defaultHttpAgent;
}

export function hasOutboundProxy(): boolean {
  return Boolean(proxyAgent || SCRAPER_API_KEY || FLARESOLVERR_URL);
}

export function isCloudflareChallenge(data: any): boolean {
  if (typeof data !== "string") return false;
  return (
    data.includes("Just a moment...") ||
    data.includes("challenge-platform") ||
    data.includes("cf-browser-verification") ||
    data.includes("Checking your browser") ||
    data.includes("Enable JavaScript and cookies to continue") ||
    data.includes("Attention Required! | Cloudflare")
  );
}

/**
 * Fetch a URL via ScraperAPI (residential IP pool)
 */
async function fetchViaScraperApi(url: string, timeout = 15000): Promise<string> {
  const response = await axios.get(SCRAPER_API_URL, {
    params: {
      api_key: SCRAPER_API_KEY,
      url,
      render: "false",
    },
    timeout,
    responseType: "text",
  });
  return response.data;
}

/**
 * Fetch a URL via FlareSolverr (Cloudflare solver daemon)
 */
async function fetchViaFlareSolverr(url: string, timeout = 25000): Promise<string> {
  const response = await axios.post(
    `${FLARESOLVERR_URL.replace(/\/$/, "")}/v1`,
    {
      cmd: "request.get",
      url,
      maxTimeout: timeout,
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: timeout + 5000,
    }
  );

  if (response.data?.status === "ok") {
    return response.data.solution?.response || "";
  }
  throw new Error(`FlareSolverr error: ${response.data?.message || "Unknown error"}`);
}

/**
 * Resilient fetch with automatic Cloudflare detection and proxy fallback.
 */
export async function resilientFetch(
  url: string,
  options: {
    headers?: Record<string, string>;
    timeout?: number;
    method?: string;
  } = {}
): Promise<{ data: string; proxyUsed: string }> {
  const { headers = {}, timeout = 6000, method = "GET" } = options;

  // 1. Direct request (using proxyAgent if configured via PROXY_URL)
  try {
    const config: AxiosRequestConfig = {
      url,
      method: method as any,
      headers,
      timeout,
      responseType: "text",
      httpsAgent: getOutboundHttpsAgent(),
      httpAgent: getOutboundHttpAgent(),
      validateStatus: (s) => s < 400,
    };

    const res = await axios(config);
    if (res.data && !isCloudflareChallenge(res.data)) {
      return { data: res.data, proxyUsed: proxyAgent ? "proxy-agent" : "direct" };
    }
  } catch (err: any) {
    const body = err?.response?.data;
    if (!isCloudflareChallenge(body) && !SCRAPER_API_KEY && !FLARESOLVERR_URL) {
      throw err;
    }
  }

  // 2. Fallback to ScraperAPI if configured
  if (SCRAPER_API_KEY) {
    try {
      console.log(`[ResilientFetch] Direct request blocked by Cloudflare, routing via ScraperAPI: ${url}`);
      const data = await fetchViaScraperApi(url, timeout * 2);
      if (data && !isCloudflareChallenge(data)) {
        return { data, proxyUsed: "scraperapi" };
      }
    } catch (err: any) {
      console.warn(`[ResilientFetch] ScraperAPI failed:`, err?.message || err);
    }
  }

  // 3. Fallback to FlareSolverr if configured
  if (FLARESOLVERR_URL) {
    try {
      console.log(`[ResilientFetch] Direct request blocked by Cloudflare, routing via FlareSolverr: ${url}`);
      const data = await fetchViaFlareSolverr(url, timeout * 3);
      if (data && !isCloudflareChallenge(data)) {
        return { data, proxyUsed: "flaresolverr" };
      }
    } catch (err: any) {
      console.warn(`[ResilientFetch] FlareSolverr failed:`, err?.message || err);
    }
  }

  throw new Error(`Failed to fetch ${url} (blocked by Cloudflare or connection error)`);
}
