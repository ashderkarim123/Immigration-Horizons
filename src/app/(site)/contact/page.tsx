import type { Metadata } from "next";
import { Clock, Mail, MessageCircle } from "lucide-react";

import { ContactForm } from "@/components/forms/contact-form";
import { Breadcrumbs } from "@/components/service/breadcrumbs";
import { JsonLd, breadcrumbSchema } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/section";
import { contact, whatsappLink } from "@/lib/content/site";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with Immigration Horizons by email or WhatsApp, or send us a message. We support clients worldwide across time zones.",
  alternates: { canonical: "/contact" },
  openGraph: {
    type: "website",
    title: "Contact Us | Immigration Horizons",
    description: "Reach us by email, WhatsApp, or the contact form.",
    url: "/contact",
  },
};

const trail = [
  { name: "Home", path: "/" },
  { name: "Contact", path: "/contact" },
];

const channels = [
  {
    icon: Mail,
    label: "Email",
    value: contact.email,
    href: `mailto:${contact.email}`,
  },
  {
    icon: MessageCircle,
    label: "WhatsApp",
    value: `+${contact.whatsappPrimary}`,
    href: whatsappLink(contact.whatsappPrimary),
  },
  {
    icon: MessageCircle,
    label: "WhatsApp (alternate)",
    value: `+${contact.whatsappSecondary}`,
    href: whatsappLink(contact.whatsappSecondary),
  },
];

export default function ContactPage() {
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
            <Eyebrow className="text-gold-300">Contact</Eyebrow>
            <h1 className="text-display-lg sm:text-display-xl mt-4 font-semibold text-white">
              Get in touch
            </h1>
            <p className="text-lead text-navy-200 mt-5 text-pretty">
              A general question, a quick query, or something about an existing
              case — reach us however suits you. For a full case review, the
              free consultation is the better starting point.
            </p>
          </div>
        </Container>
      </section>

      <Container width="wide" className="py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <aside className="flex flex-col gap-8 lg:sticky lg:top-36 lg:h-fit">
            <ul className="flex flex-col gap-4">
              {channels.map((channel) => (
                <li key={channel.label}>
                  <a
                    href={channel.href}
                    target={channel.href.startsWith("http") ? "_blank" : undefined}
                    rel={
                      channel.href.startsWith("http")
                        ? "noopener noreferrer"
                        : undefined
                    }
                    className="rounded-card border-ink-200 hover:border-navy-300 group flex items-center gap-4 border bg-white p-5 shadow-subtle transition-[border-color,box-shadow,transform] duration-300 hover:shadow-card motion-safe:hover:-translate-y-0.5"
                  >
                    <span
                      aria-hidden
                      className="bg-navy-50 text-navy-700 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    >
                      <channel.icon size={20} strokeWidth={1.75} />
                    </span>
                    <span>
                      <span className="text-ink-500 block font-sans text-xs tracking-wide uppercase">
                        {channel.label}
                      </span>
                      <span className="text-navy-800 block font-sans text-sm font-semibold">
                        {channel.value}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>

            <div className="rounded-card border-ink-200 flex items-start gap-3 border bg-ink-50 p-5">
              <Clock size={18} className="text-navy-600 mt-0.5 shrink-0" aria-hidden />
              <p className="text-ink-600 text-sm leading-relaxed">
                We work with clients across multiple time zones and reply as
                quickly as we can, usually within one business day.
              </p>
            </div>

            <div className="rounded-card bg-navy-900 flex flex-col gap-3 p-6">
              <p className="font-display text-base font-semibold text-white">
                Ready for a full case review?
              </p>
              <p className="text-navy-200 text-sm leading-relaxed">
                The free consultation is built for that — share your background
                and we&apos;ll assess your options.
              </p>
              <Button href="/consultation" variant="gold" size="sm" className="mt-1 w-fit">
                Book a free consultation
              </Button>
            </div>
          </aside>

          <div className="rounded-panel border-ink-200 relative overflow-hidden border bg-white p-6 shadow-card sm:p-9">
            <span aria-hidden className="bg-gold-500 absolute top-0 left-9 h-1 w-14 rounded-b-full" />
            <h2 className="font-display text-navy-800 text-xl font-semibold">
              Send us a message
            </h2>
            <p className="text-ink-600 mt-1.5 mb-6 text-sm">
              We&apos;ll reply by email. For anything time-sensitive, WhatsApp is
              fastest.
            </p>
            <ContactForm />
          </div>
        </div>
      </Container>
    </>
  );
}
