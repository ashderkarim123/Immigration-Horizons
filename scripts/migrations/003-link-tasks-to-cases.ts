import { ClientCase } from "../../src/lib/models/ClientCase";
import { Task } from "../../src/lib/models/Task";
import { addSample, emptyReport, noteUnresolved, type Migration } from "./types";

export const migration: Migration = {
  id: "003-link-tasks-to-cases",
  description: "Link legacy lead tasks to their respective ClientCase if unambiguously converted.",
  rationale:
    "Tasks originally linked only to a Consultation (`lead`) must be migrated to be native to " +
    "their corresponding `ClientCase` so that enterprise staff can operate on them within the case " +
    "workspace context. Tasks with ambiguous cases or no cases are left alone.",

  async run({ dryRun }) {
    const report = emptyReport();

    // We select Tasks that have a lead but no case assigned yet.
    const unlinkedTasks = await Task.find({ lead: { $ne: null }, case: null })
      .select("_id lead")
      .lean();

    if (!unlinkedTasks.length) return report;

    // Get the unique lead (Consultation) IDs.
    const leadIds = [...new Set(unlinkedTasks.map((t) => String(t.lead)))];

    // For each lead ID, find if there's exactly one case that has it as its consultation.
    const casesByLead = new Map<string, { id: unknown } | "ambiguous" | "unmatched">();

    for (const leadId of leadIds) {
      const cases = await ClientCase.find({ consultation: leadId })
        .select("_id")
        .lean();

      if (cases.length === 0) {
        casesByLead.set(leadId, "unmatched");
      } else if (cases.length === 1) {
        casesByLead.set(leadId, { id: cases[0]._id });
      } else {
        casesByLead.set(leadId, "ambiguous");
      }
    }

    for (const task of unlinkedTasks) {
      const leadId = String(task.lead);
      const caseMatch = casesByLead.get(leadId);

      if (!caseMatch || caseMatch === "unmatched") {
        report.alreadyDone += 1;
        continue;
      }

      if (caseMatch === "ambiguous") {
        noteUnresolved(report, "lead_matches_multiple_cases");
        addSample(report, `UNRESOLVED Task ${task._id} (Lead ${leadId})`);
        continue;
      }

      report.changed += 1;
      addSample(report, `Task ${task._id} -> case ${String(caseMatch.id)}`);

      if (!dryRun) {
        await Task.updateOne(
          { _id: task._id, case: null },
          { $set: { case: caseMatch.id } }
        );
      }
    }

    return report;
  },
};
