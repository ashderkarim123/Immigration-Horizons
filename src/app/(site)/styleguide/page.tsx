import type { Metadata } from "next";

import { Badge, Card, CardBody, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Eyebrow, Section, SectionHeading } from "@/components/ui/section";

export const metadata: Metadata = {
  title: "Design System",
  description:
    "Reference for the Immigration Horizons design system: colour, typography, elevation, and core components.",
  robots: { index: false, follow: false },
};

const navyRamp = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "950",
];
const goldRamp = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
];
const inkRamp = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
];

// Tailwind needs literal class names at build time, so the ramps are mapped
// to full utilities rather than composed from string fragments.
const swatchClass: Record<string, string> = {
  "navy-50": "bg-navy-50",
  "navy-100": "bg-navy-100",
  "navy-200": "bg-navy-200",
  "navy-300": "bg-navy-300",
  "navy-400": "bg-navy-400",
  "navy-500": "bg-navy-500",
  "navy-600": "bg-navy-600",
  "navy-700": "bg-navy-700",
  "navy-800": "bg-navy-800",
  "navy-900": "bg-navy-900",
  "navy-950": "bg-navy-950",
  "gold-50": "bg-gold-50",
  "gold-100": "bg-gold-100",
  "gold-200": "bg-gold-200",
  "gold-300": "bg-gold-300",
  "gold-400": "bg-gold-400",
  "gold-500": "bg-gold-500",
  "gold-600": "bg-gold-600",
  "gold-700": "bg-gold-700",
  "gold-800": "bg-gold-800",
  "gold-900": "bg-gold-900",
  "ink-50": "bg-ink-50",
  "ink-100": "bg-ink-100",
  "ink-200": "bg-ink-200",
  "ink-300": "bg-ink-300",
  "ink-400": "bg-ink-400",
  "ink-500": "bg-ink-500",
  "ink-600": "bg-ink-600",
  "ink-700": "bg-ink-700",
  "ink-800": "bg-ink-800",
  "ink-900": "bg-ink-900",
};

