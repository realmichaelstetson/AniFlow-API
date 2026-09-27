import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://aniflow.org");

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "AniFlow API — High-Performance Anime Streaming & Embed API",
    template: "%s | AniFlow API",
  },
  description:
    "High-performance anime streaming and video embed API. Embed AniList and MyAnimeList episodes with multi-server failover (Flow, Yuri, Zuri), instant Sub/Dub audio switching, auto-skip intro/outro via AniSkip, edge-proxied HLS, and bidirectional postMessage events.",
  applicationName: "AniFlow API",
  authors: [
    {
      name: "Michael Stetson",
      url: "https://github.com/realmichaelstetson/AniFlow-API",
    },
  ],
  creator: "Michael Stetson",
  publisher: "AniFlow",
  keywords: [
    "anime api",
    "anime embed",
    "anime video player",
    "anime streaming api",
    "anilist api",
    "anilist embed",
    "anilist player",
    "myanimelist api",
    "myanimelist embed",
    "mal embed",
    "mal player",
    "hls player",
    "hls streaming",
    "m3u8 player",
    "aniskip",
    "auto skip anime intro",
    "anime stream iframe",
    "sub and dub anime player",
    "consumet alternative",
    "vidhawk alternative",
    "gogoanime api",
    "anime video aggregator",
    "react anime player",
    "nextjs anime player",
    "anime embed player",
    "aniflow",
    "aniflow api",
  ],
  category: "technology",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "AniFlow API",
    title: "AniFlow API — Stream Anime on Any Website",
    description:
      "High-performance AniList & MAL video player embeds. Multi-server streaming (Flow, Yuri, Zuri), instant Sub/Dub switching, auto-skip intro/outro, and bidirectional postMessage sync.",
    images: [
      {
        url: "/og-image.png",
        width: 512,
        height: 512,
        alt: "AniFlow API — Anime Streaming & Embed Player",
      },
      {
        url: "/icons/aniflow-512.png",
        width: 512,
        height: 512,
        alt: "AniFlow API Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AniFlow API — Stream Anime on Any Website",
    description:
      "High-performance anime streaming and embed API. Support for AniList & MAL IDs, multi-server routing, sub/dub switching, and AniSkip integration.",
    images: ["/og-image.png"],
    creator: "@realmichaelstetson",
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/manifest.webmanifest",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "AniFlow API",
      description:
        "High-performance anime streaming and video embed API with a modern player.",
      publisher: {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: "AniFlow",
        url: siteUrl,
        logo: {
          "@type": "ImageObject",
          url: `${siteUrl}/icons/aniflow-512.png`,
        },
      },
    },
    {
      "@type": "WebApplication",
      "@id": `${siteUrl}/#webapp`,
      name: "AniFlow API",
      url: siteUrl,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "All",
      browserRequirements: "Requires JavaScript. Requires HTML5 video support.",
      description:
        "High-performance anime streaming and embed API with AniList & MAL support, multi-server failover, sub/dub switching, and AniSkip auto-skip.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      featureList: [
        "AniList and MyAnimeList dual database mapping",
        "Multi-server streaming engine (Flow 1, Flow 2, Yuri, Zuri)",
        "Instant Sub and Dub audio switching",
        "AniSkip automatic intro and outro skipping",
        "Liquid glass dark minimalist video player",
        "Two-way postMessage communication and event synchronization",
        "Edge HLS proxying and video caching",
        "Mobile gestures and 16:9 landscape orientation lock",
      ],
    },
    {
      "@type": "FAQPage",
      "@id": `${siteUrl}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "How do I embed the AniFlow video player into my website?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Embedding AniFlow is as simple as inserting a standard HTML <iframe> element. For example: <iframe src=\"https://aniflow.org/embed/ani/16498/1/sub\" allow=\"autoplay; fullscreen; picture-in-picture\" />.",
          },
        },
        {
          "@type": "Question",
          name: "Does AniFlow API support both AniList and MyAnimeList (MAL) IDs?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes! AniFlow natively supports both AniList IDs (/embed/ani/:id/:ep/:audio) and MyAnimeList IDs (/embed/mal/:id/:ep/:audio) with automated metadata mapping.",
          },
        },
        {
          "@type": "Question",
          name: "How does the multi-server stream route engine work?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "AniFlow integrates 4 independent streaming providers: Flow 1 (primary engine), Flow 2 (backup mirror), Yuri (specialized extractor), and Zuri (dedicated subbed catalog) with automated failover.",
          },
        },
        {
          "@type": "Question",
          name: "How does automatic intro and outro skipping work with AniSkip?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "AniFlow queries the AniSkip database in real time to fetch precise millisecond timestamps for opening (OP) and ending (ED) sequences, displaying interactive markers on the timeline scrubber.",
          },
        },
        {
          "@type": "Question",
          name: "Can I synchronize watch time and receive playback events in my app?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. AniFlow features a bidirectional HTML5 postMessage bridge streaming real-time events (aniflow:time, aniflow:play, aniflow:pause, aniflow:complete) to your parent website.",
          },
        },
        {
          "@type": "Question",
          name: "Is AniFlow API open-source and ready for production deployment?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes, AniFlow is fully open-source under the MIT license, built with Next.js 14, TypeScript, Tailwind CSS, and HLS.js, ready for Docker or Vercel deployment.",
          },
        },
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark bg-black">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Product+Sans:wght@400;700&display=swap"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen bg-[#000000] text-white font-product-sans antialiased">
        {children}
      </body>
    </html>
  );
}
