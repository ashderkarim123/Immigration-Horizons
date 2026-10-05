/**
 * Staff calendar (ADR-027): a READ-TIME projection. There is no calendar collection for tasks, document requests,
 * USCIS deadlines, target filing dates or appointments; each source adapter queries the module that owns the date and
 * maps the rows to one CalendarItem shape. Only manual events live in their own model (CaseCalendarEvent).
 *
 * Authorization never widens: every adapter starts from the actor's authorized scope (case membership / view_all, plus
 * the source's own capability) in the database query itself, so an unauthorized row is never fetched, never returned and
 * never left for the browser to hide. `calendar.view` only opens the calendar; it is not a bypass for anything below it.
 *
 * Date-only sources (task, document request, query response, USCIS response, target filing) are stored as a Mongo Date
 * whose UTC calendar date is the date; they are projected as "YYYY-MM-DD" and never shifted by a viewer's zone. Exact
 * instants (query appointments, timed manual events) keep their UTC instant and IANA zone.
 */
const mongoose = require('mongoose');

const ClientCase = require('../models/ClientCase');
const Task = require('../models/admin/Task');
const DocumentRequest = require('../models/DocumentRequest');
const ConsultationInteraction = require('../models/ConsultationInteraction');
const USCISFiling = require('../models/USCISFiling');
const CaseCalendarEvent = require('../models/CaseCalendarEvent');
const { memberCaseIds } = require('./casePolicy');
const { accessibleInteractionFilter } = require('./interactionPolicy');
const { getOrCreatePreferences } = require('./notificationService');
const { can } = require('../utils/permissions');
const { ACTIVE_REQUEST_STATUSES } = require('../utils/documentConstants');
const { ACTIVE_UNANSWERED_STATUSES } = require('../utils/interactionConstants');
const T = require('../utils/calendarTime');
const { createApiError } = require('../middleware/api/apiError');

const SOURCE_LIMIT = 500;
const SUMMARY_MAX = 200;

/** kind -> the capability a viewer needs for that source (the source's own gate, in addition to calendar.view). */
const KIND_CAPABILITY = {
  target_filing: 'cases.view',
  task_due: null, // case-less tasks need none; case tasks additionally need cases.view (checked in the adapter)
  appointment: 'queries.view',
  document_due: 'documents.view',
  query_due: 'queries.view',
  uscis_response: 'uscis_tracking.view',
  manual_event: 'cases.view',
};
const KINDS = Object.keys(KIND_CAPABILITY);

const KIND_LABELS = {
  target_filing: 'Filing dates',
  task_due: 'Tasks',
  appointment: 'Appointments',
  document_due: 'Document deadlines',
  query_due: 'Query response dates',
  uscis_response: 'USCIS response dates',
  manual_event: 'Manual events',
};

const id = (v) => (v ? String(v._id || v) : '');
const summary = (s) => String(s || '').trim().slice(0, SUMMARY_MAX);
const permittedKinds = (req) => KINDS.filter((k) => !KIND_CAPABILITY[k] || can(req, KIND_CAPABILITY[k]));
const notFound = (what) => createApiError(404, 'not_found', `${what} not found.`);
const invalidParam = (message, field) => createApiError(422, 'validation_error', message, [{ field, message }]);

// ─── Time shapes ─────────────────────────────────────────────────────────────

const dateTime = (date) => ({ mode: 'date', date, endDate: null, startAt: null, endAt: null, timeZone: null, allDay: true });
const instantTime = (startAt, endAt, timeZone) => ({
  mode: 'datetime',
  date: null,
  endDate: null,
  startAt: new Date(startAt).toISOString(),
  endAt: endAt ? new Date(endAt).toISOString() : null,
  timeZone: timeZone || null,
  allDay: false,
});

/** Sorts date-only items to the start of their day and timed items by their wall-clock time in the viewer's zone. */
function sortKey(item, zone) {
  return item.time.mode === 'date' ? `${item.time.date}T00:00` : T.instantToLocal(item.time.startAt, zone);
}

// ─── Authorized scope ────────────────────────────────────────────────────────

/**
 * Case ids the actor may see.
 *  authz  - null (no restriction: cases.view_all) or the member case ids. Used where a source is the actor's own.
 *  scope  - what the chosen scope shows for case-wide sources: team is `authz`; "mine" is the actor's member cases.
 * A requested caseId is only honoured when the actor may see that case, otherwise it is the one concealed 404.
 */
