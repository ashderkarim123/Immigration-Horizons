"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { TextArea } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { postPortalJson } from "@/lib/auth/portal-fetch";

export function FollowUpForm({ interactionId }: { interactionId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    const result = await postPortalJson(`/api/portal/interactions/${interactionId}/follow-up`, {
      body: form.get("body"),
    });

    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    (event.currentTarget as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <TextArea name="body" placeholder="Add a follow-up…" required maxLength={5000} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
        {pending ? "Sending…" : "Send follow-up"}
      </Button>
    </form>
  );
}

export function ResolutionActions({ interactionId }: { interactionId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"resolved" | "help" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(resolved: boolean) {
    setPending(resolved ? "resolved" : "help");
    setError(null);
    const result = await postPortalJson(`/api/portal/interactions/${interactionId}/resolution`, {
      resolved,
    });
    setPending(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="gold"
          size="sm"
          disabled={pending !== null}
          onClick={() => respond(true)}
        >
          {pending === "resolved" ? "Saving…" : "Resolved"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending !== null}
          onClick={() => respond(false)}
        >
          {pending === "help" ? "Saving…" : "I need more help"}
        </Button>
      </div>
    </div>
  );
}
