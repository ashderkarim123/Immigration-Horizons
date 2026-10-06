const mongoose = require('mongoose');
const { EVENT_TYPES, EVENT_STATUSES, LIMITS } = require('../utils/calendarConstants');
const { isValidTimezone, isDateString } = require('../utils/calendarTime');

const { ObjectId } = mongoose.Schema.Types;

/**
 * A manual, case-scoped date that no other domain already owns (ADR-027). The ONLY calendar-specific persistent
 * model: tasks, document requests, USCIS deadlines, target filing dates and appointments stay in their own
 * collections and are projected at read time. Cancellation is a status, never a delete.
 *
 * All-day events carry plain "YYYY-MM-DD" strings (they never shift with a timezone); timed events carry UTC
 * instants plus the IANA zone they were scheduled in. `internal*` text is Staff-only; `client*` text is what a
 * client sees, and only when `clientVisible` is set.
 */
const CaseCalendarEventSchema = new mongoose.Schema(
  {
    case: { type: ObjectId, ref: 'ClientCase', required: true },
    workspace: { type: ObjectId, ref: 'CaseWorkspace', required: true },

    eventType: { type: String, enum: EVENT_TYPES, default: 'appointment' },
    internalTitle: { type: String, required: true, trim: true, maxlength: LIMITS.internalTitle },
    internalDescription: { type: String, default: '', trim: true, maxlength: LIMITS.internalDescription },

    allDay: { type: Boolean, default: false },
    startDate: { type: String, default: null },
    endDate: { type: String, default: null },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    timeZone: { type: String, default: null },

    location: { type: String, default: '', trim: true, maxlength: LIMITS.location },
    meetingUrl: { type: String, default: null, trim: true, maxlength: LIMITS.meetingUrl },

    employeeAttendees: [{ type: ObjectId, ref: 'AdminUser' }],

    clientVisible: { type: Boolean, default: false },
    clientTitle: { type: String, default: '', trim: true, maxlength: LIMITS.clientTitle },
    clientDescription: { type: String, default: '', trim: true, maxlength: LIMITS.clientDescription },

    status: { type: String, enum: EVENT_STATUSES, default: 'scheduled' },
    cancelledAt: { type: Date, default: null },

    createdBy: { type: ObjectId, ref: 'AdminUser', default: null },
    createdByName: { type: String, default: '' },
    updatedBy: { type: ObjectId, ref: 'AdminUser', default: null },
    updatedByName: { type: String, default: '' },
  },
  { timestamps: true },
);

// The model re-checks what the service validates, so no code path can persist an inconsistent event.
CaseCalendarEventSchema.pre('validate', function () {
  if (this.allDay) {
    if (!isDateString(this.startDate)) throw new Error('An all-day event requires startDate (YYYY-MM-DD).');
    if (this.startAt || this.endAt) throw new Error('An all-day event must not have startAt or endAt.');
    if (this.endDate && (!isDateString(this.endDate) || this.endDate < this.startDate)) throw new Error('endDate must be a date on or after startDate.');
  } else {
    if (!this.startAt) throw new Error('A timed event requires startAt.');
    if (!isValidTimezone(this.timeZone)) throw new Error('A timed event requires a valid IANA timeZone.');
    if (this.startDate || this.endDate) throw new Error('A timed event must not have startDate or endDate.');
    if (this.endAt && this.endAt < this.startAt) throw new Error('endAt must not be before startAt.');
  }
  if (this.meetingUrl) {
    let ok = false;
    try {
      ok = new URL(this.meetingUrl).protocol === 'https:';
    } catch {
      ok = false;
    }
    if (!ok) throw new Error('meetingUrl must be an https URL.');
  }
  if (this.clientVisible && !String(this.clientTitle || '').trim()) throw new Error('A client-visible event requires a clientTitle.');
  if (this.status === 'cancelled' && !this.cancelledAt) throw new Error('A cancelled event requires cancelledAt.');
});

CaseCalendarEventSchema.index({ case: 1, status: 1, startAt: 1 });
CaseCalendarEventSchema.index({ case: 1, status: 1, startDate: 1 });
CaseCalendarEventSchema.index({ startAt: 1, status: 1 });
CaseCalendarEventSchema.index({ startDate: 1, status: 1 });

CaseCalendarEventSchema.statics.EVENT_TYPES = EVENT_TYPES;
CaseCalendarEventSchema.statics.STATUSES = EVENT_STATUSES;

module.exports = mongoose.model('CaseCalendarEvent', CaseCalendarEventSchema, 'case_calendar_events');
