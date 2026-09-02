import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/ui/container";
import {
  Panel,
  EmptyState,
  RowList,
  Row,
} from "@/components/app/panel";
import { Badge, humanize, priorityTone } from "@/components/app/badge";
import { requireCapability } from "@/lib/auth/current-employee";
import { roleHasCapability } from "@/lib/auth/capabilities";
import { getQueryQueue, isQueryQueueKey, QUERY_QUEUES } from "@/lib/staff/query-queues";
import {
  INTERACTION_STATUS_LABELS,
  INTERACTION_TYPE_LABELS,
  type InteractionStatus,
  type InteractionType,
} from "@/lib/content/interaction-constants";

export const metadata: Metadata = {
  title: "Queries",
  robots: { index: false, follow: false },
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function formatDateTime(value: unknown): string {
  if (!value) return "";
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export default async function StaffQueriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor, role } = await requireCapability("queries.view", "/staff/queries");
  const params = await searchParams;

  const requested = first(params.queue);
  const queue = isQueryQueueKey(requested) ? requested : "unanswered";

  const { rows, counts } = await getQueryQueue(actor, queue);
  const active = QUERY_QUEUES.find((q) => q.key === queue)!;
  const seesEverything = roleHasCapability(role, "queries.view_all");

  return (
    <Container width="default" className="py-10 sm:py-14">
      <div>
        <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">Queries</h1>
        <p className="text-ink-600 mt-1 text-[0.9375rem]">
          {seesEverything
            ? "Every client question and consultation across the practice"
            : "Consultation queries, plus case queries on cases you can open"}
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Query queues" className="lg:sticky lg:top-6 lg:self-start">
          <ul className="rounded-panel border-ink-200 shadow-subtle divide-ink-200 divide-y overflow-hidden border bg-white">
            {QUERY_QUEUES.map((entry) => {
              const isActive = entry.key === queue;
              const count = counts[entry.key] ?? 0;
              return (
                <li key={entry.key}>
                  <Link
                    href={`/staff/queries?queue=${entry.key}`}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors ${
                      isActive ? "bg-navy-50 text-navy-900 font-semibold" : "text-ink-700 hover:bg-navy-50/50"
                    }`}
                  >
                    <span className="truncate">{entry.label}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                        count > 0 ? "bg-navy-100 text-navy-800" : "text-ink-400"
                      }`}
                    >
                      {count}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <Panel title={active.label} description={active.hint}>
          {rows.length === 0 ? (
            <EmptyState
              title="Nothing in this queue"
              body="That is the point of a queue — it should be empty most of the time."
            />
          ) : (
            <RowList>
              {rows.map((row) => (
                <Row
                  key={row.id}
                  href={row.caseId ? `/staff/cases/${row.caseId}` : null}
                  primary={row.subject}
                  secondary={
                    <>
                      {row.interactionNumber} · {row.clientName} ·{" "}
                      {INTERACTION_TYPE_LABELS[row.type as InteractionType] ?? humanize(row.type)}
                      {row.assigneeName ? ` · ${row.assigneeName}` : " · unassigned"}
                      {row.scheduledFor ? ` · ${formatDateTime(row.scheduledFor)}` : ""}
                    </>
                  }
                  trailing={
                    <div className="flex items-center gap-2">
                      {row.priority !== "normal" ? (
                        <Badge tone={priorityTone(row.priority)}>{humanize(row.priority)}</Badge>
                      ) : null}
                      <Badge tone={row.status === "answered" ? "positive" : "warning"}>
                        {INTERACTION_STATUS_LABELS[row.status as InteractionStatus] ??
                          humanize(row.status)}
                      </Badge>
                    </div>
                  }
                />
              ))}
            </RowList>
          )}
        </Panel>
      </div>

      <p className="text-ink-500 mt-6 text-xs">
        Answering, scheduling, and triaging a query happen in the admin system. This console shows
        what is waiting and where it belongs.
      </p>
    </Container>
  );
}
