const ClientCase = require('../models/ClientCase');
const Task = require('../models/admin/Task');
const CaseDocument = require('../models/CaseDocument');
const DocumentRequest = require('../models/DocumentRequest');
const EvidenceRequirement = require('../models/EvidenceRequirement');
const CaseSmartForm = require('../models/CaseSmartForm');
const CasePetition = require('../models/CasePetition');
const FilingPacket = require('../models/FilingPacket');
const { accessibleCaseIdFilter } = require('./casePolicy');
const { can } = require('../utils/permissions');

// A queue's capability and filters live next to its destination. The UI never
// guesses work access from role names, and every destination rechecks policy.
function definitions(req) {
  const manager = can(req, 'cases.manage');
  const now = new Date();
  const today = new Date(now); today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);
  const nextWeek = new Date(now.getTime() + 7 * 86400000);
  const taskAssignee = !manager ? { assignee: req.staff._id } : {};
  return [
    { key: 'cases_without_manager', label: 'Cases needing a Project Manager', capability: 'cases.assign', model: ClientCase, tab: 'team', caseRows: true, match: { projectManager: null } },
    { key: 'overdue_tasks', label: manager ? 'Overdue team tasks' : 'My overdue tasks', capability: 'cases.view', model: Task, tab: 'tasks', match: { status: { $ne: 'completed' }, dueDate: { $lt: new Date(), $ne: null }, ...(!manager ? { assignee: req.staff._id } : {}) } },
    { key: 'assigned_tasks', label: 'My open tasks', capability: 'cases.view', model: Task, tab: 'tasks', match: { assignee: req.staff._id, status: { $ne: 'completed' } } },
    { key: 'tasks_due_today', label: manager ? 'Team tasks due today' : 'My tasks due today', capability: 'cases.view', model: Task, tab: 'tasks', match: { status: { $ne: 'completed' }, dueDate: { $gte: today, $lt: tomorrow }, ...taskAssignee } },
    { key: 'tasks_due_soon', label: manager ? 'Team tasks due in the next 7 days' : 'My tasks due in the next 7 days', capability: 'cases.view', model: Task, tab: 'tasks', match: { status: { $ne: 'completed' }, dueDate: { $gte: now, $lte: nextWeek }, ...taskAssignee } },
    { key: 'unassigned_tasks', label: 'Tasks needing an assignee', capability: 'tasks.manage', model: Task, tab: 'tasks', match: { status: { $ne: 'completed' }, assignee: null } },
    { key: 'document_review', label: 'Documents to review', capability: 'documents.review', model: CaseDocument, tab: 'documents', match: { status: { $in: ['uploaded', 'pending_review'] }, archivedAt: null } },
    { key: 'document_requests', label: 'Overdue document requests', capability: 'document_requests.manage', model: DocumentRequest, tab: 'documents', match: { status: { $in: ['open', 'replacement_required'] }, dueDate: { $lt: new Date(), $ne: null } } },
    { key: 'requested_documents', label: 'Documents waiting for the client', capability: 'document_requests.manage', model: DocumentRequest, tab: 'documents', match: { status: { $in: ['open', 'replacement_required'] } } },
    { key: 'missing_evidence', label: 'Evidence still needed', capability: 'cases.view', model: EvidenceRequirement, tab: 'evidence', match: { status: { $in: ['missing', 'in_progress'] } } },
    { key: 'forms_review', label: 'Forms to review', capability: 'forms.review', model: CaseSmartForm, tab: 'forms', match: { status: 'submitted' } },
    { key: 'forms_draft', label: 'Forms in preparation', capability: 'forms.edit', model: CaseSmartForm, tab: 'forms', match: { status: { $in: ['draft', 'needs_changes'] } } },
    { key: 'petition_review', label: 'Petitions to review', capability: 'petitions.review', model: CasePetition, tab: 'petition', match: { status: 'internal_review' } },
    { key: 'petition_finalize', label: 'Approved petitions to finalize', capability: 'petitions.finalize', model: CasePetition, tab: 'petition', match: { status: 'approved' } },
    { key: 'petition_draft', label: 'Petitions in preparation', capability: 'petitions.edit', model: CasePetition, tab: 'petition', match: { status: { $in: ['drafting', 'needs_changes'] } } },
    { key: 'packet_review', label: 'Filing packets to review', capability: 'filing_packets.review', model: FilingPacket, tab: 'packet', match: { status: 'review' } },
    { key: 'packet_finalize', label: 'Approved filing packets to finalize', capability: 'filing_packets.finalize', model: FilingPacket, tab: 'packet', match: { status: 'approved' } },
    { key: 'packet_draft', label: 'Filing packets in preparation', capability: 'filing_packets.manage', model: FilingPacket, tab: 'packet', match: { status: { $in: ['draft', 'needs_changes'] } } },
  ].filter(d => can(req, d.capability));
}

async function loadWorkQueues(req, { caseId = null } = {}) {
  if (!can(req, 'cases.view')) return [];
  const restriction = await accessibleCaseIdFilter(req);
  const cases = await ClientCase.find({ $and: [restriction || {}, caseId ? { _id: caseId } : { archivedAt: null }] }).select('title caseNumber').lean();
  const byId = new Map(cases.map(c => [String(c._id), c]));
  return Promise.all(definitions(req).map(async definition => {
    const rows = await definition.model.aggregate([
      { $match: { ...definition.match, [definition.caseRows ? '_id' : 'case']: { $in: cases.map(c => c._id) } } },
      { $group: { _id: definition.caseRows ? '$_id' : '$case', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]);
    return {
      key: definition.key, label: definition.label, tab: definition.tab,
      count: rows.reduce((sum, row) => sum + row.count, 0),
      items: rows.map(row => ({ caseId: String(row._id), title: byId.get(String(row._id)).title, caseNumber: byId.get(String(row._id)).caseNumber, count: row.count })),
    };
  }));
}
module.exports = { loadWorkQueues };
