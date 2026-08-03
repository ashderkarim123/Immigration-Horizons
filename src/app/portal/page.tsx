import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Briefcase, Inbox } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/portal/logout-button";
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

export default async function PortalDashboardPage() {
  const client = await requireClient("/portal");

  const db = getDb();
  if (db) await db;

  const [consultations, cases] = await Promise.all([
    db
      ? Consultation.find({ clientUser: client._id }).sort({ createdAt: -1 }).limit(5).lean()
      : Promise.resolve([]),
    listAccessibleCases(String(client._id)),
  ]);

  const displayName = client.firstName || client.email;

  return (
    <Container width="default" className="py-16 sm:py-20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">
            Welcome back, {displayName}
          </h1>
          <p className="text-ink-600 mt-1 text-[0.9375rem]">
            Here&apos;s a summary of your cases and consultations.
          </p>
        </div>
        <LogoutButton />
      </div>

      {cases.length > 0 ? (
        <div className="rounded-panel border-ink-200 mt-8 border bg-white shadow-subtle">
          <div className="border-ink-200 flex items-center justify-between border-b px-6 py-4">
            <h2 className="font-display text-navy-800 text-lg font-semibold">Your cases</h2>
            <Link
              href="/portal/cases"
              className="text-navy-700 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
            >
              View all
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
          <ul className="divide-ink-200 divide-y">
            {cases.slice(0, 5).map((c) => (
              <li key={String(c._id)}>
                <Link
                  href={`/portal/cases/${c._id}`}
                  className="hover:bg-navy-50/50 flex items-center justify-between gap-4 px-6 py-4 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="bg-navy-50 text-navy-700 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    >
                      <Briefcase size={16} strokeWidth={1.75} />
                    </span>
                    <div>
                      <p className="text-navy-800 text-sm font-semibold">
                        {c.caseNumber} — {c.title}
                      </p>
                      <p className="text-ink-500 mt-0.5 text-xs">
                        {CASE_TYPE_LABELS[c.caseType as string] ?? c.caseType}
                      </p>
                    </div>
                  </div>
                  <span className="bg-navy-50 text-navy-700 rounded-full px-3 py-1 text-xs font-semibold">
                    {CLIENT_STAGE_LABELS[c.currentStage as CaseStage] ?? c.currentStage}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-panel border-ink-200 mt-8 border bg-white shadow-subtle">
        <div className="border-ink-200 flex items-center justify-between border-b px-6 py-4">
          <h2 className="font-display text-navy-800 text-lg font-semibold">
            Recent consultations
          </h2>
          <Link
            href="/portal/consultations"
            className="text-navy-700 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
          >
            View all
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>

        {consultations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <Inbox className="text-ink-400" size={32} aria-hidden />
            <p className="text-ink-600 text-sm">
              No consultations yet.
            </p>
            <Button href="/consultation" variant="gold" size="sm" className="mt-1">
              Book a free consultation
            </Button>
          </div>
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
