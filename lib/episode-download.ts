/**
 * Episode downloader used by /api/download.
 *
 * Segments are fetched in parallel through our own HLS proxy (so token refresh, referers
 * and key resolution are reused), decrypted in-process when the playlist uses AES-128,
 * and handed to ffmpeg over pipes to be remuxed into a single fragmented MP4.
 * ffmpeg never touches the network, it only copies streams.
 *
 * Without ffmpeg the plaintext MPEG-TS segments are concatenated as-is, which only works
 * when audio is muxed into the video playlist (no separate EXT-X-MEDIA audio rendition).
 */
import { spawn, spawnSync } from "child_process";
import crypto from "crypto";
import { once } from "events";
import type { Writable } from "stream";
import { findTsStartOffset } from "@/lib/stream-proxy/media-buffer";

const SEGMENT_CONCURRENCY = 6;
// Upstream CDNs throw sporadic 502s under parallel load; a missing segment ruins the file
const SEGMENT_RETRIES = 6;
const FETCH_TIMEOUT_MS = 20000;

export interface HlsVariant {
  url: string;
  bandwidth: number;
  height: number;
  audioGroup: string | null;
}

export interface HlsAudioRendition {
  url: string;
  groupId: string;
  language: string;
  name: string;
  isDefault: boolean;
}

interface HlsKey {
  method: string;
  uri: string | null;
  iv: Buffer | null;
}

interface HlsSegment {
  url: string;
  sequence: number;
  key: HlsKey | null;
}

interface MediaPlaylist {
  initUrl: string | null;
  segments: HlsSegment[];
  duration: number;
}

export interface DownloadPlan {
  video: MediaPlaylist;
  audio: MediaPlaylist | null;
  height: number;
}

function parseAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    attrs[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return attrs;
}

async function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, { signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function fetchText(url: string, signal?: AbortSignal): Promise<{ text: string; finalUrl: string }> {
  const res = await fetchWithTimeout(url, signal);
  if (!res.ok) throw new Error(`Playlist request failed (${res.status})`);
  return { text: await res.text(), finalUrl: res.url || url };
}

function parseMaster(text: string, baseUrl: string) {
  const lines = text.split(/\r?\n/);
  const variants: HlsVariant[] = [];
  const audios: HlsAudioRendition[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXT-X-MEDIA:") && line.includes("TYPE=AUDIO")) {
      const a = parseAttributes(line.slice("#EXT-X-MEDIA:".length));
      if (a.URI) {
        audios.push({
          url: new URL(a.URI, baseUrl).href,
          groupId: a["GROUP-ID"] || "",
          language: (a.LANGUAGE || "").toLowerCase(),
          name: a.NAME || "",
          isDefault: a.DEFAULT === "YES",
        });
      }
    } else if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const a = parseAttributes(line.slice("#EXT-X-STREAM-INF:".length));
      const uri = (lines[i + 1] || "").trim();
      if (!uri || uri.startsWith("#")) continue;
      const res = (a.RESOLUTION || "").split("x");
      variants.push({
        url: new URL(uri, baseUrl).href,
        bandwidth: parseInt(a.BANDWIDTH || "0", 10) || 0,
        height: parseInt(res[1] || "0", 10) || 0,
        audioGroup: a.AUDIO || null,
      });
    }
  }
  return { variants, audios };
}

function parseMedia(text: string, baseUrl: string): MediaPlaylist {
  const lines = text.split(/\r?\n/);
  const segments: HlsSegment[] = [];
  let sequence = 0;
  let key: HlsKey | null = null;
  let initUrl: string | null = null;
  let duration = 0;
  let pendingDuration = 0;
  let expectSegment = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      sequence = parseInt(line.split(":")[1], 10) || 0;
    } else if (line.startsWith("#EXT-X-KEY:")) {
      const a = parseAttributes(line.slice("#EXT-X-KEY:".length));
      const method = (a.METHOD || "NONE").toUpperCase();
      key =
        method === "NONE"
          ? null
          : {
              method,
              uri: a.URI ? new URL(a.URI, baseUrl).href : null,
              iv: a.IV ? Buffer.from(a.IV.replace(/^0x/i, "").padStart(32, "0"), "hex") : null,
            };
    } else if (line.startsWith("#EXT-X-MAP:")) {
      const a = parseAttributes(line.slice("#EXT-X-MAP:".length));
      if (a.URI) initUrl = new URL(a.URI, baseUrl).href;
    } else if (line.startsWith("#EXTINF:")) {
      pendingDuration = parseFloat(line.slice("#EXTINF:".length)) || 0;
      expectSegment = true;
    } else if (!line.startsWith("#") && expectSegment) {
      segments.push({ url: new URL(line, baseUrl).href, sequence, key });
      duration += pendingDuration;
      sequence++;
      expectSegment = false;
    }
  }

  return { initUrl, segments, duration };
}

