import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { requireClient } from "@/lib/auth/current-client";
import { getDb } from "@/lib/db";
import { Consultation } from "@/lib/models/Consultation";
import { STATUS_LABELS } from "@/lib/content/portal";

export const metadata: Metadata = {
  title: "Your Consultations",
  robots: { index: false, follow: false },
};

// Bounded — a client-portal query must never be unbounded (module 12).
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
      />

      <div className="rounded-panel border-ink-200 border bg-white shadow-subtle">
        {consultations.length === 0 ? (
          <EmptyState
            icon={<Inbox size={28} aria-hidden />}
            title="No consultations yet"
            body="Book a free consultation and we will review your background and eligibility."
            action={
              <Button href="/consultation" variant="gold" size="sm">
                Book a free consultation
              </Button>
            }
          />
        ) : (
          <ul className="divide-ink-200 divide-y">
            {consultations.map((c) => (
              <li key={String(c._id)}>
                <Link
                  href={`/portal/consultations/${c._id}`}
                  className="hover:bg-navy-50/50 flex items-center justify-between gap-4 px-6 py-4 transition-colors"
                >
                  <div>
                    <p className="text-navy-800 text-sm font-semibold">{c.service}</p>
                    <p className="text-ink-500 mt-0.5 text-xs">
                      Submitted{" "}
                      {new Date(c.createdAt as unknown as string).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="bg-navy-50 text-navy-700 rounded-full px-3 py-1 text-xs font-semibold">
                    {STATUS_LABELS[c.status as string] ?? c.status}
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
