import type { Metadata } from "next";
import { CheckCircle2, MessageCircle } from "lucide-react";

import { ThankYouTracker } from "@/components/forms/thank-you-tracker";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { contact, whatsappLink } from "@/lib/content/site";

// A confirmation page is not a search destination, and it is absent from the sitemap.
export const metadata: Metadata = {
  title: "Thank You",
  robots: { index: false, follow: false },
};

export default function ContactThankYouPage() {
  return (
    <Container width="default" className="py-16 sm:py-24">
      <ThankYouTracker formName="contact" />
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        <CheckCircle2 className="text-gold-600" size={48} aria-hidden />
        <h1 className="font-display text-navy-900 mt-6 text-3xl font-semibold sm:text-4xl">Thank you, we&apos;ve received your message</h1>
        <p className="text-ink-600 mt-4 text-[1.0625rem] leading-relaxed">
          We&apos;ll reply by email. For anything time-sensitive, WhatsApp is the fastest way to reach us.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button href="/" variant="primary">
            Back to the homepage
          </Button>
          <Button href={whatsappLink(contact.whatsappPrimary)} variant="outline">
            <MessageCircle size={16} aria-hidden />
            Message us on WhatsApp
          </Button>
        </div>
      </div>
    </Container>
  );
}
