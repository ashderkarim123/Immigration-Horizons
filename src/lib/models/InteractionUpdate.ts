import "server-only";

import mongoose, { Schema } from "mongoose";

import { UPDATE_TYPES, UPDATE_VISIBILITY } from "../content/interaction-constants";

/** Mirrors server/models/InteractionUpdate.js — not chat, see ADR-003 §9. */
const InteractionUpdateSchema = new Schema(
  {
    interaction: { type: Schema.Types.ObjectId, ref: "ConsultationInteraction", required: true },

    authorType: { type: String, enum: ["client", "admin", "system"], required: true },
    authorClient: { type: Schema.Types.ObjectId, ref: "ClientUser", default: null },
    authorAdmin: { type: Schema.Types.ObjectId, default: null },
    authorName: { type: String, default: "" },

    updateType: { type: String, enum: UPDATE_TYPES, required: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    visibility: { type: String, enum: UPDATE_VISIBILITY, required: true },

    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

InteractionUpdateSchema.pre("validate", function (this: mongoose.Document & Record<string, unknown>) {
  if (this.authorType === "client") {
    if (!this.authorClient) throw new Error('authorType "client" requires authorClient.');
    if (this.authorAdmin) throw new Error('authorType "client" must not set authorAdmin.');
    if (this.visibility !== "client_visible") {
      throw new Error("a client-authored update must be client_visible.");
    }
  } else if (this.authorType === "admin") {
    if (!this.authorAdmin) throw new Error('authorType "admin" requires authorAdmin.');
    if (this.authorClient) throw new Error('authorType "admin" must not set authorClient.');
  }
});

InteractionUpdateSchema.index({ interaction: 1, createdAt: 1 });
InteractionUpdateSchema.index({ interaction: 1, visibility: 1, createdAt: 1 });

export const InteractionUpdate =
  mongoose.models.InteractionUpdate ||
  mongoose.model("InteractionUpdate", InteractionUpdateSchema, "interaction_updates");
