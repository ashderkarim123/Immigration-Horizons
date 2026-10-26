"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

/** Asks the server to email a fresh activation link to the account's own address. */
export function ResendActivationButton() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function resend() {
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/portal/resend-activation", { method: "POST" });
      if (res.ok) return setStatus({ kind: "sent" });
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setStatus({ kind: "error", message: body?.error?.message ?? "We could not send the email. Please try again shortly." });
    } catch {
      setStatus({ kind: "error", message: "We could not reach the server. Please check your connection and try again." });
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="primary" onClick={resend} disabled={status.kind === "sending"}>
        {status.kind === "sending" ? "Sending…" : "Resend activation email"}
      </Button>
      <p className="text-sm" role="status" aria-live="polite">
        {status.kind === "sent" ? <span className="text-navy-800">A new activation link is on its way. Check your inbox and spam folder.</span> : null}
        {status.kind === "error" ? <span className="text-red-700">{status.message}</span> : null}
      </p>
    </div>
  );
}
