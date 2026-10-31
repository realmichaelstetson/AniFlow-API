<p align="center">
  <img src="public/logo.svg" alt="AniFlow Logo" width="100" height="100" />
</p>

<h1 align="center">AniFlow API</h1>

<p align="center">
  <strong>Stream Anime on Any Website — High-Performance Multi-Server Anime Streaming & Embed API</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14.2-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?style=for-the-badge&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-38bdf8?style=for-the-badge&logo=tailwindcss" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/HLS.js-1.5-orange?style=for-the-badge" alt="Hls.js" />
  <img src="https://img.shields.io/badge/License-MIT-emerald?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <a href="#-tags-topics--search-queries"><img src="https://img.shields.io/badge/Servers-Flow%20%7C%20Kitty%20%7C%20Yuri%20%7C%20Zuri%20%7C%20Buzz-blueviolet?style=flat-square" alt="Servers" /></a>
  <a href="#-tags-topics--search-queries"><img src="https://img.shields.io/badge/Features-autoskip%20%7C%20aniskip%20%7C%20postMessage%20%7C%20strict--dub-zinc?style=flat-square" alt="Features" /></a>
</p>

---

## 📖 Overview

**AniFlow API** is a production-grade, self-hostable anime embedding backend and modern streaming player. It allows developers to integrate high-performance anime playback into any website or application using a single iframe URL or lightweight REST endpoints.

Built for speed, reliability, and visual polish, AniFlow features:
- **5-Server Redundant Architecture** (`Flow`, `Kitty`, `Yuri`, `Zuri`, `Buzz`).
- **Direct HLS `.m3u8` Stream API**: Stream directly to VLC, mpv, ExoPlayer, AVPlayer, or HTML5 `<video>` via `/meu8/ani/...` and `/meu8/mal/...`.
- **Strict Dub Verification**: Eliminates silent Japanese fallbacks on English dub streams.
- **Episode Downloads**: Any episode as a single MP4 via `/api/download/ani/...` and `/api/download/mal/...`.
- **Dual ID Resolution**: Works seamlessly with both **AniList** (`/embed/ani/...`, `/meu8/ani/...`) and **MyAnimeList** (`/embed/mal/...`, `/meu8/mal/...`) IDs.
- **Adaptive Skip-Times Engine**: Dual-source OP/ED markers via Re:ANIME & AniSkip APIs with duration compensation.
- **Resilient Multilingual Subtitle Proxy**: Seamless track persistence across server switching.
- **Liquid Glass Dark Minimalist Player**: Crafted with the unified `shad-renew` aesthetic.
- **Two-Way `postMessage` Bus**: Bidirectional playback telemetry and remote iframe control.

---

## ⚡ Multi-Server Architecture

AniFlow intelligently routes and normalizes anime video streams across 5 dedicated servers, each optimized for stability and format support:

| Server | Upstream Provider | Audio Types | Highlights |
| :--- | :--- | :--- | :--- |
| **Flow** | Re:ANIME (HD-1) | `SUB`, `DUB` | Primary ultra-fast CDN stream with native Re:ANIME OP/ED skip timestamps. |
| **Kitty** | Re:ANIME (HD-2) | `SUB`, `DUB` | High-speed backup mirror with identical low-latency pipeline and skip support. |
| **Yuri** | AniEmbed Core | `SUB`, `DUB` | High-definition soft-sub extractor with up to 16 external subtitle languages. |
| **Zuri** | AniEmbed Zuna | `SUB` only | Specialized Japanese subbed backup engine. |
| **Buzz** | MegaPlay Buzz | `SUB`, `DUB` | Adaptive HLS engine routed via custom edge `.m3u8` proxy with dynamic key management. |

### 🛡️ Strict Dub Verification (Anti-Fallback Engine)
Many third-party providers silently fall back to raw Japanese audio when an English dub track does not exist for an episode. AniFlow intercepts this behavior at both the API and player levels:
- Audio streams are deeply inspected before presentation.
- If a provider makes a silent fallback to Japanese subbed audio, that server is excluded from the dub roster.
- For anime without any English dub releases, the Dub selector is safely disabled, and the player automatically routes to Sub with a notification.

