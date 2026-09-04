import Image from "next/image";
import Link from "next/link";
import { ArrowRight, LockKeyhole, Mail, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { footerNav, legalNav } from "@/lib/content/navigation";
import { contact, site, social, whatsappLink } from "@/lib/content/site";

const externalProfiles = [
  { label: "Fiverr Profile", href: social.fiverrProfile },
  { label: "Upwork Profile", href: social.upworkProfile },
];

export function Footer() {
  return (
    <footer className="bg-navy-950 text-navy-200 relative mt-auto overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_15%_10%,rgba(201,153,46,0.22),transparent_24rem),radial-gradient(circle_at_90%_100%,rgba(68,100,152,0.25),transparent_28rem)]"
      />
      <Container width="wide" className="relative pt-12 sm:pt-16">
        <div className="rounded-panel border border-white/12 bg-white/[0.06] p-7 shadow-[0_24px_70px_rgba(0,0,0,0.18)] backdrop-blur-sm sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-9">
          <div className="max-w-2xl">
            <p className="text-gold-300 text-xs font-bold tracking-[0.15em] uppercase">
              Start with clarity
            </p>
            <h2 className="font-display mt-2 text-2xl font-semibold text-white sm:text-3xl">
              Let&apos;s understand your immigration goals.
            </h2>
            <p className="text-navy-200 mt-2 text-sm leading-relaxed sm:text-base">
              Share your background and receive a focused first assessment of
              the path that may fit your profile.
            </p>
          </div>
          <div className="mt-6 flex shrink-0 flex-col gap-3 sm:mt-0">
            <Button href="/consultation" variant="gold">
              Book a consultation <ArrowRight size={16} aria-hidden />
            </Button>
            <Link
              href="/portal/login"
              className="text-navy-100 hover:text-gold-300 inline-flex items-center justify-center gap-2 text-sm font-semibold transition-colors"
            >
              <LockKeyhole size={14} aria-hidden /> Client portal
            </Link>
          </div>
        </div>
      </Container>

      <Container width="wide" className="relative py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="flex max-w-sm flex-col gap-5">
            {/* The logo is full-colour navy + gold on transparency, so it needs
                a light backing to read on the navy footer — recolouring it to a
                flat white silhouette would lose the mark entirely. */}
            <Link
              href="/"
              aria-label="Immigration Horizons — home"
              className="inline-flex w-fit rounded-xl bg-white px-4 py-3 shadow-subtle"
            >
              <Image
                src="/images/logo-header.png"
                alt="Immigration Horizons"
                width={551}
                height={320}
                className="h-14 w-auto"
              />
            </Link>
            <p className="font-display text-gold-300 text-lg">{site.tagline}</p>
            <p className="text-sm leading-relaxed">
              Petition strategy, writing, and RFE responses for EB-2 NIW, EB-1A,
              EB-1B, EB-1C and O-1 cases. Clients supported across multiple
              countries and time zones.
            </p>
            <div className="flex flex-wrap gap-3">
              {externalProfiles.map((profile) => (
                <a
                  key={profile.href}
                  href={profile.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-white/20 px-4 py-1.5 font-sans text-xs font-semibold text-white transition-colors duration-200 hover:border-white/50 hover:bg-white/10"
                >
                  {profile.label}
                </a>
              ))}
            </div>
          </div>

          {footerNav.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="mb-4 font-sans text-[0.6875rem] font-bold tracking-[0.14em] text-white uppercase">
                {column.heading}
              </h2>
              <ul className="flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm transition-colors duration-200 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-6 border-t border-white/10 pt-10 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="mb-4 font-sans text-[0.6875rem] font-bold tracking-[0.14em] text-white uppercase">
              Contact
            </h2>
            <ul className="flex flex-col gap-2.5 text-sm">
              <li>
                <a
                  href={`mailto:${contact.email}`}
                  className="inline-flex items-center gap-2.5 transition-colors duration-200 hover:text-white"
                >
                  <Mail size={15} aria-hidden />
                  {contact.email}
                </a>
              </li>
              {[contact.whatsappPrimary, contact.whatsappSecondary].map(
                (number) => (
                  <li key={number}>
                    <a
                      href={whatsappLink(number)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2.5 transition-colors duration-200 hover:text-white"
                    >
                      <MessageCircle size={15} aria-hidden />
                      +{number}
                    </a>
                  </li>
                ),
              )}
            </ul>
          </div>

          <p className="text-navy-300 max-w-md text-xs leading-relaxed">
            {site.disclaimer}
          </p>
        </div>
      </Container>

      <div className="border-t border-white/10">
        <Container width="wide">
          <div className="text-navy-300 flex flex-col gap-3 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
            <p>
              &copy; {new Date().getFullYear()} {site.name}. All rights
              reserved.
            </p>
            <ul className="flex gap-6">
              {legalNav.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="transition-colors duration-200 hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </div>
    </footer>
  );
}
