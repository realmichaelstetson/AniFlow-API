import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AniFlow API — High-Performance Anime Embedding API & Player",
  description:
    "Developer-first AniList & MAL anime embedding API. Flow, Yuri & Zuri servers, Sub/Dub switching, edge-proxied HLS, and postMessage event sync.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark bg-black">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Product+Sans:wght@400;700&display=swap"
        />
      </head>
      <body className="min-h-screen bg-[#000000] text-white font-product-sans antialiased">
        {children}
      </body>
    </html>
  );
}
