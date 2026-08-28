"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/forms/fields";
import { postPortalJson } from "@/lib/auth/portal-fetch";

export function StaffLoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const result = await postPortalJson("/api/staff/login", {
      email: String(formData.get("email") || ""),
      password: String(formData.get("password") || ""),
      next,
    });

    if (!result.ok) {
      setPending(false);
      setError(result.error.message);
      return;
    }

    router.push(result.redirectTo ?? "/staff");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <Field label="Work email" htmlFor="email" required>
        <TextInput id="email" name="email" type="email" autoComplete="username" required />
      </Field>

      <Field label="Password" htmlFor="password" required>
        <TextInput
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Button type="submit" variant="gold" disabled={pending} block>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
