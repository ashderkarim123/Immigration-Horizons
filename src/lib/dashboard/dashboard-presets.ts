import type { EmployeeDashboardData } from "./employee-dashboard";

/**
 * Role presets: which widgets a role sees first, and in what order
 * (ADR-009 §5).
 *
 * This is *presentation priority only*. It never grants anything — a
 * widget listed here still renders as "not your remit" if the underlying
 * capability check in `employee-dashboard.ts` returned null. Reordering
 * this file cannot change what anyone can see.
 *
 * A role with no preset falls back to DEFAULT_ORDER, so a new role added
 * to the capability map gets a sensible dashboard without a code change
 * here.
 */

export type WidgetKey = Exclude<keyof EmployeeDashboardData, "role">;

export type WidgetSpec = {
  key: WidgetKey;
  label: string;
  /** What the number means, shown when it is non-zero. */
  hint: string;
  href: string;
  /** Non-zero is a problem to act on, not just information. */
  tone: "neutral" | "attention";
};

export const WIDGETS: Record<WidgetKey, WidgetSpec> = {
  myCases: {
    key: "myCases",
    label: "Your cases",
    hint: "Active cases you have access to",
    href: "/staff/cases",
    tone: "neutral",
  },
  unassignedCases: {
    key: "unassignedCases",
    label: "Unassigned cases",
    hint: "Active cases with no project manager",
    href: "/staff/cases",
    tone: "attention",
  },
  upcomingDeadlines: {
    key: "upcomingDeadlines",
    label: "Filing within 30 days",
    hint: "Cases with a target filing date coming up",
    href: "/staff/cases",
    tone: "attention",
  },
  documentsAwaitingReview: {
    key: "documentsAwaitingReview",
    label: "Documents to review",
    hint: "Uploaded documents not yet reviewed",
    href: "/staff/cases",
    tone: "attention",
  },
  overdueDocumentRequests: {
    key: "overdueDocumentRequests",
    label: "Overdue document requests",
    hint: "Requested from clients and past due",
    href: "/staff/cases",
    tone: "attention",
  },
  unansweredQueries: {
    key: "unansweredQueries",
    label: "Unanswered queries",
    hint: "Client questions still open",
    href: "/staff/queries",
    tone: "attention",
  },
  queriesAwaitingScheduling: {
    key: "queriesAwaitingScheduling",
    label: "Awaiting scheduling",
    hint: "Consultations that still need a slot",
    href: "/staff/queries",
    tone: "attention",
  },
  unreadClientMessages: {
    key: "unreadClientMessages",
    label: "Unread client messages",
    hint: "Client messages nobody on the team has opened",
    href: "/staff/cases",
    tone: "attention",
  },
  myOpenTasks: {
    key: "myOpenTasks",
    label: "Your open tasks",
    hint: "Assigned to you and not completed",
    href: "/staff/tasks",
    tone: "neutral",
  },
  myOverdueTasks: {
    key: "myOverdueTasks",
    label: "Your overdue tasks",
    hint: "Assigned to you and past due",
    href: "/staff/tasks",
    tone: "attention",
  },
};

const DEFAULT_ORDER: WidgetKey[] = [
  "myCases",
  "myOpenTasks",
  "myOverdueTasks",
  "upcomingDeadlines",
  "unreadClientMessages",
];

/**
 * Per-role priority. The three roles the brief names get explicit presets;
 * super_admin/admin get the manager view, since they hold every manager
 * capability plus org-wide visibility.
 */
const PRESETS: Record<string, WidgetKey[]> = {
  // Manager view — triage first: what is unowned, overdue, or waiting on us.
  super_admin: [
    "unassignedCases",
    "documentsAwaitingReview",
    "unansweredQueries",
    "queriesAwaitingScheduling",
    "unreadClientMessages",
    "overdueDocumentRequests",
    "upcomingDeadlines",
    "myCases",
    "myOverdueTasks",
  ],
  admin: [
    "unassignedCases",
    "documentsAwaitingReview",
    "unansweredQueries",
    "queriesAwaitingScheduling",
    "unreadClientMessages",
    "overdueDocumentRequests",
    "upcomingDeadlines",
    "myCases",
    "myOverdueTasks",
  ],
  pm: [
    "myCases",
    "unassignedCases",
    "documentsAwaitingReview",
    "unansweredQueries",
    "queriesAwaitingScheduling",
    "unreadClientMessages",
    "overdueDocumentRequests",
    "upcomingDeadlines",
    "myOverdueTasks",
  ],

  // Petition Writer — own work first: what am I writing, against what
  // evidence, with what feedback and deadline.
  petition_writer: [
    "myOpenTasks",
    "myOverdueTasks",
    "myCases",
    "upcomingDeadlines",
    "unreadClientMessages",
    "documentsAwaitingReview",
  ],

  // USCIS Forms Specialist — forms work is gated on client information
  // arriving, so outstanding document requests rank high.
  uscis_forms_specialist: [
    "myOpenTasks",
    "myOverdueTasks",
    "overdueDocumentRequests",
    "myCases",
    "upcomingDeadlines",
    "unreadClientMessages",
  ],

  // Remaining specialists share the writer shape until a product rule
  // says otherwise — better than inventing distinctions nobody asked for.
  business_plan_specialist: [
    "myOpenTasks",
    "myOverdueTasks",
    "myCases",
    "upcomingDeadlines",
    "unreadClientMessages",
  ],
  recommendation_letter_specialist: [
    "myOpenTasks",
    "myOverdueTasks",
    "myCases",
    "upcomingDeadlines",
    "unreadClientMessages",
  ],
  evidence_collector: [
    "myOpenTasks",
    "myOverdueTasks",
    "overdueDocumentRequests",
    "myCases",
    "unreadClientMessages",
  ],
  reviewer: [
    "myOpenTasks",
    "documentsAwaitingReview",
    "myCases",
    "upcomingDeadlines",
    "unreadClientMessages",
  ],
};

export function widgetOrderForRole(role: string | null | undefined): WidgetSpec[] {
  const order = (role && PRESETS[role]) || DEFAULT_ORDER;
  return order.map((key) => WIDGETS[key]);
}
