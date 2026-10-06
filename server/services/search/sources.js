/**
 * Federated search source adapters (ADR-028). Each adapter declares its capability gate, its row scope, the explicit fields it
 * may search, an explicit projection (the only fields that ever leave the database) and a DTO mapper. Nothing here searches
 * document contents, message bodies, form answers, petition text or internal notes, and no adapter returns a raw document.
 *
 * Row scope reuses the owning module's own policy (casePolicy, interactionPolicy, leadPolicy, taskDto.visibleTaskFilter,
 * collaboration channel rules, the USCIS case-scope convention) rather than a parallel rule that could drift.
 */
const mongoose = require('mongoose');

const ClientCase = require('../../models/ClientCase');
const ClientUser = require('../../models/ClientUser');
const Consultation = require('../../models/Consultation');
const Task = require('../../models/admin/Task');
const CaseDocument = require('../../models/CaseDocument');
const ConsultationInteraction = require('../../models/ConsultationInteraction');
const EvidenceRequirement = require('../../models/EvidenceRequirement');
const CaseSmartForm = require('../../models/CaseSmartForm');
const CasePetition = require('../../models/CasePetition');
const FilingPacket = require('../../models/FilingPacket');
const USCISFiling = require('../../models/USCISFiling');
const WorkspaceChannel = require('../../models/WorkspaceChannel');
const WorkspaceMember = require('../../models/WorkspaceMember');
const ChannelMember = require('../../models/ChannelMember');
const { memberCaseIds, accessibleCaseIdFilter } = require('../casePolicy');
const { accessibleInteractionFilter } = require('../interactionPolicy');
const { leadScope } = require('../leadPolicy');
const { visibleTaskFilter } = require('../taskDto');
const { can } = require('../../utils/permissions');
const { CASE_TYPES, CASE_STAGES } = require('../../utils/caseConstants');
const { INTERACTION_STATUS_LABELS, INTERACTION_TYPE_LABELS } = require('../../utils/interactionConstants');
const { normalizeReceipt } = require('../../utils/uscisConstants');
const { escapeRegex } = require('./engine');

const label = (value) => (value ? String(value).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '');
const CASE_TYPE_LABEL = Object.fromEntries(CASE_TYPES.map((t) => [t.value, t.label]));
const STAGE_LABEL = Object.fromEntries(CASE_STAGES.map((s) => [s.value, s.label]));
const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** Row scope for a case-scoped child collection: unrestricted with cases.view_all, otherwise active-membership cases only. */
async function caseScope(req, field = 'case') {
  if (can(req, 'cases.view_all')) return {};
  return { [field]: { $in: await memberCaseIds(req) } };
}

const caseDeepLink = (caseId, tab, extra = '') => `/cases/${caseId}?tab=${tab}${extra}`;

/**
 * The adapter list. `caseOf(row)` is the case a row belongs to (for the result's case chip); `dto(row, ctx)` builds the safe
 * result body (title/subtitle/statusLabel/context/href) from projected fields only.
 */
