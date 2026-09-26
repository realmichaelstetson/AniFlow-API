/**
 * Universal token expiration checker safe for both client (browser) and server (Node.js).
 */
export function isStreamTokenExpired(urlStr?: string | null): boolean {
  if (!urlStr) return false;
  try {
    let rawUrl = String(urlStr);

    // Attempt decoding up to 2 times to handle nested encoded proxy URLs
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

    // Check if token exists in string
    let token: string | null = null;
    if (rawUrl.includes("token=")) {
      const match = rawUrl.match(
        /token=([a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/i
      );
      if (match && match[1]) {
        token = match[1];
      }
    }

    if (!token) {
      try {
        const parsed = new URL(rawUrl, "http://localhost");
        token = parsed.searchParams.get("token");
      } catch {}
    }

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
