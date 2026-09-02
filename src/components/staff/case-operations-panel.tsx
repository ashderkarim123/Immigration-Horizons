"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Field, Select } from "@/components/forms/fields";
import { postAppJson } from "@/lib/auth/portal-fetch";

/**
 * Case assignment and stage controls (ADR-010 §3).
 *
 * A client component because it posts and then refreshes in place — an
 * operator changing a stage should see the activity timeline and the
 * client-visible system message appear without navigating away.
 *
 * It renders only the controls the server said this role holds. That is
 * presentation: the route re-checks the capability and the row-level case
 * scope on every request, so removing the `disabled` attribute in dev
 * tools changes nothing.
 */

type Employee = { id: string; name: string; role: string };
type StageOption = { value: string; label: string };

export function CaseOperationsPanel({
  caseId,
  currentStage,
  currentManagerId,
  employees,
  stages,
  canAssignManager,
  canChangeStage,
}: {
  caseId: string;
  currentStage: string;
  currentManagerId: string | null;
  employees: Employee[];
  stages: StageOption[];
  canAssignManager: boolean;
  canChangeStage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"manager" | "stage" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(
    kind: "manager" | "stage",
    path: string,
    body: Record<string, unknown>,
    unchangedMessage: string,
    changedMessage: string,
  ) {
    setPending(kind);
    setError(null);
    setNotice(null);

    const result = await postAppJson(path, body);
    setPending(null);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setNotice(result.outcome === "unchanged" ? unchangedMessage : changedMessage);
    router.refresh();
  }

  async function handleManager(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("projectManagerId") || "");
    if (!value) {
      setError("Choose a project manager.");
      return;
    }
    await submit(
      "manager",
      `/api/staff/cases/${caseId}/manager`,
      { projectManagerId: value },
      "That team member already manages this case.",
      "Project manager updated.",
    );
  }

  async function handleStage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("stage") || "");
    await submit(
      "stage",
      `/api/staff/cases/${caseId}/stage`,
      { stage: value },
      "The case is already at that stage.",
      "Stage updated and the client has been notified.",
    );
  }

  return (
    <div className="flex flex-col gap-5 px-5 py-5 sm:px-6">
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="border-navy-200 bg-navy-50 text-navy-800 rounded-lg border px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}

      {canAssignManager ? (
        <form onSubmit={handleManager} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Field label="Project manager" htmlFor="projectManagerId">
              <Select
                id="projectManagerId"
                name="projectManagerId"
                defaultValue={currentManagerId ?? ""}
                className="!py-2.5"
              >
                <option value="">Select a team member…</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <button
            type="submit"
            disabled={pending !== null}
            className="bg-navy-900 hover:bg-navy-800 shrink-0 rounded-xl px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors disabled:opacity-60"
          >
            {pending === "manager" ? "Saving…" : "Assign"}
          </button>
        </form>
      ) : null}

      {canChangeStage ? (
        <form onSubmit={handleStage} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Field
              label="Case stage"
              htmlFor="stage"
              hint="Changing the stage posts a client-visible update to the case."
            >
              <Select id="stage" name="stage" defaultValue={currentStage} className="!py-2.5">
                {stages.map((stage) => (
                  <option key={stage.value} value={stage.value}>
                    {stage.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <button
            type="submit"
            disabled={pending !== null}
            className="bg-navy-900 hover:bg-navy-800 shrink-0 rounded-xl px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors disabled:opacity-60"
          >
            {pending === "stage" ? "Saving…" : "Update stage"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
