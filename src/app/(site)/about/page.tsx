import type { Metadata } from "next";

import { CtaBanner } from "@/components/sections/cta-banner";
import { Differentiators } from "@/components/sections/differentiators";
import { Process } from "@/components/sections/process";
import { Breadcrumbs } from "@/components/service/breadcrumbs";
import {
  JsonLd,
  breadcrumbSchema,
  organizationSchema,
} from "@/components/seo/json-ld";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { PhotoSlot } from "@/components/ui/photo-slot";
import { Reveal } from "@/components/ui/reveal";
import { Eyebrow, Section, SectionHeading } from "@/components/ui/section";
import { coreValues, mission, vision } from "@/lib/content/brand";
import { team } from "@/lib/content/about";
import { stats } from "@/lib/content/site";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Immigration Horizons is an immigration consulting and paralegal services practice specialising in EB-2 NIW, EB-1A, EB-1B, EB-1C and O-1 petitions. 200+ cases handled, 5+ years of experience.",
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    title: "About Immigration Horizons",
    description:
      "An immigration consulting and paralegal services practice for employment-based petitions. Not a law firm.",
    url: "/about",
  },
};

const trail = [
  { name: "Home", path: "/" },
  { name: "About", path: "/about" },
];

export default function AboutPage() {
  return (
    <>
      <JsonLd data={[organizationSchema, breadcrumbSchema(trail)]} />

      <section className="bg-navy-950 relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(201,153,46,0.15),transparent_58%)]"
        />
        <Container width="wide" className="relative py-16 sm:py-20">
          <Breadcrumbs trail={trail} tone="dark" className="mb-8" />
          <div className="max-w-3xl">
            <Eyebrow className="text-gold-300">About us</Eyebrow>
            <h1 className="text-display-lg sm:text-display-xl mt-4 font-semibold text-white">
              Petition preparation, built around one person&apos;s record
            </h1>
            <p className="text-lead text-navy-200 mt-5 text-pretty">
              Immigration Horizons is an immigration consulting and paralegal
              services practice specialising in employment-based U.S. petitions.
              We are not a law firm — we prepare, draft, research, and organise,
              and we tell every client exactly where that line sits.
            </p>
          </div>

          <dl className="mt-12 grid max-w-xl grid-cols-3 gap-6 border-t border-white/10 pt-8">
            <div>
              <dt className="text-navy-300 font-sans text-xs tracking-wide uppercase">
                Cases handled
              </dt>
              <dd className="font-display mt-1 text-3xl font-semibold text-white">
                {stats.casesHandled}
              </dd>
            </div>
            <div>
              <dt className="text-navy-300 font-sans text-xs tracking-wide uppercase">
                Years experience
              </dt>
              <dd className="font-display mt-1 text-3xl font-semibold text-white">
                {stats.yearsExperience}
              </dd>
            </div>
            <div>
              <dt className="text-navy-300 font-sans text-xs tracking-wide uppercase">
                Client base
              </dt>
              <dd className="font-display mt-1 text-3xl font-semibold text-white">
                Global
              </dd>
            </div>
          </dl>
        </Container>
      </section>

      {/* Mission & Vision */}
      <Section>
        <div className="grid gap-6 md:grid-cols-2">
          <Reveal>
            <Card tone="tint" className="flex h-full flex-col gap-3">
              <h2 className="font-display text-navy-800 text-2xl font-semibold">
                {mission.heading}
              </h2>
              <p className="text-ink-600 leading-relaxed text-pretty">
                {mission.body}
              </p>
            </Card>
          </Reveal>
          <Reveal delay={0.08}>
            <Card tone="tint" className="flex h-full flex-col gap-3">
              <h2 className="font-display text-navy-800 text-2xl font-semibold">
                {vision.heading}
              </h2>
              <p className="text-ink-600 leading-relaxed text-pretty">
                {vision.body}
              </p>
            </Card>
          </Reveal>
        </div>
      </Section>

      {/* Story */}
      <Section tone="tint" space="compact">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div>
            <SectionHeading
              align="left"
              eyebrow="Our story"
              title="How we got here"
            />
            <div className="text-ink-600 mt-6 flex flex-col gap-4 text-[1.0625rem] leading-[1.75] text-pretty">
              <p>
                Immigration Horizons grew out of years of hands-on petition work
                — preparing EB-1A, EB-1B, EB-1C and EB-2 NIW self-petitions for
                clients around the world, and providing drafting support to
                immigration attorneys and paralegals who needed extra capacity
                on a case.
              </p>
              <p>
                Over {stats.yearsExperience} years and {stats.casesHandled}{" "}
                cases, a pattern became clear: the difference between a strong
                petition and a weak one is rarely the applicant&apos;s
                credentials. It is how well the evidence is understood, mapped to
                the right standard, and presented so an adjudicator can follow
                it. That is the work we set out to do properly.
              </p>
              <p>
                We built the practice around a simple principle — that our work
                should be judged on what can be checked, not on what we claim.
                Our completed-case history and client reviews are public on our
                marketplace profiles, and every testimonial on this site links
                back to its source.
              </p>
            </div>
          </div>

          <PhotoSlot
            src="/images/petition-workspace-about-v1.png"
            alt="The Immigration Horizons workspace where petitions are prepared"
            aspect="portrait"
            className="mx-auto w-full max-w-sm shadow-lifted ring-1 ring-navy-100"
          />
        </div>
      </Section>

      {/* Team */}
      <Section>
        <SectionHeading
          eyebrow="Who you work with"
          title="Our team"
          description="You work with the same point of contact from your first consultation through filing."
        />
        <div className="mx-auto mt-14 grid max-w-3xl gap-6 sm:grid-cols-1">
          {team.map((member) => (
            <Card key={member.name} className="flex flex-col gap-4 sm:flex-row sm:gap-6">
              <span
                aria-hidden
                className="bg-navy-800 font-display inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-semibold text-white"
              >
                {member.initials}
              </span>
              <div>
                <h3 className="font-display text-navy-800 text-xl font-semibold">
                  {member.name}
                </h3>
                <p className="text-gold-700 font-sans text-sm font-semibold">
                  {member.role}
                </p>
                <p className="text-ink-600 mt-3 text-[0.9375rem] leading-relaxed text-pretty">
                  {member.bio}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      {/* Core values */}
      <Section tone="tint">
        <SectionHeading eyebrow="What we stand for" title="Core values" />
        <div className="mt-14 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {coreValues.map((value) => (
            <div
              key={value.title}
              className="border-gold-500 flex flex-col gap-2.5 border-t-2 pt-5"
            >
              <h3 className="font-display text-navy-800 text-lg font-semibold">
                {value.title}
              </h3>
              <p className="text-ink-600 text-[0.9375rem] leading-relaxed text-pretty">
                {value.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Process />
      <Differentiators />

      <CtaBanner
        title="Want to talk through your case?"
        body="Book a free consultation. We'll assess your record honestly and tell you which route it supports."
        ctaLabel="Book your free consultation"
      />
    </>
  );
}
