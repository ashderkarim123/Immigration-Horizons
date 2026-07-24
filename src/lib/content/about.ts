/**
 * Differentiators and process. Both are ported from copy already live on the
 * site — the process steps are drawn from the deliverables and engagement
 * options in `services.ts` rather than invented, so nothing here describes
 * work the practice does not actually do.
 */

export type Differentiator = {
  title: string;
  body: string;
  icon: IconName;
};

export type IconName =
  | "target"
  | "document"
  | "briefcase"
  | "shield"
  | "clock"
  | "headset"
  | "globe"
  | "badge";

export const differentiators: Differentiator[] = [
  {
    title: "Transparent, personalised case strategy",
    body: "Every case strategy is built around your specific credentials and goals, not a generic template.",
    icon: "target",
  },
  {
    title: "Custom-drafted documents",
    body: "Petition letters, recommendation letters, and expert opinions are written from scratch for your case — no boilerplate.",
    icon: "document",
  },
  {
    title: "200+ cases handled",
    body: "Years of hands-on experience preparing self-petition immigration cases.",
    icon: "briefcase",
  },
  {
    title: "RFE support",
    body: "If your case receives a Request for Evidence, our team helps prepare a thorough response.",
    icon: "shield",
  },
  {
    title: "Efficient, timely preparation",
    body: "A structured process keeps your case moving without unnecessary delays.",
    icon: "clock",
  },
  {
    title: "One dedicated point of contact",
    body: "You work with the same person from your first consultation through filing.",
    icon: "headset",
  },
  {
    title: "Global client base",
    body: "Clients supported across multiple countries, comfortable working across time zones and, where needed, multiple languages.",
    icon: "globe",
  },
  {
    title: "Verified track record",
    body: "Reviews and completed-case history are publicly viewable and verifiable on our Fiverr profile.",
    icon: "badge",
  },
];

export type ProcessStep = {
  title: string;
  body: string;
};

/**
 * Deliberately describes *what happens* at each stage, never how long it
 * takes. USCIS processing times change continuously and are case- and
 * service-centre-specific; publishing figures here would go stale and could
 * mislead someone making a filing decision. Timing questions are answered at
 * consultation against the official USCIS processing-times tool.
 */
export const processSteps: ProcessStep[] = [
  {
    title: "Consultation",
    body: "You tell us about your background, your field, and your goals. This conversation is free, and its purpose is assessment — not a sales pitch.",
  },
  {
    title: "Eligibility review",
    body: "We assess your record against the requirements for each category you might qualify under, and tell you honestly which ones your profile currently supports.",
  },
  {
    title: "Case strategy",
    body: "We map your evidence to the specific criteria an adjudicator will apply, decide which criteria to lead on, and identify where the case needs reinforcement before drafting starts.",
  },
  {
    title: "Evidence collection",
    body: "You receive a specific list of what to gather — not a generic checklist. We tell you what each item needs to demonstrate and why it matters to your argument.",
  },
  {
    title: "Drafting",
    body: "Petition letters, personal statements, recommendation letters, expert opinion letters, and business or endeavor plans — each written from scratch around your record.",
  },
  {
    title: "Review",
    body: "Every document is checked for internal consistency, so that the petition letter, the recommendation letters, and the exhibits all tell the same story without contradicting each other.",
  },
  {
    title: "Final petition & exhibit packaging",
    body: "Your supporting evidence is organised and indexed into a clean exhibit set an adjudicator can follow without hunting for the document a claim refers to.",
  },
  {
    title: "Submission preparation",
    body: "USCIS form preparation and final packaging, start to finish, so what you submit is complete, correctly assembled, and internally consistent. If an RFE or NOID follows, we prepare a focused, evidence-led response.",
  },
];

export type TeamMember = {
  name: string;
  role: string;
  initials: string;
  bio: string;
};

/**
 * Only real, complete profiles. The legacy data carried a second entry
 * flagged `placeholder: true` with the body "Team member profile coming
 * soon" — that is not published.
 */
export const team: TeamMember[] = [
  {
    name: "Rahat Karim",
    role: "Founder & Immigration Case Consultant",
    initials: "RK",
    bio: "Rahat founded Immigration Horizons after 5+ years preparing EB-1A, EB-1B, EB-1C and EB-2 NIW self-petitions for clients worldwide. He has worked on 200+ cases — writing petition letters, recommendation and expert opinion letters, business plans, and RFE responses — both directly for individuals and as additional support for immigration attorneys and paralegals who need extra hands on a case.",
  },
];
