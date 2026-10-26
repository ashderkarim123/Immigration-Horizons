import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CheckCircle2, MailWarning } from "lucide-react";

import { ThankYouTracker } from "@/components/forms/thank-you-tracker";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { HANDOFF_COOKIE } from "@/lib/auth/unverified-signup";

export const metadata: Metadata = {
  title: "Thank You",
  robots: { index: false, follow: false },
};

// Reads a per-visitor cookie, so this page is always rendered per request and never cached.
export const dynamic = "force-dynamic";

const NEXT_STEPS = [
  "We read the background and goals you shared.",
  "We reply by email with our honest view of the best next step.",
  "You can follow your request in your client portal.",
];

/**
 * Shown after the server accepts a consultation request. The page looks the same for everyone;
 * only the portal button differs. Someone whose email had no account yet carries a hand-off
 * cookie, and the button posts it to the portal host, which signs them in to the unverified
 * welcome screen (ADR-033). The token goes in a POST body, never in this page's URL, so it can
 * never reach analytics.
 */
export default async function ConsultationThankYouPage() {
  const handoff = (await cookies()).get(HANDOFF_COOKIE)?.value;
  const portalOrigin = (process.env.SITE_URL ?? "").replace(/\/$/, "");

  return (
    <Container width="default" className="py-16 sm:py-24">
      <ThankYouTracker formName="consultation" />
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        <CheckCircle2 className="text-gold-600" size={48} aria-hidden />
        <h1 className="font-display text-navy-900 mt-6 text-3xl font-semibold sm:text-4xl">Thank you, your consultation request is in</h1>

        <ol className="text-ink-700 mt-8 flex w-full flex-col gap-3 text-left text-[0.9375rem]">
          {NEXT_STEPS.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span aria-hidden className="bg-navy-50 text-navy-800 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>

        <div className="mt-10 w-full rounded-2xl border border-navy-200 bg-navy-50 p-6 text-left">
          <h2 className="text-navy-900 text-lg font-semibold">Your client portal</h2>
          {handoff ? (
            <div className="mt-2 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-ink-700">
              <MailWarning aria-hidden size={20} className="mt-0.5 shrink-0 text-amber-700" />
              <p>
                Your email isn&apos;t verified yet. Open the activation link we emailed you to unlock your cases, documents and messages.
              </p>
            </div>
          ) : (
            <p className="text-ink-600 mt-2 text-sm leading-relaxed">
              If you&apos;re new, check your email for a link to activate your client portal. If you already have an account, sign in below.
            </p>
          )}
          <div className="mt-4">
            {handoff ? (
              <form method="post" action={`${portalOrigin}/portal/welcome`}>
                <input type="hidden" name="token" value={handoff} />
                <Button type="submit" variant="gold">
                  Continue to your portal
                </Button>
              </form>
            ) : (
              <Button href={`${portalOrigin}/portal/login`} variant="gold" sameTab>
                Continue to your portal
              </Button>
            )}
          </div>
        </div>

        <Button href="/" variant="outline" className="mt-8">
          Back to the homepage
        </Button>
      </div>
    </Container>
  );
}
