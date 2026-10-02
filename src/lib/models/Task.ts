import "server-only";

import mongoose, { Schema } from "mongoose";

/**
 * Read-only mirror of server/models/admin/Task.js (ADR-009 §5).
 *
 * Note the shape this inherits: `Task.lead` references a **Consultation**,
 * not a ClientCase — tasks predate the case domain (they came with the
 * Phase 9 lead-operations work) and were never migrated onto cases. So a
 * specialist's "assigned work" is lead-scoped, and the staff dashboard
 * surfaces it as such rather than pretending it is case-scoped.
 *
 * This app never writes a Task; creating and assigning them stays in the
 * admin CMS.
 */
const TaskSchema = new Schema(
  {
    lead: { type: Schema.Types.ObjectId, ref: "Consultation", required: false },
    case: { type: Schema.Types.ObjectId, ref: "ClientCase", default: null },
    title: { type: String, required: true },
    type: { type: String, default: "Other" },
    description: { type: String, default: "" },
    assignee: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    assigneeName: { type: String, default: "" },
    status: { type: String, enum: ["todo", "in_progress", "waiting", "review", "completed"], default: "todo" },
    priority: { type: String, default: "medium" },
    dueDate: { type: Date, default: null },
    notes: { type: String, default: "" },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true },
);

export const Task = mongoose.models.Task || mongoose.model("Task", TaskSchema, "tasks");