async function resolveScope(req, { scope, caseId }) {
  const viewAll = can(req, 'cases.view_all');
  const members = (await memberCaseIds(req)).map(String);
  const authz = viewAll ? null : members;
  const scoped = scope === 'team' ? authz : members;

  if (caseId) {
    if (!mongoose.Types.ObjectId.isValid(caseId)) throw notFound('Case');
    if (!can(req, 'cases.view')) throw createApiError(403, 'forbidden', 'Insufficient capability.');
    if (authz && !authz.includes(String(caseId))) throw notFound('Case');
    if (!(await ClientCase.exists({ _id: caseId }))) throw notFound('Case');
    return { caseId: String(caseId), authz: [String(caseId)], scoped: [String(caseId)], viewAll };
  }
  return { caseId: null, authz, scoped, viewAll };
}

const inIds = (ids, field = 'case') => (ids ? { [field]: { $in: ids.map((i) => new mongoose.Types.ObjectId(i)) } } : {});

// ─── Source adapters ─────────────────────────────────────────────────────────
// Each returns plain rows (already restricted to what the actor may see) mapped to CalendarItems; case labels are
// filled in afterwards in one query.

const caseRef = (c) => (c && c.caseNumber ? { id: id(c), caseNumber: c.caseNumber, title: c.title } : null);
const base = (over) => ({ sourceField: null, case: null, description: '', priority: null, actionRequired: false, person: null, clientVisible: false, actions: { canEdit: false, canCancel: false }, ...over });
const caseLink = (caseId, tab) => ({ path: `/cases/${caseId}`, queryParams: tab ? { tab } : {} });

async function targetFilingItems(req, ctx, w) {
  if (ctx.scoped && ctx.scoped.length === 0) return { items: [], more: false };
  const rows = await ClientCase.find({ archivedAt: null, targetFilingDate: { $gte: w.dateFrom, $lt: w.dateEnd }, ...inIds(ctx.scoped, '_id') })
    .select('caseNumber title targetFilingDate')
    .sort({ targetFilingDate: 1 })
    .limit(SOURCE_LIMIT + 1)
    .lean();
  return {
    more: rows.length > SOURCE_LIMIT,
    items: rows.slice(0, SOURCE_LIMIT).map((c) =>
      base({
        id: `case:${c._id}:targetFilingDate`,
        sourceType: 'case',
        sourceId: id(c),
        sourceField: 'targetFilingDate',
        kind: 'target_filing',
        case: caseRef(c),
        title: `Target filing: ${c.title}`,
        time: dateTime(T.dateOnly(c.targetFilingDate)),
        status: 'scheduled',
        link: caseLink(c._id, 'overview'),
      }),
    ),
  };
}

async function taskItems(req, ctx, w, { scope, includeCompleted, assignee }) {
  const q = { dueDate: { $gte: w.dateFrom, $lt: w.dateEnd } };
  if (!includeCompleted) q.status = { $ne: 'completed' };

  // Team-wide task visibility is its own capability (or managing the case being viewed); everything else is the actor's own tasks.
  const sees = scope === 'team' && (can(req, 'tasks.view_all') || (ctx.caseId && can(req, 'cases.manage')));
  if (!sees) q.assignee = req.staff._id;
  else if (assignee) q.assignee = assignee;

  // Tasks of cases the actor cannot see never appear.
  if (ctx.caseId) q.case = ctx.caseId;
  else if (!can(req, 'cases.view')) q.case = null;
  else if (ctx.authz) q.$or = [{ case: null }, inIds(ctx.authz)];

  const rows = await Task.find(q).populate('case', 'caseNumber title').populate('assignee', 'name').sort({ dueDate: 1, _id: 1 }).limit(SOURCE_LIMIT + 1).lean();
  return {
    more: rows.length > SOURCE_LIMIT,
    items: rows.slice(0, SOURCE_LIMIT).map((t) =>
      base({
        id: `task:${t._id}:dueDate`,
        sourceType: 'task',
        sourceId: id(t),
        sourceField: 'dueDate',
        kind: 'task_due',
        case: caseRef(t.case),
        title: t.title,
        description: summary(t.description),
        time: dateTime(T.dateOnly(t.dueDate)),
        status: t.status,
        priority: t.priority || null,
        person: t.assignee ? t.assignee.name || null : null,
        link: t.case ? caseLink(t.case._id, 'tasks') : { path: '/tasks', queryParams: {} },
      }),
    ),
  };
}

