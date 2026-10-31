<p align="center">
  <img src="public/logo.svg" alt="AniFlow Logo" width="100" height="100" />
</p>

<h1 align="center">AniFlow API</h1>

<p align="center">
  Self-hostable anime embed API and HLS player. Pass an AniList or MAL ID, get a working stream.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14.2-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?style=for-the-badge&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-38bdf8?style=for-the-badge&logo=tailwindcss" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/HLS.js-1.5-orange?style=for-the-badge" alt="Hls.js" />
  <img src="https://img.shields.io/badge/License-MIT-emerald?style=for-the-badge" alt="License" />
</p>

---

## Overview

AniFlow is a self-hostable backend and player for embedding anime on your own site or app. You can drop in a single iframe, call the REST API, or point any HLS-capable player at a plain `.m3u8` URL.

Key points:

- **Five servers** (`Flow`, `Kitty`, `Yuri`, `Zuri`, `Buzz`) with per-request server selection.
- **Direct HLS endpoints** at `/meu8/ani/...` and `/meu8/mal/...`, usable from VLC, mpv, ExoPlayer, AVPlayer or a plain `<video>` tag.
- **Dub verification.** Servers that silently fall back to Japanese audio are excluded from the dub list.
- **AniList and MyAnimeList IDs** are both supported (`/embed/ani/...`, `/embed/mal/...`).
- **Intro/outro skipping** using Re:ANIME timestamps and the AniSkip API, adjusted for episode duration.
- **Subtitle proxy** with up to 16 languages. The selected track persists when you switch servers.
- **Dark, minimal player** with a two-way `postMessage` interface for telemetry and remote control.

---

## Servers

| Server | Upstream | Audio | Notes |
| :--- | :--- | :--- | :--- |
| **Flow** | Re:ANIME (HD-1) | `SUB`, `DUB` | Primary server. Uses Re:ANIME's own OP/ED timestamps. |
| **Kitty** | Re:ANIME (HD-2) | `SUB`, `DUB` | Backup mirror for Flow, with the same skip-time support. |
| **Yuri** | AniEmbed Core | `SUB`, `DUB` | Soft subtitles, up to 16 external languages. |
| **Zuri** | AniEmbed Zuna | `SUB` only | Japanese-audio backup. |
| **Buzz** | MegaPlay Buzz | `SUB`, `DUB` | Served through the edge `.m3u8` proxy, with key handling. |

### Dub verification

Some providers return the original Japanese audio when an English dub doesn't exist for an episode, without any indication. AniFlow checks for this at both the API and player level:

- Audio streams are inspected before they are returned.
- A server that falls back to Japanese audio is left out of the dub list.
- If an anime has no English dub at all, the Dub option is disabled and the player switches to Sub with a notification.

---

## Player

- **Interface:** blurred floating controls and a minimal layout. Controls hide during playback.
- **Skip intro/outro:** OP and ED segments are marked on the timeline. Skipping can be automatic or triggered with a button. Flow and Kitty use native Re:ANIME timestamps; Yuri, Zuri and Buzz use AniSkip with duration compensation.
- **Subtitles:** up to 16 languages (English, Spanish, French, German, Italian, Portuguese, Polish, Russian and more). The chosen track carries over when you change servers. Font (Sans, Anime, Serif, Mono), size, color, background opacity and outline are adjustable.
- **Audio and video:**
  - Volume boost up to 200% via the Web Audio API.
  - Playback speed from 0.25x to 2.0x.
  - Adaptive bitrate, or a fixed resolution (1080p, 720p, 480p, 360p).
- **Mobile:** tap to toggle controls, double-tap left or right to seek ±10 s, and automatic landscape lock in fullscreen.

---

## API Reference

### Embed URLs

AniList:
```http
GET /embed/ani/{anilistId}/{episode}/{audio}?server={server}
```

MyAnimeList:
```http
GET /embed/mal/{malId}/{episode}/{audio}?server={server}
```

**Path parameters**

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `anilistId` / `malId` | `number` | Yes | Anime ID from AniList or MyAnimeList. |
| `episode` | `number` | Yes | Episode number (e.g. `1`, `12`). |
| `audio` | `string` | No | `sub` (default) or `dub`. |

