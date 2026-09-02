import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { Panel, DefinitionList } from "@/components/app/panel";
import { Badge } from "@/components/app/badge";
import { ProfileForm } from "@/components/portal/profile-form";
import { requireClient } from "@/lib/auth/current-client";

export const metadata: Metadata = {
  title: "Your Profile",
  robots: { index: false, follow: false },
};

function formatDate(value: unknown): string {
  if (!value) return "—";
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export default async function PortalProfilePage() {
  const client = await requireClient("/portal/profile");

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader
        title="Your profile"
        description="The details we use to identify you and keep in touch about your case."
        breadcrumbs={[
          { name: "Portal", href: "/portal" },
          { name: "Profile", href: "/portal/profile" },
        ]}
      />

      <div className="flex flex-col gap-6">
        <Panel
          title="Your details"
          description="Changes here update how we address you in messages and documents."
        >
          <ProfileForm
            firstName={String(client.firstName || "")}
            lastName={String(client.lastName || "")}
            phone={String(client.phone || "")}
          />
        </Panel>

        <Panel
          title="Email address"
          description="Your sign-in address, and where every notification is sent."
        >
          <div className="px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-navy-800 text-sm font-semibold">{String(client.email)}</p>
              {client.emailVerifiedAt ? (
                <Badge tone="positive">Verified</Badge>
              ) : (
                <Badge tone="warning">Not yet verified</Badge>
              )}
            </div>
            {/* Stated plainly rather than shown as a disabled input with no
                explanation — email is the login identity, the key every
                invitation is issued against, and the notification address. */}
            <p className="text-ink-600 mt-3 max-w-xl text-sm">
              Your email address can&apos;t be changed here, because it&apos;s how you sign in and
              how we reach you about your case. If you need it updated, message your case team or
              contact us and we&apos;ll take care of it.
            </p>
          </div>
        </Panel>

        <Panel title="Account">
          <DefinitionList
            items={[
              { label: "Member since", value: formatDate(client.createdAt) },
              {
                label: "Last sign-in",
                value: client.lastLoginAt ? formatDate(client.lastLoginAt) : "This is your first",
              },
              {
                label: "Password last changed",
                value: client.passwordChangedAt ? formatDate(client.passwordChangedAt) : "Never",
              },
            ]}
          />
        </Panel>

        <div className="border-ink-200 rounded-xl border border-dashed bg-white/60 px-5 py-4">
          <p className="text-ink-600 flex flex-wrap items-center gap-2 text-sm">
            <ShieldCheck size={16} aria-hidden className="text-navy-600" />
            Manage your password and signed-in devices in{" "}
            <Link href="/portal/security" className="text-navy-700 font-semibold hover:underline">
              Security
            </Link>
            .
          </p>
        </div>
      </div>
    </Container>
  );
}
