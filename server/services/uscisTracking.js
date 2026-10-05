/**
 * USCIS filing tracking domain (ADR-026). Routes are transport; every rule lives here.
 *
 * Events are authoritative and immutable. The filing's `current*` fields are a snapshot
 * written only through applySnapshot(), which is one atomic conditional update ("newest
 * occurredAt wins, then the later event id"), so a backfilled older event can never roll
 * the status back and two concurrent writers cannot lose each other. rebuildCurrentSnapshot()
 * recomputes the same answer from the events if the snapshot is ever stale.
 *
 * Service calls return outcomes ('validation_error', 'conflict', 'invalid_state', ...) instead
 * of throwing, so a bad request is a 4xx and never a Mongoose 500.
 */
const crypto = require('crypto');
const mongoose = require('mongoose');

const USCISFiling = require('../models/USCISFiling');
const USCISStatusEvent = require('../models/USCISStatusEvent');
const CaseActivity = require('../models/CaseActivity');
const ClientCase = require('../models/ClientCase');
const WorkspaceMember = require('../models/WorkspaceMember');
const AdminUser = require('../models/admin/User');
const caseManagement = require('./caseManagement');
const { memberCaseIds } = require('./casePolicy');
const { notifyEmployee, notifyClient } = require('./notificationService');
const { can } = require('../utils/permissions');
const { categoryForTitle, toPlainText } = require('./uscis/statusCatalog');
const { ProviderError } = require('./uscis/torchProvider');
const C = require('../utils/uscisConstants');

const EVENT_PAGE = 100;
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000; // allows clock skew, not a made-up future status
const SORTS = {
  updated: { updatedAt: -1, _id: -1 },
  due: { responseDueAt: 1, _id: 1 },
  status: { currentStatusAt: -1, _id: -1 },
};

const id = (v) => (v ? String(v._id || v) : null);
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const invalid = (errors) => ({ outcome: 'validation_error', errors });
const isId = (v) => mongoose.Types.ObjectId.isValid(v) && String(new mongoose.Types.ObjectId(v)) === String(v);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const actorOf = (staff) => ({ type: 'admin_user', id: staff._id, name: staff.name || 'Employee' });