**Query parameters**

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `server` | `string` | `flow` | One of `flow`, `kitty`, `yuri`, `zuri`, `buzz`. |
| `startAt` / `progress` | `number` | `0` | Start playback at this offset, in seconds. |
| `autoskipIntro` | `1` \| `0` | `1` | Skip opening themes automatically. |
| `autoskipOutro` | `1` \| `0` | `1` | Skip ending themes automatically. |
| `parentHost` | `string` | auto | Parent domain, for cases where the referer is stripped. |

---

### Direct HLS streams

Use these endpoints to stream without an iframe, in a `<video>` tag, a mobile app, VLC or mpv.

AniList:
```http
GET /meu8/ani/{anilistId}/{episode}/{audio}?server={server}
```

MyAnimeList:
```http
GET /meu8/mal/{malId}/{episode}/{audio}?server={server}
```

Examples:
```bash
# English dub, episode 1, in VLC
vlc "https://your-domain.com/meu8/ani/16498/1/dub"

# Japanese sub, episode 1, using the Yuri server, in mpv
mpv "https://your-domain.com/meu8/ani/16498/1/sub?server=yuri"

# Inspect the response headers
curl -IL "https://your-domain.com/meu8/mal/16498/1/dub"
```

- The response is an `#EXTM3U` manifest with `Content-Type: application/vnd.apple.mpegurl`.
- `audio` (`sub` or `dub`) goes in the path, and `server` in the query string.
- The same streams are also available at `/m3u8/ani/...` and `/m3u8/mal/...`, or via `GET /api/play?anilistId=16498&episode=1&format=m3u8`.

---

### REST endpoints

#### `GET /api/play`

Returns stream manifests, proxy URLs and subtitle tracks as JSON.

```http
GET /api/play?anilistId=16498&episode=1&audio=sub&server=flow
```

Add `&format=m3u8` to get the raw playlist instead of JSON.

#### `POST /api/play`

Creates a playback ticket and returns the stream, subtitles and skip times.

```bash
curl -X POST https://your-domain.com/api/play \
  -H "Content-Type: application/json" \
  -d '{
    "anilistId": 16498,
    "episode": 1,
    "audio": "sub",
    "server": "flow",
    "startAt": 0
  }'
```

Response:
```json
{
  "success": true,
  "ticket": "9f8a3d1b-...",
  "embedUrl": "https://your-domain.com/embed?t=9f8a3d1b-...",
  "stream": {
    "url": "https://your-domain.com/api/proxy/m3u8?url=...",
    "format": "hls",
    "server": "flow",
    "audio": "sub",
    "subtitles": [
      { "language": "English", "url": "https://your-domain.com/api/proxy/subtitles?url=..." }
    ],
    "skipTimes": {
      "intro": { "start": 90, "end": 180 },
      "outro": { "start": 1320, "end": 1410 }
    }
  }
}
```

#### `GET /api/anime/skip-times`

Returns OP/ED timestamps from AniSkip, scaled to the given episode duration.

```http
GET /api/anime/skip-times?malId=16498&episode=1&duration=1440
```

#### `GET /api/anime/flow-skip-times`

Returns Re:ANIME's native skip markers, used by Flow and Kitty.

```http
GET /api/anime/flow-skip-times?anilistId=16498&episode=1
```

---

## Usage Examples

### HTML iframe

```html
<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 16px;">
  <iframe
    src="https://your-domain.com/embed/ani/16498/1/sub?server=flow&autoskipIntro=1"
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
    allowfullscreen
    allow="autoplay; fullscreen; picture-in-picture"
  ></iframe>
</div>
```

### React / Next.js

