"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { UserMinus } from "lucide-react";

import { Field, Select } from "@/components/forms/fields";
import { Badge } from "@/components/app/badge";
import { postAppJson } from "@/lib/auth/portal-fetch";

/**
 * Workspace membership management (ADR-010 §3).
 *
 * Both the roster and the controls live here so a removal updates the list
 * in place. The roster is rendered from server-supplied rows; this
 * component never queries anything itself.
 *
 * Removal is confirmed inline rather than via `window.confirm` — a native
 * dialog is unstyleable, easy to mis-click through, and inconsistent with
 * the rest of the console.
 */

export type MemberRow = {
  id: string;
  memberType: "client" | "employee";
  name: string;
  email: string;
  workspaceRole: string;
  status: string;
  roleCode: string | null;
  isProjectManager: boolean;
};

type Employee = { id: string; name: string; role: string };

const ASSIGNABLE_ROLES = [
  { value: "contributor", label: "Contributor" },
  { value: "case_manager", label: "Case Manager" },
  { value: "reviewer", label: "Reviewer" },
  { value: "observer", label: "Observer" },
];

export function MemberManager({
  caseId,
  members,
  employees,
  canManage,
  roleLabels,
}: {
  caseId: string;
  members: MemberRow[];
  employees: Employee[];
  canManage: boolean;
  roleLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Anyone already on the workspace is filtered out of the add list, so
  // the common case ("who is missing?") is answered by the control itself.
  const memberNames = new Set(members.map((m) => m.name));
  const addable = employees.filter((employee) => !memberNames.has(employee.name));

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const adminUserId = String(form.get("adminUserId") || "");
    if (!adminUserId) {
      setError("Choose a team member to add.");
      return;
    }

    setPending("add");
    setError(null);
    const result = await postAppJson(`/api/staff/cases/${caseId}/members`, {
      adminUserId,
      workspaceRole: String(form.get("workspaceRole") || "contributor"),
    });
    setPending(null);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  async function handleRemove(memberId: string) {
    setPending(memberId);
    setError(null);
    const result = await postAppJson(`/api/staff/cases/${caseId}/members/${memberId}/remove`, {});
    setPending(null);
    setConfirming(null);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {error ? (
        <p
          role="alert"
          className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-6"
        >
          {error}
        </p>
      ) : null}

      <ul className="divide-ink-200 divide-y">
        {members.map((member) => (
          <li key={member.id} className="px-5 py-3.5 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-navy-800 truncate text-sm font-semibold">
                  {member.name}
                  {member.isProjectManager ? (
                    <Badge tone="gold" className="ml-2">
                      Project manager
                    </Badge>
                  ) : null}
                </p>
                <p className="text-ink-500 mt-0.5 truncate text-xs">
                  {member.memberType === "client"
                    ? "Client"
                    : `${roleLabels[member.roleCode ?? ""] ?? member.roleCode ?? "Team member"} · ${member.workspaceRole.replace(/_/g, " ")}`}
                  {member.email ? ` · ${member.email}` : ""}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {member.status !== "active" ? (
                  <Badge tone="warning">{member.status}</Badge>
                ) : null}
                {canManage && member.memberType === "employee" && !member.isProjectManager ? (
                  confirming === member.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleRemove(member.id)}
                        disabled={pending !== null}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                      >
                        {pending === member.id ? "Removing…" : "Confirm"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="text-ink-600 hover:text-navy-800 px-2 py-1.5 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(member.id)}
                      aria-label={`Remove ${member.name} from this case`}
                      className="text-ink-500 hover:bg-ink-100 hover:text-navy-800 rounded-lg p-1.5 transition-colors"
                    >
                      <UserMinus size={16} aria-hidden />
                    </button>
                  )
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {canManage ? (
        <form
          onSubmit={handleAdd}
          className="border-ink-200 flex flex-col gap-3 border-t px-5 py-5 sm:flex-row sm:items-end sm:px-6"
        >
          <div className="min-w-0 flex-1">
            <Field label="Add a team member" htmlFor="adminUserId">
              <Select id="adminUserId" name="adminUserId" className="!py-2.5" defaultValue="">
                <option value="">Select…</option>
                {addable.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="sm:w-44">
            <Field label="Workspace role" htmlFor="workspaceRole">
              <Select
                id="workspaceRole"
                name="workspaceRole"
                className="!py-2.5"
                defaultValue="contributor"
              >
                {ASSIGNABLE_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
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
            {pending === "add" ? "Adding…" : "Add"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
