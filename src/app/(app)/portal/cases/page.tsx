import type { Metadata } from "next";
import { BriefcaseBusiness } from "lucide-react";

import { Badge, stageTone } from "@/components/app/badge";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, Panel, Row, RowList } from "@/components/app/panel";
import { Container } from "@/components/ui/container";
import { listAccessibleCases } from "@/lib/auth/case-policy";
import { requireClient } from "@/lib/auth/current-client";
import {
  CASE_TYPES,
  CLIENT_STAGE_LABELS,
  type CaseStage,
} from "@/lib/content/case-constants";

export const metadata: Metadata = {
  title: "Your Cases",
  robots: { index: false, follow: false },
};

const CASE_TYPE_LABELS = Object.fromEntries(
  CASE_TYPES.map((type) => [type.value, type.label]),
);

export default async function PortalCasesPage() {
  const client = await requireClient("/portal/cases");
  const cases = await listAccessibleCases(String(client._id));

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader
        title="Your cases"
        description="Every case we are working on for you, and where each one currently stands."
        breadcrumbs={[
          { name: "Portal", href: "/portal" },
          { name: "Cases", href: "/portal/cases" },
        ]}
      />

      <Panel
        title="Case workspace"
        description={
          cases.length === 1 ? "1 case available" : `${cases.length} cases available`
        }
      >
        {cases.length === 0 ? (
          <EmptyState
            icon={<BriefcaseBusiness size={24} aria-hidden />}
            title="No active cases yet"
            body="Once we begin work on your petition, your case appears here with its current status."
          />
        ) : (
          <RowList>
            {cases.map((caseRecord) => (
              <Row
                key={String(caseRecord._id)}
                href={`/portal/cases/${caseRecord._id}`}
                icon={<BriefcaseBusiness size={16} strokeWidth={1.75} />}
                primary={`${caseRecord.caseNumber} — ${caseRecord.title}`}
                secondary={`${CASE_TYPE_LABELS[caseRecord.caseType as string] ?? caseRecord.caseType} · Opened ${new Date(
                  caseRecord.openedAt as unknown as string,
                ).toLocaleDateString()}`}
                trailing={
                  <Badge tone={stageTone(caseRecord.currentStage)}>
                    {CLIENT_STAGE_LABELS[caseRecord.currentStage as CaseStage] ??
                      caseRecord.currentStage}
                  </Badge>
                }
              />
            ))}
          </RowList>
        )}
      </Panel>
    </Container>
  );
}
