import "server-only";

import mongoose, { Schema } from "mongoose";

import { CALENDAR_EVENT_STATUSES, CALENDAR_EVENT_TYPES, CALENDAR_LIMITS } from "../content/calendar-constants";

/**
 * Mirrors server/models/CaseCalendarEvent.js (ADR-027). The portal only ever READS this collection, through
 * lib/calendar/client-view.ts, and only the client* fields of client-visible, non-cancelled events. Staff
 * (Express) is the only writer, so neither indexes nor write-time validation are declared here.
 */
const CaseCalendarEventSchema = new Schema(
  {
    case: { type: Schema.Types.ObjectId, ref: "ClientCase", required: true },
    workspace: { type: Schema.Types.ObjectId, ref: "CaseWorkspace", required: true },

    eventType: { type: String, enum: CALENDAR_EVENT_TYPES, default: "appointment" },
    internalTitle: { type: String, required: true, trim: true, maxlength: CALENDAR_LIMITS.internalTitle },
    internalDescription: { type: String, default: "", trim: true, maxlength: CALENDAR_LIMITS.internalDescription },

    allDay: { type: Boolean, default: false },
    startDate: { type: String, default: null },
    endDate: { type: String, default: null },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    timeZone: { type: String, default: null },

    location: { type: String, default: "", trim: true, maxlength: CALENDAR_LIMITS.location },
    meetingUrl: { type: String, default: null, trim: true, maxlength: CALENDAR_LIMITS.meetingUrl },

    employeeAttendees: [{ type: Schema.Types.ObjectId, ref: "AdminUser" }],

    clientVisible: { type: Boolean, default: false },
    clientTitle: { type: String, default: "", trim: true, maxlength: CALENDAR_LIMITS.clientTitle },
    clientDescription: { type: String, default: "", trim: true, maxlength: CALENDAR_LIMITS.clientDescription },

    status: { type: String, enum: CALENDAR_EVENT_STATUSES, default: "scheduled" },
    cancelledAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    createdByName: { type: String, default: "" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    updatedByName: { type: String, default: "" },
  },
  { timestamps: true },
);

export const CaseCalendarEvent =
  mongoose.models.CaseCalendarEvent || mongoose.model("CaseCalendarEvent", CaseCalendarEventSchema, "case_calendar_events");
