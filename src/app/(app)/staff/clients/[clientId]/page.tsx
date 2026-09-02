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
  clientStatusTone,
  documentStatusTone,
  humanize,
  stageTone,
} from "@/components/app/badge";
import { requireCapability } from "@/lib/auth/current-employee";
import { getClientOverviewForEmployee } from "@/lib/auth/employee-client-policy";
import { CASE_TYPES, CASE_STAGES } from "@/lib/content/case-constants";
import { INTERACTION_STATUS_LABELS, type InteractionStatus } from "@/lib/content/interaction-constants";

export const metadata: Metadata = {
  title: "Client",
  robots: { index: false, follow: false },
};

const CASE_TYPE_LABELS = Object.fromEntries(CASE_TYPES.map((t) => [t.value, t.label]));
const CASE_STAGE_LABELS = Object.fromEntries(CASE_STAGES.map((s) => [s.value, s.label]));

function formatDate(value: unknown): string {
  if (!value) return "—";
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export default async function StaffClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const { actor } = await requireCapability("clients.view", `/staff/clients/${clientId}`);

  const overview = await getClientOverviewForEmployee(clientId, actor);
  if (!overview) notFound();

  const { client } = overview;

  return (
    <Container width="default" className="py-10 sm:py-14">
      <Link
        href="/staff/clients"
        className="text-navy-700 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft size={14} aria-hidden />
        All clients
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">
            {client.name}
          </h1>
          <p className="text-ink-600 mt-1 text-[0.9375rem]">{client.email}</p>
        </div>
        <Badge tone={clientStatusTone(client.status)}>{humanize(client.status)}</Badge>
      </div>

      <div className="mt-8 flex flex-col gap-6">
        <Panel title="Account">
          <DefinitionList
            items={[
              { label: "Phone", value: client.phone || "—" },
              { label: "Registered", value: formatDate(client.createdAt) },
              { label: "Last sign-in", value: client.lastLoginAt ? formatDate(client.lastLoginAt) : "Never" },
              { label: "Email verified", value: client.emailVerifiedAt ? formatDate(client.emailVerifiedAt) : "No" },
              { label: "Password set", value: client.hasPassword ? "Yes" : "No" },
              {
                label: "Locked",
                value: client.lockedUntil ? `Until ${formatDate(client.lockedUntil)}` : "No",
              },
              {
                label: "Live invitation",
                value: overview.invitation
                  ? `Expires ${formatDate(overview.invitation.expiresAt)}`
                  : "None outstanding",
              },
            ]}
          />
        </Panel>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel title="Cases" description="Only cases you can open are listed">
            {overview.cases.length === 0 ? (
              <EmptyState
                title="No cases"
                body="Either this client has none, or none are within your workspace access."
              />
            ) : (
              <RowList>
                {overview.cases.map((c) => (
                  <Row
                    key={String(c._id)}
                    href={`/staff/cases/${c._id}`}
                    primary={`${String(c.caseNumber)} — ${String(c.title)}`}
                    secondary={`${CASE_TYPE_LABELS[String(c.caseType)] ?? String(c.caseType)} · updated ${formatDate(c.updatedAt)}`}
                    trailing={
                      <Badge tone={stageTone(c.currentStage)}>
                        {CASE_STAGE_LABELS[String(c.currentStage)] ?? humanize(c.currentStage)}
                      </Badge>
                    }
                  />
                ))}
              </RowList>
            )}
          </Panel>

          <Panel title="Consultations" description="Leads submitted by this client">
            {overview.consultations.length === 0 ? (
              <EmptyState title="No consultations recorded" />
            ) : (
              <RowList>
                {overview.consultations.map((c) => (
                  <Row
                    key={String(c._id)}
                    primary={String(c.service)}
                    secondary={`${formatDate(c.createdAt)}${c.convertedCase ? " · converted to a case" : ""}`}
                    trailing={<Badge tone="neutral">{humanize(c.status)}</Badge>}
                  />
                ))}
              </RowList>
            )}
          </Panel>

          <Panel
            title="Workspace memberships"
            description="Where this client has portal access"
          >
            {overview.memberships.length === 0 ? (
              <EmptyState title="No workspace memberships" />
            ) : (
              <RowList>
                {overview.memberships.map((m) => (
                  <Row
                    key={m.id}
                    href={m.caseId ? `/staff/cases/${m.caseId}` : null}
                    primary={m.caseNumber}
                    secondary={`${m.caseTitle} · ${humanize(m.workspaceRole)}`}
                    trailing={
                      <Badge tone={m.status === "active" ? "positive" : "warning"}>
                        {humanize(m.status)}
                      </Badge>
                    }
                  />
                ))}
              </RowList>
            )}
          </Panel>

          <Panel title="Queries" description="Questions raised by this client">
            {overview.queries === null ? (
              <RestrictedState what="Client queries" />
            ) : overview.queries.length === 0 ? (
              <EmptyState title="No queries" />
            ) : (
              <RowList>
                {overview.queries.map((q) => (
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

          <Panel title="Documents" description="Uploaded on cases you can open">
            {overview.documents === null ? (
              <RestrictedState what="Documents" />
            ) : overview.documents.length === 0 ? (
              <EmptyState title="No documents" />
            ) : (
              <RowList>
                {overview.documents.map((d) => (
                  <Row
                    key={String(d._id)}
                    href={`/staff/cases/${d.case}`}
                    primary={String(d.displayName)}
                    secondary={formatDate(d.uploadedAt)}
                    trailing={
                      <Badge tone={documentStatusTone(d.status)}>{humanize(d.status)}</Badge>
                    }
                  />
                ))}
              </RowList>
            )}
          </Panel>

          <Panel
            title="Communication"
            description="Messages this client sent, on cases you can open"
          >
            {overview.communication === null ? (
              <RestrictedState what="Case conversations" />
            ) : overview.communication.length === 0 ? (
              <EmptyState title="No messages from this client" />
            ) : (
              <RowList>
                {overview.communication.map((m) => (
                  <Row
                    key={String(m._id)}
                    href={`/staff/cases/${m.case}`}
                    primary={String(m.body)}
                    secondary={formatDate(m.createdAt)}
                  />
                ))}
              </RowList>
            )}
          </Panel>
        </div>

        <Panel
          title="Notifications sent"
          description="What this client has been told, and whether the email left the building"
        >
          {overview.notifications.length === 0 ? (
            <EmptyState title="No notifications sent yet" />
          ) : (
            <RowList>
              {overview.notifications.map((n) => (
                <Row
                  key={String(n._id)}
                  primary={String(n.title)}
                  secondary={`${humanize(n.type)} · ${formatDate(n.createdAt)}`}
                  trailing={
                    <div className="flex items-center gap-2">
                      <Badge tone={n.isRead ? "neutral" : "warning"}>
                        {n.isRead ? "Read" : "Unread"}
                      </Badge>
                      <Badge
                        tone={
                          n.emailState === "sent"
                            ? "positive"
                            : n.emailState === "failed"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {humanize(n.emailState)}
                      </Badge>
                    </div>
                  }
                />
              ))}
            </RowList>
          )}
        </Panel>
      </div>
    </Container>
  );
}
