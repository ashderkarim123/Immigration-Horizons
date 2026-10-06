/**
 * Manual case calendar events (ADR-027): create, edit, cancel, load. The only calendar data this app owns.
 *
 * Handlers authorize (calendar.view/manage, then case row access) and delegate here; the service validates, converts
 * wall-clock input to exact instants with Luxon, and writes a SAFE CaseActivity line (event type and actor only: never
 * the internal title, description, location or meeting link). Cancellation is a status, never a delete, and a cancelled
 * event is final. Attendees must be active employee members of the case workspace.
 */
const mongoose = require('mongoose');

const CaseCalendarEvent = require('../models/CaseCalendarEvent');
const CaseActivity = require('../models/CaseActivity');
const WorkspaceMember = require('../models/WorkspaceMember');
const AdminUser = require('../models/admin/User');
const { EVENT_TYPES, LIMITS } = require('../utils/calendarConstants');
const T = require('../utils/calendarTime');

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const invalid = (errors) => ({ outcome: 'validation_error', errors });
const actorOf = (staff) => ({ type: 'admin_user', id: staff._id, name: staff.name || 'Employee' });
const idOf = (v) => String(v._id || v);

const recordActivity = (event, type, message, actor) =>
  CaseActivity.record({ caseId: event.case, workspaceId: event.workspace, type, message, actor }).catch((err) => console.error('[calendar] activity failed:', err.message));

/** The editable shape of a stored event, so a PATCH can be merged and the WHOLE result validated like a create. */
function toInput(e) {
  return {
    eventType: e.eventType,
    title: e.internalTitle,
    description: e.internalDescription,
    allDay: e.allDay,
    startDate: e.startDate,
    endDate: e.endDate,
    startLocal: e.allDay ? null : T.instantToLocal(e.startAt, e.timeZone),
    endLocal: e.allDay || !e.endAt ? null : T.instantToLocal(e.endAt, e.timeZone),
    timeZone: e.timeZone,
    location: e.location,
    meetingUrl: e.meetingUrl,
    attendeeIds: (e.employeeAttendees || []).map(idOf),
    clientVisible: e.clientVisible,
    clientTitle: e.clientTitle,
    clientDescription: e.clientDescription,
  };
}

const bounded = (errors, key, label, value, max) => {
  if (value.length > max) errors[key] = `${label} must be at most ${max} characters.`;
};

/** Validates a complete event input and returns the fields to persist. Attendees are checked separately (they need the database). */
function readFields(input) {
  const errors = {};
  const v = {};

  v.eventType = text(input.eventType) || 'appointment';
  if (!EVENT_TYPES.includes(v.eventType)) errors.eventType = 'Choose an event type from the list.';

  v.internalTitle = text(input.title);
  if (!v.internalTitle) errors.title = 'Enter a title.';
  bounded(errors, 'title', 'The title', v.internalTitle, LIMITS.internalTitle);
  v.internalDescription = text(input.description);
  bounded(errors, 'description', 'The description', v.internalDescription, LIMITS.internalDescription);
  v.location = text(input.location);
  bounded(errors, 'location', 'The location', v.location, LIMITS.location);

  v.meetingUrl = text(input.meetingUrl) || null;
  if (v.meetingUrl) {
    let ok = v.meetingUrl.length <= LIMITS.meetingUrl;
    try {
      ok = ok && new URL(v.meetingUrl).protocol === 'https:';
    } catch {
      ok = false;
    }
    if (!ok) errors.meetingUrl = 'Enter a secure link starting with https://.';
  }

  v.allDay = input.allDay === true;
  if (v.allDay) {
    v.startDate = text(input.startDate);
    v.endDate = text(input.endDate) || null;
    v.startAt = v.endAt = v.timeZone = null;
    if (!T.isDateString(v.startDate)) errors.startDate = 'Enter the date.';
    else if (v.endDate && (!T.isDateString(v.endDate) || v.endDate < v.startDate)) errors.endDate = 'The end date must be on or after the start date.';
  } else {
    v.startDate = v.endDate = null;
    v.timeZone = text(input.timeZone);
    if (!T.isValidTimezone(v.timeZone)) errors.timeZone = 'Choose a time zone such as America/New_York.';
    v.startAt = errors.timeZone ? null : T.localToInstant(text(input.startLocal), v.timeZone);
    if (!errors.timeZone && !v.startAt) errors.startLocal = 'Enter the start date and time.';
    const endLocal = text(input.endLocal);
    v.endAt = null;
    if (endLocal && !errors.timeZone) {
      v.endAt = T.localToInstant(endLocal, v.timeZone);
      if (!v.endAt) errors.endLocal = 'Enter the end date and time.';
      else if (v.startAt && v.endAt < v.startAt) errors.endLocal = 'The end must not be before the start.';
    }
  }

  v.clientVisible = input.clientVisible === true;
  v.clientTitle = text(input.clientTitle);
  v.clientDescription = text(input.clientDescription);
  bounded(errors, 'clientTitle', 'The client title', v.clientTitle, LIMITS.clientTitle);
  bounded(errors, 'clientDescription', 'The client description', v.clientDescription, LIMITS.clientDescription);
  if (v.clientVisible && !v.clientTitle) errors.clientTitle = 'Enter what the client should see as the title.';

  const attendeeIds = Array.isArray(input.attendeeIds) ? [...new Set(input.attendeeIds.map(String))] : [];
  if (attendeeIds.length > LIMITS.attendees) errors.attendeeIds = `Add at most ${LIMITS.attendees} attendees.`;
  else if (attendeeIds.some((a) => !mongoose.Types.ObjectId.isValid(a))) errors.attendeeIds = 'One of the attendees is not valid.';
  v.attendeeIds = attendeeIds;

  return Object.keys(errors).length ? { errors } : { values: v };
}

