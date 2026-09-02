"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor } from "lucide-react";

import { Badge } from "@/components/app/badge";
import { postPortalJson } from "@/lib/auth/portal-fetch";

/**
 * Signed-in device list with per-session and bulk revocation
 * (ADR-011 §4).
 *
 * Removal is confirmed inline rather than through `window.confirm` — a
 * native dialog is unstyleable and easy to click through by reflex, and
 * this action ends someone's session.
 *
 * Signing out the *current* device is allowed and redirects to the login
 * page, because the alternative is leaving the browser holding a token
 * whose row no longer exists.
 */

export type SessionRow = {
  id: string;
  isCurrent: boolean;
  device: string;
  createdIp: string;
  lastSeenAt: string | null;
  createdAt: string | null;
};

function formatWhen(value: string | null): string {
  if (!value) return "unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleString();
}

export function SessionManager({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const otherCount = sessions.filter((s) => !s.isCurrent).length;

  async function revoke(sessionId: string) {
    setPending(sessionId);
    setError(null);
    setNotice(null);

    const result = await postPortalJson("/api/portal/security/sessions/revoke", { sessionId });
    setPending(null);
    setConfirming(null);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    if (result.redirectTo) {
      router.push(result.redirectTo);
      router.refresh();
      return;
    }

    setNotice("That device has been signed out.");
    router.refresh();
  }

  async function revokeOthers() {
    setPending("others");
    setError(null);
    setNotice(null);

    const result = await postPortalJson("/api/portal/security/sessions/revoke-others", {});
    setPending(null);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setNotice("Every other device has been signed out.");
    router.refresh();
  }

  return (
    <div>
      {error ? (
        <p
          role="alert"
          className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-6"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="mx-5 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 sm:mx-6"
        >
          {notice}
        </p>
      ) : null}

      <ul className="divide-ink-200 divide-y">
        {sessions.map((session) => (
          <li key={session.id} className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden
                className="bg-navy-50 text-navy-700 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              >
                <Monitor size={16} strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <p className="text-navy-800 flex items-center gap-2 text-sm font-semibold">
                  <span className="truncate">{session.device}</span>
                  {session.isCurrent ? <Badge tone="positive">This device</Badge> : null}
                </p>
                <p className="text-ink-500 mt-0.5 truncate text-xs">
                  Last active {formatWhen(session.lastSeenAt)}
                  {session.createdIp ? ` · ${session.createdIp}` : ""}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {confirming === session.id ? (
                <>
                  <button
                    type="button"
                    onClick={() => revoke(session.id)}
                    disabled={pending !== null}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                  >
                    {pending === session.id ? "Signing out…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="text-ink-600 hover:text-navy-800 px-2 py-1.5 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(session.id)}
                  className="border-ink-300 text-navy-700 hover:border-navy-400 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
                >
                  {session.isCurrent ? "Sign out" : "Sign out device"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {otherCount > 0 ? (
        <div className="border-ink-200 flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 sm:px-6">
          <p className="text-ink-600 text-sm">
            Don&apos;t recognise something here? Sign out everywhere else and change your password.
          </p>
          <button
            type="button"
            onClick={revokeOthers}
            disabled={pending !== null}
            className="bg-navy-900 hover:bg-navy-800 shrink-0 rounded-xl px-4 py-2 font-sans text-sm font-semibold text-white transition-colors disabled:opacity-60"
          >
            {pending === "others"
              ? "Signing out…"
              : `Sign out ${otherCount} other device${otherCount === 1 ? "" : "s"}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
