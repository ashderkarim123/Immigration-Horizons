"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { postPortalJson } from "@/lib/auth/portal-fetch";

/** Sends a new top-level message or a reply — exactly one of channelId/parentMessageId is expected per instance. */
export function MessageComposer({
  channelId,
  parentMessageId,
  placeholder = "Write a message…",
}: {
  channelId?: string;
  parentMessageId?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const bodyText = String(formData.get("body") || "");
    const idempotencyKey = crypto.randomUUID();

    const path = parentMessageId ? `/api/portal/messages/${parentMessageId}/replies` : `/api/portal/channels/${channelId}/messages`;

    const result = await postPortalJson(path, { body: bodyText, idempotencyKey });

    if (!result.ok) {
      setPending(false);
      setError(result.error.message);
      return;
    }

    formRef.current?.reset();
    setPending(false);
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-2" noValidate>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <textarea
        name="body"
        required
        maxLength={8000}
        rows={3}
        placeholder={placeholder}
        className="border-ink-200 focus:border-navy-400 w-full rounded-xl border p-3 text-sm focus:outline-none"
      />
      <div>
        <Button type="submit" variant="gold" size="sm" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
