import type { Metadata } from "next";
import { Briefcase, Inbox } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { Panel, PanelLink, EmptyState, RowList, Row } from "@/components/app/panel";
import { Badge, stageTone } from "@/components/app/badge";
import { requireClient } from "@/lib/auth/current-client";
import { getDb } from "@/lib/db";
import { Consultation } from "@/lib/models/Consultation";
import { STATUS_LABELS } from "@/lib/content/portal";
import { listAccessibleCases } from "@/lib/auth/case-policy";
import { CASE_TYPES, CLIENT_STAGE_LABELS, type CaseStage } from "@/lib/content/case-constants";

export const metadata: Metadata = {
  title: "Client Portal",
  robots: { index: false, follow: false },
};

const CASE_TYPE_LABELS = Object.fromEntries(CASE_TYPES.map((t) => [t.value, t.label]));

/**
 * The client dashboard.
 *
 * The notification bell and sign-out button used to live here as well as
 * in the shell. They were removed rather than restyled: two bells with two
 * unread counts is worse than one, and the shell's version is present on
 * every page instead of only this one (ADR-011 §1).
 */
export default async function PortalDashboardPage() {
  const client = await requireClient("/portal");

  const db = getDb();
  if (db) await db;

  const [consultations, cases] = await Promise.all([
    db
      ? Consultation.find({ clientUser: client._id })
          .select("service status createdAt")
          .sort({ createdAt: -1 })
          .limit(5)
          .lean()
      : Promise.resolve([]),
    listAccessibleCases(String(client._id)),
  ]);

  const displayName = client.firstName || client.email;

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader
        title={`Welcome back, ${displayName}`}
        description="A summary of your cases and consultations."
      />

      <div className="flex flex-col gap-6">
        <Panel
          title="Your cases"
          action={cases.length > 0 ? <PanelLink href="/portal/cases">View all</PanelLink> : undefined}
        >
          {cases.length === 0 ? (
            <EmptyState
              title="No active cases yet"
              body="Once we begin work on your petition, your case appears here with its current status."
            />
          ) : (
            <RowList>
              {cases.slice(0, 5).map((c) => (
                <Row
                  key={String(c._id)}
                  href={`/portal/cases/${c._id}`}
                  icon={<Briefcase size={16} strokeWidth={1.75} />}
                  primary={`${c.caseNumber} — ${c.title}`}
                  secondary={CASE_TYPE_LABELS[c.caseType as string] ?? String(c.caseType)}
                  trailing={
                    <Badge tone={stageTone(c.currentStage)}>
                      {CLIENT_STAGE_LABELS[c.currentStage as CaseStage] ?? String(c.currentStage)}
                    </Badge>
                  }
                />
              ))}
            </RowList>
          )}
        </Panel>

        <Panel
          title="Recent consultations"
          action={
            consultations.length > 0 ? (
              <PanelLink href="/portal/consultations">View all</PanelLink>
            ) : undefined
          }
        >
          {consultations.length === 0 ? (
            <EmptyState
              title="No consultations yet"
              body="Book a free consultation and we'll review your background and eligibility."
              icon={<Inbox size={28} aria-hidden />}
              action={
                <Button href="/consultation" variant="gold" size="sm">
                  Book a free consultation
                </Button>
              }
            />
          ) : (
            <RowList>
              {consultations.map((c) => (
                <Row
                  key={String(c._id)}
                  href={`/portal/consultations/${c._id}`}
                  primary={String(c.service)}
                  secondary={`Submitted ${new Date(c.createdAt as unknown as string).toLocaleDateString()}`}
                  trailing={
                    <Badge tone="neutral">
                      {STATUS_LABELS[c.status as string] ?? String(c.status)}
                    </Badge>
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