function pickAudio(audios: HlsAudioRendition[], groupId: string | null, audio: "sub" | "dub") {
  const pool = audios.filter((a) => !groupId || a.groupId === groupId);
  if (pool.length === 0) return null;
  const wanted =
    audio === "dub"
      ? pool.find((a) => a.language.startsWith("en") || /english/i.test(a.name))
      : pool.find((a) => a.language.startsWith("ja") || a.language === "jpn" || /native|japanese/i.test(a.name));
  return wanted || pool.find((a) => a.isDefault) || pool[0];
}

/**
 * Resolves a playable master (or media) playlist URL into concrete video and audio
 * segment lists. `maxHeight` caps the chosen rendition (0 = best available).
 */
export async function buildDownloadPlan(
  playlistUrl: string,
  audio: "sub" | "dub",
  maxHeight = 0,
  signal?: AbortSignal
): Promise<DownloadPlan> {
  const master = await fetchText(playlistUrl, signal);
  if (!master.text.startsWith("#EXTM3U")) throw new Error("Upstream did not return an HLS playlist");

  const { variants, audios } = parseMaster(master.text, master.finalUrl);
  if (variants.length === 0) {
    return { video: parseMedia(master.text, master.finalUrl), audio: null, height: 0 };
  }

  const sorted = [...variants].sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);
  const variant = (maxHeight > 0 && sorted.find((v) => v.height > 0 && v.height <= maxHeight)) || sorted[0];

  const rendition = variant.audioGroup ? pickAudio(audios, variant.audioGroup, audio) : null;
  const [videoText, audioText] = await Promise.all([
    fetchText(variant.url, signal),
    rendition ? fetchText(rendition.url, signal) : Promise.resolve(null),
  ]);

  return {
    video: parseMedia(videoText.text, videoText.finalUrl),
    audio: audioText ? parseMedia(audioText.text, audioText.finalUrl) : null,
    height: variant.height,
  };
}

