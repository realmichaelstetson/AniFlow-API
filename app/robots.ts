import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://api.aniflow.cc");

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/api/proxy/", "/api/play", "/api/progress", "/embed/"],
      },
      {
        userAgent: "Googlebot",
        allow: ["/"],
        disallow: ["/api/proxy/", "/api/play", "/api/progress", "/embed/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
