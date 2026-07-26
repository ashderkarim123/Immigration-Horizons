import type { MetadataRoute } from "next";

import { site } from "@/lib/content/site";
import { caseCategories, supportServices } from "@/lib/content/services";

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

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const serviceRoutes = [
    ...caseCategories.map((c) => `/services/${c.slug}`),
    ...supportServices.map((s) => `/services/${s.slug}`),
  ].map((path) => ({
    url: `${site.url}${path}`,
    lastModified: now,
    priority: 0.8,
  }));

  return [
    ...staticRoutes.map(({ path, priority }) => ({
      url: `${site.url}${path}`,
      lastModified: now,
      priority,
    })),
    ...serviceRoutes,
  ];
}
