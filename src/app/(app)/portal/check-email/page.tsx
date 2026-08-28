import type { Metadata } from "next";
import { MailCheck } from "lucide-react";

import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Check Your Email",
  robots: { index: false, follow: false },
};

export default function PortalCheckEmailPage() {
  return (
    <Container width="default" className="py-16 sm:py-24">
      <div className="mx-auto max-w-md text-center">
        <span
          aria-hidden
          className="bg-navy-50 text-navy-700 mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full"
        >
          <MailCheck size={26} strokeWidth={1.75} />
        </span>
        <h1 className="font-display text-navy-900 mt-6 text-2xl font-semibold sm:text-3xl">
          Check your email
        </h1>
        <p className="text-ink-600 mt-3 text-[0.9375rem] leading-relaxed">
          Your consultation request has been received. We&apos;ve also sent
          you an email with a link to activate your client portal account,
          where you&apos;ll be able to track your consultation.
        </p>
        <p className="text-ink-500 mt-4 text-sm">
          Didn&apos;t get an email? Check your spam folder, or reach us
          directly and we&apos;ll help you get set up.
        </p>
      </div>
    </Container>
  );
}
