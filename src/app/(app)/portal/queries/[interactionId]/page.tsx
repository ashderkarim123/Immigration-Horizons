import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/service/breadcrumbs";
import { requireClient } from "@/lib/auth/current-client";
import {
  getAccessibleInteraction,
  getClientVisibleHistory,
  getClientVisibleUpdates,
} from "@/lib/auth/interaction-policy";
import { FollowUpForm, ResolutionActions } from "@/components/portal/query-actions";
import {
  INTERACTION_TYPE_LABELS,
  INTERACTION_STATUS_LABELS,
} from "@/lib/content/interaction-constants";

export const metadata: Metadata = {
  title: "Query Details",
  robots: { index: false, follow: false },
};

export default async function PortalQueryDetailPage({
  params,
}: {
  params: Promise<{ interactionId: string }>;
}) {
  const { interactionId } = await params;
  const client = await requireClient(`/portal/queries/${interactionId}`);

  const interaction = await getAccessibleInteraction(interactionId, String(client._id));
  if (!interaction) notFound();

  const [history, updates] = await Promise.all([
    getClientVisibleHistory(interactionId),
    getClientVisibleUpdates(interactionId),
  ]);

  const trail = [
    { name: "Portal", path: "/portal" },
    { name: "Queries", path: "/portal/queries" },
    { name: interaction.interactionNumber, path: `/portal/queries/${interactionId}` },
  ];

  const canFollowUp = !["closed", "cancelled"].includes(interaction.status);
  const canConfirmResolution = interaction.status === "answered";

  return (
    <Container width="default" className="py-16 sm:py-20">
      <Breadcrumbs trail={trail} className="mb-8" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">
            {interaction.subject}
          </h1>
          <p className="text-ink-500 mt-1 text-sm">
            {INTERACTION_TYPE_LABELS[interaction.type as keyof typeof INTERACTION_TYPE_LABELS] ?? interaction.type} ·{" "}
            {interaction.interactionNumber}
          </p>
        </div>
        <span className="bg-navy-50 text-navy-700 rounded-full px-3 py-1 text-xs font-semibold">
          {INTERACTION_STATUS_LABELS[interaction.status as keyof typeof INTERACTION_STATUS_LABELS] ?? interaction.status}
        </span>
      </div>

      {interaction.scheduledFor ? (
        <div className="rounded-panel border-navy-200 bg-navy-50 mt-6 border p-4 text-sm">
          <strong>Scheduled:</strong>{" "}
          {new Date(interaction.scheduledFor as unknown as string).toLocaleString(undefined, {
            timeZone: interaction.timezone || undefined,
          })}{" "}
          ({interaction.timezone})
        </div>
      ) : null}

      <div className="rounded-panel border-ink-200 mt-8 border bg-white p-6 shadow-subtle sm:p-8">
        <h2 className="font-display text-navy-800 text-base font-semibold">Your message</h2>
        <p className="text-ink-700 mt-2 whitespace-pre-wrap text-[0.9375rem] leading-relaxed">
          {interaction.description}
        </p>

        {interaction.clientVisibleResponse ? (
          <div className="border-ink-200 mt-6 border-t pt-6">
            <h2 className="font-display text-navy-800 text-base font-semibold">Our response</h2>
            <p className="text-ink-700 mt-2 whitespace-pre-wrap text-[0.9375rem] leading-relaxed">
              {interaction.clientVisibleResponse}
            </p>
          </div>
        ) : null}
      </div>

      {canConfirmResolution ? (
        <div className="rounded-panel border-ink-200 mt-6 border bg-white p-6 shadow-subtle">
          <h2 className="font-display text-navy-800 text-base font-semibold">Did this resolve your question?</h2>
          <div className="mt-3">
            <ResolutionActions interactionId={interactionId} />
          </div>
        </div>
      ) : null}

      {updates.length > 0 ? (
        <div className="rounded-panel border-ink-200 mt-6 border bg-white p-6 shadow-subtle">
          <h2 className="font-display text-navy-800 text-base font-semibold">Updates</h2>
          <ul className="mt-3 flex flex-col gap-4">
            {updates.map((u) => (
              <li key={String(u._id)} className="border-ink-200 border-l-2 pl-4">
                <p className="text-ink-500 text-xs">
                  {u.authorName} · {new Date(u.createdAt as unknown as string).toLocaleString()}
                </p>
                <p className="text-ink-700 mt-1 text-sm whitespace-pre-wrap">{u.body}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canFollowUp ? (
        <div className="rounded-panel border-ink-200 mt-6 border bg-white p-6 shadow-subtle">
          <h2 className="font-display text-navy-800 text-base font-semibold">Add a follow-up</h2>
          <div className="mt-3">
            <FollowUpForm interactionId={interactionId} />
          </div>
        </div>
      ) : null}

      {history.length > 0 ? (
        <div className="rounded-panel border-ink-200 mt-6 border bg-white p-6 shadow-subtle">
          <h2 className="font-display text-navy-800 text-base font-semibold">Timeline</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {history.map((h) => (
              <li key={h.id} className="text-ink-600 flex justify-between text-sm">
                <span>{h.summary}</span>
                <span className="text-ink-400 text-xs">
                  {new Date(h.createdAt as unknown as string).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Container>
  );
}
