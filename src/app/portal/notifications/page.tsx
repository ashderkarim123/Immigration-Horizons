import type { Metadata } from "next";
import Link from "next/link";
import { Bell, SlidersHorizontal } from "lucide-react";

import { Container } from "@/components/ui/container";
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
    <Container width="default" className="py-16 sm:py-20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-navy-900 flex items-center gap-2 text-2xl font-semibold sm:text-3xl">
            <Bell size={24} strokeWidth={1.75} aria-hidden />
            Notifications
          </h1>
          <p className="text-ink-600 mt-1 text-[0.9375rem]">Updates about your cases, documents, and messages.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/portal/notifications/preferences"
            className="text-navy-700 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
          >
            <SlidersHorizontal size={14} aria-hidden />
            Preferences
          </Link>
          <MarkAllNotificationsReadButton />
        </div>
      </div>

      <div className="rounded-panel border-ink-200 mt-8 border bg-white shadow-subtle">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <Bell className="text-ink-400" size={32} aria-hidden />
            <p className="text-ink-600 text-sm">You&apos;re all caught up.</p>
          </div>
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
