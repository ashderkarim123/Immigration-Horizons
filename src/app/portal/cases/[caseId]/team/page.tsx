import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/service/breadcrumbs";
import { requireClient } from "@/lib/auth/current-client";
import { getAccessibleCase, getClientVisibleTeam } from "@/lib/auth/case-policy";

export const metadata: Metadata = {
  title: "Your Case Team",
  robots: { index: false, follow: false },
};

export default async function PortalCaseTeamPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const client = await requireClient(`/portal/cases/${caseId}/team`);

  const accessible = await getAccessibleCase(caseId, String(client._id));
  if (!accessible) notFound();
  const { caseDoc, workspace } = accessible;

  const team = await getClientVisibleTeam(String(workspace._id));

  const trail = [
    { name: "Portal", path: "/portal" },
    { name: "Cases", path: "/portal/cases" },
    { name: caseDoc.caseNumber, path: `/portal/cases/${caseId}` },
    { name: "Team", path: `/portal/cases/${caseId}/team` },
  ];

  return (
    <Container width="default" className="py-16 sm:py-20">
      <Breadcrumbs trail={trail} className="mb-8" />

      <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">
        Your team
      </h1>
      <p className="text-ink-600 mt-2 text-[0.9375rem]">
        The Immigration Horizons team working on {caseDoc.caseNumber}.
      </p>

      <div className="rounded-panel border-ink-200 mt-8 border bg-white shadow-subtle">
        {team.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <Users className="text-ink-400" size={32} aria-hidden />
            <p className="text-ink-600 text-sm">Your team hasn&apos;t been set up yet.</p>
          </div>
        ) : (
          <ul className="divide-ink-200 divide-y">
            {team.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <span className="text-navy-800 text-sm font-semibold">{member.name}</span>
                <span className="bg-navy-50 text-navy-700 rounded-full px-3 py-1 text-xs font-semibold">
                  {member.displayRole}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Container>
  );
}
