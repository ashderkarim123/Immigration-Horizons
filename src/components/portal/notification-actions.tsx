"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { postPortalJson } from "@/lib/auth/portal-fetch";

/** Marks one notification read — server re-verifies ownership via the recipient filter regardless of what id is passed. */
export function MarkNotificationReadButton({ notificationId }: { notificationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleMarkRead() {
    setPending(true);
    const result = await postPortalJson(`/api/portal/notifications/${notificationId}/read`, {});
    setPending(false);
    if (result.ok) router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleMarkRead}
      disabled={pending}
      className="text-navy-600 hover:text-navy-800 shrink-0 text-xs font-medium"
    >
      {pending ? "…" : "Mark read"}
    </button>
  );
}

export function MarkAllNotificationsReadButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleMarkAllRead() {
    setPending(true);
    const result = await postPortalJson("/api/portal/notifications/read-all", {});
    setPending(false);
    if (result.ok) router.refresh();
  }

  return (
    <Button type="button" onClick={handleMarkAllRead} disabled={pending} variant="outline" size="sm">
      {pending ? "Marking…" : "Mark all read"}
    </Button>
  );
}
