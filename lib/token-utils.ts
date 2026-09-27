/**
 * Universal token and stream utilities safe for Node.js and Edge/browser runtimes.
 */

export function extractStreamToken(urlStr?: string | null): string | null {
  if (!urlStr) return null;
  try {
    let rawUrl = String(urlStr);

    for (let i = 0; i < 2; i++) {
      if (
        rawUrl.includes("%3A") ||
        rawUrl.includes("%2F") ||
        rawUrl.includes("%3F") ||
        rawUrl.includes("%3D") ||
        rawUrl.includes("%3a") ||
        rawUrl.includes("%2f") ||
        rawUrl.includes("%3f") ||
        rawUrl.includes("%3d")
      ) {
        try {
          rawUrl = decodeURIComponent(rawUrl);
        } catch {}
      }
    }

    if (rawUrl.includes("url=")) {
      const idx = rawUrl.indexOf("url=");
      const sub = rawUrl.substring(idx + 4).split("&")[0];
      if (sub) {
        rawUrl = sub;
      }
    }

    const match = rawUrl.match(
      /token=([a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/i
    );
    if (match && match[1]) {
      return match[1];
    }

    try {
      const parsed = new URL(rawUrl, "http://localhost");
      return parsed.searchParams.get("token");
    } catch {}
  } catch {}
  return null;
}

export function extractStreamVideoId(urlStr?: string | null): string | null {
  if (!urlStr) return null;
  try {
    const token = extractStreamToken(urlStr);
    if (token) {
      const parts = token.split(".");
      if (parts.length >= 2) {
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        let jsonStr: string;
        if (typeof Buffer !== "undefined") {
          jsonStr = Buffer.from(b64, "base64").toString("utf8");
        } else {
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          jsonStr = new TextDecoder().decode(bytes);
        }
        const payload = JSON.parse(jsonStr);
        if (payload.video_id) return String(payload.video_id);
      }
    }
  } catch {}

  try {
    const match = String(urlStr).match(/_v\d+\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) return match[1];
  } catch {}

  return null;
}

export function replaceStreamToken(
  urlStr: string,
  newToken: string,
  newHost?: string
): string {
  try {
    const parsed = new URL(urlStr);
    parsed.searchParams.set("token", newToken);
    if (newHost) {
      parsed.host = newHost;
    }
    return parsed.href;
  } catch {
    let res = urlStr;
    if (res.includes("token=")) {
      res = res.replace(/token=[^&]+/, `token=${newToken}`);
    } else {
      const sep = res.includes("?") ? "&" : "?";
      res = `${res}${sep}token=${newToken}`;
    }
    if (newHost) {
      res = res.replace(/https?:\/\/[^\/]+/, (m) => {
        const proto = m.split("://")[0];
        return `${proto}://${newHost}`;
      });
    }
    return res;
  }
}

export function isStreamTokenExpired(urlStr?: string | null): boolean {
  if (!urlStr) return false;
  try {
    const token = extractStreamToken(urlStr);
    if (!token) return false;

    const parts = token.split(".");
    if (parts.length < 2) return false;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    let jsonStr: string;
    if (typeof Buffer !== "undefined") {
      jsonStr = Buffer.from(b64, "base64").toString("utf8");
    } else {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      jsonStr = new TextDecoder().decode(bytes);
    }
    const payload = JSON.parse(jsonStr);
    if (payload.exp && typeof payload.exp === "number") {
      // Return true if expired or expiring within 60 seconds
      return payload.exp * 1000 <= Date.now() + 60000;
    }
  } catch {}
  return false;
}

export function isTokenizedStreamUrl(urlStr?: string | null): boolean {
  if (!urlStr) return false;
  let decoded = String(urlStr);
  try {
    decoded = decodeURIComponent(decoded);
  } catch {}
  const lower = decoded.toLowerCase();
  return (
    lower.includes("token=") ||
    lower.includes("flixcloud") ||
    lower.includes("atomic4cdn") ||
    lower.includes("rundowncdn")
  );
}
