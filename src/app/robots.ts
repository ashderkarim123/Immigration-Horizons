import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { site } from "@/lib/content/site";
import { classifyHost } from "@/lib/hosts";

/**
 * Host-aware robots (ADR-008 §5).
 *
 * Only the public marketing site participates in organic search. The SaaS
 * host serves a blanket disallow instead — one host, one answer, rather
 * than relying on per-page metadata alone.
 *
 * `headers()` makes this route dynamic, which is correct: the response
 * genuinely differs per host and must not be cached across them.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const headerList = await headers();
  const kind = classifyHost(headerList.get("x-forwarded-host") ?? headerList.get("host"));

  if (kind === "app" || kind === "admin") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Defence in depth for the single-host case (local dev, or a
      // misconfigured proxy that never sets the app host): the SaaS
      // surface is never a crawl target on the public host either.
      disallow: ["/portal", "/portal/", "/api/portal"],
    },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
