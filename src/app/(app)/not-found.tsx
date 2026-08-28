import Link from "next/link";

import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";

/**
 * SaaS 404 (ADR-008 §3). Without this, a miss inside the app falls through
 * to the root `not-found.tsx`, which is marketing copy — service links,
 * WhatsApp, "book a consultation" — none of which belongs in a signed-in
 * case-management context.
 *
 * Next injects its own `<meta name="robots">` on not-found, so this file
 * deliberately declares no metadata of its own; the app host's
 * `X-Robots-Tag` header and blanket robots.txt cover it either way.
 */
export default function AppNotFound() {
  return (
    <Container width="prose" className="py-24 text-center sm:py-32">
      <p className="text-ink-500 font-sans text-sm font-semibold tracking-wide uppercase">
        404
      </p>
      <h1 className="font-display text-navy-900 mt-3 text-2xl font-semibold sm:text-3xl">
        We couldn&apos;t find that page
      </h1>
      <p className="text-ink-600 mt-3 text-[0.9375rem]">
        The link may be out of date, or the case or document may no longer be
        shared with you.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button href="/portal" variant="gold" size="sm">
          Back to your dashboard
        </Button>
        <Link
          href="/portal/queries/new"
          className="text-navy-700 text-sm font-semibold hover:underline"
        >
          Ask our team a question
        </Link>
      </div>
    </Container>
  );
}
