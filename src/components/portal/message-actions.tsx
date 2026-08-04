"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { postPortalJson } from "@/lib/auth/portal-fetch";

/** Delete-own-message action — shown only for the client's own, not-yet-deleted messages (server re-verifies ownership regardless). */
export function MessageActions({ messageId }: { messageId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this message?")) return;
    setPending(true);
    const result = await postPortalJson(`/api/portal/messages/${messageId}/delete`, {});
    setPending(false);
    if (result.ok) router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="text-ink-400 hover:text-red-600 text-xs font-medium"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
