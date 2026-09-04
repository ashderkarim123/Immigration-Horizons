/**
 * Renders the shared Open Graph / Twitter card to a static PNG in
 * `public/images/`. Run after editing `src/lib/seo/og-image.tsx`:
 *
 *   npm run og:generate
 *
 * The card is a committed asset rather than a live `opengraph-image` route
 * because Next only merges a file-convention image into pages that don't
 * declare their own `openGraph` object — and most marketing pages do, for
 * per-page titles. A static path referenced from a shared constant works
 * on every page regardless.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { renderOgImage } from "../src/lib/seo/og-image";
import { OG_IMAGE_FILE } from "../src/lib/seo/og";

async function main() {
  const response = renderOgImage();
  const buffer = Buffer.from(await response.arrayBuffer());

  const outDir = join(process.cwd(), "public", "images");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, OG_IMAGE_FILE);
  await writeFile(outPath, buffer);

  console.log(`Wrote ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
