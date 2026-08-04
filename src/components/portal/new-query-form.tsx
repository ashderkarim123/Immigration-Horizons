"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Field, Select, TextArea, TextInput } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { postPortalJson } from "@/lib/auth/portal-fetch";

type ConsultationOption = { id: string; label: string };
type CaseOption = { id: string; workspaceId: string; label: string };

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "follow_up_query", label: "Follow-up question" },
  { value: "scheduled_consultation", label: "Request a consultation" },
  { value: "client_question", label: "Question about my case" },
  { value: "case_update_request", label: "Case update request" },
];

export function NewQueryForm({
  consultations,
  cases,
}: {
  consultations: ConsultationOption[];
  cases: CaseOption[];
}) {
  const router = useRouter();
  const [scope, setScope] = useState<"consultation" | "case">(
    consultations.length ? "consultation" : "case",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const selectedCase = cases.find((c) => c.id === form.get("caseId"));

    const result = await postPortalJson("/api/portal/interactions", {
      scopeType: scope,
      consultationId: scope === "consultation" ? form.get("consultationId") : undefined,
      caseId: scope === "case" ? selectedCase?.id : undefined,
      workspaceId: scope === "case" ? selectedCase?.workspaceId : undefined,
      type: form.get("type"),
      subject: form.get("subject"),
      description: form.get("description"),
    });

    if (!result.ok) {
      setPending(false);
      setError(result.error.message);
      return;
    }

    router.push(result.redirectTo ?? "/portal/queries");
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

      {consultations.length > 0 && cases.length > 0 ? (
        <Field label="This is about" htmlFor="scope">
          <Select
            id="scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as "consultation" | "case")}
          >
            <option value="consultation">My consultation</option>
            <option value="case">An active case</option>
          </Select>
        </Field>
      ) : null}

      {scope === "consultation" ? (
        <Field label="Consultation" htmlFor="consultationId" required>
          <Select id="consultationId" name="consultationId" required>
            {consultations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label="Case" htmlFor="caseId" required>
          <Select id="caseId" name="caseId" required>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Type" htmlFor="type" required>
        <Select id="type" name="type" required>
          {TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Subject" htmlFor="subject" required>
        <TextInput id="subject" name="subject" required maxLength={200} />
      </Field>

      <Field label="Details" htmlFor="description" required>
        <TextArea id="description" name="description" required maxLength={5000} />
      </Field>

      <Button type="submit" variant="gold" size="lg" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Submitting…" : "Submit"}
      </Button>
    </form>
  );
}