---

## ✨ Player Capabilities

- **Liquid Glass `shad-renew` Design**:
  - Backdrop blur floating capsules, true inset borders, and minimal glow indicators.
  - Zero clutter: controls fade out cleanly during active playback.
- **Timeline OP/ED Markers & Auto-Skip**:
  - Highlights Opening (OP) and Ending (ED) segments directly on the timeline scrubber.
  - Automatically skips intros and outros when enabled, or offers instant 1-click skip buttons.
  - Powered by native Re:ANIME timestamps for Flow/Kitty, and AniSkip API with duration compensation for Yuri, Zuri, and Buzz.
- **Multilingual Subtitle Suite**:
  - Up to 16 languages (English, Spanish, French, German, Italian, Portuguese, Polish, Russian, etc.).
  - Subtitle persistence across server switches with real-time `/api/play` fallback resolution.
  - Subtitle styling customizer: font family (*Sans*, *Anime*, *Serif*, *Mono*), size, text color, background opacity, and outlines.
- **Audio & Video Enhancements**:
  - **Volume Booster**: Digital amplification up to `200%` using the Web Audio API.
  - **Speed Slider**: Fluid playback rates ranging from `0.25x` to `2.0x`.
  - **Resolution Selector**: HLS adaptive auto-bitrate or manual resolution pinning (`1080p`, `720p`, `480p`, `360p`).
- **Mobile Gestures & Landscape Lock**:
  - Smart tap toggles controls without glitching.
  - Double-tap left/right for $\pm 10\text{s}$ seeking.
  - Auto 16:9 fullscreen orientation locking on mobile browsers.

---

## 📡 Embed API Reference

### 1. Direct Embed URLs

Embed the player anywhere with zero configuration using standardized URL patterns:

#### AniList Pattern:
```http
GET /embed/ani/{anilistId}/{episode}/{audio}?server={server}
```

#### MyAnimeList (MAL) Pattern:
```http
GET /embed/mal/{malId}/{episode}/{audio}?server={server}
```

#### URL Path Parameters:
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `anilistId` / `malId` | `number` | **Yes** | Anime ID from AniList or MyAnimeList. |
| `episode` | `number` | **Yes** | Episode index (e.g. `1`, `12`). |
| `audio` | `string` | No | Audio preference: `sub` (default) or `dub`. |

#### Query Parameters:
| Query Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `server` | `string` | `flow` | Preferred server: `flow`, `kitty`, `yuri`, `zuri`, `buzz`. |
| `startAt` / `progress` | `number` | `0` | Start playback at $N$ seconds. |
| `autoskipIntro` | `1` \| `0` | `1` | Automatically skip opening themes (`1` = enabled, `0` = disabled). |
| `autoskipOutro` | `1` \| `0` | `1` | Automatically skip ending themes (`1` = enabled, `0` = disabled). |
| `parentHost` | `string` | *(auto)* | Explicit domain if parent frame enforces referer stripping. |

---

### 2. Direct HLS M3U8 Stream API (`/meu8/...`)

Stream anime directly into native HTML5 `<video>` tags, mobile apps (iOS AVPlayer, Android ExoPlayer), VLC, or mpv without using an iframe:

#### AniList M3U8 Pattern:
```http
GET /meu8/ani/{anilistId}/{episode}/{audio}?server={server}
```

#### MyAnimeList (MAL) M3U8 Pattern:
```http
GET /meu8/mal/{malId}/{episode}/{audio}?server={server}
```

#### CLI / Player Examples:
```bash
# Play Episode 1 English Dub directly in VLC or mpv:
vlc "https://your-domain.com/meu8/ani/16498/1/dub"

# Stream Episode 1 Japanese Sub with Yuri server:
mpv "https://your-domain.com/meu8/ani/16498/1/sub?server=yuri"

# Inspect headers using cURL:
curl -IL "https://your-domain.com/meu8/mal/16498/1/dub"
```

