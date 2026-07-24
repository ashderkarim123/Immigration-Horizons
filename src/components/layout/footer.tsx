import Image from "next/image";
import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";

import { Container } from "@/components/ui/container";
import { footerNav, legalNav } from "@/lib/content/navigation";
import { contact, site, social, whatsappLink } from "@/lib/content/site";

const externalProfiles = [
  { label: "Fiverr Profile", href: social.fiverrProfile },
  { label: "Upwork Profile", href: social.upworkProfile },
];

export function Footer() {
  return (
    <footer className="bg-navy-950 text-navy-200 mt-auto">
      <Container width="wide" className="py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="flex max-w-sm flex-col gap-5">
            <Link href="/" aria-label="Immigration Horizons — home">
              <Image
                src="/images/logo-header.png"
                alt="Immigration Horizons"
                width={551}
                height={320}
                className="h-12 w-auto brightness-0 invert"
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
