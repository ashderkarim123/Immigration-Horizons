import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { WhatsAppFab } from "@/components/layout/whatsapp-fab";

/**
 * Public marketing website chrome (ADR-008 §3). This is the only one of
 * the two applications that participates in organic search; its metadata,
 * canonical URLs, structured data, and sitemap behaviour are unchanged by
 * the split — the header and footer simply moved down one level from the
 * root layout so the SaaS application no longer inherits them.
 */
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
