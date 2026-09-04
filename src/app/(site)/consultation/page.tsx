import type { Metadata } from "next";
import { CalendarCheck, Clock, MessageCircle, ShieldCheck } from "lucide-react";

import { ConsultationForm } from "@/components/forms/consultation-form";
import { Breadcrumbs } from "@/components/service/breadcrumbs";
import { JsonLd, breadcrumbSchema } from "@/components/seo/json-ld";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/section";
import { allServices } from "@/lib/content/services";
import { contact, stats, whatsappLink } from "@/lib/content/site";
import { baseOpenGraph } from "@/lib/seo/og";

export const metadata: Metadata = {
  title: "Book a Free Consultation",
  description:
    "Book a free consultation for your EB-2 NIW, EB-1A, EB-1B, EB-1C or O-1 petition — we'll assess which route your profile actually supports.",
  alternates: { canonical: "/consultation" },
  openGraph: {
    ...baseOpenGraph,
    title: "Book a Free Consultation | Immigration Horizons",
    description:
      "Tell us about your background and goals. We'll assess which employment-based route your profile supports — honestly, before you commit to anything.",
    url: "/consultation",
  },
};

const TRACKING_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
] as const;

const assurances = [
  {
    icon: ShieldCheck,
    title: "An honest assessment",
    body: "If your profile doesn't yet support the category you're asking about, we'll tell you — before you spend anything.",
  },
  {
    icon: CalendarCheck,
    title: "No obligation",
    body: "The consultation is free and there's no commitment to engage us afterwards.",
  },
  {
    icon: Clock,
    title: "We work across time zones",
    body: `${stats.casesHandled} cases handled for clients worldwide. We reply by email or WhatsApp.`,
  },
];

const trail = [
  { name: "Home", path: "/" },
  { name: "Book a Consultation", path: "/consultation" },
];

export default async function ConsultationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  // Match a ?service= slug or name to a real service so the dropdown pre-fills.
  const serviceParam = first(params.service);
  const matched = allServices.find(
    (s) => s.slug === serviceParam || s.name === serviceParam,
  );

  const tracking: Record<string, string> = {};
  for (const key of TRACKING_KEYS) {
    const value = first(params[key]);
    if (value) tracking[key] = value;
  }

  return (
    <>
      <JsonLd data={breadcrumbSchema(trail)} />

      <section className="bg-navy-950 relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(201,153,46,0.15),transparent_58%)]"
        />
        <Container width="wide" className="relative py-14 sm:py-16">
          <Breadcrumbs trail={trail} tone="dark" className="mb-8" />
          <div className="max-w-2xl">
            <Eyebrow className="text-gold-300">Free consultation</Eyebrow>
            <h1 className="text-display-lg sm:text-display-xl mt-4 font-semibold text-white">
              Tell us about your case
            </h1>
            <p className="text-lead text-navy-200 mt-5 text-pretty">
              Share your background and goals. We&apos;ll tell you which
              employment-based route your profile genuinely supports — and if
              it&apos;s not ready yet, we&apos;ll tell you that too.
            </p>
          </div>
        </Container>
      </section>

      <Container width="wide" className="py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_0.7fr] lg:gap-16">
          <div className="rounded-panel border-ink-200 relative overflow-hidden border bg-white p-6 shadow-card sm:p-9">
            <span aria-hidden className="bg-gold-500 absolute top-0 left-9 h-1 w-14 rounded-b-full" />
            <ConsultationForm
              defaultService={matched?.name}
              tracking={tracking}
            />
          </div>

          <aside className="flex flex-col gap-8 lg:sticky lg:top-36 lg:h-fit">
            <ul className="flex flex-col gap-6">
              {assurances.map((item) => (
                <li key={item.title} className="flex gap-4">
                  <span
                    aria-hidden
                    className="bg-navy-50 text-navy-700 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  >
                    <item.icon size={20} strokeWidth={1.75} />
                  </span>
                  <div>
                    <h2 className="font-display text-navy-800 text-base font-semibold">
                      {item.title}
                    </h2>
                    <p className="text-ink-600 mt-1 text-sm leading-relaxed">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="rounded-card bg-navy-900 flex flex-col gap-3 p-6">
              <p className="font-display text-base font-semibold text-white">
                Prefer to message us directly?
              </p>
              <p className="text-navy-200 text-sm leading-relaxed">
                Reach us on WhatsApp or by email — whichever is easier for you.
              </p>
              <div className="mt-1 flex flex-col gap-2.5">
                <a
                  href={whatsappLink(contact.whatsappPrimary)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-300 inline-flex items-center gap-2 font-sans text-sm font-semibold hover:text-gold-200"
                >
                  <MessageCircle size={15} aria-hidden />+{contact.whatsappPrimary}
                </a>
                <a
                  href={`mailto:${contact.email}`}
                  className="text-navy-200 inline-flex items-center gap-2 font-sans text-sm hover:text-white"
                >
                  {contact.email}
                </a>
              </div>
            </div>
          </aside>
        </div>
      </Container>
    </>
  );
}
