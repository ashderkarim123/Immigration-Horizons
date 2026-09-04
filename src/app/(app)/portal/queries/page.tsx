import type { Metadata } from "next";
import { MessageCircleQuestion } from "lucide-react";

import { Badge, type BadgeTone } from "@/components/app/badge";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, Panel, Row, RowList } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { requireClient } from "@/lib/auth/current-client";
import {
  INTERACTION_STATUS_LABELS,
  INTERACTION_TYPE_LABELS,
} from "@/lib/content/interaction-constants";
import { listAccessibleInteractions } from "@/lib/auth/interaction-policy";

export const metadata: Metadata = {
  title: "Your Queries",
  robots: { index: false, follow: false },
};

function statusTone(status: unknown): BadgeTone {
  if (status === "closed" || status === "resolved") return "positive";
  if (status === "awaiting_client") return "warning";
  return "neutral";
}

export default async function PortalQueriesPage() {
  const client = await requireClient("/portal/queries");
  const interactions = await listAccessibleInteractions(String(client._id));

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader
        title="Your questions"
        description="Questions you have asked us, and consultations you have requested."
        breadcrumbs={[
          { name: "Portal", href: "/portal" },
          { name: "Questions", href: "/portal/queries" },
        ]}
        actions={
          <Button href="/portal/queries/new" variant="gold" size="sm">
            Ask a question
          </Button>
        }
      />

      <Panel
        title="Conversation history"
        description="Your questions and their latest status"
      >
        {interactions.length === 0 ? (
          <EmptyState
            icon={<MessageCircleQuestion size={24} aria-hidden />}
            title="No questions yet"
            body="Start a question here and keep every reply together in your portal."
            action={
              <Button href="/portal/queries/new" variant="gold" size="sm">
                Ask a question
              </Button>
            }
          />
        ) : (
          <RowList>
            {interactions.map((interaction) => (
              <Row
                key={String(interaction._id)}
                href={`/portal/queries/${interaction._id}`}
                icon={<MessageCircleQuestion size={16} strokeWidth={1.75} />}
                primary={String(interaction.subject)}
                secondary={`${INTERACTION_TYPE_LABELS[interaction.type as keyof typeof INTERACTION_TYPE_LABELS] ?? interaction.type} · ${interaction.interactionNumber}`}
                trailing={
                  <Badge tone={statusTone(interaction.status)}>
                    {INTERACTION_STATUS_LABELS[
                      interaction.status as keyof typeof INTERACTION_STATUS_LABELS
                    ] ?? interaction.status}
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
