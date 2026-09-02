import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { Panel, DefinitionList, EmptyState } from "@/components/app/panel";
import { PasswordChangeForm } from "@/components/portal/password-change-form";
import { SessionManager } from "@/components/portal/session-manager";
import { requireClientSession } from "@/lib/auth/current-client";
import { listClientSessions } from "@/lib/auth/client-account";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/validation";

export const metadata: Metadata = {
  title: "Security",
  robots: { index: false, follow: false },
};

function formatDateTime(value: unknown): string {
  if (!value) return "—";
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default async function PortalSecurityPage() {
  const { client, actor } = await requireClientSession("/portal/security");
  const sessions = await listClientSessions(actor.clientUserId, actor.sessionId);

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader
        title="Security"
        description="Your password and the devices currently signed in to your account."
        breadcrumbs={[
          { name: "Portal", href: "/portal" },
          { name: "Security", href: "/portal/security" },
        ]}
      />

      <div className="flex flex-col gap-6">
        <Panel
          title="Change your password"
          description="You'll need your current password. Other signed-in devices are signed out automatically."
        >
          <PasswordChangeForm minLength={MIN_PASSWORD_LENGTH} />
        </Panel>

        <Panel
          title="Signed-in devices"
          description="Sign out anything you don't recognise."
        >
          {sessions.length === 0 ? (
            <EmptyState
              title="No active sessions"
              body="This is unusual — you're reading this page, so at least one session should be listed. Try signing out and back in."
            />
          ) : (
            <SessionManager
              sessions={sessions.map((session) => ({
                id: session.id,
                isCurrent: session.isCurrent,
                device: session.device,
                createdIp: session.createdIp,
                lastSeenAt: session.lastSeenAt ? session.lastSeenAt.toISOString() : null,
                createdAt: session.createdAt ? session.createdAt.toISOString() : null,
              }))}
            />
          )}
        </Panel>

        <Panel title="Account security">
          <DefinitionList
            items={[
              {
                label: "Password last changed",
                value: client.passwordChangedAt ? formatDateTime(client.passwordChangedAt) : "Never",
              },
              {
                label: "Email verified",
                value: client.emailVerifiedAt ? formatDateTime(client.emailVerifiedAt) : "Not yet",
              },
              {
                label: "Last sign-in",
                value: client.lastLoginAt ? formatDateTime(client.lastLoginAt) : "This is your first",
              },
            ]}
          />
        </Panel>

        <div className="border-ink-200 rounded-xl border border-dashed bg-white/60 px-5 py-4">
          <p className="text-ink-600 text-sm">
            Forgotten your password? You can{" "}
            <Link
              href="/portal/forgot-password"
              className="text-navy-700 font-semibold hover:underline"
            >
              reset it by email
            </Link>
            . A reset signs out every device, including this one.
          </p>
        </div>
      </div>
    </Container>
  );
}