- **Manifest Response**: Returns a compliant `#EXTM3U` HLS manifest with header `Content-Type: application/vnd.apple.mpegurl`.
- **Audio & Server Selection**: Supports `:audio` path parameter (`sub` or `dub`) and `?server=` query parameter (`flow`, `kitty`, `yuri`, `zuri`, `buzz`).
- **Flexible Endpoints**: Also accessible via `/m3u8/ani/...`, `/m3u8/mal/...`, or query format `GET /api/play?anilistId=16498&episode=1&format=m3u8`.

---

### 3. Episode Download API (`/api/download/...`)

Downloads a whole episode as a single MP4 file. Segments are fetched in parallel through the stream proxy, AES-128 decrypted when needed, and remuxed (no re-encoding) by ffmpeg into a fragmented MP4 that streams straight to the client.

```http
GET /api/download/ani/{anilistId}/{episode}/{audio}?server={server}&quality={quality}
GET /api/download/mal/{malId}/{episode}/{audio}?server={server}&quality={quality}
GET /api/download?anilistId=16498&episode=1&audio=sub&server=flow
```

```bash
# Saves "Attack on Titan - E01 [SUB].mp4"
curl -OJ "https://your-domain.com/api/download/ani/16498/1/sub"

# 720p English dub from Buzz
curl -OJ "https://your-domain.com/api/download/mal/16498/1/dub?server=buzz&quality=720"
```

| Parameter | Values | Default | Description |
| :--- | :--- | :--- | :--- |
| `audio` | `sub`, `dub` | `sub` | Audio track to keep in the file. |
| `server` | `flow`, `kitty`, `yuri`, `zuri`, `buzz` | `flow` | Stream source. |
| `quality` | `1080`, `720`, `480` | best | Highest resolution to download. |

- **Response**: `video/mp4` with `Content-Disposition: attachment` and the anime title as filename, plus `X-Episode-Duration` (seconds) and `X-Episode-Resolution` headers. No `Content-Length` — the file is built while it streams.
- **ffmpeg**: Required on the host (`ffmpeg` on `PATH`, or `FFMPEG_PATH`). Flow and Kitty ship audio as a separate HLS rendition, which can only be merged with ffmpeg. Without ffmpeg, servers with muxed audio (Buzz, Yuri) fall back to a raw `.ts` file and Flow/Kitty return `501 FFMPEG_REQUIRED`.
- **Timing**: A 24-minute 1080p episode is roughly 0.5–1 GB and typically completes in 1–2 minutes.

---

### 4. REST API Endpoints

#### `GET /api/play`
Queries stream manifests, proxy URLs, and subtitle tracks:

```http
GET /api/play?anilistId=16498&episode=1&audio=sub&server=flow
```

Appending `&format=m3u8` instantly delivers the raw `.m3u8` playlist instead of JSON.

#### `POST /api/play`
Generates a streaming session ticket and extracts direct stream manifests with subtitles and skip times:

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

**JSON Response:**
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
Fetches OP/ED timestamps from AniSkip adjusted for target episode duration:
```http
GET /api/anime/skip-times?malId=16498&episode=1&duration=1440
```

#### `GET /api/anime/flow-skip-times`
Fetches Re:ANIME native skip markers for Flow & Kitty:
```http
GET /api/anime/flow-skip-times?anilistId=16498&episode=1
```

---

## 💻 Code Examples

### 1. Responsive HTML Iframe

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

---

### 2. React / Next.js Component

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

---

### 3. Direct HTML5 `<video>` with HLS.js

