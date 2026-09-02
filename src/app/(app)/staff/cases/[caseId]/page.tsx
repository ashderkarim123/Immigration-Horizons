import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import {
  Panel,
  EmptyState,
  RowList,
  Row,
  DefinitionList,
} from "@/components/app/panel";
import { RestrictedState } from "@/components/staff/panel";
import {
  Badge,
  documentStatusTone,
  humanize,
  priorityTone,
  stageTone,
} from "@/components/app/badge";
import { CaseOperationsPanel } from "@/components/staff/case-operations-panel";
import { MemberManager } from "@/components/staff/member-manager";
import { requireCapability } from "@/lib/auth/current-employee";
import { getAccessibleCaseWorkspace } from "@/lib/auth/employee-case-policy";
import { roleHasCapability, ROLE_LABELS } from "@/lib/auth/capabilities";
import { getCaseDetailForEmployee } from "@/lib/staff/case-detail";
import { CASE_TYPES, CASE_STAGES } from "@/lib/content/case-constants";
import { INTERACTION_STATUS_LABELS, type InteractionStatus } from "@/lib/content/interaction-constants";

export const metadata: Metadata = {
  title: "Case",
  robots: { index: false, follow: false },
};

const CASE_TYPE_LABELS = Object.fromEntries(CASE_TYPES.map((t) => [t.value, t.label]));
const CASE_STAGE_LABELS = Object.fromEntries(CASE_STAGES.map((s) => [s.value, s.label]));

