import type { MetadataRoute } from "next";

import { getPublishedBlogPosts } from "@/lib/blogs";
import { site } from "@/lib/content/site";
import { caseCategories, supportServices } from "@/lib/content/services";

/**
 * Date the marketing content was last meaningfully revised. Kept as a
 * hand-maintained constant on purpose: deriving `lastModified` from
 * `new Date()` rewrites every `<lastmod>` on every deploy, which trains
 * crawlers to discount the signal. Bump this when page copy changes; move
 * to per-page dates only once the content model actually carries them.
 */
const CONTENT_LAST_MODIFIED = "2026-09-04";

const staticRoutes = [
  { path: "", priority: 1 },
  { path: "/services", priority: 0.9 },
  { path: "/consultation", priority: 0.9 },
  { path: "/contact", priority: 0.8 },
  { path: "/about", priority: 0.7 },
  { path: "/reviews", priority: 0.6 },
  { path: "/faqs", priority: 0.6 },
  { path: "/resources", priority: 0.5 },
  { path: "/blog", priority: 0.5 },
  { path: "/privacy", priority: 0.2 },
  { path: "/terms", priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const blogRoutes = (await getPublishedBlogPosts()).map((post) => ({
    url: `${site.url}/blog/${post.slug}`,
    lastModified: post.updatedAt,
    priority: 0.7,
  }));
  const serviceRoutes = [
    ...caseCategories.map((c) => `/services/${c.slug}`),
    ...supportServices.map((s) => `/services/${s.slug}`),
  ].map((path) => ({
    url: `${site.url}${path}`,
    lastModified: CONTENT_LAST_MODIFIED,
    priority: 0.8,
  }));

  return [
    ...staticRoutes.map(({ path, priority }) => ({
      // No trailing slash on the root: matches the normalised canonical
      // and og:url Next emits for `/`.
      url: `${site.url}${path}`,
      lastModified: CONTENT_LAST_MODIFIED,
      priority,
    })),
    ...serviceRoutes,
    ...blogRoutes,
  ];
}
