import Link from "next/link";
import { Check, Minus } from "lucide-react";

import { Section, SectionHeading } from "@/components/ui/section";

/**
 * At-a-glance comparison of the immigrant case categories. Facts are drawn
 * from each category's statutory requirements (see the individual guide pages
 * for sourcing). O-1 is intentionally excluded here because it is a temporary
 * nonimmigrant classification, not comparable on these immigrant-petition rows.
 */
type Row = {
  slug: string;
  name: string;
  selfPetition: boolean;
  employer: boolean;
  laborCert: boolean;
  standard: string;
};

const rows: Row[] = [
  {
    slug: "eb2-niw",
    name: "EB-2 NIW",
    selfPetition: true,
    employer: false,
    laborCert: false,
    standard: "Nationally important endeavour",
  },
  {
    slug: "eb1a",
    name: "EB-1A",
    selfPetition: true,
    employer: false,
    laborCert: false,
    standard: "Sustained acclaim (3 of 10)",
  },
  {
    slug: "eb1b",
    name: "EB-1B",
    selfPetition: false,
    employer: true,
    laborCert: false,
    standard: "International recognition (2 of 6)",
  },
  {
    slug: "eb1c",
    name: "EB-1C",
    selfPetition: false,
    employer: true,
    laborCert: false,
    standard: "Managerial / executive capacity",
  },
];

function Cell({ value }: { value: boolean }) {
  return value ? (
    <span className="text-green-600" aria-label="Yes">
      <Check size={18} className="mx-auto" aria-hidden />
    </span>
  ) : (
    <span className="text-ink-300" aria-label="No">
      <Minus size={18} className="mx-auto" aria-hidden />
    </span>
  );
}

export function CategoryComparison() {
  return (
    <Section tone="tint">
      <SectionHeading
        eyebrow="At a glance"
        title="Compare the immigrant categories"
        description="A quick way to narrow down where your profile fits. The full guide for each explains the requirements in depth. O-1 is a temporary visa and is covered separately."
      />

      <div className="mt-12 overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse text-left">
          <caption className="sr-only">
            Comparison of EB-2 NIW, EB-1A, EB-1B and EB-1C on self-petition,
            employer requirement, labor certification, and evidentiary standard.
          </caption>
          <thead>
            <tr className="border-ink-200 border-b">
              <th
                scope="col"
                className="text-ink-500 py-4 pr-4 font-sans text-xs font-bold tracking-[0.1em] uppercase"
              >
                Category
              </th>
              <th
                scope="col"
                className="text-ink-500 px-3 py-4 text-center font-sans text-xs font-bold tracking-[0.1em] uppercase"
              >
                Self-petition
              </th>
              <th
                scope="col"
                className="text-ink-500 px-3 py-4 text-center font-sans text-xs font-bold tracking-[0.1em] uppercase"
              >
                Needs employer
              </th>
              <th
                scope="col"
                className="text-ink-500 px-3 py-4 text-center font-sans text-xs font-bold tracking-[0.1em] uppercase"
              >
                Labor cert
              </th>
              <th
                scope="col"
                className="text-ink-500 px-3 py-4 font-sans text-xs font-bold tracking-[0.1em] uppercase"
              >
                Core standard
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.slug}
                className="border-ink-200 border-b transition-colors hover:bg-white"
              >
                <th scope="row" className="py-5 pr-4">
                  <Link
                    href={`/services/${row.slug}`}
                    className="text-navy-800 hover:text-gold-700 font-display text-base font-semibold underline-offset-4 hover:underline"
                  >
                    {row.name}
                  </Link>
                </th>
                <td className="px-3 py-5 text-center">
                  <Cell value={row.selfPetition} />
                </td>
                <td className="px-3 py-5 text-center">
                  <Cell value={row.employer} />
                </td>
                <td className="px-3 py-5 text-center">
                  <Cell value={row.laborCert} />
                </td>
                <td className="text-ink-600 px-3 py-5 text-sm">
                  {row.standard}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-ink-500 mt-6 text-center text-sm">
        Not sure which row is you?{" "}
        <Link
          href="/consultation"
          className="text-navy-700 font-semibold underline underline-offset-4"
        >
          Get a free eligibility assessment
        </Link>
        .
      </p>
    </Section>
  );
}
