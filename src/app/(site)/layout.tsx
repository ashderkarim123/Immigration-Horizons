import type { Metadata } from "next";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { WhatsAppFab } from "@/components/layout/whatsapp-fab";
import { baseOpenGraph } from "@/lib/seo/og";

/**
 * Public marketing website chrome (ADR-008 §3). This is the only one of
 * the two applications that participates in organic search; its metadata,
 * canonical URLs, structured data, and sitemap behaviour are unchanged by
 * the split — the header and footer simply moved down one level from the
 * root layout so the SaaS application no longer inherits them.
 */

/**
 * Open Graph / Twitter defaults for every marketing page, scoped to
 * `(site)` so the SaaS shell keeps no social presence. Metadata is
 * shallow-merged, so a page that needs a different `og:type` (the
 * long-form guides) must spread `articleOpenGraph` to keep the image —
 * a bare page inherits everything here.
 */
export const metadata: Metadata = {
  openGraph: baseOpenGraph,
  twitter: {
    card: "summary_large_image",
    images: [baseOpenGraph.images[0].url],
  },
};
export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Header />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <WhatsAppFab />
    </>
  );
}
