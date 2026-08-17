import type { MetadataRoute } from "next";

// Next.js's file-based robots.txt convention. Best-effort only — real bots and scrapers ignore
// robots.txt outright — but it stops well-behaved crawlers from indexing /share/* pages (personal
// content meant for direct link sharing, not public search discovery) or wasting requests probing
// /workspace/* (auth-gated anyway, so a crawl there is just a bounce off the sign-in redirect).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: ["/share/", "/workspace/"],
    },
  };
}