async function documentItems(req, ctx, w, { includeCompleted }) {
  if (ctx.scoped && ctx.scoped.length === 0) return { items: [], more: false };
  const q = { dueDate: { $gte: w.dateFrom, $lt: w.dateEnd }, ...inIds(ctx.scoped) };
  if (!includeCompleted) q.status = { $in: ACTIVE_REQUEST_STATUSES };
  const rows = await DocumentRequest.find(q).select('case title status dueDate instructions').sort({ dueDate: 1, _id: 1 }).limit(SOURCE_LIMIT + 1).lean();
  return {
    more: rows.length > SOURCE_LIMIT,
    items: rows.slice(0, SOURCE_LIMIT).map((r) =>
      base({
        id: `document_request:${r._id}:dueDate`,
        sourceType: 'document_request',
        sourceId: id(r),
        sourceField: 'dueDate',
        kind: 'document_due',
        case: { id: id(r.case), caseNumber: '', title: '' },
        title: `Document due: ${r.title}`,
        description: summary(r.instructions),
        time: dateTime(T.dateOnly(r.dueDate)),
        status: r.status,
        link: caseLink(r.case, 'documents'),
      }),
    ),
  };
}

async function queryItems(req, ctx, w, { scope, includeCompleted, wantAppointments, wantDue }) {
  const access = await accessibleInteractionFilter(req);
  const scoping = {};
  if (scope === 'mine') scoping.assignedTo = req.staff._id;
  if (ctx.caseId) Object.assign(scoping, { scopeType: 'case', case: ctx.caseId });

  const windows = [];
  if (wantAppointments) {
    windows.push({
      scheduledFor: { $gte: w.instantFrom, $lte: w.instantTo },
      ...(includeCompleted ? {} : { status: { $in: ['scheduled', 'rescheduled'] } }),
    });
  }
  if (wantDue) {
    windows.push({
      responseDueAt: { $gte: w.dateFrom, $lt: w.dateEnd },
      ...(includeCompleted ? {} : { status: { $in: ACTIVE_UNANSWERED_STATUSES } }),
    });
  }
  if (!windows.length) return { items: [], more: false };

  const rows = await ConsultationInteraction.find({ $and: [access, scoping, { $or: windows }] })
    .select('interactionNumber subject status priority scopeType case scheduledFor timezone responseDueAt assignedTo')
    .populate('assignedTo', 'name')
    .sort({ scheduledFor: 1, responseDueAt: 1, _id: 1 })
    .limit(SOURCE_LIMIT + 1)
    .lean();

  const items = [];
  for (const r of rows.slice(0, SOURCE_LIMIT)) {
    const common = { sourceType: 'query', sourceId: id(r), case: r.case ? { id: id(r.case), caseNumber: '', title: '' } : null, priority: r.priority || null, person: r.assignedTo?.name || null, link: { path: `/consultations/${r._id}`, queryParams: {} }, status: r.status };
    if (wantAppointments && r.scheduledFor && r.scheduledFor >= w.instantFrom && r.scheduledFor <= w.instantTo) {
      items.push(base({ ...common, id: `query:${r._id}:scheduledFor`, sourceField: 'scheduledFor', kind: 'appointment', title: `Appointment: ${r.subject}`, time: instantTime(r.scheduledFor, null, r.timezone) }));
    }
    if (wantDue && r.responseDueAt && r.responseDueAt >= w.dateFrom && r.responseDueAt < w.dateEnd && (includeCompleted || ACTIVE_UNANSWERED_STATUSES.includes(r.status))) {
      items.push(base({ ...common, id: `query:${r._id}:responseDueAt`, sourceField: 'responseDueAt', kind: 'query_due', title: `Response due: ${r.subject}`, time: dateTime(T.dateOnly(r.responseDueAt)) }));
    }
  }
  return { items, more: rows.length > SOURCE_LIMIT };
}

