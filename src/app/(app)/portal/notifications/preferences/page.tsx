import type { Metadata } from "next";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { requireClient } from "@/lib/auth/current-client";
import { getDb } from "@/lib/db";
import { getOrCreatePreferences } from "@/lib/notifications/notification-service";
import { NotificationPreferencesForm } from "@/components/portal/notification-preferences-form";

export const metadata: Metadata = {
  title: "Notification Preferences",
  robots: { index: false, follow: false },
};

export default async function PortalNotificationPreferencesPage() {
  const client = await requireClient("/portal/notifications/preferences");

  const db = getDb();
  if (db) await db;

  const preferences = db
    ? await getOrCreatePreferences({ recipientType: "client", recipientClientId: client._id })
    : { mentionEmails: true, digestEmails: true, digestFrequency: "daily" as const };

  return (
    <Container width="prose" className="py-10 sm:py-14">
      <PageHeader
        title="Notification preferences"
        description="Choose what emails you receive alongside your in-app notifications."
        breadcrumbs={[
          { name: "Portal", href: "/portal" },
          { name: "Notifications", href: "/portal/notifications" },
          { name: "Preferences", href: "/portal/notifications/preferences" },
        ]}
      />

      <div className="rounded-panel border-ink-200 border bg-white p-6 shadow-subtle">
        <NotificationPreferencesForm
          initialMentionEmails={Boolean(preferences.mentionEmails)}
          initialDigestEmails={Boolean(preferences.digestEmails)}
          initialDigestFrequency={(preferences.digestFrequency as "daily" | "weekly" | "off") ?? "daily"}
        />
      </div>
    </Container>
  );
}
