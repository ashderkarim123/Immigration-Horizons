"use client";

import { useState, type FormEvent } from "react";

import { Field, TextInput } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { postPortalJson } from "@/lib/auth/portal-fetch";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    const form = new FormData(event.currentTarget);
    const result = await postPortalJson("/api/portal/forgot-password", {
      email: String(form.get("email") ?? ""),
    });

    setPending(false);
    // Deliberately shown on both success and failure — the endpoint always
    // returns the same generic message so the response never reveals
    // whether the email has an account.
    setMessage(
      result.ok
        ? result.message ?? "If an account exists for that email, we've sent password reset instructions."
        : result.error.message,
    );
  }

  if (message) {
    return (
      <p className="rounded-xl border border-navy-200 bg-navy-50 px-4 py-3 text-sm text-navy-800">
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <Field label="Email" htmlFor="email" required>
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
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
        {pending ? "Sending…" : "Send reset instructions"}
      </Button>
    </form>
  );
}