async function uscisItems(req, ctx, w) {
  if (ctx.scoped && ctx.scoped.length === 0) return { items: [], more: false };
  const rows = await USCISFiling.find({ archivedAt: null, actionRequired: true, responseDueAt: { $gte: w.dateFrom, $lt: w.dateEnd }, ...inIds(ctx.scoped) })
    .select('case title formType currentStatusTitle responseDueAt clientVisible')
    .sort({ responseDueAt: 1, _id: 1 })
    .limit(SOURCE_LIMIT + 1)
    .lean();
  return {
    more: rows.length > SOURCE_LIMIT,
    items: rows.slice(0, SOURCE_LIMIT).map((f) =>
      base({
        id: `uscis:${f._id}:responseDueAt`,
        sourceType: 'uscis',
        sourceId: id(f),
        sourceField: 'responseDueAt',
        kind: 'uscis_response',
        case: { id: id(f.case), caseNumber: '', title: '' },
        title: `USCIS response due: ${f.title}`,
        description: summary(f.currentStatusTitle),
        time: dateTime(T.dateOnly(f.responseDueAt)),
        status: 'action_required',
        actionRequired: true,
        clientVisible: !!f.clientVisible,
        link: { path: `/cases/${f.case}`, queryParams: { tab: 'tracking', filing: id(f) } },
      }),
    ),
  };
}

/** Manual events overlapping the window: all-day by their date strings, timed by instants. */
function manualWindowFilter(w, includeCompleted) {
  return {
    status: includeCompleted ? { $in: ['scheduled', 'completed', 'cancelled'] } : 'scheduled',
    $or: [
      { allDay: true, startDate: { $lte: w.to }, $or: [{ endDate: { $gte: w.from } }, { endDate: null, startDate: { $gte: w.from } }] },
      { allDay: false, startAt: { $lte: w.instantTo }, $or: [{ endAt: { $gte: w.instantFrom } }, { endAt: null, startAt: { $gte: w.instantFrom } }] },
    ],
  };
}

async function manualItems(req, ctx, w, { scope, includeCompleted }) {
  if (ctx.scoped && ctx.scoped.length === 0) return { items: [], more: false };
  const q = { ...manualWindowFilter(w, includeCompleted), ...inIds(ctx.scoped) };
  if (scope === 'mine') q.employeeAttendees = req.staff._id;
  const rows = await CaseCalendarEvent.find(q).sort({ startDate: 1, startAt: 1, _id: 1 }).limit(SOURCE_LIMIT + 1).lean();
  const canManage = can(req, 'calendar.manage');
  return {
    more: rows.length > SOURCE_LIMIT,
    items: rows.slice(0, SOURCE_LIMIT).map((e) => manualItem(e, { canManage })),
  };
}

/** Maps one manual event to a CalendarItem. `canManage` already includes case row access. */
function manualItem(e, { canManage }) {
  const open = e.status === 'scheduled';
  return base({
    id: `manual_event:${e._id}`,
    sourceType: 'manual_event',
    sourceId: id(e),
    kind: 'manual_event',
    case: { id: id(e.case), caseNumber: '', title: '' },
    title: e.internalTitle,
    description: summary(e.internalDescription),
    time: e.allDay ? { ...dateTime(e.startDate), endDate: e.endDate && e.endDate !== e.startDate ? e.endDate : null } : instantTime(e.startAt, e.endAt, e.timeZone),
    status: e.status,
    clientVisible: !!e.clientVisible,
    link: { path: `/cases/${e.case}`, queryParams: { tab: 'calendar', event: id(e) } },
    actions: { canEdit: canManage && open, canCancel: canManage && open },
  });
}

// ─── Query ───────────────────────────────────────────────────────────────────

function readFilters(params) {
  const scope = params.scope === undefined || params.scope === '' ? 'mine' : params.scope;
  if (!['mine', 'team'].includes(scope)) throw invalidParam('Choose mine or team.', 'scope');

  let kinds = null;
  if (params.kinds !== undefined && params.kinds !== '') {
    kinds = String(params.kinds).split(',').map((k) => k.trim()).filter(Boolean);
    const unknown = kinds.find((k) => !KINDS.includes(k));
    if (unknown) throw invalidParam(`Unknown calendar kind "${unknown}".`, 'kinds');
  }
  if (params.assignee && !mongoose.Types.ObjectId.isValid(params.assignee)) throw invalidParam('Choose a valid employee.', 'assignee');
  return { scope, kinds, assignee: params.assignee || null, includeCompleted: params.includeCompleted === 'true' || params.includeCompleted === true };
}

