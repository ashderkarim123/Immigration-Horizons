import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { contact, whatsappLink } from "@/lib/content/site";

export function CtaBanner({
  title = "Ready to talk about your case?",
  body = "Book a free consultation and tell us about your background and goals. We will follow up by email or WhatsApp.",
  ctaLabel = "Book your free consultation",
}: {
  title?: string;
  body?: string;
  ctaLabel?: string;
}) {
  return (
    <section className="pb-20 sm:pb-28">
      <Container width="wide">
        <Reveal>
          <div className="rounded-panel bg-navy-800 relative overflow-hidden px-8 py-14 text-center sm:px-16 sm:py-20">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(201,153,46,0.18),transparent_60%)]"
            />
            <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-5">
              <h2 className="text-display-md sm:text-display-lg font-semibold text-white">
                {title}
              </h2>
              <p className="text-navy-200 text-lead text-pretty">{body}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-3">
                <Button href="/consultation" variant="gold" size="lg">
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
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
