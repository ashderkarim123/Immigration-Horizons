import Image from "next/image";
import Link from "next/link";
import { LockKeyhole, Mail, MessageCircle } from "lucide-react";

import { Container } from "@/components/ui/container";
import { footerNav, legalNav } from "@/lib/content/navigation";
import { contact, site, social, whatsappLink } from "@/lib/content/site";
import { APP_HOST } from "@/lib/hosts";

const profiles = [
  { label: "Fiverr", href: social.fiverrProfile },
  { label: "Upwork", href: social.upworkProfile },
];

/** Deep-forest footer: reverse logo, the disclaimer verbatim, contact, four link columns. */
export function Footer() {
  return (
    <footer className="bg-navy-950 text-ink-50/82 mt-auto">
      <Container width="wide" className="grid gap-10 pt-14 pb-12 sm:pt-18 lg:grid-cols-[1.3fr_repeat(4,minmax(0,1fr))]">
        <div className="flex max-w-md flex-col gap-5 lg:max-w-none">
          <Link href="/" aria-label="Immigration Horizons — home" className="w-fit">
            <Image
              src="/images/open-horizons-horizontal-reverse.svg"
              alt="Immigration Horizons"
              width={1000}
              height={280}
              className="h-auto w-[240px]"
            />
          </Link>
          <p className="max-w-[60ch] text-sm leading-relaxed text-ink-50/78">
            {site.disclaimer}
          </p>
          <ul className="flex flex-col gap-2 text-[0.9375rem]">
            <li>
              <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-2.5 hover:text-white hover:underline">
                <Mail size={15} aria-hidden />
                {contact.email}
              </a>
            </li>
            <li>
              <a
                href={whatsappLink(contact.whatsappPrimary)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 hover:text-white hover:underline"
              >
                <MessageCircle size={15} aria-hidden />
                WhatsApp +{contact.whatsappPrimary}
              </a>
            </li>
            <li className="flex flex-wrap gap-x-4">
              {profiles.map((profile) => (
                <a
                  key={profile.href}
                  href={profile.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white hover:underline"
                >
                  {profile.label} profile
                </a>
              ))}
            </li>
          </ul>
        </div>

        {footerNav.map((column) => (
          <nav key={column.heading} aria-label={column.heading}>
            <h2 className="text-gold-200 mb-4 font-sans text-xs font-bold tracking-[0.12em] uppercase">
              {column.heading}
            </h2>
            <ul className="flex flex-col gap-2.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-[0.9375rem] hover:text-white hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>

      <div className="border-t border-white/14">
        <Container width="wide" className="flex flex-col gap-3 py-7 text-[0.8125rem] text-ink-50/70 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {site.name}. All rights reserved.
          </p>
          <ul className="flex flex-wrap gap-6">
            {legalNav.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-white hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <a href={`https://${APP_HOST}/portal/login`} className="inline-flex items-center gap-1.5 hover:text-white hover:underline">
                <LockKeyhole size={13} aria-hidden /> Client portal
              </a>
            </li>
          </ul>
        </Container>
      </div>
    </footer>
  );
}
