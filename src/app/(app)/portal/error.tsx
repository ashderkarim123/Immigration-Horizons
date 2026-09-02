"use client";

import { useEffect } from "react";

import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";

/**
 * Portal error boundary.
 *
 * Never renders `error.message`. A failure inside a portal page happens
 * while holding a client's own case data, and Mongo/driver errors quote
 * collection names, field names, and sometimes the offending value — none
 * of which belongs in a browser. The digest is shown instead: it is a
 * random id that means something in the server log and nothing to anyone
 * who reads it here.
 *
 * The copy avoids implying the client did something wrong, and offers the
 * two things that actually help: retry, or go somewhere that works.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[portal]", error);
  }, [error]);

  return (
    <Container width="prose" className="py-20 text-center sm:py-28">
      <h1 className="font-display text-navy-900 text-2xl font-semibold">
        We couldn&apos;t load this page
      </h1>
      <p className="text-ink-600 mt-3 text-[0.9375rem]">
        Something went wrong on our side — nothing you did caused it, and nothing in your case has
        been affected. Trying again usually resolves it.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={reset} variant="gold" size="sm">
          Try again
        </Button>
        <Button href="/portal" variant="outline" size="sm">
          Back to your dashboard
        </Button>
      </div>
      {error.digest ? (
        <p className="text-ink-400 mt-6 font-mono text-xs">
          Reference: {error.digest} — quote this if you contact us.
        </p>
      ) : null}
    </Container>
  );
}
