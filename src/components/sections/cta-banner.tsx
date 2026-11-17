import { Button } from "@/components/ui/button";
import { Eyebrow, Section } from "@/components/ui/section";
import { contact, whatsappLink } from "@/lib/content/site";

/** Closing deep-forest section. Every page ends on it. */
export function CtaBanner({
  title = "Ready to talk about your case?",
  body = "Book a free consultation and tell us about your background and goals. We will follow up by email or WhatsApp.",
  ctaLabel = "Book a free consultation",
}: {
  title?: string;
  body?: string;
  ctaLabel?: string;
}) {
  return (
    <Section tone="navy" space="spacious">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
        <Eyebrow className="text-gold-200">Next step</Eyebrow>
        <h2 className="text-display-md sm:text-display-lg max-w-[20ch]">
          {title}
        </h2>
        <p className="text-lead text-pretty">{body}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-3">
          <Button href="/consultation" variant="onDark" size="lg">
            {ctaLabel}
          </Button>
          <Button
            href={whatsappLink(contact.whatsappPrimary)}
            variant="inverse"
            size="lg"
          >
            Chat on WhatsApp
          </Button>
        </div>
      </div>
    </Section>
  );
}
