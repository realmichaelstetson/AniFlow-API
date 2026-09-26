import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VidHawk — Seamless Anime Embedding API",
  description:
    "High-performance AniList & MAL anime embeds for developers. Flow and Zuri servers, Sub/Dub switching, edge-proxied HLS, and postMessage sync.",
  icons: {
    icon: "/favicon.ico",
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
