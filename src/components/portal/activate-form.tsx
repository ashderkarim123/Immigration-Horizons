"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Field, TextInput } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { postPortalJson } from "@/lib/auth/portal-fetch";

export function ActivateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <p
        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        role="alert"
      >
        This activation link is missing its token. Please use the link from
        your email, or request a new one by contacting us.
      </p>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const result = await postPortalJson("/api/portal/activate", {
      token,
      password: String(form.get("password") ?? ""),
      confirmPassword: String(form.get("confirmPassword") ?? ""),
      acceptedTerms: form.get("acceptedTerms") === "on",
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

      <Field
        label="Create a password"
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

      <Field label="Confirm password" htmlFor="confirmPassword" required>
        <TextInput
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>

      <label className="text-ink-600 flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="acceptedTerms"
          className="border-ink-300 mt-0.5 h-4 w-4 rounded"
          required
        />
        I agree to the{" "}
        <a href="/terms" className="text-navy-700 hover:underline">
          Terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="text-navy-700 hover:underline">
          Privacy Policy
        </a>
        .
      </label>

      <Button
        type="submit"
        variant="gold"
        size="lg"
        disabled={pending}
        className="w-full"
      >
        {pending ? "Activating…" : "Activate my account"}
      </Button>
    </form>
  );
}