const SOURCES = {
  cases: {
    label: 'Cases',
    capability: 'cases.view',
    model: ClientCase,
    scope: async (req) => (await accessibleCaseIdFilter(req)) || {},
    fields: [{ path: 'caseNumber', identifier: true, label: 'Case number' }, { path: 'title', label: 'Title' }],
    project: { caseNumber: 1, title: 1, caseType: 1, currentStage: 1, priority: 1, archivedAt: 1, updatedAt: 1 },
    caseOf: (row) => row._id,
    dto: (row) => ({
      title: row.title,
      subtitle: row.caseNumber,
      statusLabel: row.archivedAt ? 'Archived' : STAGE_LABEL[row.currentStage] || label(row.currentStage),
      context: [CASE_TYPE_LABEL[row.caseType] || label(row.caseType), `${label(row.priority)} priority`],
      href: `/cases/${row._id}`,
    }),
  },

  clients: {
    label: 'Clients',
    capability: 'clients.view',
    model: ClientUser,
    // The client directory is org-wide for roles holding clients.view; disabled accounts are excluded, as in the directory.
    scope: async () => ({ status: { $ne: 'disabled' } }),
    computed: { _fullName: { $trim: { input: { $concat: [{ $ifNull: ['$firstName', ''] }, ' ', { $ifNull: ['$lastName', ''] }] } } } },
    fields: [
      { path: 'email', identifier: true, label: 'Email' },
      { path: '_fullName', label: 'Name' },
      { path: 'lastName', label: 'Last name' },
    ],
    // Safe directory fields only: never credentials, lockout counters, sessions or phone.
    project: { firstName: 1, lastName: 1, email: 1, status: 1, updatedAt: 1, _fullName: 1 },
    caseOf: () => null,
    dto: (row) => ({
      title: [row.firstName, row.lastName].filter(Boolean).join(' ') || row.email,
      subtitle: row.email,
      statusLabel: label(row.status),
      context: [],
      href: `/clients/${row._id}`,
    }),
  },

  consultations: {
    label: 'Consultations',
    capability: 'leads.view',
    model: Consultation,
    scope: leadScope,
    fields: [{ path: 'email', identifier: true, label: 'Email' }, { path: 'name', label: 'Name' }, { path: 'service', label: 'Service' }],
    project: { name: 1, email: 1, service: 1, status: 1, convertedCase: 1, updatedAt: 1 },
    caseOf: (row) => row.convertedCase,
    dto: (row) => ({ title: row.name, subtitle: row.email, statusLabel: label(row.status), context: [row.service].filter(Boolean), href: `/intake/${row._id}` }),
  },

  tasks: {
    label: 'Tasks',
    capability: null, // every employee has Tasks; visibility is the module's own rule
    model: Task,
    scope: (req) => visibleTaskFilter(req, { all: true }),
    fields: [{ path: 'title', label: 'Title' }, { path: 'type', label: 'Type' }],
    // No notes, description or attachment URLs.
    project: { title: 1, type: 1, status: 1, priority: 1, dueDate: 1, case: 1, updatedAt: 1 },
    caseOf: (row) => row.case,
    dto: (row) => ({
      title: row.title,
      subtitle: row.type,
      statusLabel: label(row.status),
      context: [`${label(row.priority)} priority`, row.dueDate ? `Due ${isoDay(row.dueDate)}` : null].filter(Boolean),
      href: row.case ? caseDeepLink(row.case, 'tasks') : '/tasks',
    }),
  },

  documents: {
    label: 'Documents',
    capability: 'documents.view',
    model: CaseDocument,
    scope: async (req) => ({ archivedAt: null, ...(can(req, 'documents.view_all') ? {} : { case: { $in: await memberCaseIds(req) } }) }),
    fields: [{ path: 'displayName', label: 'Name' }, { path: 'originalName', label: 'File name' }, { path: 'documentType', label: 'Type' }],
    // Metadata only: never storageKey, paths, checksum, review comments or contents.
    project: { displayName: 1, originalName: 1, documentType: 1, status: 1, case: 1, updatedAt: 1 },
    caseOf: (row) => row.case,
    dto: (row) => ({
      title: row.displayName,
      subtitle: row.originalName !== row.displayName ? row.originalName : null,
      statusLabel: label(row.status),
      context: [row.documentType].filter(Boolean),
      href: `/documents/${row._id}`,
    }),
  },

  queries: {
    label: 'Queries',
    capability: 'queries.view',
    model: ConsultationInteraction,
    scope: accessibleInteractionFilter,
    fields: [{ path: 'interactionNumber', identifier: true, label: 'Reference' }, { path: 'subject', label: 'Subject' }],
    // No description, internalResponse or notes.
    project: { interactionNumber: 1, subject: 1, type: 1, status: 1, case: 1, updatedAt: 1 },
    caseOf: (row) => row.case,
    dto: (row) => ({
      title: row.subject,
      subtitle: row.interactionNumber,
      statusLabel: INTERACTION_STATUS_LABELS[row.status] || label(row.status),
      context: [INTERACTION_TYPE_LABELS[row.type] || label(row.type)],
      href: `/consultations/${row._id}`,
    }),
  },

  evidence: {
    label: 'Evidence',
    capability: 'cases.view',
    model: EvidenceRequirement,
    scope: (req) => caseScope(req),
    fields: [{ path: 'title', label: 'Requirement' }, { path: 'section', label: 'Section' }],
    // No internalNotes, staffGuidance or client guidance.
    project: { title: 1, section: 1, status: 1, importance: 1, case: 1, updatedAt: 1 },
    caseOf: (row) => row.case,
    dto: (row) => ({ title: row.title, subtitle: row.section, statusLabel: label(row.status), context: [label(row.importance)], href: caseDeepLink(row.case, 'evidence') }),
  },

  forms: {
    label: 'Forms',
    capability: 'forms.view',
    model: CaseSmartForm,
    scope: (req) => caseScope(req),
    fields: [{ path: 'templateTitleSnapshot', label: 'Form' }, { path: 'templateKey', label: 'Template' }],
    // Never `answers` or review notes.
    project: { templateTitleSnapshot: 1, templateKey: 1, status: 1, case: 1, updatedAt: 1 },
    caseOf: (row) => row.case,
    dto: (row) => ({ title: row.templateTitleSnapshot, subtitle: row.templateKey, statusLabel: label(row.status), context: [], href: caseDeepLink(row.case, 'forms') }),
  },

  petitions: {
    label: 'Petitions',
    capability: 'petitions.view',
    model: CasePetition,
    scope: (req) => caseScope(req),
    fields: [{ path: 'title', label: 'Title' }, { path: 'kind', label: 'Kind' }],
    // Never `sections` (body text), description or internalReviewNote.
    project: { title: 1, kind: 1, status: 1, sequence: 1, case: 1, updatedAt: 1 },
    caseOf: (row) => row.case,
    dto: (row) => ({ title: row.title, subtitle: label(row.kind), statusLabel: label(row.status), context: [`Petition ${row.sequence}`], href: caseDeepLink(row.case, 'petition') }),
  },

  filing_packets: {
    label: 'Filing packets',
    capability: 'filing_packets.view',
    model: FilingPacket,
    scope: (req) => caseScope(req),
    fields: [{ path: 'title', label: 'Title' }, { path: 'kind', label: 'Kind' }, { path: 'petitionTitleSnapshot', label: 'Petition' }],
    // Never `items` (notes), description or internalReviewNote.
    project: { title: 1, kind: 1, petitionTitleSnapshot: 1, status: 1, sequence: 1, case: 1, updatedAt: 1 },
    caseOf: (row) => row.case,
    dto: (row) => ({
      title: row.title,
      subtitle: label(row.kind),
      statusLabel: label(row.status),
      context: [`Packet ${row.sequence}`, row.petitionTitleSnapshot].filter(Boolean),
      href: caseDeepLink(row.case, 'packet'),
    }),
  },

  uscis: {
    label: 'USCIS',
    capability: 'uscis_tracking.view',
    model: USCISFiling,
    // The Phase 11 convention: org-wide with cases.view_all, otherwise member cases; archived filings are not searched.
    scope: async (req) => ({ archivedAt: null, ...(can(req, 'cases.view_all') ? {} : { case: { $in: await memberCaseIds(req) } }) }),
    fields: [
      { path: 'receiptNumber', identifier: true, normalize: normalizeReceipt, label: 'Receipt number' },
      { path: 'title', label: 'Title' },
      { path: 'formType', label: 'Form' },
      { path: 'currentStatusTitle', label: 'Status' },
    ],
    project: { receiptNumber: 1, title: 1, formType: 1, currentStatusTitle: 1, actionRequired: 1, case: 1, updatedAt: 1 },
    caseOf: (row) => row.case,
    dto: (row) => ({
      title: row.title,
      subtitle: row.receiptNumber || null,
      statusLabel: row.currentStatusTitle || 'No status recorded',
      context: [row.formType, row.actionRequired ? 'Action required' : null].filter(Boolean),
      href: caseDeepLink(row.case, 'tracking', `&filing=${row._id}`),
    }),
  },

  conversations: {
    label: 'Conversations',
    capability: 'channels.view',
    model: WorkspaceChannel,
    // The collaboration rule: an active workspace membership (unless channels.view_all), and for a restricted channel an
    // active channel membership too. A channel the actor cannot open never matches, so its name cannot leak.
    scope: async (req, q) => {
      const base = { archivedAt: null };
      // Channel names, plus the number/title of the channel's case (a case already inside the actor's scope).
      const caseHits = await ClientCase.find({ $and: [(await accessibleCaseIdFilter(req)) || {}, { $or: [{ caseNumber: new RegExp(escapeRegex(q), 'i') }, { title: new RegExp(escapeRegex(q), 'i') }] }] }).select('_id').limit(100).lean();
      const caseMatch = { $or: [{ name: { $regex: escapeRegex(q), $options: 'i' } }, { case: { $in: caseHits.map((c) => c._id) } }] };
      if (can(req, 'channels.view_all')) return { $and: [base, caseMatch] };
      const members = await WorkspaceMember.find({ adminUser: req.staff._id, memberType: 'employee', status: 'active' }).select('workspace').lean();
      const channelIds = await ChannelMember.distinct('channel', { workspaceMember: { $in: members.map((m) => m._id) }, status: 'active' });
      return { $and: [base, caseMatch, { workspace: { $in: members.map((m) => m.workspace) } }, { $or: [{ visibility: { $ne: 'restricted_members' } }, { _id: { $in: channelIds } }] }] };
    },
    fields: [{ path: 'name', label: 'Channel name' }],
    // The scope above already carries the text match (name OR case), so ranking is by name and a case-only match says "Case".
    textInScope: true,
    fallbackField: 'Case',
    project: { name: 1, visibility: 1, case: 1, updatedAt: 1 },
    caseOf: (row) => row.case,
    dto: (row) => ({ title: row.name, subtitle: null, statusLabel: label(row.visibility), context: [], href: caseDeepLink(row.case, 'chat', `&channel=${row._id}`) }),
  },
};

const SOURCE_TYPES = Object.keys(SOURCES);

/** A case id as an ObjectId string, or null. */
const asId = (v) => (v && mongoose.isValidObjectId(v) ? String(v) : null);

module.exports = { SOURCES, SOURCE_TYPES, asId };
