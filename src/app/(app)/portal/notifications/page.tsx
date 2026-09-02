import type { Metadata } from "next";
import Link from "next/link";
import { Bell, SlidersHorizontal } from "lucide-react";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/panel";
import { requireClient } from "@/lib/auth/current-client";
import { getDb } from "@/lib/db";
import { listForClient } from "@/lib/notifications/notification-service";
import { MarkNotificationReadButton, MarkAllNotificationsReadButton } from "@/components/portal/notification-actions";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default async function PortalNotificationsPage() {
  const client = await requireClient("/portal/notifications");

  const db = getDb();
  if (db) await db;

  const notifications = db ? await listForClient({ clientUserId: client._id, limit: 50 }) : [];

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader
        title="Notifications"
        description="Updates about your cases, documents, and messages."
        breadcrumbs={[
          { name: "Portal", href: "/portal" },
          { name: "Notifications", href: "/portal/notifications" },
        ]}
        actions={
          <>
            <Link
              href="/portal/notifications/preferences"
              className="text-navy-700 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
            >
              <SlidersHorizontal size={14} aria-hidden />
              Preferences
            </Link>
            <MarkAllNotificationsReadButton />
          </>
        }
      />

      <div className="rounded-panel border-ink-200 border bg-white shadow-subtle">
        {notifications.length === 0 ? (
          <EmptyState
            icon={<Bell size={28} aria-hidden />}
            title="You are all caught up"
            body="We will let you know here when something changes on your case."
          />
        ) : (
          <ul className="divide-ink-200 divide-y">
            {notifications.map((n) => (
              <li
                key={String(n._id)}
                className={`flex items-start justify-between gap-4 px-6 py-4 ${n.read ? "" : "bg-navy-50/40"}`}
              >
                <div>
                  <p className="text-navy-800 text-sm font-semibold">{n.title as string}</p>
                  <p className="text-ink-600 mt-0.5 text-sm">{n.message as string}</p>
                  <p className="text-ink-400 mt-1 text-xs">{timeAgo(n.createdAt as unknown as Date)}</p>
                </div>
                {!n.read ? <MarkNotificationReadButton notificationId={String(n._id)} /> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Container>
  );
}