function formatDate(value: unknown): string {
  if (!value) return "—";
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export default async function StaffCaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const { actor, role } = await requireCapability("cases.view", `/staff/cases/${caseId}`);

  // Row-level check: a case this employee isn't a member of returns null,
  // and a non-existent one returns null too — indistinguishable by design.
  const loaded = await getAccessibleCaseWorkspace(caseId, actor);
  if (!loaded) notFound();

  const caseDoc = loaded.caseDoc as Record<string, unknown>;
  const workspace = loaded.workspace as Record<string, unknown>;
  const detail = await getCaseDetailForEmployee(caseDoc, workspace, actor);

  const canAssignManager = roleHasCapability(role, "cases.assign");
  const canChangeStage = roleHasCapability(role, "cases.manage");
  const canManageMembers = roleHasCapability(role, "workspace.members.manage");

  const channelById = new Map(
    (detail.channels ?? []).map((c) => [String(c._id), c as Record<string, unknown>]),
  );

  return (
    <Container width="default" className="py-10 sm:py-14">
      <Link
        href="/staff/cases"
        className="text-navy-700 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft size={14} aria-hidden />
        All cases
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">
            {String(caseDoc.caseNumber)} — {String(caseDoc.title)}
          </h1>
          <p className="text-ink-600 mt-1 text-[0.9375rem]">
            {CASE_TYPE_LABELS[String(caseDoc.caseType)] ?? String(caseDoc.caseType)}
            {detail.primaryClientName ? ` · ${detail.primaryClientName}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {caseDoc.archivedAt ? <Badge tone="neutral">Archived</Badge> : null}
          <Badge tone={priorityTone(caseDoc.priority)}>{humanize(caseDoc.priority)} priority</Badge>
          <Badge tone={stageTone(caseDoc.currentStage)}>
            {CASE_STAGE_LABELS[String(caseDoc.currentStage)] ?? humanize(caseDoc.currentStage)}
          </Badge>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-6">
        <Panel title="Overview">
          <DefinitionList
            items={[
              { label: "Project manager", value: detail.projectManagerName ?? "Unassigned" },
              { label: "Primary client", value: detail.primaryClientName ?? "—" },
              { label: "Opened", value: formatDate(caseDoc.openedAt) },
              { label: "Target filing", value: formatDate(caseDoc.targetFilingDate) },
              { label: "Filed", value: formatDate(caseDoc.filedAt) },
              { label: "Last change", value: formatDate(caseDoc.updatedAt) },
            ]}
          />
        </Panel>

        {canAssignManager || canChangeStage ? (
          <Panel
            title="Case operations"
            description="Assignment and stage changes are recorded on the case timeline."
          >
            <CaseOperationsPanel
              caseId={String(caseDoc._id)}
              currentStage={String(caseDoc.currentStage)}
              currentManagerId={caseDoc.projectManager ? String(caseDoc.projectManager) : null}
              employees={detail.assignableEmployees}
              stages={CASE_STAGES.map((s) => ({ value: s.value, label: s.label }))}
              canAssignManager={canAssignManager}
              canChangeStage={canChangeStage}
            />
          </Panel>
        ) : null}

        <Panel
          title="Workspace members"
          description={`${detail.members.length} member${detail.members.length === 1 ? "" : "s"} on this case`}
        >
          <MemberManager
            caseId={String(caseDoc._id)}
            members={detail.members}
            employees={detail.assignableEmployees}
            canManage={canManageMembers}
            roleLabels={ROLE_LABELS}
          />
        </Panel>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel title="Documents" description="Most recent first">
            {detail.documents === null ? (
              <RestrictedState what="Documents" />
            ) : detail.documents.length === 0 ? (
              <EmptyState title="No documents yet" body="Uploads appear here as clients supply them." />
            ) : (
              <RowList>
                {detail.documents.map((d) => (
                  <Row
                    key={String(d._id)}
                    primary={String(d.displayName)}
                    secondary={`${detail.categoryNames.get(String(d.category)) ?? "Uncategorised"} · ${formatDate(d.uploadedAt)}`}
                    trailing={
                      <Badge tone={documentStatusTone(d.status)}>{humanize(d.status)}</Badge>
                    }
                  />
                ))}
              </RowList>
            )}
          </Panel>

          <Panel title="Document requests" description="Outstanding asks of the client">
            {detail.documentRequests === null ? (
              <RestrictedState what="Document requests" />
            ) : detail.documentRequests.length === 0 ? (
              <EmptyState title="Nothing requested" />
            ) : (
              <RowList>
                {detail.documentRequests.map((r) => {
                  const due = r.dueDate ? new Date(r.dueDate as string) : null;
                  const overdue = r.status === "open" && due !== null && due < new Date();
                  return (
                    <Row
                      key={String(r._id)}
                      primary={String(r.title)}
                      secondary={due ? `Due ${formatDate(r.dueDate)}` : "No due date"}
                      trailing={
                        <Badge tone={overdue ? "danger" : humanize(r.status) === "fulfilled" ? "positive" : "neutral"}>
                          {overdue ? "Overdue" : humanize(r.status)}
                        </Badge>
                      }
                    />
                  );
                })}
              </RowList>
            )}
          </Panel>

          <Panel title="Queries" description="Client questions raised on this case">
            {detail.queries === null ? (
              <RestrictedState what="Client queries" />
            ) : detail.queries.length === 0 ? (
              <EmptyState title="No queries on this case" />
            ) : (
              <RowList>
                {detail.queries.map((q) => (
                  <Row
                    key={String(q._id)}
                    primary={String(q.subject)}
                    secondary={`${String(q.interactionNumber)} · ${formatDate(q.createdAt)}`}
                    trailing={
                      <Badge tone={q.status === "answered" ? "positive" : "warning"}>
                        {INTERACTION_STATUS_LABELS[q.status as InteractionStatus] ?? humanize(q.status)}
                      </Badge>
                    }
                  />
                ))}
              </RowList>
            )}
          </Panel>

          <Panel title="Tasks" description="Assigned work on the originating lead">
            {detail.tasks.length === 0 ? (
              <EmptyState
                title="No tasks"
                body="Tasks are created against the originating lead in the admin system."
              />
            ) : (
              <RowList>
                {detail.tasks.map((t) => {
                  const due = t.dueDate ? new Date(t.dueDate as string) : null;
                  const overdue = t.status !== "completed" && due !== null && due < new Date();
                  return (
                    <Row
                      key={String(t._id)}
                      primary={String(t.title)}
                      secondary={`${String(t.type)}${t.assigneeName ? ` · ${String(t.assigneeName)}` : ""}${due ? ` · due ${formatDate(t.dueDate)}` : ""}`}
                      trailing={
                        <Badge tone={overdue ? "danger" : t.status === "completed" ? "positive" : "neutral"}>
                          {overdue ? "Overdue" : humanize(t.status)}
                        </Badge>
                      }
                    />
                  );
                })}
              </RowList>
            )}
          </Panel>
        </div>

        <Panel
          title="Channels and messages"
          description="Internal channels are visible to the team only, never to the client"
        >
          {detail.channels === null || detail.recentMessages === null ? (
            <RestrictedState what="Case conversations" />
          ) : detail.channels.length === 0 ? (
            <EmptyState title="No channels provisioned" />
          ) : (
            <>
              <div className="flex flex-wrap gap-2 px-5 py-4 sm:px-6">
                {detail.channels.map((channel) => (
                  <Badge
                    key={String(channel._id)}
                    tone={channel.visibility === "employees_only" ? "warning" : "neutral"}
                  >
                    {String(channel.name)}
                    {channel.visibility === "employees_only" ? " · internal" : ""}
                  </Badge>
                ))}
              </div>

              {detail.recentMessages.length === 0 ? (
                <EmptyState title="No messages yet" />
              ) : (
                <RowList>
                  {detail.recentMessages.map((m) => {
                    const channel = channelById.get(String(m.channel));
                    const internal = channel?.visibility === "employees_only";
                    return (
                      <Row
                        key={String(m._id)}
                        primary={String(m.body)}
                        secondary={`${String(m.senderDisplayName)} · ${String(channel?.name ?? "Channel")} · ${formatDate(m.createdAt)}`}
                        trailing={
                          internal ? (
                            <Badge tone="warning">Internal</Badge>
                          ) : (
                            <Badge tone="neutral">{humanize(m.senderType)}</Badge>
                          )
                        }
                      />
                    );
                  })}
                </RowList>
              )}
            </>
          )}
        </Panel>

        <Panel title="Activity" description="Append-only case timeline">
          {detail.activity === null ? (
            <RestrictedState what="Case activity" />
          ) : detail.activity.length === 0 ? (
            <EmptyState title="Nothing recorded yet" />
          ) : (
            <RowList>
              {detail.activity.map((a) => (
                <Row
                  key={String(a._id)}
                  primary={String(a.message)}
                  secondary={`${String(a.actorName)} · ${formatDate(a.createdAt)}`}
                  trailing={<Badge tone="neutral">{humanize(a.type)}</Badge>}
                />
              ))}
            </RowList>
          )}
        </Panel>
      </div>
    </Container>
  );
}
