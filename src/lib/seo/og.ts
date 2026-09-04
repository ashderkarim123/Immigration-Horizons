/**
 * Open Graph / Twitter card constants — no `next/og` import, so this is
 * safe to pull into page metadata. The PNG itself is generated from
 * `og-image.tsx` by `npm run og:generate` and committed to
 * `public/images/`.
 */
import { site } from "@/lib/content/site";

export const OG_IMAGE_FILE = "og-card.png";

export const OG_ALT =
  "Immigration Horizons — US immigration petition preparation";

export const OG_SIZE = { width: 1200, height: 630 } as const;

export const OG_IMAGE = {
  url: `/images/${OG_IMAGE_FILE}`,
  width: OG_SIZE.width,
  height: OG_SIZE.height,
  alt: OG_ALT,
} as const;

/**
 * Metadata is shallow-merged: a page that declares `openGraph` replaces
 * the layout's entirely, so every page spreads one of these to keep the
 * card image, site name and locale.
 */
export const baseOpenGraph = {
  type: "website" as const,
  siteName: site.name,
  locale: "en_US",
  images: [OG_IMAGE],
};

/** Same, for the long-form guide pages (`og:type: article`). */
export const articleOpenGraph = {
  ...baseOpenGraph,
  type: "article" as const,
};