/** undefined = field absent, null = cleared, Date = valid; throws a field message for an invalid value. */
function readDate(data, key, label) {
  if (data[key] === undefined) return undefined;
  if (data[key] === null || data[key] === '') return null;
  const d = new Date(data[key]);
  if (Number.isNaN(d.getTime())) throw new Error(`${label} is not a valid date.`);
  return d;
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

function toEventDto(e) {
  return {
    id: id(e),
    statusCategory: e.statusCategory,
    statusTitle: e.statusTitle,
    statusDescription: e.statusDescription || '',
    occurredAt: e.occurredAt,
    observedAt: e.observedAt,
    source: e.source,
    actionRequired: !!e.actionRequired,
    responseDueAt: e.responseDueAt || null,
    clientVisible: !!e.clientVisible,
    createdByName: e.createdByName || '',
    createdAt: e.createdAt,
  };
}

/** What this actor may do with this filing. The route has already established case row access. */
function filingActions(req, filing, providerStatus) {
  const open = !filing.archivedAt;
  const manage = can(req, 'uscis_tracking.manage') && open;
  return {
    canEdit: manage,
    canAddStatus: manage,
    canArchive: manage,
    canSync: can(req, 'uscis_tracking.sync') && open && C.isProviderReceipt(filing.receiptNumber) && !!providerStatus && providerStatus.enabled && providerStatus.configured,
  };
}

function toFilingDto(f, actions) {
  return {
    id: id(f),
    caseId: id(f.case),
    title: f.title,
    formType: f.formType,
    formSubType: f.formSubType || null,
    receiptNumber: f.receiptNumber || null,
    providerEligible: C.isProviderReceipt(f.receiptNumber),
    filedAt: f.filedAt || null,
    receiptDate: f.receiptDate || null,
    serviceCenter: f.serviceCenter || null,
    clientVisible: !!f.clientVisible,
    archived: !!f.archivedAt,
    provider: {
      type: f.trackingProvider,
      enabled: !!f.trackingEnabled,
      lastCheckedAt: f.lastCheckedAt || null,
      lastSuccessfulSyncAt: f.lastSyncSucceededAt || null,
      lastErrorAt: f.lastSyncErrorAt || null,
      lastErrorCode: f.lastSyncErrorCode || null,
    },
    currentStatus: f.currentEvent
      ? {
          category: f.currentStatusCategory,
          title: f.currentStatusTitle,
          description: f.currentStatusDescription || '',
          occurredAt: f.currentStatusAt,
          source: f.currentStatusSource,
          actionRequired: !!f.actionRequired,
          responseDueAt: f.responseDueAt || null,
        }
      : null,
    updatedAt: f.updatedAt,
    createdAt: f.createdAt,
    actions,
  };
}

async function eventsFor(filingId) {
  const [events, total] = await Promise.all([
    USCISStatusEvent.find({ filing: filingId }).sort({ occurredAt: -1, _id: -1 }).limit(EVENT_PAGE).lean(),
    USCISStatusEvent.countDocuments({ filing: filingId }),
  ]);
  return { events: events.map(toEventDto), eventTotal: total };
}

async function toDetail(req, filingId, providerStatus) {
  const filing = await USCISFiling.findById(filingId).lean();
  return { filing: toFilingDto(filing, filingActions(req, filing, providerStatus)), ...(await eventsFor(filing._id)) };
}

// ─── Loading ─────────────────────────────────────────────────────────────────

/** Filing plus its case and primary workspace, or null for a malformed / unknown / orphaned id. */
async function loadFilingContext(filingId) {
  if (!isId(filingId)) return null;
  const filing = await USCISFiling.findById(filingId);
  if (!filing) return null;
  const ctx = await caseManagement.loadCaseAndWorkspace(filing.case);
  return ctx ? { filing, ...ctx } : null;
}

async function listCaseFilings(req, caseDoc, { includeArchived = false, providerStatus } = {}) {
  const filings = await USCISFiling.find({ case: caseDoc._id, ...(includeArchived ? {} : { archivedAt: null }) }).sort({ updatedAt: -1, _id: -1 }).lean();
  return filings.map((f) => toFilingDto(f, filingActions(req, f, providerStatus)));
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

const snapshotOf = (e) => ({
  currentEvent: e._id,
  currentStatusCategory: e.statusCategory,
  currentStatusTitle: e.statusTitle,
  currentStatusDescription: e.statusDescription || '',
  currentStatusAt: e.occurredAt,
  currentStatusSource: e.source,
  actionRequired: !!e.actionRequired,
  responseDueAt: e.responseDueAt || null,
});

/** True if `event` is now the current status. One atomic conditional write: newer occurredAt, or the same instant and a later id. */
async function applySnapshot(filingId, event, actor) {
  const res = await USCISFiling.updateOne(
    { _id: filingId, $or: [{ currentEvent: null }, { currentStatusAt: { $lt: event.occurredAt } }, { currentStatusAt: event.occurredAt, currentEvent: { $lt: event._id } }] },
    { $set: { ...snapshotOf(event), ...(actor ? { updatedBy: actor.id || null, updatedByName: actor.name || '' } : {}) } },
  );
  return res.matchedCount === 1;
}

/** Recomputes the snapshot from the immutable events (the repair path). */
async function rebuildCurrentSnapshot(filingId) {
  const latest = await USCISStatusEvent.findOne({ filing: filingId }).sort({ occurredAt: -1, _id: -1 }).lean();
  const $set = latest
    ? snapshotOf(latest)
    : { currentEvent: null, currentStatusCategory: null, currentStatusTitle: '', currentStatusDescription: '', currentStatusAt: null, currentStatusSource: null, actionRequired: false, responseDueAt: null };
  await USCISFiling.updateOne({ _id: filingId }, { $set });
  return latest ? latest._id : null;
}

// ─── Notifications & activity (never allowed to fail the mutation) ───────────

async function staffRecipients(caseDoc, workspaceId, actorId) {
  const members = await WorkspaceMember.find({ workspace: workspaceId, memberType: 'employee', status: 'active', workspaceRole: { $in: ['project_manager', 'case_manager'] } }).select('adminUser').lean();
  const ids = new Set(members.map((m) => String(m.adminUser)));
  if (caseDoc.projectManager) ids.add(String(caseDoc.projectManager));
  ids.delete(String(actorId || ''));
  if (!ids.size) return [];
  return AdminUser.find({ _id: { $in: [...ids] }, isActive: true }).select('name').lean();
}

async function notifyStaff({ caseDoc, workspace, actor, type, title, message, dedupeKey }) {
  for (const user of await staffRecipients(caseDoc, workspace._id, actor && actor.id)) {
    await notifyEmployee({ adminUserId: user._id, adminUserName: user.name, title, message, type, dedupeKey: `${dedupeKey}:${user._id}`, relatedCase: caseDoc._id });
  }
}

/** One notification set per event that actually became the current status; replays never reach here. */
async function notifyEvent({ filing, event, caseDoc, workspace, actor }) {
  try {
    const type = event.actionRequired ? 'uscis_action_required' : 'uscis_status_changed';
    const due = event.actionRequired && event.responseDueAt ? ` Response due ${event.responseDueAt.toISOString().slice(0, 10)}.` : '';
    await notifyStaff({ caseDoc, workspace, actor, type, title: `USCIS ${event.actionRequired ? 'action required' : 'status updated'}: ${caseDoc.caseNumber}`, message: `${filing.formType}: ${event.statusTitle}.${due}`, dedupeKey: `uscis:${event._id}:employee` });

    if (filing.clientVisible && event.clientVisible) {
      const clients = await WorkspaceMember.find({ workspace: workspace._id, memberType: 'client', status: 'active' }).select('clientUser').lean();
      for (const member of clients) {
        await notifyClient({
          clientUserId: member.clientUser,
          requireActiveWorkspace: workspace._id,
          type,
          title: `USCIS update on ${caseDoc.caseNumber}`,
          message: `Your ${filing.formType} status is now: ${event.statusTitle}.`,
          dedupeKey: `uscis:${event._id}:client:${member.clientUser}`,
          relatedCase: caseDoc._id,
        });
      }
    }
  } catch (err) {
    console.error('[uscis] notification failed:', err.message);
  }
}

const recordActivity = (caseDoc, workspace, type, message, actor) =>
  CaseActivity.record({ caseId: caseDoc._id, workspaceId: workspace._id, type, message, actor }).catch((err) => console.error('[uscis] activity failed:', err.message));

// ─── Filings ─────────────────────────────────────────────────────────────────

/** Validates the editable filing fields. `partial` checks only the present ones. */
function readFilingFields(data, { partial }) {
  const errors = {};
  const values = {};
  const bounded = (key, label, max, required) => {
    if (data[key] === undefined && partial) return;
    const value = text(data[key]);
    if (!value) {
      if (required) errors[key] = `${label} is required.`;
      else values[key] = null;
    } else if (value.length > max) errors[key] = `${label} must not exceed ${max} characters.`;
    else values[key] = value;
  };
  bounded('title', 'Title', C.LIMITS.title, true);
  bounded('formType', 'Form type', C.LIMITS.formType, true);
  bounded('formSubType', 'Form sub-type', C.LIMITS.formSubType, false);
  bounded('serviceCenter', 'Service center', C.LIMITS.serviceCenter, false);

  if (data.receiptNumber !== undefined) {
    const receipt = C.normalizeReceipt(data.receiptNumber);
    if (receipt && !C.isManualReceipt(receipt)) errors.receiptNumber = 'Receipt numbers use letters and digits only (typically three letters followed by ten digits).';
    else values.receiptNumber = receipt;
  }
  for (const [key, label] of [['filedAt', 'Filed date'], ['receiptDate', 'Receipt date']]) {
    try {
      const d = readDate(data, key, label);
      if (d !== undefined) values[key] = d;
    } catch (err) {
      errors[key] = err.message;
    }
  }
  if (data.clientVisible !== undefined) {
    if (typeof data.clientVisible !== 'boolean') errors.clientVisible = 'Client visibility must be true or false.';
    else values.clientVisible = data.clientVisible;
  }
  if (data.trackingEnabled !== undefined) {
    if (typeof data.trackingEnabled !== 'boolean') errors.trackingEnabled = 'Tracking must be true or false.';
    else values.trackingEnabled = data.trackingEnabled;
  }
  return Object.keys(errors).length ? { errors } : { values };
}

const duplicateReceipt = () => ({ outcome: 'conflict', errors: { receiptNumber: 'Another filing already uses this receipt number.' } });

async function createFiling({ caseDoc, workspace, data, actor }) {
  const checked = readFilingFields(data, { partial: false });
  if (checked.errors) return invalid(checked.errors);
  const v = checked.values;

  // The unique index is the race-proof guard; this check also covers a database whose index has not been built yet.
  if (v.receiptNumber && (await USCISFiling.exists({ receiptNumber: v.receiptNumber }))) return duplicateReceipt();
  if (v.trackingEnabled && !C.isProviderReceipt(v.receiptNumber)) return invalid({ trackingEnabled: 'A receipt like AAA1234567890 is needed to track with USCIS.' });

  let filing;
  try {
    filing = await USCISFiling.create({
      ...v,
      case: caseDoc._id,
      workspace: workspace._id,
      trackingProvider: v.trackingEnabled ? 'uscis_case_status' : 'none',
      createdBy: actor.id,
      createdByName: actor.name,
      updatedBy: actor.id,
      updatedByName: actor.name,
    });
  } catch (err) {
    if (err && err.code === 11000) return duplicateReceipt();
    throw err;
  }

  await recordActivity(caseDoc, workspace, 'uscis_filing_created', `${filing.formType} tracking record created by ${actor.name}.`, actor);
  try {
    await notifyStaff({ caseDoc, workspace, actor, type: 'uscis_filing_added', title: `USCIS filing added: ${caseDoc.caseNumber}`, message: `${filing.formType} is now tracked on this case.`, dedupeKey: `uscis:${filing._id}:added` });
  } catch (err) {
    console.error('[uscis] notification failed:', err.message);
  }
  return { outcome: 'created', filing };
}

async function updateFiling({ filing, caseDoc, workspace, data, actor }) {
  if (filing.archivedAt) return { outcome: 'invalid_state' };
  const checked = readFilingFields(data, { partial: true });
  if (checked.errors) return invalid(checked.errors);
  const v = checked.values;

  if (v.receiptNumber !== undefined && v.receiptNumber !== filing.receiptNumber) {
    if (v.receiptNumber && (await USCISFiling.exists({ receiptNumber: v.receiptNumber, _id: { $ne: filing._id } }))) return duplicateReceipt();
    // Provider history belongs to the receipt it came from; changing the receipt would mix two filings' histories.
    if (await USCISStatusEvent.exists({ filing: filing._id, source: 'uscis_api' })) return invalid({ receiptNumber: 'This filing already has USCIS-sourced history, so its receipt number can no longer be changed.' });
  }
  const receipt = v.receiptNumber === undefined ? filing.receiptNumber : v.receiptNumber;
  const enabling = v.trackingEnabled === true;
  if (enabling && !C.isProviderReceipt(receipt)) return invalid({ trackingEnabled: 'A receipt like AAA1234567890 is needed to track with USCIS.' });
  if (v.receiptNumber !== undefined && !C.isProviderReceipt(receipt) && filing.trackingEnabled && v.trackingEnabled !== false) v.trackingEnabled = false;

  let changed = false;
  for (const [key, value] of Object.entries(v)) {
    const before = filing[key] instanceof Date ? filing[key].getTime() : filing[key];
    const after = value instanceof Date ? value.getTime() : value;
    if ((before ?? null) !== (after ?? null)) {
      filing[key] = value;
      changed = true;
    }
  }
  if (!changed) return { outcome: 'unchanged', filing };
  if (v.trackingEnabled !== undefined) filing.trackingProvider = filing.trackingEnabled ? 'uscis_case_status' : 'none';
  filing.updatedBy = actor.id;
  filing.updatedByName = actor.name;

  try {
    await filing.save();
  } catch (err) {
    if (err && err.code === 11000) return duplicateReceipt();
    throw err;
  }
  await recordActivity(caseDoc, workspace, 'uscis_filing_updated', `${filing.formType} tracking details updated by ${actor.name}.`, actor);
  return { outcome: 'updated', filing };
}

async function archiveFiling({ filing, caseDoc, workspace, actor }) {
  if (filing.archivedAt) return { outcome: 'unchanged', filing };
  filing.archivedAt = new Date();
  filing.updatedBy = actor.id;
  filing.updatedByName = actor.name;
  await filing.save();
  await recordActivity(caseDoc, workspace, 'uscis_filing_archived', `${filing.formType} tracking record archived by ${actor.name}.`, actor);
  return { outcome: 'archived', filing };
}

// ─── Status events ───────────────────────────────────────────────────────────

async function appendEvent({ filing, caseDoc, workspace, fields, actor }) {
  const event = await USCISStatusEvent.create({
    ...fields,
    filing: filing._id,
    case: filing.case,
    workspace: filing.workspace,
    observedAt: fields.observedAt || new Date(),
    createdBy: actor ? actor.id : null,
    createdByName: actor ? actor.name : 'USCIS Case Status',
  });
  const becameCurrent = await applySnapshot(filing._id, event, actor);
  if (becameCurrent) await notifyEvent({ filing, event, caseDoc, workspace, actor });
  return { event, becameCurrent };
}

async function addStatusEvent({ filing, caseDoc, workspace, data, actor }) {
  if (filing.archivedAt) return { outcome: 'invalid_state' };
  const errors = {};

  if (!C.STATUS_CATEGORIES.includes(data.statusCategory)) errors.statusCategory = 'Choose a status category.';
  const statusTitle = text(data.statusTitle);
  if (!statusTitle) errors.statusTitle = 'Status title is required.';
  else if (statusTitle.length > C.LIMITS.statusTitle) errors.statusTitle = `Status title must not exceed ${C.LIMITS.statusTitle} characters.`;
  const statusDescription = data.statusDescription === undefined ? '' : text(data.statusDescription);
  if (statusDescription.length > C.LIMITS.statusDescription) errors.statusDescription = `Description must not exceed ${C.LIMITS.statusDescription} characters.`;

  let occurredAt;
  let responseDueAt;
  try {
    occurredAt = readDate(data, 'occurredAt', 'Occurred date');
    if (!occurredAt) errors.occurredAt = errors.occurredAt || 'Occurred date is required.';
    else if (occurredAt.getTime() > Date.now() + MAX_FUTURE_MS) errors.occurredAt = 'A status cannot have occurred in the future.';
  } catch (err) {
    errors.occurredAt = err.message;
  }
  try {
    responseDueAt = readDate(data, 'responseDueAt', 'Response due date');
  } catch (err) {
    errors.responseDueAt = err.message;
  }
  for (const key of ['actionRequired', 'clientVisible']) {
    if (data[key] !== undefined && typeof data[key] !== 'boolean') errors[key] = 'Must be true or false.';
  }
  const actionRequired = data.actionRequired === true;
  if (responseDueAt && !actionRequired) errors.responseDueAt = 'A response due date only applies when action is required.';
  if (Object.keys(errors).length) return invalid(errors);

  const { event, becameCurrent } = await appendEvent({
    filing,
    caseDoc,
    workspace,
    actor,
    fields: { statusCategory: data.statusCategory, statusTitle, statusDescription, occurredAt, source: 'manual', actionRequired, responseDueAt: responseDueAt || null, clientVisible: data.clientVisible === true },
  });
  await recordActivity(caseDoc, workspace, 'uscis_status_recorded', `${filing.formType} tracking status ${becameCurrent ? 'updated to' : 'recorded:'} "${statusTitle}" by ${actor.name}.`, actor);
  return { outcome: 'recorded', event, becameCurrent };
}

// ─── Provider synchronization ────────────────────────────────────────────────

const eventKey = (filingId, kind, ...parts) => crypto.createHash('sha256').update([filingId, kind, ...parts].join('|')).digest('hex');

async function syncFiling({ filing, caseDoc, workspace, provider, actor }) {
  const status = provider.status();
  if (!status.enabled || !status.configured) return { outcome: 'provider_not_configured' };
  if (filing.archivedAt) return { outcome: 'invalid_state' };
  if (!C.isProviderReceipt(filing.receiptNumber)) return invalid({ receiptNumber: 'A receipt number like AAA1234567890 is needed to refresh from USCIS.' });

  const checkedAt = new Date();
  let observation;
  try {
    observation = await provider.getStatus(filing.receiptNumber);
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err;
    // Known status is left exactly as it was; only safe error metadata is recorded.
    await USCISFiling.updateOne({ _id: filing._id }, { $set: { lastCheckedAt: checkedAt, lastSyncErrorAt: checkedAt, lastSyncErrorCode: err.code } });
    console.warn(`[uscis] sync failed for ${C.maskReceipt(filing.receiptNumber)}: ${err.code}`);
    return { outcome: 'provider_error', code: err.code };
  }

  const visible = !!filing.clientVisible;
  const planned = observation.history.map((h) => ({ key: eventKey(filing._id, 'h', h.occurredAt.toISOString(), h.title), title: h.title, description: h.description, occurredAt: h.occurredAt }));
  const last = observation.history[observation.history.length - 1];
  if (!last || last.title !== observation.current.title) {
    planned.push({ key: eventKey(filing._id, 'c', observation.providerFingerprint), title: observation.current.title, description: observation.current.description, occurredAt: observation.current.occurredAt || checkedAt });
  }

  let created = 0;
  let current = null;
  for (const p of planned) {
    // The unique index is the race-proof guard; this makes replay a no-op even before that index is built.
    if (await USCISStatusEvent.exists({ providerEventKey: p.key })) continue;
    try {
      const { event, becameCurrent } = await appendEvent({
        filing,
        caseDoc,
        workspace,
        actor: null,
        fields: { statusCategory: categoryForTitle(p.title), statusTitle: toPlainText(p.title, C.LIMITS.statusTitle), statusDescription: toPlainText(p.description, C.LIMITS.statusDescription), occurredAt: p.occurredAt, observedAt: checkedAt, source: 'uscis_api', providerEventKey: p.key, providerModifiedAt: observation.providerModifiedAt, providerPayloadHash: observation.providerFingerprint, actionRequired: false, clientVisible: visible },
      });
      created += 1;
      if (becameCurrent) current = event;
    } catch (err) {
      if (!(err && err.code === 11000)) throw err; // already imported: replay is a no-op
    }
  }

  await USCISFiling.updateOne({ _id: filing._id }, { $set: { lastCheckedAt: checkedAt, lastSyncSucceededAt: checkedAt, lastSyncErrorAt: null, lastSyncErrorCode: null, trackingEnabled: true, trackingProvider: 'uscis_case_status' } });
  if (created) await recordActivity(caseDoc, workspace, 'uscis_status_recorded', `${filing.formType} tracking refreshed from USCIS${current ? `: "${current.statusTitle}"` : ''}.`, actor);
  return { outcome: 'synced', created };
}

// ─── Cross-case queue ────────────────────────────────────────────────────────

const parseBool = (v) => (v === 'true' ? true : v === 'false' ? false : undefined);
const parseDate = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/** The filter for the actor's authorized filings, narrowed by the query. Filters only ever narrow the authorized case set. */
async function buildQueueFilter(req, query = {}) {
  const filter = {};
  const authorizedIds = can(req, 'cases.view_all') && query.scope !== 'mine' ? null : (await memberCaseIds(req)).map(String);
  if (authorizedIds) filter.case = { $in: authorizedIds };
  if (query.archived !== 'true') filter.archivedAt = null;

  if (C.STATUS_CATEGORIES.includes(query.statusCategory)) filter.currentStatusCategory = query.statusCategory;
  const actionRequired = parseBool(query.actionRequired);
  if (actionRequired !== undefined) filter.actionRequired = actionRequired;
  if (C.TRACKING_PROVIDERS.includes(query.trackingProvider)) filter.trackingProvider = query.trackingProvider;

  const from = parseDate(query.responseDueFrom);
  const to = parseDate(query.responseDueTo);
  if (from || to) filter.responseDueAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  else if (query.hasDue === 'true') filter.responseDueAt = { $ne: null };

  const search = text(query.search).slice(0, 80);
  if (search) {
    const matchedCases = await ClientCase.find({ caseNumber: new RegExp(escapeRegex(search), 'i'), ...(authorizedIds ? { _id: { $in: authorizedIds } } : {}) }).select('_id').limit(50).lean();
    const receiptPrefix = C.normalizeReceipt(search);
    filter.$or = [
      ...(receiptPrefix ? [{ receiptNumber: new RegExp(`^${escapeRegex(receiptPrefix)}`) }] : []),
      { title: new RegExp(escapeRegex(search), 'i') },
      { formType: new RegExp(escapeRegex(search), 'i') },
      ...(matchedCases.length ? [{ case: { $in: matchedCases.map((c) => c._id) } }] : []),
    ];
  }
  return filter;
}

async function queryFilings(req, query, providerStatus) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
  const filter = await buildQueueFilter(req, query);
  const [rows, total] = await Promise.all([
    USCISFiling.find(filter).sort(SORTS[query.sort] || SORTS.updated).skip((page - 1) * limit).limit(limit).lean(),
    USCISFiling.countDocuments(filter),
  ]);

  // One lookup for the whole page, not one per row.
  const cases = await ClientCase.find({ _id: { $in: [...new Set(rows.map((r) => String(r.case)))] } }).select('caseNumber title projectManager primaryClient').populate('projectManager', 'name').populate('primaryClient', 'firstName lastName email').lean();
  const caseById = new Map(cases.map((c) => [String(c._id), c]));

  const items = rows.map((f) => {
    const c = caseById.get(String(f.case));
    return {
      ...toFilingDto(f, filingActions(req, f, providerStatus)),
      case: c ? { id: id(c), caseNumber: c.caseNumber, title: c.title } : null,
      client: c && c.primaryClient ? { displayName: [c.primaryClient.firstName, c.primaryClient.lastName].filter(Boolean).join(' ') || c.primaryClient.email } : null,
      projectManager: c && c.projectManager ? { name: c.projectManager.name || '' } : null,
    };
  });
  return { items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)), pageSize: limit };
}

/** Dashboard count: the same authorized filter as the queue. */
async function countActionRequired(req) {
  return USCISFiling.countDocuments(await buildQueueFilter(req, { actionRequired: 'true' }));
}

module.exports = {
  actorOf,
  toDetail,
  toFilingDto,
  loadFilingContext,
  listCaseFilings,
  createFiling,
  updateFiling,
  archiveFiling,
  addStatusEvent,
  syncFiling,
  rebuildCurrentSnapshot,
  queryFilings,
  countActionRequired,
  filingActions,
};