/** Attendees must be ACTIVE employees who are active members of this workspace; anyone else is refused, never silently dropped. */
async function checkAttendees(workspaceId, attendeeIds) {
  if (!attendeeIds.length) return null;
  const members = await WorkspaceMember.find({ workspace: workspaceId, memberType: 'employee', status: 'active', adminUser: { $in: attendeeIds } }).select('adminUser').lean();
  const memberIds = new Set(members.map((m) => idOf(m.adminUser)));
  const active = await AdminUser.find({ _id: { $in: [...memberIds] }, isActive: true }).select('_id').lean();
  const ok = new Set(active.map((u) => idOf(u)));
  return attendeeIds.every((a) => ok.has(a)) ? null : 'Attendees must be active members of this case.';
}

function applyValues(event, v) {
  Object.assign(event, {
    eventType: v.eventType,
    internalTitle: v.internalTitle,
    internalDescription: v.internalDescription,
    allDay: v.allDay,
    startDate: v.startDate,
    endDate: v.endDate && v.endDate !== v.startDate ? v.endDate : null,
    startAt: v.startAt,
    endAt: v.endAt,
    timeZone: v.timeZone,
    location: v.location,
    meetingUrl: v.meetingUrl,
    employeeAttendees: v.attendeeIds,
    clientVisible: v.clientVisible,
    clientTitle: v.clientTitle,
    clientDescription: v.clientDescription,
  });
}

async function createEvent({ caseDoc, workspace, data, actor }) {
  const checked = readFields(data);
  if (checked.errors) return invalid(checked.errors);
  const attendeeError = await checkAttendees(workspace._id, checked.values.attendeeIds);
  if (attendeeError) return invalid({ attendeeIds: attendeeError });

  const event = new CaseCalendarEvent({ case: caseDoc._id, workspace: workspace._id, createdBy: actor.id, createdByName: actor.name, updatedBy: actor.id, updatedByName: actor.name });
  applyValues(event, checked.values);
  await event.save();
  await recordActivity(event, 'calendar_event_created', `A ${event.eventType} was added to the case calendar by ${actor.name}.`, actor);
  return { outcome: 'created', event };
}

async function updateEvent({ event, data, actor }) {
  if (event.status === 'cancelled') return { outcome: 'invalid_state' };
  const merged = { ...toInput(event.toObject()), ...data };
  // Switching between all-day and timed must not carry the other mode's stale fields.
  if (data.allDay === true && !event.allDay) Object.assign(merged, { startLocal: null, endLocal: null, timeZone: null }, { startDate: data.startDate, endDate: data.endDate });
  if (data.allDay === false && event.allDay) Object.assign(merged, { startDate: null, endDate: null }, { startLocal: data.startLocal, endLocal: data.endLocal });
  const checked = readFields(merged);
  if (checked.errors) return invalid(checked.errors);
  const attendeeError = await checkAttendees(event.workspace, checked.values.attendeeIds.filter((a) => !event.employeeAttendees.map(idOf).includes(a)));
  if (attendeeError) return invalid({ attendeeIds: attendeeError });

  applyValues(event, checked.values);
  event.updatedBy = actor.id;
  event.updatedByName = actor.name;
  await event.save();
  await recordActivity(event, 'calendar_event_updated', `A ${event.eventType} on the case calendar was updated by ${actor.name}.`, actor);
  return { outcome: 'updated', event };
}

/** Idempotent: cancelling a cancelled event changes nothing and writes no second activity line. */
async function cancelEvent({ event, actor }) {
  if (event.status === 'cancelled') return { outcome: 'unchanged', event };
  event.status = 'cancelled';
  event.cancelledAt = new Date();
  event.updatedBy = actor.id;
  event.updatedByName = actor.name;
  await event.save();
  await recordActivity(event, 'calendar_event_cancelled', `A ${event.eventType} on the case calendar was cancelled by ${actor.name}.`, actor);
  return { outcome: 'cancelled', event };
}

/** Staff-facing DTO. `canManage` already includes case row access. Never used for clients. */
async function toDto(event, { canManage }) {
  const e = event.toObject ? event.toObject() : event;
  const people = e.employeeAttendees?.length ? await AdminUser.find({ _id: { $in: e.employeeAttendees } }).select('name').lean() : [];
  const names = new Map(people.map((p) => [idOf(p), p.name || '']));
  const open = e.status === 'scheduled';
  const zone = e.timeZone;
  return {
    id: idOf(e),
    caseId: idOf(e.case),
    eventType: e.eventType,
    title: e.internalTitle,
    description: e.internalDescription || '',
    allDay: !!e.allDay,
    startDate: e.startDate || null,
    endDate: e.endDate || null,
    startAt: e.startAt ? new Date(e.startAt).toISOString() : null,
    endAt: e.endAt ? new Date(e.endAt).toISOString() : null,
    startLocal: e.allDay ? null : T.instantToLocal(e.startAt, zone),
    endLocal: e.allDay ? null : T.instantToLocal(e.endAt, zone),
    timeZone: zone || null,
    location: e.location || '',
    meetingUrl: e.meetingUrl || null,
    attendees: e.employeeAttendees.map((a) => ({ id: idOf(a), name: names.get(idOf(a)) || '' })),
    clientVisible: !!e.clientVisible,
    clientTitle: e.clientTitle || '',
    clientDescription: e.clientDescription || '',
    status: e.status,
    actions: { canEdit: canManage && open, canCancel: canManage && open },
  };
}

module.exports = { actorOf, readFields, createEvent, updateEvent, cancelEvent, toDto };