async function fetchBytes(url: string, signal?: AbortSignal): Promise<Buffer> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < SEGMENT_RETRIES; attempt++) {
    if (signal?.aborted) throw new Error("aborted");
    try {
      const res = await fetchWithTimeout(url, signal);
      if (!res.ok) throw new Error(`Segment request failed (${res.status})`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, Math.min(500 * 2 ** attempt, 5000)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Segment request failed");
}

/** Yields the playlist's media bytes in order, prefetching a few segments ahead. */
async function* mediaBytes(playlist: MediaPlaylist, signal?: AbortSignal): AsyncGenerator<Buffer> {
  const keyCache = new Map<string, Promise<Buffer>>();
  const getKey = (uri: string) => {
    let p = keyCache.get(uri);
    if (!p) {
      p = fetchBytes(uri, signal);
      keyCache.set(uri, p);
    }
    return p;
  };

  const loadSegment = async (seg: HlsSegment): Promise<Buffer> => {
    let buf = await fetchBytes(seg.url, signal);
    if (seg.key) {
      if (seg.key.method !== "AES-128" || !seg.key.uri) {
        throw new Error(`Unsupported HLS encryption: ${seg.key.method}`);
      }
      const key = await getKey(seg.key.uri);
      const iv = seg.key.iv || Buffer.alloc(16);
      if (!seg.key.iv) iv.writeUInt32BE(seg.sequence, 12);
      const decipher = crypto.createDecipheriv("aes-128-cbc", key.subarray(0, 16), iv);
      buf = Buffer.concat([decipher.update(buf), decipher.final()]);
    }
    // Plaintext may still carry a fake image header in front of the TS packets
    const offset = findTsStartOffset(buf);
    return offset > 0 ? buf.subarray(offset) : buf;
  };

  if (playlist.initUrl) yield await fetchBytes(playlist.initUrl, signal);

  const window: Promise<Buffer>[] = [];
  let next = 0;
  const fill = () => {
    while (window.length < SEGMENT_CONCURRENCY && next < playlist.segments.length) {
      const p = loadSegment(playlist.segments[next++]);
      p.catch(() => {}); // surfaced when awaited in order
      window.push(p);
    }
  };

  fill();
  while (window.length > 0) {
    const buf = await window.shift()!;
    fill();
    yield buf;
  }
}

async function pump(source: AsyncGenerator<Buffer>, target: Writable) {
  for await (const chunk of source) {
    if (target.destroyed) return;
    if (!target.write(chunk)) await once(target, "drain");
  }
  target.end();
}

let ffmpegAvailable: boolean | null = null;

export function hasFfmpeg(): boolean {
  if (ffmpegAvailable === null) {
    try {
      const res = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", ["-version"], { timeout: 5000 });
      ffmpegAvailable = res.status === 0;
    } catch {
      ffmpegAvailable = false;
    }
  }
  return ffmpegAvailable;
}

/**
 * Streams the plan as a fragmented MP4 (ffmpeg remux) or, when ffmpeg is missing and the
 * audio is muxed in, as raw concatenated MPEG-TS.
 */
export function streamDownload(plan: DownloadPlan, signal?: AbortSignal): { stream: ReadableStream<Uint8Array>; container: "mp4" | "ts" } {
  const abort = new AbortController();
  signal?.addEventListener("abort", () => abort.abort());

  if (!hasFfmpeg()) {
    if (plan.audio) throw new Error("FFMPEG_REQUIRED");
    const source = mediaBytes(plan.video, abort.signal);
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { value, done } = await source.next();
          if (done) controller.close();
          else controller.enqueue(new Uint8Array(value));
        } catch (err) {
          controller.error(err);
        }
      },
      cancel() {
        abort.abort();
      },
    });
    return { stream, container: "ts" };
  }

  const args = ["-hide_banner", "-loglevel", "error", "-i", "pipe:0"];
  if (plan.audio) args.push("-i", "pipe:3", "-map", "0:v:0", "-map", "1:a:0");
  else args.push("-map", "0:v:0", "-map", "0:a:0?");
  args.push(
    "-c", "copy",
    "-bsf:a", "aac_adtstoasc",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-f", "mp4",
    "pipe:1"
  );

  const proc = spawn(process.env.FFMPEG_PATH || "ffmpeg", args, {
    stdio: ["pipe", "pipe", "pipe", "pipe"],
  });

  let stderr = "";
  proc.stderr.on("data", (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-2000);
  });

  const kill = () => {
    abort.abort();
    if (proc.exitCode === null) proc.kill("SIGKILL");
  };
  abort.signal.addEventListener("abort", () => {
    if (proc.exitCode === null) proc.kill("SIGKILL");
  });

  // Writes into a pipe ffmpeg already closed raise EPIPE; the exit code reports the real failure
  proc.stdin.on("error", () => {});
  const audioPipe = proc.stdio[3] as Writable;
  audioPipe?.on("error", () => {});

  let pumpError: unknown = null;
  const onPumpError = (err: unknown) => {
    if (!pumpError) pumpError = err;
    kill();
  };
  pump(mediaBytes(plan.video, abort.signal), proc.stdin).catch(onPumpError);
  if (plan.audio && audioPipe) pump(mediaBytes(plan.audio, abort.signal), audioPipe).catch(onPumpError);

  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      proc.stdout.on("data", (chunk: Buffer) => {
        if (cancelled) return;
        controller.enqueue(new Uint8Array(chunk));
        if ((controller.desiredSize ?? 1) <= 0) proc.stdout.pause();
      });
      proc.on("close", (code) => {
        if (cancelled || signal?.aborted) return;
        if (code === 0 && !pumpError) {
          controller.close();
          return;
        }
        const reason = pumpError instanceof Error ? pumpError.message : stderr.trim() || `ffmpeg exited with ${code}`;
        console.error("[download] stream failed:", reason);
        controller.error(new Error(reason));
      });
      proc.on("error", (err) => {
        if (!cancelled) controller.error(err);
      });
    },
    pull() {
      proc.stdout.resume();
    },
    cancel() {
      cancelled = true;
      kill();
    },
  });

  return { stream, container: "mp4" };
}
