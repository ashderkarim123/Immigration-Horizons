import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";

import { Badge } from "@/components/app/badge";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, Panel, Row, RowList } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { requireClient } from "@/lib/auth/current-client";
import { STATUS_LABELS } from "@/lib/content/portal";
import { getDb } from "@/lib/db";
import { Consultation } from "@/lib/models/Consultation";

export const metadata: Metadata = {
  title: "Your Consultations",
  robots: { index: false, follow: false },
};

const MAX_RESULTS = 50;

export default async function PortalConsultationsPage() {
  const client = await requireClient("/portal/consultations");
  const db = getDb();
  if (db) await db;

  const consultations = db
    ? await Consultation.find({ clientUser: client._id })
        .sort({ createdAt: -1 })
        .limit(MAX_RESULTS)
        .lean()
    : [];

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader
        title="Your consultations"
        description="Every consultation request you have submitted, and what happened next."
        breadcrumbs={[
          { name: "Portal", href: "/portal" },
          { name: "Consultations", href: "/portal/consultations" },
        ]}
        actions={
          <Button href="/consultation" variant="gold" size="sm">
            Book consultation
          </Button>
        }
      />

      <Panel
        title="Consultation history"
        description={`Showing ${consultations.length} most recent request${consultations.length === 1 ? "" : "s"}`}
      >
        {consultations.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={24} aria-hidden />}
            title="No consultations yet"
            body="Book a free consultation and we will review your background and eligibility."
            action={
              <Button href="/consultation" variant="gold" size="sm">
                Book a free consultation
              </Button>
            }
          />
        ) : (
          <RowList>
            {consultations.map((consultation) => (
              <Row
                key={String(consultation._id)}
                href={`/portal/consultations/${consultation._id}`}
                icon={<CalendarDays size={16} strokeWidth={1.75} />}
                primary={String(consultation.service)}
                secondary={`Submitted ${new Date(
                  consultation.createdAt as unknown as string,
                ).toLocaleDateString()}`}
                trailing={
                  <Badge tone="neutral">
                    {STATUS_LABELS[consultation.status as string] ??
                      String(consultation.status)}
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
