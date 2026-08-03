"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Field, TextInput } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { postPortalJson } from "@/lib/auth/portal-fetch";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? undefined;

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const result = await postPortalJson("/api/portal/login", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      next,
    });

    if (!result.ok) {
      setPending(false);
      setError(result.error.message);
      return;
    }

    router.push(result.redirectTo ?? "/portal");
    router.refresh();
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

      <Field label="Email" htmlFor="email" required>
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
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

      <div className="flex justify-end">
        <a
          href="/portal/forgot-password"
          className="text-navy-700 font-sans text-sm hover:underline"
        >
          Forgot password?
        </a>
      </div>

      <Button
        type="submit"
        variant="gold"
        size="lg"
        disabled={pending}
        className="w-full"
      >
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
