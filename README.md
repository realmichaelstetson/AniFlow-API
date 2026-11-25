<p align="center">
  <img src="public/logo.svg" alt="AniFlow Logo" width="100" height="100" />
</p>

<h1 align="center">AniFlow API</h1>

<p align="center">
  Self-hostable streaming embed API, HLS proxy, downloader, and liquid-glass player for Anime, Movies, and TV Shows. Pass an AniList, MyAnimeList, or TMDB ID and get a playable stream.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14.2-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?style=for-the-badge&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-38bdf8?style=for-the-badge&logo=tailwindcss" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/HLS.js-1.5-orange?style=for-the-badge" alt="Hls.js" />
  <img src="https://img.shields.io/badge/License-MIT-emerald?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <strong>Live Preview:</strong> <a href="https://api.aniflow.cc/">https://api.aniflow.cc/</a>
</p>

> [!NOTE]
> You can try the live preview at [https://api.aniflow.cc/](https://api.aniflow.cc/), **but self-hosting your own instance is strongly recommended for better streaming performance, lower latency, full server availability, and dedicated proxy bandwidth.**

> [!WARNING]
> **Cloudflare & Hosted Proxy Limitations:** On cloud/datacenter deployments (including the hosted preview at `https://api.aniflow.cc/`), Cloudflare frequently blocks or rate-limits datacenter IPs on upstream `/api/sources` and CDN proxy endpoints. Because of this, **some servers (`Prism`, `Flux`, `Nimbus`, `Comet`, `Citadel`, and `Katana Multi`) and the extra dubbed audio languages they provide may appear and work on `localhost`/residential IPs while being unavailable on hosted production instances** unless you route upstream requests through a residential proxy (`OUTBOUND_PROXY_URL` / `PROXY_URL`), `SCRAPER_API_KEY`, or `FLARESOLVERR_URL`.

---

## What's New

### Added
- **Movies & TV Shows Support (TMDB):** Full embed, JSON Play API, direct `.m3u8`/`.meu8` streaming, and `.mp4` downloads powered by TMDB metadata (`lib/tmdb.ts`) and Vidly media providers (`Edge`, `Prism`, `Flux`, `Nimbus`, `Comet`, `Citadel`) via `lib/media-service.ts`.
- **Flexible Slug Routes:** Unified `/embed/{anime|movie|tv}/...`, `/meu8/{anime|movie|tv}/...`, `/m3u8/{anime|movie|tv}/...`, and `/api/download/{anime|movie|tv}/...` routes (`lib/route-utils.ts`) supporting readable inline audio paths such as `/audio="english"`, `/audio="polish"`, or `/audio="japanese"`.
- **Stream Download Endpoints:** Added Movie & TV download routes alongside refactored Anime download endpoints (`/api/download/ani/...`, `/api/download/mal/...`, `/api/download/anime/...`, `/api/download/movie/...`, `/api/download/tv/...`) with `?quality=1080|720|480` selection.
- **Dedicated Play API Endpoints:** Added `/api/anime/play`, `/api/movie/play`, and `/api/tv/play` JSON/M3U8 endpoints.
- **Interactive Documentation & Playground:** Updated the home page (`app/page.tsx`) with a live playground supporting Anime, Movies, and TV Shows, dynamic server/audio pickers, code examples, parameter tables, and `postMessage` docs.

### Changed
- **English Audio Default for Anime:** All Anime routes (`/embed/...`, `/api/play`, `/api/anime/play`, `/meu8/...`, `/m3u8/...`, `/api/download/...`, `/api/proxy/m3u8`) and the playground now default to **English (`english` / `dub`)**, automatically falling back to Japanese (`sub`) with a player notification when an episode has no authentic English dub.
- **Real Country-Only Audio Detection:** Normalized 45+ ISO languages with verified country flags in `lib/vidly.ts` and `embed-player.tsx`. Removed hardcoded `[English, Japanese]` fallback placeholders on Movies/TV and filtered out unrecognized/non-country tracks (`Unknown`, `8. Unknown`, `und`, synthetic `main`, etc.) across API responses, HLS manifests, the Audio & Subtitles menu, and the playground.
- **Cross-Server Audio & Route Switching:** Clicking any available language in the player's **Audio & Subtitles** menu either switches HLS tracks on the fly within the active multi-audio stream or automatically switches playback to the highest-priority server providing that language, keeping active Audio (`✓`) and Server Route indicators accurate. When `?server=` is omitted on Movie/TV embeds, the player automatically selects the server matching the requested audio language.
- **Proxy Improvements:** Updated `/api/proxy/m3u8` to rewrite `DEFAULT`/`AUTOSELECT` flags per `#EXT-X-MEDIA:TYPE=AUDIO` group according to the requested language, and hardened `/api/proxy/segment` and `/api/proxy/subtitles`.

---

## Overview

AniFlow is a self-hostable backend and HLS player for embedding **Anime**, **Movies**, and **TV Shows** in any website or application. Use the drop-in iframe player, consume the JSON REST API, stream directly to VLC/mpv/`<video>` via `.meu8`/`.m3u8`, or serve direct MP4 downloads.

Key capabilities:

- **Anime, Movies & TV Shows:** Supports **AniList** (`ani`), **MyAnimeList** (`mal`), and **TMDB** (`movie`, `tv`) IDs.
- **Six Anime Servers:** `Katana`, `Flow`, `Kitty`, `Yuri`, `Zuri`, and `Buzz` with English Dub default and verified Japanese Sub fallback.
- **Six Movie/TV Providers:** `Edge` (`singularity` / `evion`), `Prism`, `Flux`, `Nimbus`, `Comet`, and `Citadel` with dynamic country-based multi-audio discovery.
- **Country-Verified Multi-Audio:** Detects real spoken languages with vector country flags across HLS manifests and video sources—never displaying placeholder tracks or `Unknown` labels.
- **Direct HLS & MP4 Downloads:** Point VLC, mpv, ExoPlayer, AVPlayer, or `hls.js` at `/meu8/...` or `/m3u8/...`, or download remuxed streams via `/api/download/...`.
- **Intro/Outro Skipping:** OP/ED timestamps using native Re:ANIME markers (`Flow`, `Kitty`) and AniSkip (`Katana`, `Yuri`, `Zuri`, `Buzz`), scaled to episode duration.
- **Multilingual Subtitle Proxy:** Clean single-track-per-language subtitles (VTT/SRT/ASS converted to WebVTT) with custom styling, persisted across server switches.
- **Liquid Glass Player:** Floating dark UI with a two-column **Audio & Subtitles** menu, **Preferences** panel, quality switcher, and two-way `postMessage` API.

---

## Servers & Audio Resolution

### Anime Servers

| Server | Upstream | Audio | Notes |
| :--- | :--- | :--- | :--- |
| **Katana** | Vidly (Hikari) | `DUB`, `SUB`, `MULTI` | High-performance multi-audio HLS engine (English default, Japanese, European, and regional dubs). |
| **Flow** | Re:ANIME (HD-1) | `DUB`, `SUB` | Primary backup server with Re:ANIME's native OP/ED skip timestamps. |
| **Kitty** | Re:ANIME (HD-2) | `DUB`, `SUB` | Mirror for Flow with identical skip-time support. |
| **Yuri** | AniEmbed Core | `DUB`, `SUB` | Soft subtitles supporting multiple external languages. |
| **Zuri** | AniEmbed Zuna | `SUB` only | Japanese-audio fallback stream. |
| **Buzz** | MegaPlay Buzz | `DUB`, `SUB` | Served through the edge `.m3u8` proxy with dynamic segment handling. |

#### Dub Verification
Some upstream anime hosts silently serve Japanese audio when an English dub is missing. AniFlow validates dub streams at both API and player layers:
- Audio tracks and manifests are inspected before selection.
- Servers that silently fall back to Japanese audio are excluded from the Dub roster (`audio_fallback`).
- If an episode has no genuine English dub across any provider, the player automatically falls back to Japanese (`Sub`) with an informative toast and selects the matching track in the menu.

### Movies & TV Servers

| Server | API ID | Capabilities |
| :--- | :--- | :--- |
| **Edge** | `singularity` (Movies) / `evion` (TV) | Primary HD/4K multi-audio source. |
| **Prism** | `prism` | Multi-language HLS streams (e.g., English, Polish, Spanish, etc. when offered by upstream). |
| **Flux** | `flux` | HD video source with embedded/source language detection. |
| **Nimbus** | `nimbus` | HD mirror source. |
| **Comet** | `comet` | Backup stream source. |
| **Citadel** | `citadel` | Secondary multi-source mirror. |

#### Country-Only Audio Filtering & Auto Server Switching
- Movie and TV audio menus display **only real recognized country languages** actually present in the resolved video sources or HLS master manifests.
- Unlabeled (`und`, `main`) or non-country strings (`Unknown`, `8. Unknown`, `other`) are filtered out automatically, and fake Japanese placeholders are never injected when a movie/TV source does not provide Japanese audio.
- Clicking any language in the player switches the active HLS `audioTrack` immediately if present on the current server, or seamlessly switches to the best server offering that language.

> [!WARNING]
> **Why Some Servers & Audio Tracks Work on `localhost` but Not on Production (`api.aniflow.cc`):**
> - Upstream Vidly `/api/sources` endpoints (`Prism`, `Flux`, `Nimbus`, `Comet`, `Citadel`, and `Katana Multi`) are protected by Cloudflare, which aggressively challenges or blocks shared cloud/datacenter IP ranges (such as Koyeb, AWS, GCP, OVH, etc.).
> - Primary SSR-embedded routes (**Edge** for Movies/TV and **Katana Sub/Dub** for Anime) normally remain available on hosted deployments, while secondary multi-audio mirrors (**Prism**, **Citadel**, **Comet**, **Nimbus**, **Flux**, **Katana Multi**) — along with any audio dub tracks exclusive to those mirrors — may disappear or fail on cloud hosting without a residential IP or proxy bypass (`OUTBOUND_PROXY_URL` / `PROXY_URL`, `SCRAPER_API_KEY`, `FLARESOLVERR_URL`).

---

## Player Features

- **Liquid glass design:** Minimalist dark controls with blurred glass panels and auto-hide during playback.
- **Unified Audio & Subtitles menu:**
  - **Audio (Left column):** Displays only real country-flagged audio tracks available across the stream/sources. Clicking a track switches tracks live inside HLS or swaps to the server carrying that language.
  - **Subtitles (Right column):** Deduplicated single-track-per-language subtitles with country flags, synced across server changes.
- **Preferences menu:** **Playback Speed** (`0.25x` – `2.0x`), **Volume Slider**, **Volume Boost** (up to `+200%` Web Audio gain), and **Auto Skip** (Opening / Ending) toggles.
- **Server Route menu:** Switch between Anime Dub/Sub providers or distinct Movie/TV servers showing active language badges (`2 Audio`, `Polish`, `1080p`).
- **Video Quality selector:** Adaptive bitrate (`Auto`) or manual resolution locking (`1080p`, `720p`, `480p`, `360p`).
- **Subtitle styling dialog:** Font family (`Sans`, `Anime`, `Serif`, `Mono`), font size, text color, background opacity, shadow, and outlines.
- **Mobile gestures:** Tap to toggle controls, double-tap left/right to seek `±10s`, and automatic landscape lock in fullscreen.

---

## API Reference

### Embed URLs

#### Flexible Slug Routes (Recommended)

Anime (AniList or MAL):
```http
GET /embed/anime/{ani|mal}/{id}/{episode}/audio="{language}"?server={server}
```

Movies (TMDB ID):
```http
GET /embed/movie/{tmdb_id}/audio="{language}"?server={server}
```

TV Shows (TMDB ID):
```http
GET /embed/tv/{tmdb_id}/{episode}/audio="{language}"?season={season}&server={server}
GET /embed/tv/{tmdb_id}/{season}/{episode}/audio="{language}"?server={server}
```

#### Legacy / Direct Anime Embed Routes

```http
GET /embed/ani/{anilistId}/{episode}?server={server}
GET /embed/ani/{anilistId}/{episode}/{audio}?server={server}
GET /embed/mal/{malId}/{episode}?server={server}
GET /embed/mal/{malId}/{episode}/{audio}?server={server}
```

**Parameters**

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `id` / `anilistId` / `malId` / `tmdb_id` | `number` | Required | ID from AniList, MyAnimeList, or TMDB. |
| `season` | `number` | `1` | TV season number (path segment or `?season=`). |
| `episode` | `number` | `1` | Episode number. |
| `audio` | `string` | `english` | Language name or code (`english`, `japanese`, `polish`, `spanish`, `german`, `french`, `sub`, `dub`, etc.). Works in path (`audio="english"` or `dub`/`sub`) or query (`?audio=...`). |
| `server` | `string` | Auto (`katana-dub` for anime; language-matched server for movie/tv) | Anime: `katana`, `flow`, `kitty`, `yuri`, `zuri`, `buzz`. Movies/TV: `singularity`, `evion`, `prism`, `flux`, `nimbus`, `comet`, `citadel`. |
| `startAt` / `progress` | `number` | `0` | Initial playback offset in seconds. |
| `autoskipIntro` | `1` \| `0` | `1` | Automatically skip anime intros. |
| `autoskipOutro` | `1` \| `0` | `1` | Automatically skip anime outros. |
| `parentHost` | `string` | Auto | Parent domain hint when `Referer` is stripped. |

---

### Direct HLS Streams (`/meu8` & `/m3u8`)

Stream raw proxied `#EXTM3U` playlists in VLC, mpv, ExoPlayer, AVPlayer, or `<video>` with the requested audio track marked as default:

```http
GET /meu8/anime/{ani|mal}/{id}/{episode}/audio="{language}"
GET /meu8/movie/{tmdb_id}/audio="{language}"
GET /meu8/tv/{tmdb_id}/{episode}/audio="{language}"?season={season}
GET /meu8/tv/{tmdb_id}/{season}/{episode}/audio="{language}"
```

Alias routes are also available under `/m3u8/...`, `/meu8/ani/...`, `/meu8/mal/...`, `/api/m3u8/ani/...`, and `/api/m3u8/mal/...`.

Examples:
```bash
# Default English anime stream in VLC
vlc "https://your-domain.com/meu8/anime/ani/16498/1"

# Japanese subbed anime via Katana in mpv
mpv "https://your-domain.com/meu8/anime/ani/16498/1/audio=%22japanese%22?server=katana"

# Movie with Polish audio preference
vlc "https://your-domain.com/meu8/movie/550/audio=%22polish%22"

# TV show episode S01E01 with English audio
mpv "https://your-domain.com/meu8/tv/1399/1/1/audio=%22english%22"
```

---

### Download Endpoints

Stream downloadable MPEG-TS/MP4 video files directly:

```http
GET /api/download/anime/{ani|mal}/{id}/{episode}/audio="{language}"?quality={1080|720|480}&server={server}
GET /api/download/movie/{tmdb_id}/audio="{language}"?quality={1080|720|480}&server={server}
GET /api/download/tv/{tmdb_id}/{season}/{episode}/audio="{language}"?quality={1080|720|480}&server={server}
GET /api/download?anilistId={id}&episode={n}&audio=english
```

Also available at `/api/download/ani/{anilistId}/{episode}/{audio}` and `/api/download/mal/{malId}/{episode}/{audio}`.

---

### JSON Play & Metadata Endpoints

#### `GET /api/play` & `GET /api/anime/play`
Resolves anime stream manifests, all available servers (`sources`), audio tracks, subtitles, and skip timestamps:
```http
GET /api/anime/play?anilistId=16498&episode=1&audio=en
```
Add `&format=m3u8` to receive the proxied playlist directly instead of JSON.

#### `GET /api/movie/play`
Resolves movie metadata (via TMDB), all available Vidly sources, country-verified `audioTracks`, and subtitles:
```http
GET /api/movie/play?tmdb_id=550&audio=en
```

#### `GET /api/tv/play`
Resolves TV series & episode metadata (via TMDB), available Vidly sources, `audioTracks`, and subtitles:
```http
GET /api/tv/play?tmdb_id=1399&season=1&episode=1&audio=en
```

#### `POST /api/play`
Creates a playback ticket and returns stream metadata and skip timestamps:
```bash
curl -X POST https://your-domain.com/api/play \
  -H "Content-Type: application/json" \
  -d '{
    "anilistId": 16498,
    "episode": 1,
    "audio": "english",
    "server": "katana",
    "startAt": 0
  }'
```

#### Skip Times
```http
GET /api/anime/skip-times?malId=16498&episode=1&duration=1440
GET /api/anime/flow-skip-times?anilistId=16498&episode=1
```

---

## Usage Examples

### HTML iframe

```html
<!-- Anime (defaults to English Dub with Sub fallback) -->
<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 16px;">
  <iframe
    src='https://your-domain.com/embed/anime/ani/16498/1/audio="english"'
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
    allowfullscreen
    allow="autoplay; fullscreen; picture-in-picture"
  ></iframe>
</div>

<!-- Movie (TMDB 550) -->
<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 16px;">
  <iframe
    src='https://your-domain.com/embed/movie/550/audio="english"'
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
    allowfullscreen
    allow="autoplay; fullscreen; picture-in-picture"
  ></iframe>
</div>
```

### React / Next.js

```tsx
import React from "react";

interface MediaEmbedProps {
  mediaType?: "anime" | "movie" | "tv";
  id: number;
  season?: number;
  episode?: number;
  audio?: string;
  server?: string;
}

export function MediaPlayer({
  mediaType = "anime",
  id,
  season = 1,
  episode = 1,
  audio = "english",
  server,
}: MediaEmbedProps) {
  const basePath =
    mediaType === "movie"
      ? `/embed/movie/${id}/audio="${encodeURIComponent(audio)}"`
      : mediaType === "tv"
      ? `/embed/tv/${id}/${season}/${episode}/audio="${encodeURIComponent(audio)}"`
      : `/embed/anime/ani/${id}/${episode}/audio="${encodeURIComponent(audio)}"`;

  const src = server
    ? `https://your-domain.com${basePath}?server=${encodeURIComponent(server)}`
    : `https://your-domain.com${basePath}`;

  return (
    <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-2xl">
      <iframe
        src={src}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
```

### HTML5 `<video>` with HLS.js

```html
<video id="video" controls autoplay playsinline style="width: 100%; max-width: 800px; border-radius: 12px;"></video>

<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
<script>
  const video = document.getElementById("video");
  const streamUrl = "https://your-domain.com/meu8/anime/ani/16498/1";

  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(streamUrl);
    hls.attachMedia(video);
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = streamUrl;
  }
</script>
```

### `postMessage` Integration

The embedded player emits events to the parent window and accepts structured control commands.

Listening for events:
```javascript
window.addEventListener("message", (event) => {
  const payload = event.data;
  if (!payload) return;

  if (payload.type === "PLAYER_EVENT") {
    console.log("Player event:", payload.data);
  }

  if (payload.type === "watching-log") {
    console.log("Progress:", payload.currentTime, "/", payload.duration);
  }
});
```

Sending commands:
```javascript
const player = document.querySelector("#aniflow-player");

player.contentWindow?.postMessage({
  source: "aniembed",
  version: 1,
  type: "command",
  name: "seek",
  data: { time: 120 },
}, "*");
```

Supported commands: `play`, `pause`, `seek` (`{ time }`), `setVolume` (`{ volume }`), `setMuted` (`{ muted }`), `setPlaybackRate` (`{ rate }`), `setProvider` (`{ language, providerId }`), `getState` / `getStatus`.

---

## Project Structure

```text
aniflow-api/
├── app/
│   ├── api/
│   │   ├── anime/
│   │   │   ├── flow-skip-times/     # Re:ANIME OP/ED timestamps
│   │   │   ├── play/                # Anime Play API alias
│   │   │   └── skip-times/          # AniSkip integration with duration scaling
│   │   ├── download/                # Stream download routes (anime, movie, tv, ani, mal)
│   │   ├── m3u8/                    # API M3U8 routes (ani, mal, root)
│   │   ├── movie/play/              # Movie JSON/M3U8 Play API
│   │   ├── play/                    # Core anime stream resolver & ticket API
│   │   ├── progress/                # Playback progress endpoint
│   │   ├── proxy/                   # HLS manifest, segment, TS, key, and subtitle proxies
│   │   └── tv/play/                 # TV Show JSON/M3U8 Play API
│   ├── embed/
│   │   ├── ani/[anilistId]/         # Legacy AniList embeds
│   │   ├── anime/[...slug]/         # Unified Anime embed routes
│   │   ├── mal/[malId]/             # Legacy MAL embeds
│   │   ├── movie/[...slug]/         # Movie embed routes
│   │   ├── tv/[...slug]/            # TV Show embed routes
│   │   └── page.tsx                 # Ticket/query embed entry point
│   ├── m3u8/                        # Direct M3U8 aliases (anime, movie, tv, ani, mal)
│   ├── meu8/                        # Direct HLS playlists (anime, movie, tv, ani, mal)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                     # Documentation & live interactive playground
├── components/
│   ├── player/
│   │   ├── embed-page-client.tsx    # Client embed query/audio/server resolver
│   │   ├── embed-player.tsx         # Liquid glass HLS player & audio/server switcher
│   │   ├── subtitle-settings-dialog.tsx
│   │   └── player-core/             # AV sync guard & scoped subtitle helpers
│   └── ui/dialog.tsx
├── lib/
│   ├── aniembed-extractor.ts        # Yuri and Zuri extraction
│   ├── anime-extract/               # Additional extractors & decryptors
│   ├── anime-resolver.ts            # Unified anime resolution helpers
│   ├── aniskip.ts                   # AniSkip API client
│   ├── buzz.ts                      # Buzz extraction and proxy helpers
│   ├── episode-download.ts          # Direct stream remux/download helper
│   ├── media-service.ts             # Movie & TV playback and download orchestration
│   ├── reanime.ts                   # Flow and Kitty extraction
│   ├── route-utils.ts               # Slug parsing & audio normalization
│   ├── skip-times-adapter.ts        # Duration scaling for skip timestamps
│   ├── stream-proxy/media-buffer.ts # MPEG-TS / fMP4 / PNG-header inspection
│   ├── tmdb.ts                      # TMDB Movie & TV metadata client
│   └── vidly.ts                     # Vidly (Katana, Edge, Prism, Flux, Nimbus, Comet, Citadel) & language detection
├── shared/
│   └── validators.ts                # Public URL & SSRF validation
└── public/                          # Static assets & logos
```

---

## Getting Started

### Requirements

- [Node.js](https://nodejs.org/) 18.17.0 or newer
- `npm`, `yarn`, or `pnpm`

### Installation

```bash
git clone https://github.com/realmichaelstetson/AniFlow-API.git
cd AniFlow-API
npm install
```

Start the development server and open [http://localhost:3000](http://localhost:3000):

```bash
npm run dev
```

Build and run for production:

```bash
npm run build
npm run start
```

### Optional Proxy Environment Variables (Cloudflare Bypass on Datacenter Hosts)

If you deploy AniFlow on a cloud/VPS provider whose datacenter IP is flagged by Cloudflare (causing extra Movie/TV servers like `Prism`/`Nimbus`/`Comet`/`Citadel` or `Katana Multi` audio tracks to fail), configure one of the outbound bypass options supported by `lib/proxy-agent.ts` and `lib/vidly.ts`:

```env
# HTTP/HTTPS/SOCKS outbound residential proxy
OUTBOUND_PROXY_URL=http://user:pass@residential-proxy:port

# Or ScraperAPI / FlareSolverr Cloudflare solver
SCRAPER_API_KEY=your_scraperapi_key
FLARESOLVERR_URL=http://localhost:8191
```

---

## Docker

```dockerfile
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t aniflow-api .
docker run -p 3000:3000 aniflow-api
```

---

## Legal Notice

AniFlow is an open-source stream aggregator and playback client intended for educational and integration purposes. It does not host, store, or upload any video files or copyrighted media. All streams and metadata are resolved at request time from publicly reachable third-party sources.

Copyright claims and DMCA requests should be directed to the relevant upstream hosts.

---

## License

Released under the [MIT License](LICENSE).
