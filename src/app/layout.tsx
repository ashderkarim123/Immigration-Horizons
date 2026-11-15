import type { Metadata } from "next";
import { DM_Serif_Display, Inter } from "next/font/google";

import { site } from "@/lib/content/site";
import "./globals.css";

/**
 * Document shell only (ADR-008 §3).
 *
 * Everything below this file is split into two applications by route
 * group: `(site)` is the public marketing website, `(app)` is the SaaS
 * case-management application. Each owns its own chrome and its own
 * metadata, so the portal no longer renders the marketing header, footer,
 * and WhatsApp button — which it did before this cycle, because they lived
 * here in the root layout.
 *
 * Route groups are URL-transparent: no public URL changed.
 */

// UI and body copy: modern, neutral, excellent at small sizes.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Display headings: an institutional serif carries the authority and
// trust an immigration practice needs, without reading as dated.
const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} | US Immigration Petition Specialists`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  icons: {
    icon: [
      { url: "/images/favicon.ico", sizes: "any" },
      { url: "/images/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/images/favicon-16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: "/images/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: "#164B3B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${dmSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-white">{children}</body>
    </html>
  );
}
