import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
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
    <Container width="prose" className="py-16 sm:py-20">
      <Link href="/portal/notifications" className="text-navy-700 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
        <ArrowLeft size={14} aria-hidden />
        Back to notifications
      </Link>

      <h1 className="font-display text-navy-900 mt-4 text-2xl font-semibold sm:text-3xl">Notification Preferences</h1>
      <p className="text-ink-600 mt-1 text-[0.9375rem]">
        Choose what emails you receive alongside your in-app notifications.
      </p>

      <div className="rounded-panel border-ink-200 mt-8 border bg-white p-6 shadow-subtle">
        <NotificationPreferencesForm
          initialMentionEmails={Boolean(preferences.mentionEmails)}
          initialDigestEmails={Boolean(preferences.digestEmails)}
          initialDigestFrequency={(preferences.digestFrequency as "daily" | "weekly" | "off") ?? "daily"}
        />
      </div>
    </Container>
  );
}