Stream raw `.m3u8` playlists directly without iframes using [Hls.js](https://github.com/video-dev/hls.js/) or native Safari/iOS HLS:

```html
<video id="video" controls autoplay playsinline style="width: 100%; max-width: 800px; border-radius: 12px;"></video>

<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script>
  const video = document.getElementById('video');
  const streamUrl = 'https://your-domain.com/meu8/ani/16498/1/sub';

  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(streamUrl);
    hls.attachMedia(video);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Native Safari / iOS HLS engine
    video.src = streamUrl;
  }
</script>
```

---

### 4. Bidirectional `postMessage` Integration

Communicate directly with the embedded player from the parent window.

#### Listen for Events:
```javascript
window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;

  // Real-time playback status events
  if (data.type === "PLAYER_EVENT") {
    console.log("Player Event:", data.data);
    // Payload: { type: "play" | "pause" | "time" | "complete" | "error", currentTime, duration }
  }

  // Periodic watch progress (~1s intervals)
  if (data.type === "watching-log") {
    console.log("Watch Progress:", data.currentTime, "/", data.duration);
  }
});
```

#### Dispatch Player Commands:
```javascript
const playerIframe = document.getElementById("aniflow-player");

// Control Playback
playerIframe.contentWindow.postMessage({ command: "play" }, "*");
playerIframe.contentWindow.postMessage({ command: "pause" }, "*");

// Seek to a specific timestamp (in seconds)
playerIframe.contentWindow.postMessage({ command: "seek", time: 120 }, "*");

// Request current playback status snapshot
playerIframe.contentWindow.postMessage({ command: "getStatus" }, "*");
```

---

## 📁 Project Structure

```
aniflow-api/
├── app/
│   ├── api/
│   │   ├── anime/
│   │   │   ├── flow-skip-times/ # Re:ANIME OP/ED skip extraction
│   │   │   └── skip-times/      # AniSkip integration with duration adjustment
│   │   ├── m3u8/                # Direct HLS stream aliases
│   │   ├── play/                # Core stream resolver & ticket factory
│   │   ├── progress/            # Playback tracking & telemetry endpoint
│   │   └── proxy/               # Edge HLS proxy (m3u8, segment, subtitles, key)
│   ├── embed/
│   │   ├── ani/[anilistId]/     # AniList-based embed routes
│   │   └── mal/[malId]/         # MyAnimeList-based embed routes
│   ├── meu8/
│   │   ├── ani/[anilistId]/     # AniList direct M3U8 streaming routes
│   │   └── mal/[malId]/         # MyAnimeList direct M3U8 streaming routes
│   ├── globals.css              # Global styles & theme definitions
│   ├── layout.tsx               # Root layout & site metadata
│   └── page.tsx                 # Documentation & interactive player hero
├── components/
│   └── player/
│       ├── embed-player.tsx     # Full-featured HLS streaming player
│       ├── embed-page-client.tsx# Standalone embed viewport wrapper
│       └── player-core/         # Player state & subtitle scoping helpers
├── lib/
│   ├── aniembed-extractor.ts    # Yuri & Zuri stream extraction engine
│   ├── aniskip.ts               # AniSkip client integration
│   ├── buzz.ts                  # Buzz (MegaPlay) extraction & proxy engine
│   ├── reanime.ts               # Flow & Kitty extraction engine
│   ├── skip-times-adapter.ts    # Skip time duration scaling & fallback logic
│   └── utils.ts                 # Utility & styling helper functions
├── shared/
│   └── validators.ts            # Input validation & schema definitions
├── public/                      # Static brand assets & logos
└── tailwind.config.ts           # Design system & color tokens
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (`v18.17.0` or higher)
- `npm`, `yarn`, or `pnpm`
- [ffmpeg](https://ffmpeg.org/) on `PATH` (only for `/api/download`)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/realmichaelstetson/AniFlow-API.git
   cd AniFlow-API
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

4. **Production Build**:
   ```bash
   npm run build
   npm run start
   ```

---

## ⚡ Deployment with Docker

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

## ⚖️ Legal & DMCA Disclaimer

AniFlow API is an open-source stream aggregator and playback client designed solely for educational and integration purposes. AniFlow **does not host, store, or upload** any video files or copyrighted media on its servers. All video streams and metadata are resolved dynamically from publicly available, third-party internet endpoints.

Any copyright claims or DMCA requests should be directed to the respective upstream media hosts.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
