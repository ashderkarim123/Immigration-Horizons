import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/ui/container";
import { FilterBar, Pagination } from "@/components/staff/filter-bar";
import { Badge, clientStatusTone, humanize } from "@/components/app/badge";
import {
  EmptyState,
} from "@/components/app/panel";
import { requireCapability } from "@/lib/auth/current-employee";
import { listClientsForEmployee } from "@/lib/auth/employee-client-policy";
import { CLIENT_USER_STATUS_VALUES } from "@/lib/models/ClientUser";

export const metadata: Metadata = {
  title: "Clients",
  robots: { index: false, follow: false },
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function StaffClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor } = await requireCapability("clients.view", "/staff/clients");
  const params = await searchParams;

  const search = first(params.q);
  const status = first(params.status);
  const caseStateParam = first(params.cases);
  const caseState =
    caseStateParam === "with_cases" || caseStateParam === "no_cases" ? caseStateParam : "all";
  const page = Math.max(1, Number.parseInt(first(params.page), 10) || 1);

  const result = await listClientsForEmployee(actor, { search, status, caseState, page });

  const activeParams: Record<string, string> = {};
  if (search) activeParams.q = search;
  if (status) activeParams.status = status;
  if (caseState !== "all") activeParams.cases = caseState;

  return (
    <Container width="default" className="py-10 sm:py-14">
      <div>
        <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">Clients</h1>
        <p className="text-ink-600 mt-1 text-[0.9375rem]">
          Every portal account. Case detail on a client&apos;s record stays scoped to the cases you
          can open.
        </p>
      </div>

      <div className="mt-6">
        <FilterBar
          action="/staff/clients"
          searchValue={search}
          searchPlaceholder="Name or email"
          hasActiveFilters={Object.keys(activeParams).length > 0}
          selects={[
            {
              name: "status",
              label: "Account",
              value: status,
              options: [
                { value: "", label: "Any status" },
                ...CLIENT_USER_STATUS_VALUES.map((value) => ({ value, label: humanize(value) })),
              ],
            },
            {
              name: "cases",
              label: "Cases",
              value: caseState,
              options: [
                { value: "all", label: "Any" },
                { value: "with_cases", label: "Has a case" },
                { value: "no_cases", label: "No case" },
              ],
            },
          ]}
        />
      </div>

      <div className="rounded-panel border-ink-200 shadow-subtle mt-6 border bg-white">
        {result.items.length === 0 ? (
          <EmptyState
            title="No clients match"
            body="Clients appear here once a consultation is linked to a portal account."
          />
        ) : (
          <ul className="divide-ink-200 divide-y">
            {result.items.map((client) => (
              <li key={client.id}>
                <Link
                  href={`/staff/clients/${client.id}`}
                  className="hover:bg-navy-50/50 flex items-center justify-between gap-4 px-5 py-4 transition-colors sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="text-navy-800 truncate text-sm font-semibold">{client.name}</p>
                    <p className="text-ink-500 mt-0.5 truncate text-xs">
                      {client.email} · {client.caseCount} case{client.caseCount === 1 ? "" : "s"}
                      {client.lastLoginAt
                        ? ` · last signed in ${new Date(client.lastLoginAt).toLocaleDateString()}`
                        : " · never signed in"}
                    </p>
                  </div>
                  <Badge tone={clientStatusTone(client.status)}>{humanize(client.status)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Pagination
        basePath="/staff/clients"
        params={activeParams}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        noun="client"
      />
    </Container>
  );
}
