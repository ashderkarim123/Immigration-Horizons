import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircleQuestion } from "lucide-react";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireClient } from "@/lib/auth/current-client";
import { listAccessibleInteractions } from "@/lib/auth/interaction-policy";
import { INTERACTION_TYPE_LABELS, INTERACTION_STATUS_LABELS } from "@/lib/content/interaction-constants";

export const metadata: Metadata = {
  title: "Your Queries",
  robots: { index: false, follow: false },
};

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

      <div className="rounded-panel border-ink-200 border bg-white shadow-subtle">
        {interactions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <MessageCircleQuestion className="text-ink-400" size={28} aria-hidden />
            <p className="text-navy-800 text-sm font-semibold">No questions yet</p>
            <Button href="/portal/queries/new" variant="gold" size="sm" className="mt-1">
              Ask a question
            </Button>
          </div>
        ) : (
          <ul className="divide-ink-200 divide-y">
            {interactions.map((i) => (
              <li key={String(i._id)}>
                <Link
                  href={`/portal/queries/${i._id}`}
                  className="hover:bg-navy-50/50 flex items-center justify-between gap-4 px-6 py-4 transition-colors"
                >
                  <div>
                    <p className="text-navy-800 text-sm font-semibold">{i.subject}</p>
                    <p className="text-ink-500 mt-0.5 text-xs">
                      {INTERACTION_TYPE_LABELS[i.type as keyof typeof INTERACTION_TYPE_LABELS] ?? i.type} ·{" "}
                      {i.interactionNumber}
                    </p>
                  </div>
                  <span className="bg-navy-50 text-navy-700 rounded-full px-3 py-1 text-xs font-semibold">
                    {INTERACTION_STATUS_LABELS[i.status as keyof typeof INTERACTION_STATUS_LABELS] ?? i.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Container>
  );
}
