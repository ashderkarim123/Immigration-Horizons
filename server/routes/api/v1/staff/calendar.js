/**
 * Staff API: unified calendar (ADR-027). The calendar itself is a read-time projection of the modules that own each
 * date (services/calendarService.js); only manual case events are written here (services/calendarEvents.js).
 * Handlers authorize (capability, then case row access) and map service outcomes. A missing, malformed or
 * inaccessible event or case is one identical 404; a visible case where the actor lacks the capability is 403.
 */
const express = require('express');
const mongoose = require('mongoose');

const calendar = require('../../../../services/calendarService');
const events = require('../../../../services/calendarEvents');
const caseManagement = require('../../../../services/caseManagement');
const notificationService = require('../../../../services/notificationService');
const CaseCalendarEvent = require('../../../../models/CaseCalendarEvent');
const AdminUser = require('../../../../models/admin/User');
const { canAccessCase } = require('../../../../services/petitionPolicy');
const { can } = require('../../../../utils/permissions');
const { isValidTimezone } = require('../../../../utils/calendarTime');
const { createApiError } = require('../../../../middleware/api/apiError');
const { requireApiCapability } = require('../../../../middleware/api/staffAuth');
const { trustedOriginMiddleware } = require('../../../../middleware/api/trustedOrigin');

const router = express.Router();

const respond = (res, req, data, status = 200) => res.status(status).json({ data, meta: { requestId: req.id } });
const notFound = (what) => createApiError(404, 'not_found', `${what} not found.`);
const route = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    next(err);
  }
};
const fieldErrors = (errors) => Object.entries(errors).map(([field, message]) => ({ field, message }));
const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

function failOnOutcome(result) {
  if (result.outcome === 'validation_error') throw createApiError(422, 'validation_error', 'Please correct the highlighted fields.', fieldErrors(result.errors));
  if (result.outcome === 'invalid_state') throw createApiError(409, 'invalid_state', 'This event was cancelled and can no longer be changed.');
}

/** Case the actor may see, into req.calendarCase; else the one 404. */
const caseParam = route(async (req, res, next) => {
  const loaded = await caseManagement.loadCaseAndWorkspace(req.params.caseId);
  if (!loaded || !(await canAccessCase(req, loaded.workspace._id))) return next(notFound('Case'));
  req.calendarCase = loaded;
  return next();
});

/** Manual event (and the right to see its case) into req.calendarEvent; else the one 404. */
const eventParam = route(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.eventId)) return next(notFound('Event'));
  const event = await CaseCalendarEvent.findById(req.params.eventId);
  if (!event || !(await canAccessCase(req, event.workspace))) return next(notFound('Event'));
  req.calendarEvent = event;
  return next();
});

const dto = (req, event) => events.toDto(event, { canManage: can(req, 'calendar.manage') });

// GET /api/v1/staff/calendar/config
router.get('/calendar/config', requireApiCapability('calendar.view'), route(async (req, res) => {
  respond(res, req, await calendar.calendarConfig(req));
}));

// GET /api/v1/staff/calendar?from=&to=&timeZone=&scope=&kinds=&caseId=&assignee=&includeCompleted=
router.get('/calendar', requireApiCapability('calendar.view'), route(async (req, res) => {
  respond(res, req, await calendar.queryCalendar(req, req.query));
}));

// PATCH /api/v1/staff/calendar/preferences   { timeZone?, deadlineReminders?, appointmentReminders? }
router.patch('/calendar/preferences', trustedOriginMiddleware, requireApiCapability('calendar.view'), route(async (req, res) => {
  const data = body(req);
  const errors = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(data, k);
  if (has('timeZone') && data.timeZone !== null && data.timeZone !== '' && !isValidTimezone(data.timeZone)) errors.timeZone = 'Choose a time zone such as America/New_York.';
  for (const k of ['deadlineReminders', 'appointmentReminders']) if (has(k) && typeof data[k] !== 'boolean') errors[k] = 'Choose on or off.';
  if (!has('timeZone') && !has('deadlineReminders') && !has('appointmentReminders')) errors.timeZone = 'Nothing to update.';
  if (Object.keys(errors).length) throw createApiError(422, 'validation_error', 'Please correct the highlighted fields.', fieldErrors(errors));

  if (has('timeZone')) {
    const value = data.timeZone || '';
    await AdminUser.updateOne({ _id: req.staff._id }, { $set: { timeZone: value } });
    req.staff.timeZone = value;
  }
  const updates = {};
  for (const k of ['deadlineReminders', 'appointmentReminders']) if (has(k)) updates[k] = data[k];
  if (Object.keys(updates).length) await notificationService.updatePreferences({ recipientType: 'employee', recipientAdminId: req.staff._id, updates });
  respond(res, req, await calendar.calendarConfig(req));
}));

// POST /api/v1/staff/cases/:caseId/calendar-events
router.post('/cases/:caseId/calendar-events', trustedOriginMiddleware, requireApiCapability('calendar.manage'), requireApiCapability('cases.view'), caseParam, route(async (req, res) => {
  const { caseDoc, workspace } = req.calendarCase;
  const result = await events.createEvent({ caseDoc, workspace, data: body(req), actor: events.actorOf(req.staff) });
  failOnOutcome(result);
  respond(res, req, await dto(req, result.event), 201);
}));

// GET /api/v1/staff/calendar-events/:eventId
router.get('/calendar-events/:eventId', requireApiCapability('calendar.view'), requireApiCapability('cases.view'), eventParam, route(async (req, res) => {
  respond(res, req, await dto(req, req.calendarEvent));
}));

// PATCH /api/v1/staff/calendar-events/:eventId
router.patch('/calendar-events/:eventId', trustedOriginMiddleware, requireApiCapability('calendar.manage'), requireApiCapability('cases.view'), eventParam, route(async (req, res) => {
  const result = await events.updateEvent({ event: req.calendarEvent, data: body(req), actor: events.actorOf(req.staff) });
  failOnOutcome(result);
  respond(res, req, await dto(req, req.calendarEvent));
}));

// POST /api/v1/staff/calendar-events/:eventId/cancel   (there is no delete route: cancellation keeps the record)
router.post('/calendar-events/:eventId/cancel', trustedOriginMiddleware, requireApiCapability('calendar.manage'), requireApiCapability('cases.view'), eventParam, route(async (req, res) => {
  const result = await events.cancelEvent({ event: req.calendarEvent, actor: events.actorOf(req.staff) });
  failOnOutcome(result);
  respond(res, req, await dto(req, req.calendarEvent));
}));

module.exports = router;
