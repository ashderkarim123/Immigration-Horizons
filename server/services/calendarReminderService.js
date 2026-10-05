/**
 * Calendar reminders (ADR-027). No reminder rows are stored and nothing remembers a "last run": every run reads the CURRENT
 * state of the authoritative source models, works out which reminder bucket each date is in right now, resolves the CURRENT
 * recipients (active assignee / project manager / attendees / client members), applies their preferences, and writes one
 * Notification per (source, field, current date, recipient, bucket) through the Notification dedupeKey unique index.
 * Re-running, overlapping workers and restarts therefore cannot send a second copy; a changed date changes the key and
 * can remind again. A missed bucket is not back-filled: only the bucket a date is in now is considered.
 *
 * `apply: false` (the default) reads and counts only; it writes nothing and returns counts, never names or receipt numbers.
 *
 * Document requests: the legacy `document_request_overdue` client pass in scripts/sendNotificationDigests.js is PRESERVED
 * and this engine never sends a client "overdue" for a document request (it would be a second overdue sender). Employees
 * still get the overdue reminder, which the legacy pass never sent.
 */
const Task = require('../models/admin/Task');
const AdminUser = require('../models/admin/User');
const ClientUser = require('../models/ClientUser');
const ClientCase = require('../models/ClientCase');
const CaseWorkspace = require('../models/CaseWorkspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const DocumentRequest = require('../models/DocumentRequest');
const ConsultationInteraction = require('../models/ConsultationInteraction');
const USCISFiling = require('../models/USCISFiling');
const USCISStatusEvent = require('../models/USCISStatusEvent');
const CaseCalendarEvent = require('../models/CaseCalendarEvent');
const Notification = require('../models/admin/Notification');
const NotificationPreference = require('../models/admin/NotificationPreference');
const { createNotificationOnce } = require('./notificationService');
const { can } = require('../utils/permissions');
const { ACTIVE_UNANSWERED_STATUSES } = require('../utils/interactionConstants');
const T = require('../utils/calendarTime');

const HORIZON_DAYS = 7;
const OVERDUE_LOOKBACK_DAYS = 14; // an overdue reminder is sent once, and only while the date is still recent news
const SOURCE_LIMIT = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DOCUMENT_REMINDER_STATUSES = ['open', 'replacement_required']; // the client still has to act

const DEADLINE_TYPE = 'calendar_deadline_reminder';
const APPOINTMENT_TYPE = 'calendar_appointment_reminder';

// ─── Buckets (pure) ──────────────────────────────────────────────────────────

/** The reminder bucket of a date-only deadline ("YYYY-MM-DD") as of `today` (a date in the recipient's zone), or null. */
function deadlineBucket(dateStr, today) {
  const days = T.daysBetween(today, dateStr);
  if (days < 0) return days >= -OVERDUE_LOOKBACK_DAYS ? 'overdue' : null;
  if (days === 0) return 'due_today';
  if (days === 1) return 'due_tomorrow';
  return days <= HORIZON_DAYS ? 'due_within_7_days' : null;
}

/** The reminder bucket of an exact instant, or null when it is more than a day away or already past. */
function timedBucket(startAt, now) {
  const ms = new Date(startAt).getTime() - now.getTime();
  if (ms <= 0) return null;
  if (ms <= HOUR_MS) return 'within_1_hour';
  return ms <= DAY_MS ? 'within_24_hours' : null;
}

const TITLE_PHRASE = { due_within_7_days: 'due this week', due_tomorrow: 'due tomorrow', due_today: 'due today', overdue: 'overdue' };
const TIMED_PHRASE = { within_24_hours: 'within 24 hours', within_1_hour: 'in 1 hour' };

function deadlineText(bucket, dateStr, today) {
  switch (bucket) {
    case 'due_within_7_days': return `is due in ${T.daysBetween(today, dateStr)} days (${dateStr})`;
    case 'due_tomorrow': return `is due tomorrow (${dateStr})`;
    case 'due_today': return 'is due today';
    default: return `was due on ${dateStr} and is overdue`;
  }
}

// ─── Per-run directory of current people, memberships and preferences ────────

function createDirectory() {
  const memo = (fn) => {
    const cache = new Map();
    return (...args) => {
      const key = args.map(String).join('|');
      // Cache the settled promise, not the Mongoose query: a query object can only be awaited once.
      if (!cache.has(key)) cache.set(key, Promise.resolve(fn(...args)));
      return cache.get(key);
    };
  };

  const admin = memo((id) => AdminUser.findById(id).select('name role isActive timeZone').lean());
  const client = memo((id) => ClientUser.findById(id).select('status').lean());
  const employeeMember = memo((workspaceId, adminId) => WorkspaceMember.exists({ workspace: workspaceId, memberType: 'employee', adminUser: adminId, status: 'active' }));
  const clientMember = memo((workspaceId, clientId) => WorkspaceMember.exists({ workspace: workspaceId, memberType: 'client', clientUser: clientId, status: 'active' }));
  const prefs = memo((type, id) => NotificationPreference.findOne(type === 'employee' ? { recipientAdmin: id } : { recipientClient: id }).lean());

  return {
    /** An employee who may be told about this work now: active, and on the case (or org-wide) when it is case-scoped. */
    async employee(adminId, workspaceId) {
      if (!adminId) return null;
      const user = await admin(adminId);
      if (!user || !user.isActive) return null;
      const orgWide = can({ staff: { role: user.role } }, 'cases.view_all');
      if (workspaceId && !orgWide && !(await employeeMember(workspaceId, adminId))) return null;
      return { type: 'employee', id: String(user._id), name: user.name || '', role: user.role, zone: T.resolveTimeZone(user.timeZone).zone };
    },
    /** A client who may be told: an active account and, for a case, an active member of that case's workspace. */
    async client(clientId, workspaceId) {
      if (!clientId) return null;
      const user = await client(clientId);
      if (!user || user.status !== 'active') return null;
      if (workspaceId && !(await clientMember(workspaceId, clientId))) return null;
      return { type: 'client', id: String(clientId), name: '', zone: T.resolveTimeZone(null).zone };
    },
    /** Read-only: a missing preference row means "on" (the schema default); a dry run never creates one. */
    async wants(recipient, field) {
      const row = await prefs(recipient.type, recipient.id);
      return !row || row[field] !== false;
    },
    async activeClientMembers(workspaceId) {
      const members = await WorkspaceMember.find({ workspace: workspaceId, memberType: 'client', status: 'active', clientUser: { $ne: null } }).select('clientUser').lean();
      const out = [];
      for (const m of members) {
        const r = await this.client(m.clientUser, workspaceId);
        if (r) out.push(r);
      }
      return out;
    },
    /** Live cases (not archived) by id, each with its primary workspace id. */
    async cases(ids) {
      const unique = [...new Set(ids.filter(Boolean).map(String))];
      const [rows, workspaces] = await Promise.all([
        ClientCase.find({ _id: { $in: unique }, archivedAt: null }).select('caseNumber title projectManager').lean(),
        CaseWorkspace.find({ case: { $in: unique }, workspaceType: 'primary' }).select('case').lean(),
      ]);
      const ws = new Map(workspaces.map((w) => [String(w.case), w._id]));
      return new Map(rows.filter((c) => ws.has(String(c._id))).map((c) => [String(c._id), { ...c, workspaceId: ws.get(String(c._id)) }]));
    },
  };
}

// ─── Candidates ──────────────────────────────────────────────────────────────

const keyOf = (c) => `calendar:${c.sourceType}:${c.sourceId}:${c.field}:${c.version}:${c.recipient.type}:${c.recipient.id}:${c.bucket}`;

/** A date-only deadline reminder for one recipient, or nothing when no bucket applies (or it is a skipped bucket). */
function deadlineCandidate(now, spec) {
  const today = T.todayInZone(spec.recipient.zone, now);
  const bucket = deadlineBucket(spec.date, today);
  if (!bucket || (spec.skipBuckets || []).includes(bucket)) return null;
  const lead = spec.caseNumber ? `Case ${spec.caseNumber}: ` : '';
  return {
    ...spec,
    version: spec.date,
    bucket,
    prefField: 'deadlineReminders',
    type: DEADLINE_TYPE,
    title: `${spec.noun} ${TITLE_PHRASE[bucket]}`,
    message: `${lead}"${spec.subject}" ${deadlineText(bucket, spec.date, today)}.`,
  };
}

/** A timed reminder (appointments and timed events) for one recipient. */
function appointmentCandidate(now, spec) {
  const bucket = timedBucket(spec.startAt, now);
  if (!bucket) return null;
  const lead = spec.caseNumber ? `Case ${spec.caseNumber}: ` : '';
  return {
    ...spec,
    version: new Date(spec.startAt).toISOString(),
    bucket,
    prefField: 'appointmentReminders',
    type: APPOINTMENT_TYPE,
    title: `${spec.noun} ${TIMED_PHRASE[bucket]}`,
    message: `${lead}"${spec.subject}" starts ${T.formatInstant(spec.startAt, spec.recipient.zone)}.`,
  };
}

const lo = (now) => new Date(now.getTime() - (OVERDUE_LOOKBACK_DAYS + 2) * DAY_MS);
const hi = (now) => new Date(now.getTime() + (HORIZON_DAYS + 2) * DAY_MS);

const staffPath = (caseId, tab, extra = '') => `/cases/${caseId}?tab=${tab}${extra}`;
const portalCasePath = (caseId, section = '') => `/portal/cases/${caseId}${section}`;

const COLLECTORS = {
  async task({ now, dir }) {
    const rows = await Task.find({ status: { $ne: 'completed' }, assignee: { $ne: null }, dueDate: { $gte: lo(now), $lte: hi(now) } }).select('title case assignee dueDate').limit(SOURCE_LIMIT).lean();
    const cases = await dir.cases(rows.map((t) => t.case));
    const out = [];
    for (const t of rows) {
      const c = t.case ? cases.get(String(t.case)) : null;
      if (t.case && !c) continue; // archived or unreadable case
      const recipient = await dir.employee(t.assignee, c?.workspaceId);
      if (!recipient) continue;
      const cand = deadlineCandidate(now, {
        sourceType: 'task', sourceId: String(t._id), field: 'dueDate', date: T.dateOnly(t.dueDate), recipient,
        noun: 'Task', subject: t.title, caseNumber: c?.caseNumber,
        related: { relatedTask: t._id, relatedCase: c?._id || null },
        actionPath: c ? staffPath(c._id, 'tasks') : '/tasks',
      });
      if (cand) out.push(cand);
    }
    return out;
  },

  async case_target({ now, dir }) {
    const rows = await ClientCase.find({ archivedAt: null, projectManager: { $ne: null }, targetFilingDate: { $gte: lo(now), $lte: hi(now) } }).select('caseNumber title projectManager targetFilingDate').limit(SOURCE_LIMIT).lean();
    const cases = await dir.cases(rows.map((c) => c._id));
    const out = [];
    for (const row of rows) {
      const c = cases.get(String(row._id));
      if (!c) continue;
      const recipient = await dir.employee(row.projectManager, c.workspaceId);
      if (!recipient) continue;
      const cand = deadlineCandidate(now, {
        sourceType: 'case', sourceId: String(row._id), field: 'targetFilingDate', date: T.dateOnly(row.targetFilingDate), recipient,
        noun: 'Target filing', subject: row.title, caseNumber: row.caseNumber,
        related: { relatedCase: row._id }, actionPath: staffPath(row._id, 'overview'),
      });
      if (cand) out.push(cand);
    }
    return out;
  },

  async document_request({ now, dir }) {
    const rows = await DocumentRequest.find({ status: { $in: DOCUMENT_REMINDER_STATUSES }, dueDate: { $gte: lo(now), $lte: hi(now) } }).select('case workspace title requestedBy requestedFrom dueDate').limit(SOURCE_LIMIT).lean();
    const cases = await dir.cases(rows.map((r) => r.case));
    const out = [];
    for (const r of rows) {
      const c = cases.get(String(r.case));
      if (!c) continue;
      const base = { sourceType: 'document_request', sourceId: String(r._id), field: 'dueDate', date: T.dateOnly(r.dueDate), subject: r.title, related: { relatedDocumentRequest: r._id, relatedCase: r.case } };
      const staff = await dir.employee(r.requestedBy, r.workspace);
      if (staff) {
        const cand = deadlineCandidate(now, { ...base, recipient: staff, noun: 'Document request', caseNumber: c.caseNumber, actionPath: staffPath(r.case, 'documents') });
        if (cand) out.push(cand);
      }
      const member = await WorkspaceMember.findById(r.requestedFrom).select('clientUser').lean();
      const client = member?.clientUser ? await dir.client(member.clientUser, r.workspace) : null;
      if (client) {
        // The legacy document_request_overdue job already tells the client about an overdue request; never a second sender.
        const cand = deadlineCandidate(now, { ...base, recipient: client, noun: 'Document request', skipBuckets: ['overdue'], actionPath: portalCasePath(r.case, '/documents') });
        if (cand) out.push(cand);
      }
    }
    return out;
  },

  async query_appointment({ now, dir }) {
    const rows = await ConsultationInteraction.find({ status: { $in: ['scheduled', 'rescheduled'] }, scheduledFor: { $gt: now, $lte: new Date(now.getTime() + DAY_MS) } })
      .select('scopeType case workspace subject assignedTo clientUser scheduledFor').limit(SOURCE_LIMIT).lean();
    const out = [];
    for (const q of rows) {
      const base = { sourceType: 'query', sourceId: String(q._id), field: 'scheduledFor', startAt: q.scheduledFor, noun: 'Appointment', subject: q.subject, related: { relatedInteraction: q._id, relatedCase: q.case || null } };
      const staff = await dir.employee(q.assignedTo, q.scopeType === 'case' ? q.workspace : null);
      if (staff && can({ staff: { role: staff.role } }, 'queries.view')) {
        const cand = appointmentCandidate(now, { ...base, recipient: staff, actionPath: `/consultations/${q._id}` });
        if (cand) out.push(cand);
      }
      const client = await dir.client(q.clientUser, q.scopeType === 'case' ? q.workspace : null);
      if (client) {
        const cand = appointmentCandidate(now, { ...base, recipient: client, actionPath: `/portal/queries/${q._id}` });
        if (cand) out.push(cand);
      }
    }
    return out;
  },

  // Query response deadlines go to the assigned employee only (no PM oversight). Apart from the appointment collector
  // because it is a date-only deadline with its own source field and status set.
  async query_response({ now, dir }) {
    const rows = await ConsultationInteraction.find({ status: { $in: ACTIVE_UNANSWERED_STATUSES }, assignedTo: { $ne: null }, responseDueAt: { $gte: lo(now), $lte: hi(now) } })
      .select('scopeType case workspace subject assignedTo responseDueAt').limit(SOURCE_LIMIT).lean();
    const out = [];
    for (const q of rows) {
      const staff = await dir.employee(q.assignedTo, q.scopeType === 'case' ? q.workspace : null);
      if (!staff || !can({ staff: { role: staff.role } }, 'queries.view')) continue;
      const cand = deadlineCandidate(now, {
        sourceType: 'query', sourceId: String(q._id), field: 'responseDueAt', date: T.dateOnly(q.responseDueAt), recipient: staff,
        noun: 'Query response', subject: q.subject, related: { relatedInteraction: q._id, relatedCase: q.case || null }, actionPath: `/consultations/${q._id}`,
      });
      if (cand) out.push(cand);
    }
    return out;
  },

  async uscis({ now, dir }) {
    const filings = await USCISFiling.find({ archivedAt: null, actionRequired: true, responseDueAt: { $gte: lo(now), $lte: hi(now) } }).select('case workspace title responseDueAt').limit(SOURCE_LIMIT).lean();
    const cases = await dir.cases(filings.map((f) => f.case));
    const out = [];
    for (const f of filings) {
      const c = cases.get(String(f.case));
      if (!c) continue;
      const pm = await dir.employee(c.projectManager, f.workspace);
      if (pm) {
        const cand = deadlineCandidate(now, {
          sourceType: 'uscis', sourceId: String(f._id), field: 'responseDueAt', date: T.dateOnly(f.responseDueAt), recipient: pm,
          noun: 'USCIS response', subject: f.title, caseNumber: c.caseNumber, related: { relatedCase: f.case },
          actionPath: staffPath(f.case, 'tracking', `&filing=${f._id}`),
        });
        if (cand) out.push(cand);
      }
    }
    out.push(...(await clientUscis({ now, dir })));
    return out;
  },

  async manual_event({ now, dir }) {
    const today = T.todayInZone('UTC', now);
    const rows = await CaseCalendarEvent.find({
      status: 'scheduled',
      $or: [
        { allDay: true, startDate: { $gte: T.addDays(today, -2), $lte: T.addDays(today, HORIZON_DAYS + 2) } },
        { allDay: false, startAt: { $gt: now, $lte: new Date(now.getTime() + DAY_MS) } },
      ],
    }).limit(SOURCE_LIMIT).lean();
    const cases = await dir.cases(rows.map((e) => e.case));
    const out = [];
    for (const e of rows) {
      const c = cases.get(String(e.case));
      if (!c) continue;
      const make = (recipient, staff) => {
        const common = {
          sourceType: 'manual_event', sourceId: String(e._id), recipient, noun: 'Event', subject: staff ? e.internalTitle : e.clientTitle,
          caseNumber: staff ? c.caseNumber : undefined, related: { relatedCase: e.case },
          actionPath: staff ? staffPath(e.case, 'calendar', `&event=${e._id}`) : portalCasePath(e.case),
        };
        // An all-day event is a date (start day only, never "overdue"); a timed event is an appointment in time.
        return e.allDay
          ? deadlineCandidate(now, { ...common, field: 'startDate', date: e.startDate, skipBuckets: ['overdue'] })
          : appointmentCandidate(now, { ...common, field: 'startAt', startAt: e.startAt });
      };
      for (const attendee of e.employeeAttendees || []) {
        const r = await dir.employee(attendee, e.workspace);
        const cand = r && make(r, true);
        if (cand) out.push(cand);
      }
      if (e.clientVisible && String(e.clientTitle || '').trim()) {
        for (const r of await dir.activeClientMembers(e.workspace)) {
          const cand = make(r, false);
          if (cand) out.push(cand);
        }
      }
    }
    return out;
  },
};

/**
 * A client hears about a USCIS response date only under the Phase 11 visibility rule: the filing is client-visible and the
 * newest CLIENT-VISIBLE event requires action with a response date. The Staff snapshot is never used for a client.
 */
async function clientUscis({ now, dir }) {
  const filings = await USCISFiling.find({ archivedAt: null, clientVisible: true }).select('case workspace title').limit(SOURCE_LIMIT).lean();
  if (!filings.length) return [];
  const events = await USCISStatusEvent.find({ filing: { $in: filings.map((f) => f._id) }, clientVisible: true }).sort({ occurredAt: -1, _id: -1 }).select('filing actionRequired responseDueAt').lean();
  const newest = new Map();
  for (const e of events) if (!newest.has(String(e.filing))) newest.set(String(e.filing), e);

  const live = await dir.cases(filings.map((f) => f.case));
  const out = [];
  for (const f of filings) {
    const e = newest.get(String(f._id));
    if (!e || !e.actionRequired || !e.responseDueAt || !live.has(String(f.case))) continue;
    for (const r of await dir.activeClientMembers(f.workspace)) {
      const cand = deadlineCandidate(now, {
        sourceType: 'uscis', sourceId: String(f._id), field: 'responseDueAt', date: T.dateOnly(e.responseDueAt), recipient: r,
        noun: 'USCIS response', subject: f.title, related: { relatedCase: f.case }, actionPath: portalCasePath(f.case, '/uscis'),
      });
      if (cand) out.push(cand);
    }
  }
  return out;
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const SOURCES = Object.keys(COLLECTORS);

/**
 * One reminder pass. Returns safe counts only. `apply: false` writes nothing (not even a default preference row).
 * `sources` limits the pass to some collectors (tests); the worker and script always run them all.
 */
async function runReminders({ apply = false, now = new Date(), sources = SOURCES } = {}) {
  const dir = createDirectory();
  const bySource = {};
  const byBucket = {};
  const totals = { candidates: 0, skippedByPreference: 0, alreadySent: 0, [apply ? 'created' : 'wouldCreate']: 0 };

  const unique = new Map();
  for (const name of sources) {
    const found = await COLLECTORS[name]({ now, dir });
    bySource[name] = { candidates: found.length, [apply ? 'created' : 'wouldCreate']: 0 };
    for (const c of found) unique.set(keyOf(c), { ...c, collector: name });
  }
  totals.candidates = unique.size;

  const wanted = [];
  for (const [dedupeKey, c] of unique) {
    if (!(await dir.wants(c.recipient, c.prefField))) totals.skippedByPreference += 1;
    else wanted.push({ ...c, dedupeKey });
  }

  const existing = new Set((await Notification.find({ dedupeKey: { $in: wanted.map((c) => c.dedupeKey) } }).select('dedupeKey').lean()).map((n) => n.dedupeKey));
  for (const c of wanted) {
    let created = false;
    if (existing.has(c.dedupeKey)) {
      totals.alreadySent += 1;
      continue;
    }
    if (apply) {
      ({ created } = await createNotificationOnce({
        recipientType: c.recipient.type,
        recipientAdminId: c.recipient.type === 'employee' ? c.recipient.id : null,
        recipientClientId: c.recipient.type === 'client' ? c.recipient.id : null,
        recipientName: c.recipient.name,
        title: c.title,
        message: c.message,
        type: c.type,
        dedupeKey: c.dedupeKey,
        actionPath: c.actionPath,
        ...c.related,
      }));
      if (!created) {
        totals.alreadySent += 1; // lost a race to a concurrent run: the notification exists exactly once
        continue;
      }
    }
    const field = apply ? 'created' : 'wouldCreate';
    totals[field] += 1;
    bySource[c.collector][field] += 1;
    byBucket[c.bucket] = (byBucket[c.bucket] || 0) + 1;
  }

  return { mode: apply ? 'apply' : 'dry-run', evaluatedAt: now.toISOString(), totals, bySource, byBucket };
}

module.exports = { SOURCES, HORIZON_DAYS, OVERDUE_LOOKBACK_DAYS, deadlineBucket, timedBucket, runReminders };
