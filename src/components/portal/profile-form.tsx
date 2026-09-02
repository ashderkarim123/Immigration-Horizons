"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/forms/fields";
import { postPortalJson } from "@/lib/auth/portal-fetch";

/**
 * Profile details form (ADR-011 §4).
 *
 * Errors and the success confirmation are both announced to assistive
 * technology (`role="alert"` / `role="status"`), because a form whose only
 * feedback is a colour change tells a screen-reader user nothing.
 */
export function ProfileForm({
  firstName,
  lastName,
  phone,
}: {
  firstName: string;
  lastName: string;
  phone: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const result = await postPortalJson("/api/portal/profile", {
      firstName: String(form.get("firstName") || ""),
      lastName: String(form.get("lastName") || ""),
      phone: String(form.get("phone") || ""),
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setNotice(
      result.outcome === "unchanged" ? "No changes to save." : "Your details have been updated.",
    );
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-5 py-5 sm:px-6" noValidate>
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="border-navy-200 bg-navy-50 text-navy-800 rounded-lg border px-3 py-2 text-sm"
        >
          {notice}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" required>
          <TextInput
            id="firstName"
            name="firstName"
            defaultValue={firstName}
            autoComplete="given-name"
            maxLength={80}
            required
          />
        </Field>
        <Field label="Last name" htmlFor="lastName">
          <TextInput
            id="lastName"
            name="lastName"
            defaultValue={lastName}
            autoComplete="family-name"
            maxLength={80}
          />
        </Field>
      </div>

      <Field
        label="Phone"
        htmlFor="phone"
        hint="Optional. Include your country code so we can reach you."
      >
        <TextInput
          id="phone"
          name="phone"
          type="tel"
          defaultValue={phone}
          autoComplete="tel"
          maxLength={40}
        />
      </Field>

      <div>
        <Button type="submit" variant="gold" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
