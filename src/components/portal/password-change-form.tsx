"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/forms/fields";
import { postPortalJson } from "@/lib/auth/portal-fetch";

/**
 * Password change form (ADR-011 §4).
 *
 * Three UX decisions worth stating:
 *
 *  - The minimum length is shown **before** submission, not discovered by
 *    failing. Length is the only rule (NIST 800-63B); there is no
 *    special-character theatre to explain.
 *  - The form clears itself on success, so a filled password field is
 *    never left sitting in a shared browser.
 *  - The confirmation names the side effect — other devices were signed
 *    out — because that is surprising if it happens silently.
 */
export function PasswordChangeForm({ minLength }: { minLength: number }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const result = await postPortalJson("/api/portal/security/password", {
      currentPassword: String(form.get("currentPassword") || ""),
      newPassword: String(form.get("newPassword") || ""),
      confirmPassword: String(form.get("confirmPassword") || ""),
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    formRef.current?.reset();
    setNotice("Your password has been changed. Any other signed-in devices were signed out.");
    router.refresh();
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 px-5 py-5 sm:px-6"
      noValidate
    >
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {notice}
        </p>
      ) : null}

      <Field label="Current password" htmlFor="currentPassword" required>
        <TextInput
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          label="New password"
          htmlFor="newPassword"
          required
          hint={`At least ${minLength} characters. Length matters more than symbols.`}
        >
          <TextInput
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={minLength}
            required
          />
        </Field>
        <Field label="Confirm new password" htmlFor="confirmPassword" required>
          <TextInput
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={minLength}
            required
          />
        </Field>
      </div>

      <div>
        <Button type="submit" variant="gold" size="sm" disabled={pending}>
          {pending ? "Changing…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
