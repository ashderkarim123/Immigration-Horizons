import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/ui/container";
import { FilterBar, Pagination } from "@/components/staff/filter-bar";
import { Badge, humanize, priorityTone, stageTone } from "@/components/app/badge";
import {
  EmptyState,
} from "@/components/app/panel";
import { requireCapability } from "@/lib/auth/current-employee";
import { listCasesForEmployee } from "@/lib/auth/employee-case-policy";
import { roleHasCapability } from "@/lib/auth/capabilities";
import { CASE_TYPES, CASE_STAGES } from "@/lib/content/case-constants";

export const metadata: Metadata = {
  title: "Cases",
  robots: { index: false, follow: false },
};

const CASE_TYPE_LABELS = Object.fromEntries(CASE_TYPES.map((t) => [t.value, t.label]));
const CASE_STAGE_LABELS = Object.fromEntries(CASE_STAGES.map((s) => [s.value, s.label]));

const PRIORITIES = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function StaffCasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Capability first; the row-level scope is applied inside the policy and
  // cannot be widened by any parameter read below.
  const { actor, role } = await requireCapability("cases.view", "/staff/cases");
  const params = await searchParams;

  const search = first(params.q);
  const stage = first(params.stage);
  const caseType = first(params.type);
  const priority = first(params.priority);
  const scopeParam = first(params.scope);
  const scope = scopeParam === "mine" || scopeParam === "unassigned" ? scopeParam : "all";
  const includeArchived = first(params.archived) === "1";
  const page = Math.max(1, Number.parseInt(first(params.page), 10) || 1);

  const result = await listCasesForEmployee(actor, {
    search,
    stage,
    caseType,
    priority,
    scope,
    includeArchived,
    page,
  });

  const seesEverything = roleHasCapability(role, "cases.view_all");
  const canSeeUnassigned = roleHasCapability(role, "cases.assign");

  const activeParams: Record<string, string> = {};
  if (search) activeParams.q = search;
  if (stage) activeParams.stage = stage;
  if (caseType) activeParams.type = caseType;
  if (priority) activeParams.priority = priority;
  if (scope !== "all") activeParams.scope = scope;
  if (includeArchived) activeParams.archived = "1";

  const hasActiveFilters = Object.keys(activeParams).length > 0;

  return (
    <Container width="default" className="py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">Cases</h1>
          <p className="text-ink-600 mt-1 text-[0.9375rem]">
            {seesEverything
              ? "Every case across the practice"
              : "Cases you hold an active workspace membership on"}
          </p>
        </div>
        <Link href="/staff/operations" className="text-navy-700 text-sm font-semibold hover:underline">
          Operations board
        </Link>
      </div>

      <div className="mt-6">
        <FilterBar
          action="/staff/cases"
          searchValue={search}
          searchPlaceholder="Case number or title"
          hasActiveFilters={hasActiveFilters}
          selects={[
            {
              name: "scope",
              label: "Scope",
              value: scope,
              options: [
                { value: "all", label: seesEverything ? "All cases" : "All my cases" },
                { value: "mine", label: "My cases" },
                ...(canSeeUnassigned ? [{ value: "unassigned", label: "Unassigned" }] : []),
              ],
            },
            {
              name: "stage",
              label: "Stage",
              value: stage,
              options: [
                { value: "", label: "Any stage" },
                ...CASE_STAGES.map((s) => ({ value: s.value, label: s.label })),
              ],
            },
            {
              name: "type",
              label: "Type",
              value: caseType,
              options: [
                { value: "", label: "Any type" },
                ...CASE_TYPES.map((t) => ({ value: t.value, label: t.label })),
              ],
            },
            {
              name: "priority",
              label: "Priority",
              value: priority,
              options: [{ value: "", label: "Any priority" }, ...PRIORITIES],
            },
            {
              name: "archived",
              label: "Archived",
              value: includeArchived ? "1" : "",
              options: [
                { value: "", label: "Active only" },
                { value: "1", label: "Include archived" },
              ],
            },
          ]}
        />
      </div>

      <div className="rounded-panel border-ink-200 shadow-subtle mt-6 border bg-white">
        {result.items.length === 0 ? (
          <EmptyState
            title={hasActiveFilters ? "No cases match those filters" : "No cases yet"}
            body={
              hasActiveFilters
                ? "Clear the filters to see everything you have access to."
                : seesEverything
                  ? "No active cases exist. Convert a lead in the admin system to create one."
                  : "You'll see a case here as soon as you're added to its workspace."
            }
          />
        ) : (
          <ul className="divide-ink-200 divide-y">
            {result.items.map((c) => (
              <li key={String(c._id)}>
                <Link
                  href={`/staff/cases/${c._id}`}
                  className="hover:bg-navy-50/50 flex items-center justify-between gap-4 px-5 py-4 transition-colors sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="text-navy-800 truncate text-sm font-semibold">
                      {String(c.caseNumber)} — {String(c.title)}
                    </p>
                    <p className="text-ink-500 mt-0.5 truncate text-xs">
                      {CASE_TYPE_LABELS[String(c.caseType)] ?? String(c.caseType)}
                      {c.targetFilingDate
                        ? ` · files ${new Date(c.targetFilingDate as string).toLocaleDateString()}`
                        : ""}
                      {c.projectManager ? "" : " · no manager"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {c.priority && c.priority !== "medium" ? (
                      <Badge tone={priorityTone(c.priority)}>{humanize(c.priority)}</Badge>
                    ) : null}
                    {c.archivedAt ? <Badge tone="neutral">Archived</Badge> : null}
                    <Badge tone={stageTone(c.currentStage)}>
                      {CASE_STAGE_LABELS[String(c.currentStage)] ?? humanize(c.currentStage)}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Pagination
        basePath="/staff/cases"
        params={activeParams}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        noun="case"
      />
    </Container>
  );
}