/** The viewer's zone: an explicit valid `timeZone` parameter, else their saved zone, the practice zone, then UTC. */
function viewerZone(req, requested) {
  if (requested !== undefined && requested !== '') {
    if (!T.isValidTimezone(requested)) throw invalidParam('timeZone must be an IANA zone such as America/New_York.', 'timeZone');
    return requested;
  }
  return T.resolveTimeZone(req.staff?.timeZone).zone;
}

async function fillCaseLabels(items) {
  const needed = [...new Set(items.filter((i) => i.case && !i.case.caseNumber).map((i) => i.case.id))];
  if (!needed.length) return;
  const rows = await ClientCase.find({ _id: { $in: needed } }).select('caseNumber title').lean();
  const byId = new Map(rows.map((c) => [id(c), c]));
  for (const item of items) {
    if (item.case && !item.case.caseNumber) item.case = caseRef(byId.get(item.case.id)) || item.case;
  }
}

/** GET /staff/calendar. Every adapter runs only for kinds the actor may see AND asked for. */
async function queryCalendar(req, params = {}) {
  const filters = readFilters(params);
  const zone = viewerZone(req, params.timeZone);
  const window = T.queryWindow({ from: params.from, to: params.to, zone });
  if (window.error) throw invalidParam(window.error, 'from');
  const w = { ...window, dateEnd: T.dateStringToUtc(T.addDays(window.to, 1)) };

  const ctx = await resolveScope(req, { scope: filters.scope, caseId: params.caseId });
  const allowed = permittedKinds(req);
  const kinds = (filters.kinds || allowed).filter((k) => allowed.includes(k));
  const wants = (k) => kinds.includes(k);
  const opts = { scope: filters.scope, includeCompleted: filters.includeCompleted, assignee: filters.assignee };

  const parts = await Promise.all([
    wants('target_filing') ? targetFilingItems(req, ctx, w) : null,
    wants('task_due') ? taskItems(req, ctx, w, opts) : null,
    wants('document_due') ? documentItems(req, ctx, w, opts) : null,
    wants('appointment') || wants('query_due') ? queryItems(req, ctx, w, { ...opts, wantAppointments: wants('appointment'), wantDue: wants('query_due') }) : null,
    wants('uscis_response') ? uscisItems(req, ctx, w) : null,
    wants('manual_event') ? manualItems(req, ctx, w, opts) : null,
  ]);

  const done = parts.filter(Boolean);
  const items = done.flatMap((p) => p.items);
  await fillCaseLabels(items);
  items.sort((a, b) => (sortKey(a, zone) < sortKey(b, zone) ? -1 : sortKey(a, zone) > sortKey(b, zone) ? 1 : a.title.localeCompare(b.title) || (a.id < b.id ? -1 : 1)));

  return {
    items,
    range: { from: w.from, to: w.to, timeZone: zone },
    kinds,
    scope: filters.scope,
    truncated: done.some((p) => p.more),
  };
}

async function calendarConfig(req) {
  const resolved = T.resolveTimeZone(req.staff?.timeZone);
  const prefs = await getOrCreatePreferences({ recipientType: 'employee', recipientAdminId: req.staff._id });
  return {
    reminders: { deadlineReminders: prefs.deadlineReminders !== false, appointmentReminders: prefs.appointmentReminders !== false },
    timeZone: {
      resolved: resolved.zone,
      source: resolved.source,
      userValue: req.staff?.timeZone && T.isValidTimezone(req.staff.timeZone) ? req.staff.timeZone : null,
      practice: T.practiceTimeZone(),
    },
    kinds: permittedKinds(req).map((value) => ({ value, label: KIND_LABELS[value] })),
    scopes: ['mine', 'team'],
    canManage: can(req, 'calendar.manage'),
    maxRangeDays: T.MAX_RANGE_DAYS,
  };
}

module.exports = {
  KINDS,
  KIND_CAPABILITY,
  SOURCE_LIMIT,
  queryCalendar,
  calendarConfig,
  manualItem,
  permittedKinds,
};
