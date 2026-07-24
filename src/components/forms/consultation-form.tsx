"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, MessageCircle } from "lucide-react";

import { submitConsultation, type FormState } from "@/app/consultation/actions";
import { Button } from "@/components/ui/button";
import { caseCategories, supportServices } from "@/lib/content/services";
import { contact, whatsappLink } from "@/lib/content/site";

import {
  Field,
  Honeypot,
  Select,
  TextArea,
  TextInput,
  TrackingFields,
} from "./fields";

const initialState: FormState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="gold"
      size="lg"
      disabled={pending}
      className="w-full sm:w-auto"
    >
      {pending ? "Sending…" : "Request my free consultation"}
    </Button>
  );
}

export function ConsultationForm({
  defaultService,
  tracking = {},
}: {
  defaultService?: string;
  tracking?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(submitConsultation, initialState);

  if (state.status === "success") {
    return (
      <div className="rounded-panel border-navy-200 bg-navy-50 flex flex-col items-center gap-4 border p-10 text-center">
        <CheckCircle2 className="text-gold-600" size={44} aria-hidden />
        <h2 className="font-display text-navy-800 text-2xl font-semibold">
          Request received
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
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <Honeypot />
      <TrackingFields params={tracking} />

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

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Phone / WhatsApp"
          htmlFor="phone"
          hint="Optional, but helps us reach you faster."
        >
          <TextInput id="phone" name="phone" type="tel" autoComplete="tel" />
        </Field>
        <Field
          label="Service you're interested in"
          htmlFor="service"
          required
          error={state.errors?.service}
        >
          <Select
            id="service"
            name="service"
            defaultValue={defaultService ?? ""}
            error={!!state.errors?.service}
          >
            <option value="" disabled>
              Choose a service…
            </option>
            <optgroup label="Case categories">
              {caseCategories.map((c) => (
                <option key={c.slug} value={c.name}>
                  {c.name} — {c.tagline}
                </option>
              ))}
            </optgroup>
            <optgroup label="Single deliverables">
              {supportServices.map((s) => (
                <option key={s.slug} value={s.name}>
                  {s.name}
                </option>
              ))}
            </optgroup>
            <option value="Immigration Consultation">Not sure yet</option>
          </Select>
        </Field>
      </div>

      <Field
        label="Tell us about your situation"
        htmlFor="message"
        required
        error={state.errors?.message}
        hint="Your field, background, and what you're hoping to achieve. A few sentences is enough to start."
      >
        <TextArea
          id="message"
          name="message"
          error={!!state.errors?.message}
        />
      </Field>

      <p className="text-ink-500 text-xs leading-relaxed">
        By submitting, you agree we may contact you about your enquiry. We are an
        immigration consulting and paralegal services practice, not a law firm,
        and we do not provide legal advice.
      </p>

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
