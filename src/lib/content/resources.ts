/**
 * Resources page content.
 *
 * Two kinds of resource: our own in-depth guides (the service pages), and
 * links to primary official sources. The official links are real, authoritative
 * USCIS / State Department / eCFR pages — the honest, useful thing to point a
 * researching visitor at, and an EEAT signal.
 */

export type OfficialResource = {
  label: string;
  description: string;
  href: string;
};

export const officialResources: OfficialResource[] = [
  {
    label: "USCIS — Green Card for Employment-Based Immigrants",
    description:
      "The official overview of the employment-based preference categories and how they fit together.",
    href: "https://www.uscis.gov/green-card/green-card-eligibility/green-card-for-employment-based-immigrants",
  },
  {
    label: "USCIS — EB-1 First Preference",
    description:
      "Extraordinary ability (EB-1A), outstanding professors and researchers (EB-1B), and multinational managers and executives (EB-1C).",
    href: "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-first-preference-eb-1",
  },
  {
    label: "USCIS — EB-2 Second Preference",
    description:
      "Advanced-degree professionals, exceptional ability, and the National Interest Waiver.",
    href: "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-second-preference-eb-2",
  },
  {
    label: "Matter of Dhanasar (AAO 2016)",
    description:
      "The precedent decision that sets the three-prong framework USCIS applies to National Interest Waiver petitions.",
    href: "https://www.justice.gov/eoir/page/file/920996/download",
  },
  {
    label: "USCIS — Check Case Processing Times",
    description:
      "The authoritative, always-current source for how long cases are taking at each service centre. Always use this rather than any figure quoted elsewhere.",
    href: "https://egov.uscis.gov/processing-times/",
  },
  {
    label: "Department of State — Visa Bulletin",
    description:
      "Monthly priority-date availability by category and country of chargeability, which determines when a case can move forward.",
    href: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html",
  },
  {
    label: "USCIS — Form I-140",
    description:
      "The Immigrant Petition for Alien Worker, used for EB-1 and EB-2 filings. Always check the current edition and fee before filing.",
    href: "https://www.uscis.gov/i-140",
  },
  {
    label: "USCIS Policy Manual",
    description:
      "The agency's own guidance on how officers evaluate petitions, including the evidentiary standards for each category.",
    href: "https://www.uscis.gov/policy-manual",
  },
];
