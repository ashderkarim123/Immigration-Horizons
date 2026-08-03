"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import { Field, TextInput } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { postPortalJson } from "@/lib/auth/portal-fetch";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <p
        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        role="alert"
      >
        This reset link is missing its token. Please use the link from your
        email, or request a new one.
      </p>
    );
  }

  if (done) {
    return (
      <p className="rounded-xl border border-navy-200 bg-navy-50 px-4 py-3 text-sm text-navy-800">
        Your password has been reset. You can now{" "}
        <a href="/portal/login" className="font-semibold hover:underline">
          sign in
        </a>{" "}
        with your new password.
      </p>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const result = await postPortalJson("/api/portal/reset-password", {
      token,
      password: String(form.get("password") ?? ""),
      confirmPassword: String(form.get("confirmPassword") ?? ""),
    });

    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setDone(true);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <Field
        label="New password"
        htmlFor="password"
        required
        hint="At least 10 characters."
      >
        <TextInput
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>

      <Field label="Confirm new password" htmlFor="confirmPassword" required>
        <TextInput
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>

      <Button
        type="submit"
        variant="gold"
        size="lg"
        disabled={pending}
        className="w-full"
      >
        {pending ? "Resetting…" : "Reset password"}
      </Button>
    </form>
  );
}