```tsx
import React from "react";

interface AnimePlayerProps {
  anilistId: number;
  episode?: number;
  audio?: "sub" | "dub";
  server?: "flow" | "kitty" | "yuri" | "zuri" | "buzz";
  autoSkip?: boolean;
}

export function AnimePlayer({
  anilistId,
  episode = 1,
  audio = "sub",
  server = "flow",
  autoSkip = true,
}: AnimePlayerProps) {
  const embedUrl = `https://your-domain.com/embed/ani/${anilistId}/${episode}/${audio}?server=${server}&autoskipIntro=${autoSkip ? 1 : 0}`;

  return (
    <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-2xl">
      <iframe
        src={embedUrl}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
```

### HTML5 `<video>` with HLS.js

Load a raw playlist without an iframe, using [hls.js](https://github.com/video-dev/hls.js/) or the native HLS support in Safari and iOS:

```html
<video id="video" controls autoplay playsinline style="width: 100%; max-width: 800px; border-radius: 12px;"></video>

<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
<script>
  const video = document.getElementById('video');
  const streamUrl = 'https://your-domain.com/meu8/ani/16498/1/sub';

  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(streamUrl);
    hls.attachMedia(video);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Native HLS (Safari / iOS)
    video.src = streamUrl;
  }
</script>
```

### `postMessage` integration

The embedded player sends events to the parent window and accepts commands from it.

Listening for events:
```javascript
window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;

  // Playback state changes
  if (data.type === "PLAYER_EVENT") {
    console.log("Player event:", data.data);
    // Payload: { type: "play" | "pause" | "time" | "complete" | "error", currentTime, duration }
  }

  // Watch progress, roughly once per second
  if (data.type === "watching-log") {
    console.log("Progress:", data.currentTime, "/", data.duration);
  }
});
```

Sending commands:
```javascript
const playerIframe = document.getElementById("aniflow-player");

playerIframe.contentWindow.postMessage({ command: "play" }, "*");
playerIframe.contentWindow.postMessage({ command: "pause" }, "*");

// Seek to a position, in seconds
playerIframe.contentWindow.postMessage({ command: "seek", time: 120 }, "*");

// Request a snapshot of the current playback state
playerIframe.contentWindow.postMessage({ command: "getStatus" }, "*");
```

---

## Project Structure

```
aniflow-api/
├── app/
│   ├── api/
│   │   ├── anime/
│   │   │   ├── flow-skip-times/  # Re:ANIME OP/ED skip extraction
│   │   │   └── skip-times/       # AniSkip integration with duration adjustment
│   │   ├── m3u8/                 # Direct HLS stream aliases
│   │   ├── play/                 # Stream resolver and ticket creation
│   │   ├── progress/             # Playback progress tracking
│   │   └── proxy/                # HLS proxy (m3u8, segments, subtitles, keys)
│   ├── embed/
│   │   ├── ani/[anilistId]/      # AniList embed routes
│   │   └── mal/[malId]/          # MyAnimeList embed routes
│   ├── meu8/
│   │   ├── ani/[anilistId]/      # AniList direct M3U8 routes
│   │   └── mal/[malId]/          # MyAnimeList direct M3U8 routes
│   ├── globals.css               # Global styles and theme
│   ├── layout.tsx                # Root layout and site metadata
│   └── page.tsx                  # Documentation page with demo player
├── components/
│   └── player/
│       ├── embed-player.tsx      # HLS player
│       ├── embed-page-client.tsx # Embed page wrapper
│       └── player-core/          # Player state and subtitle helpers
├── lib/
│   ├── aniembed-extractor.ts     # Yuri and Zuri extraction
│   ├── aniskip.ts                # AniSkip client
│   ├── buzz.ts                   # Buzz (MegaPlay) extraction and proxying
│   ├── reanime.ts                # Flow and Kitty extraction
│   ├── skip-times-adapter.ts     # Skip-time scaling and fallback logic
│   └── utils.ts                  # Shared helpers
├── shared/
│   └── validators.ts             # Input validation and schemas
├── public/                       # Static assets and logos
└── tailwind.config.ts            # Design tokens
```

---

## Getting Started

### Requirements

- [Node.js](https://nodejs.org/) 18.17.0 or newer
- `npm`, `yarn` or `pnpm`

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

AniFlow is an open-source stream aggregator and playback client intended for educational and integration purposes. It does not host, store or upload any video files or copyrighted media. All streams and metadata are resolved at request time from third-party sources that are publicly reachable.

Copyright claims and DMCA requests should be sent to the relevant upstream hosts.

---

## License

Released under the [MIT License](LICENSE).
