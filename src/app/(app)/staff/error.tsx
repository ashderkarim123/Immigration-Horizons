"use client";

import { useEffect } from "react";

import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";

/**
 * Staff-area error boundary. Shows a recoverable message and never the
 * underlying error text — an internal query failure must not surface
 * collection names or ids to the browser.
 */
export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[staff]", error);
  }, [error]);

  return (
    <Container width="prose" className="py-20 text-center sm:py-28">
      <h1 className="font-display text-navy-900 text-2xl font-semibold">Something went wrong</h1>
      <p className="text-ink-600 mt-3 text-[0.9375rem]">
        We couldn&apos;t load this page. Trying again usually resolves it.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <Button type="button" onClick={reset} variant="gold" size="sm">
          Try again
        </Button>
        <Button href="/staff" variant="outline" size="sm">
          Back to dashboard
        </Button>
      </div>
      {error.digest ? (
        <p className="text-ink-400 mt-6 font-mono text-xs">Reference: {error.digest}</p>
      ) : null}
    </Container>
  );
}
