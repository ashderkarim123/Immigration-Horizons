import { ImageResponse } from "next/og";

import { site } from "@/lib/content/site";
import { OG_SIZE } from "@/lib/seo/og";

/**
 * The shared Open Graph / Twitter card. Rendered to a static PNG by
 * `npm run og:generate` (see `scripts/generateOgImage.tsx`) rather than
 * served as a live route — see `og.ts` for why.
 *
 * Typographic on purpose: a 1200x630 card has to stay legible as a phone
 * thumbnail, and the brand argument here is "verifiable, not decorative".
 * `next/og` ships a single Geist weight, so hierarchy comes from size and
 * colour, not font-weight.
 */

const NAVY = "#152c54";
const NAVY_DEEP = "#0f1f3d";
const GOLD = "#c9992e";
const GOLD_LIGHT = "#e4c46f";
const NAVY_200 = "#c6d5e9";

export function renderOgImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          backgroundColor: NAVY,
          backgroundImage: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
          color: "#ffffff",
          fontFamily: "Geist, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              backgroundColor: GOLD,
              borderRadius: "8px",
            }}
          />
          <div
            style={{ fontSize: "32px", letterSpacing: "0.14em", color: NAVY_200 }}
          >
            {site.name.toUpperCase()}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ fontSize: "68px", lineHeight: 1.1, maxWidth: "900px" }}>
            US immigration petition preparation
          </div>
          <div
            style={{ fontSize: "34px", color: GOLD_LIGHT, maxWidth: "940px" }}
          >
            EB-2 NIW · EB-1A · EB-1B · EB-1C · O-1 · RFE responses
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: "24px",
            color: NAVY_200,
            borderTop: `2px solid ${GOLD}`,
            paddingTop: "28px",
          }}
        >
          An immigration consulting and paralegal services practice — not a law
          firm.
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