function Ramp({ name, steps }: { name: string; steps: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-display-sm font-semibold capitalize">{name}</h3>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-11">
        {steps.map((step) => (
          <div key={step} className="flex flex-col gap-1.5">
            <div
              className={`border-ink-200/60 h-14 rounded-lg border ${swatchClass[`${name}-${step}`]}`}
            />
            <span className="text-ink-500 font-sans text-[0.6875rem]">
              {step}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StyleguidePage() {
  return (
    <>
      <Section tone="navy" space="spacious">
        <Reveal className="flex max-w-3xl flex-col gap-6">
          <Eyebrow className="text-gold-300">Design System</Eyebrow>
          <h1 className="text-display-xl sm:text-display-2xl font-semibold text-white">
            Immigration Horizons
          </h1>
          <p className="text-lead text-navy-200 text-pretty">
            The shared visual language behind every page: navy and gold, an
            institutional serif for authority, and a restrained motion system.
            Every component on this page is the real one used in production.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Button variant="gold" size="lg" href="#components">
              View components
            </Button>
            <Button variant="inverse" size="lg" href="#colour">
              View tokens
            </Button>
          </div>
        </Reveal>
      </Section>

      <Section id="colour">
        <SectionHeading
          align="left"
          eyebrow="Foundations"
          title="Colour"
          description="Navy carries authority and structure. Gold is an accent — used for emphasis and conversion, never as a background for body copy."
        />
        <div className="mt-14 flex flex-col gap-12">
          <Ramp name="navy" steps={navyRamp} />
          <Ramp name="gold" steps={goldRamp} />
          <Ramp name="ink" steps={inkRamp} />
        </div>

        <Card tone="tint" className="mt-12">
          <CardTitle as="h3">Contrast rules</CardTitle>
          <ul className="text-ink-600 mt-4 flex flex-col gap-2.5 text-sm">
            <li>
              <strong className="text-navy-800">Gold text on white</strong> must
              be <code className="text-gold-700">gold-700</code> or darker.
              Brand <code>gold-500</code> is ~2.6:1 and is reserved for fills,
              rules, and ornament.
            </li>
            <li>
              <strong className="text-navy-800">Gold text on navy</strong> uses{" "}
              <code>gold-300</code>/<code>gold-400</code>.
            </li>
            <li>
              <strong className="text-navy-800">The gold CTA button</strong>{" "}
              pairs <code>gold-500</code> fill with <code>navy-900</code> text,
              which clears AA comfortably.
            </li>
            <li>
              <strong className="text-navy-800">Body copy</strong> is{" "}
              <code>ink-600</code> on white and <code>navy-100/200</code> on
              navy.
            </li>
          </ul>
        </Card>
      </Section>

      <Section tone="tint">
        <SectionHeading
          align="left"
          eyebrow="Foundations"
          title="Typography"
          description="Source Serif 4 for display headings, Inter for UI and body. Both are variable and self-hosted, so there are no external font requests."
        />
        <div className="mt-14 flex flex-col gap-10">
          <div className="flex flex-col gap-2">
            <span className="text-ink-500 font-sans text-xs">
              display-2xl · hero
            </span>
            <p className="text-display-2xl text-navy-800 font-semibold">
              Your future. Our preparation.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-ink-500 font-sans text-xs">
              display-lg · section heading
            </span>
            <p className="text-display-lg text-navy-800 font-semibold">
              Petitions built on evidence
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-ink-500 font-sans text-xs">
              display-sm · card title
            </span>
            <p className="text-display-sm text-navy-800 font-semibold">
              EB-2 National Interest Waiver
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-ink-500 font-sans text-xs">
              lead · section intro
            </span>
            <p className="text-lead text-ink-600 max-w-2xl">
              We prepare EB-2 NIW cases around the Dhanasar framework with a
              clear evidence narrative, polished drafting, and structured filing
              support.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-ink-500 font-sans text-xs">base · body</span>
            <p className="text-ink-600 max-w-[68ch]">
              Every case strategy is built around your specific credentials and
              goals, not a generic template. Petition letters, recommendation
              letters, and expert opinions are written from scratch for your
              case.
            </p>
          </div>
        </div>
      </Section>

      <Section id="components">
        <SectionHeading
          align="left"
          eyebrow="Components"
          title="Buttons"
          description="One shape language: fully rounded, three sizes, five intents. The lift on hover is motion-safe only."
        />
        <div className="mt-12 flex flex-col gap-8">
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary">Primary</Button>
            <Button variant="gold">Book a consultation</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
          <div className="bg-navy-900 rounded-panel flex flex-wrap items-center gap-4 p-8">
            <Button variant="gold">Gold on navy</Button>
            <Button variant="inverse">Inverse on navy</Button>
          </div>
        </div>
      </Section>

      <Section tone="tint">
        <SectionHeading
          align="left"
          eyebrow="Components"
          title="Cards and badges"
          description="Surfaces share one radius and a navy-tinted shadow scale. Linked cards get hover elevation; static cards do not."
        />
        <RevealGroup className="mt-12 grid gap-6 md:grid-cols-3">
          <RevealItem>
            <Card className="flex h-full flex-col gap-3">
              <Badge>Default</Badge>
              <CardTitle>Static surface</CardTitle>
              <CardBody>
                Used for content that is read rather than clicked — stats,
                explanations, inline notes.
              </CardBody>
            </Card>
          </RevealItem>
          <RevealItem>
            <Card
              href="/styleguide#components"
              className="flex h-full flex-col gap-3"
            >
              <Badge tone="neutral">Linked</Badge>
              <CardTitle>Interactive surface</CardTitle>
              <CardBody>
                The whole card is one link target, which keeps the tab order
                short and the hit area large.
              </CardBody>
            </Card>
          </RevealItem>
          <RevealItem>
            <Card tone="featured" className="flex h-full flex-col gap-3">
              <Badge tone="gold">Featured</Badge>
              <CardTitle>Recommended option</CardTitle>
              <CardBody>
                A gold ring marks the one option we want the visitor to choose.
                Used sparingly — once per view.
              </CardBody>
            </Card>
          </RevealItem>
        </RevealGroup>
      </Section>

      <Section tone="navy" space="spacious">
        <SectionHeading
          align="left"
          eyebrow="Foundations"
          title="Motion"
          description="Entrances are short, play once, and never block reading. Anything decorative is disabled under prefers-reduced-motion."
          className="[&_p]:text-navy-200"
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            ["Reveal", "A 16px rise and fade over 550ms, triggered once."],
            ["RevealGroup", "Cascades children 80ms apart across a grid."],
            ["Hover lift", "A 2–4px translate, gated behind motion-safe."],
          ].map(([title, body], i) => (
            <Reveal key={title} delay={i * 0.08}>
              <Card tone="inverse" className="flex h-full flex-col gap-3">
                <CardTitle className="text-white">{title}</CardTitle>
                <CardBody className="text-navy-200">{body}</CardBody>
              </Card>
            </Reveal>
          ))}
        </div>
      </Section>
    </>
  );
}
