"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, MessageCircle } from "lucide-react";

import { submitContact } from "@/app/(site)/contact/actions";
import type { FormState } from "@/app/(site)/consultation/actions";
import { trackFormAttempt, useFormTracking } from "@/components/analytics/use-form-tracking";
import { Button } from "@/components/ui/button";
import { contact, whatsappLink } from "@/lib/content/site";
import { trackingFromSearch, type TrackingParams } from "@/lib/tracking";

import { Field, Honeypot, TextArea, TextInput, TrackingFields } from "./fields";

const initialState: FormState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" disabled={pending}>
      {pending ? "Sending…" : "Send message"}
    </Button>
  );
}

export function ContactForm() {
  const [state, formAction] = useActionState(submitContact, initialState);
  useFormTracking("contact", state);

  // Read in the browser so /contact stays a static page. These are only the page's own query-string
  // campaign parameters, submitted with the form; nothing is stored in the browser.
  const [tracking, setTracking] = useState<TrackingParams>({});
  useEffect(() => {
    // Hydration-safe: the query string is not known on the server, so it is read once after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTracking(trackingFromSearch(window.location.search));
  }, []);

  if (state.status === "success") {
    return (
      <div className="rounded-panel border-navy-200 bg-navy-50 flex flex-col items-center gap-4 border p-10 text-center">
        <CheckCircle2 className="text-gold-600" size={44} aria-hidden />
        <h2 className="font-display text-navy-800 text-2xl font-semibold">
          Message sent
        </h2>
        <p className="text-ink-600 max-w-md text-[0.9375rem] leading-relaxed">
          {state.message}
        </p>
        <Button
          href={whatsappLink(contact.whatsappPrimary)}
          variant="outline"
          className="mt-2"
        >
          <MessageCircle size={16} aria-hidden />
          Message us on WhatsApp
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={() => trackFormAttempt("contact")} className="flex flex-col gap-5" noValidate>
      <Honeypot />
      <TrackingFields params={tracking as Record<string, string>} />

      {state.status === "error" && state.message ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor="name" required error={state.errors?.name}>
          <TextInput
            id="name"
            name="name"
            autoComplete="name"
            error={!!state.errors?.name}
          />
        </Field>
        <Field label="Email" htmlFor="email" required error={state.errors?.email}>
          <TextInput
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            error={!!state.errors?.email}
          />
        </Field>
      </div>

      <Field
        label="Message"
        htmlFor="message"
        required
        error={state.errors?.message}
      >
        <TextArea id="message" name="message" error={!!state.errors?.message} />
      </Field>

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
