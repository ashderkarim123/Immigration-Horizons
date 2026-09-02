import type { Metadata } from "next";
import { notFound } from "next/navigation";
import mongoose from "mongoose";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/app/badge";
import { requireClient } from "@/lib/auth/current-client";
import { getDb } from "@/lib/db";
import { Consultation } from "@/lib/models/Consultation";
import { STATUS_LABELS } from "@/lib/content/portal";

export const metadata: Metadata = {
  title: "Consultation Details",
  robots: { index: false, follow: false },
};

export default async function PortalConsultationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await requireClient(`/portal/consultations/${id}`);

  // Never let an invalid id reach a Mongo query — and treat "not a valid
  // id" and "not found" identically (404), same as "found but not yours"
  // below, so nothing about a consultation's existence leaks either way.
  if (!mongoose.Types.ObjectId.isValid(id)) notFound();

  const db = getDb();
  if (!db) notFound();
  await db;

  const consultation = await Consultation.findOne({
    _id: id,
    clientUser: client._id,
  }).lean();

  if (!consultation) notFound();

  const trail = [
    { name: "Portal", href: "/portal" },
    { name: "Consultations", href: "/portal/consultations" },
    { name: consultation.service, href: `/portal/consultations/${id}` },
  ];

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader
        title={String(consultation.service)}
        description={`Submitted ${new Date(consultation.createdAt as unknown as string).toLocaleString()}`}
        breadcrumbs={trail}
        badge={
          <Badge tone="neutral">
            {STATUS_LABELS[consultation.status as string] ?? String(consultation.status)}
          </Badge>
        }
      />

      <div className="rounded-panel border-ink-200 mt-8 border bg-white p-6 shadow-subtle sm:p-8">
        <h2 className="font-display text-navy-800 text-base font-semibold">
          Your message
        </h2>
        <p className="text-ink-700 mt-2 whitespace-pre-wrap text-[0.9375rem] leading-relaxed">
          {consultation.message}
        </p>
      </div>
    </Container>
  );
}
