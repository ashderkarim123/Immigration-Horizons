const mongoose = require('mongoose');

const ConsultationInteraction = require('../../models/ConsultationInteraction');
const InteractionHistory = require('../../models/InteractionHistory');
const InteractionUpdate = require('../../models/InteractionUpdate');
const Consultation = require('../../models/Consultation');
const ClientCase = require('../../models/ClientCase');
const ClientUser = require('../../models/ClientUser');
const AdminUser = require('../../models/admin/User');
const WorkspaceMember = require('../../models/WorkspaceMember');

const { requireCapability, can } = require('../../utils/permissions');
const { actorFromSession } = require('../../utils/actorSnapshot');
const {
  INTERACTION_TYPES,
  INTERACTION_TYPE_LABELS,
  INTERACTION_STATUSES,
  INTERACTION_STATUS_LABELS,
  INTERACTION_PRIORITIES,
} = require('../../utils/interactionConstants');
const interactionPolicy = require('../../services/interactionPolicy');
const interactionService = require('../../services/interactionService');
const { loadQueue, queueCounts } = require('../../services/interactionQueues');

const MAX_PAGE_LIMIT = 100;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_SEARCH_LENGTH = 100;

function sanitizeEnumParam(value, allowed) {
  return typeof value === 'string' && allowed.includes(value) ? value : 'all';
}
function parseBoundedInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function loadAndAuthorize(req, res, capabilityCheck) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404).send('Interaction not found.');
    return null;
  }
  const interaction = await ConsultationInteraction.findById(req.params.id);
  if (!interaction) {
    res.status(404).send('Interaction not found.');
    return null;
  }
  if (!(await capabilityCheck(req, interaction))) {
    res.status(403).send('Forbidden.');
    return null;
  }
  return interaction;
}

// VersionErrors are thrown (see interactionService.js's saveGuarded), not
// returned inside `result` — they're always handled in each route's own
// catch block. This just logs validation problems before the redirect.
function handleServiceOutcome(res, req, result) {
  if (result.outcome === 'validation_error') {
    console.warn('[admin/queries] validation error:', result.errors);
  }
  return res.redirect(`/admin/queries/${req.params.id}`);
}

/**
 * Attaches Cycle 3 consultation-interaction ("queries") routes onto the
 * shared admin router — same pattern as leadOps.js/cases.js.
 */
module.exports = function attachQueries(router) {
  // ======================================================================
  // LIST
  // ======================================================================

  router.get('/admin/queries', requireCapability('queries.view'), async (req, res) => {
    try {
      const status = sanitizeEnumParam(req.query.status, INTERACTION_STATUSES.concat('all'));
      const type = sanitizeEnumParam(req.query.type, INTERACTION_TYPES.concat('all'));
      const priority = sanitizeEnumParam(req.query.priority, INTERACTION_PRIORITIES.concat('all'));
      const scope = sanitizeEnumParam(req.query.scope, ['consultation', 'case', 'all']);
      const assignee = mongoose.Types.ObjectId.isValid(req.query.assignee || '') ? req.query.assignee : 'all';
      const queue = typeof req.query.queue === 'string' ? req.query.queue : '';
      const search = typeof req.query.search === 'string' ? req.query.search.slice(0, MAX_SEARCH_LENGTH) : '';
      const page = parseBoundedInt(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER);
      const limit = parseBoundedInt(req.query.limit, DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT);

      let result;
      if (queue) {
        result = await loadQueue(queue, { page, limit }).catch(() => null);
      }

      if (!result) {
        const filter = {};
        if (status !== 'all') filter.status = status;
        if (type !== 'all') filter.type = type;
        if (priority !== 'all') filter.priority = priority;
        if (scope !== 'all') filter.scopeType = scope;
        if (assignee !== 'all') filter.assignedTo = assignee;

        if (!can(req, 'queries.view_all')) {
          const adminUserId = req.session.adminUser && req.session.adminUser.id;
          if (!adminUserId) {
            filter._id = { $in: [] };
          } else {
            // Consultation-scoped interactions: visible to any queries.view
            // holder (matches this app's existing lead-access convention —
            // see services/interactionPolicy.js). Case-scoped interactions:
            // restricted to workspaces the actor actively belongs to.
            const workspaceIds = await WorkspaceMember.distinct('workspace', {
              adminUser: adminUserId,
              memberType: 'employee',
              status: 'active',
            });
            filter.$or = [{ scopeType: 'consultation' }, { scopeType: 'case', workspace: { $in: workspaceIds } }];
          }
        }

        if (search) {
          const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          filter.$and = (filter.$and || []).concat([
            { $or: [{ subject: { $regex: safe, $options: 'i' } }, { interactionNumber: { $regex: safe, $options: 'i' } }] },
          ]);
        }

        const safeLimit = limit;
        const safePage = page;
        const [items, total] = await Promise.all([
          ConsultationInteraction.find(filter)
            .populate('clientUser', 'email firstName lastName')
            .populate('assignedTo', 'name')
            .sort({ createdAt: -1 })
            .skip((safePage - 1) * safeLimit)
            .limit(safeLimit)
            .lean(),
          ConsultationInteraction.countDocuments(filter),
        ]);
        result = { items, total, page: safePage, totalPages: Math.max(1, Math.ceil(total / safeLimit)) };
      }

      const [teamMembers, counts] = await Promise.all([
        AdminUser.find({ isActive: true }).select('name role').sort({ name: 1 }).lean(),
        queueCounts(),
      ]);

      res.render('admin/queries/index', {
        title: 'Queries | Admin',
        interactions: result.items,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        statusFilter: status,
        typeFilter: type,
        priorityFilter: priority,
        scopeFilter: scope,
        assigneeFilter: assignee,
        queueFilter: queue,
        search,
        teamMembers,
        counts,
        interactionTypes: INTERACTION_TYPES,
        interactionTypeLabels: INTERACTION_TYPE_LABELS,
        interactionStatuses: INTERACTION_STATUSES,
        interactionStatusLabels: INTERACTION_STATUS_LABELS,
        interactionPriorities: INTERACTION_PRIORITIES,
        currentPage: 'queries',
      });
    } catch (err) {
      console.error('[admin/queries/index]', err.message);
      res.redirect('/admin');
    }
  });

  // ======================================================================
  // DETAIL
  // ======================================================================

  router.get('/admin/queries/:id', requireCapability('queries.view'), async (req, res) => {
    try {
      const interaction = await loadAndAuthorize(req, res, interactionPolicy.canViewInteraction);
      if (!interaction) return;

      const [clientUser, consultation, caseDoc, assignedTo, history, updates, teamMembers] = await Promise.all([
        ClientUser.findById(interaction.clientUser).lean(),
        interaction.consultation ? Consultation.findById(interaction.consultation).lean() : null,
        interaction.case ? ClientCase.findById(interaction.case).lean() : null,
        interaction.assignedTo ? AdminUser.findById(interaction.assignedTo).select('name role').lean() : null,
        InteractionHistory.find({ interaction: interaction._id }).sort({ createdAt: -1 }).lean(),
        InteractionUpdate.find({ interaction: interaction._id, deletedAt: null }).sort({ createdAt: 1 }).lean(),
        AdminUser.find({ isActive: true }).select('name role').sort({ name: 1 }).lean(),
      ]);

      res.render('admin/queries/detail', {
        title: `Query: ${interaction.interactionNumber} | Admin`,
        interaction,
        clientUser,
        consultation,
        caseDoc,
        assignedTo,
        history,
        updates,
        teamMembers,
        canTriage: await interactionPolicy.canTriageInteraction(req, interaction),
        canAssign: await interactionPolicy.canAssignInteraction(req, interaction),
        canSchedule: await interactionPolicy.canScheduleInteraction(req, interaction),
        canAnswer: await interactionPolicy.canAnswerInteraction(req, interaction),
        canClose: await interactionPolicy.canCloseInteraction(req, interaction),
        interactionTypeLabels: INTERACTION_TYPE_LABELS,
        interactionStatusLabels: INTERACTION_STATUS_LABELS,
        currentPage: 'queries',
      });
    } catch (err) {
      console.error('[admin/queries/detail]', err.message);
      res.redirect('/admin/queries');
    }
  });

  // ======================================================================
  // LIFECYCLE ACTIONS
  // ======================================================================

  router.post('/admin/queries/:id/acknowledge', requireCapability('queries.triage'), async (req, res) => {
    try {
      const interaction = await loadAndAuthorize(req, res, interactionPolicy.canTriageInteraction);
      if (!interaction) return;
      const result = await interactionService.acknowledgeInteraction(interaction, actorFromSession(req));
      handleServiceOutcome(res, req, result);
    } catch (err) {
      if (err.isVersionConflict) return res.status(409).send(err.message);
      console.error('[admin/queries/acknowledge]', err.message);
      res.redirect(`/admin/queries/${req.params.id}`);
    }
  });

  router.post('/admin/queries/:id/assign', requireCapability('queries.assign'), async (req, res) => {
    try {
      const interaction = await loadAndAuthorize(req, res, interactionPolicy.canAssignInteraction);
      if (!interaction) return;
      const result = await interactionService.assignInteraction(interaction, req.body.assignedTo, actorFromSession(req));
      handleServiceOutcome(res, req, result);
    } catch (err) {
      if (err.isVersionConflict) return res.status(409).send(err.message);
      console.error('[admin/queries/assign]', err.message);
      res.redirect(`/admin/queries/${req.params.id}`);
    }
  });

  router.post('/admin/queries/:id/schedule', requireCapability('queries.schedule'), async (req, res) => {
    try {
      const interaction = await loadAndAuthorize(req, res, interactionPolicy.canScheduleInteraction);
      if (!interaction) return;
      const result = await interactionService.scheduleInteraction(
        interaction,
        { scheduledFor: req.body.scheduledFor, timezone: req.body.timezone },
        actorFromSession(req),
      );
      handleServiceOutcome(res, req, result);
    } catch (err) {
      if (err.isVersionConflict) return res.status(409).send(err.message);
      console.error('[admin/queries/schedule]', err.message);
      res.redirect(`/admin/queries/${req.params.id}`);
    }
  });

  router.post('/admin/queries/:id/status', requireCapability('queries.manage'), async (req, res) => {
    try {
      const interaction = await loadAndAuthorize(req, res, interactionPolicy.canManageInteraction);
      if (!interaction) return;
      let result;
      if (req.body.status === 'in_progress') {
        result = await interactionService.startWork(interaction, actorFromSession(req));
      } else {
        return res.status(422).send('Unsupported status transition for this route.');
      }
      handleServiceOutcome(res, req, result);
    } catch (err) {
      if (err.isVersionConflict) return res.status(409).send(err.message);
      console.error('[admin/queries/status]', err.message);
      res.redirect(`/admin/queries/${req.params.id}`);
    }
  });

  router.post('/admin/queries/:id/answer', requireCapability('queries.answer'), async (req, res) => {
    try {
      const interaction = await loadAndAuthorize(req, res, interactionPolicy.canAnswerInteraction);
      if (!interaction) return;
      const result = await interactionService.answerInteraction(
        interaction,
        {
          clientVisibleResponse: req.body.clientVisibleResponse,
          internalResponse: req.body.internalResponse,
          resolutionSummary: req.body.resolutionSummary,
        },
        actorFromSession(req),
      );
      handleServiceOutcome(res, req, result);
    } catch (err) {
      if (err.isVersionConflict) return res.status(409).send(err.message);
      console.error('[admin/queries/answer]', err.message);
      res.redirect(`/admin/queries/${req.params.id}`);
    }
  });

  router.post('/admin/queries/:id/request-clarification', requireCapability('queries.answer'), async (req, res) => {
    try {
      const interaction = await loadAndAuthorize(req, res, interactionPolicy.canAnswerInteraction);
      if (!interaction) return;
      const result = await interactionService.requestClarification(
        interaction,
        { clientVisibleQuestion: req.body.clientVisibleQuestion },
        actorFromSession(req),
      );
      handleServiceOutcome(res, req, result);
    } catch (err) {
      if (err.isVersionConflict) return res.status(409).send(err.message);
      console.error('[admin/queries/request-clarification]', err.message);
      res.redirect(`/admin/queries/${req.params.id}`);
    }
  });

  router.post('/admin/queries/:id/no-show', requireCapability('queries.manage'), async (req, res) => {
    try {
      const interaction = await loadAndAuthorize(req, res, interactionPolicy.canManageInteraction);
      if (!interaction) return;
      const result = await interactionService.markNoShow(interaction, actorFromSession(req));
      handleServiceOutcome(res, req, result);
    } catch (err) {
      if (err.isVersionConflict) return res.status(409).send(err.message);
      console.error('[admin/queries/no-show]', err.message);
      res.redirect(`/admin/queries/${req.params.id}`);
    }
  });

  router.post('/admin/queries/:id/cancel', requireCapability('queries.manage'), async (req, res) => {
    try {
      const interaction = await loadAndAuthorize(req, res, interactionPolicy.canManageInteraction);
      if (!interaction) return;
      const result = await interactionService.cancelInteraction(interaction, { reason: req.body.reason }, actorFromSession(req));
      handleServiceOutcome(res, req, result);
    } catch (err) {
      if (err.isVersionConflict) return res.status(409).send(err.message);
      console.error('[admin/queries/cancel]', err.message);
      res.redirect(`/admin/queries/${req.params.id}`);
    }
  });

  router.post('/admin/queries/:id/close', requireCapability('queries.close'), async (req, res) => {
    try {
      const interaction = await loadAndAuthorize(req, res, interactionPolicy.canCloseInteraction);
      if (!interaction) return;
      const result = await interactionService.closeInteraction(interaction, actorFromSession(req));
      handleServiceOutcome(res, req, result);
    } catch (err) {
      if (err.isVersionConflict) return res.status(409).send(err.message);
      console.error('[admin/queries/close]', err.message);
      res.redirect(`/admin/queries/${req.params.id}`);
    }
  });

  // ======================================================================
  // EMPLOYEE INTERNAL NOTE
  // ======================================================================

  router.post('/admin/queries/:id/notes', requireCapability('queries.view'), async (req, res) => {
    try {
      const interaction = await loadAndAuthorize(req, res, interactionPolicy.canAddInteractionUpdate);
      if (!interaction) return;
      const actor = actorFromSession(req);
      if (req.body.note && req.body.note.trim()) {
        await InteractionUpdate.create({
          interaction: interaction._id,
          authorType: 'admin',
          authorAdmin: actor.id || null,
          authorName: actor.name,
          updateType: 'employee_note',
          body: req.body.note.trim(),
          visibility: 'internal',
        });
      }
      res.redirect(`/admin/queries/${req.params.id}`);
    } catch (err) {
      console.error('[admin/queries/notes]', err.message);
      res.redirect(`/admin/queries/${req.params.id}`);
    }
  });

  // ======================================================================
  // HISTORICAL-CONSULTATION LAZY INITIALIZATION
  // ======================================================================

  router.post('/admin/leads/:id/initialize-interaction', requireCapability('queries.create'), async (req, res) => {
    try {
      const lead = await Consultation.findById(req.params.id);
      if (!lead) return res.status(404).send('Consultation not found.');
      if (!lead.clientUser) {
        return res.status(422).send('This consultation has no linked client account yet.');
      }
      const result = await interactionService.createInitialConsultationInteraction({
        consultationId: lead._id,
        clientUserId: lead.clientUser,
        subject: `Initial consultation — ${lead.service || 'General inquiry'}`,
        description: lead.message,
      });
      if (result.outcome === 'deferred_no_client') {
        return res.status(422).send('This consultation has no linked client account yet.');
      }
      res.redirect(`/admin/leads/${req.params.id}`);
    } catch (err) {
      console.error('[admin/leads/initialize-interaction]', err.message);
      res.redirect(`/admin/leads/${req.params.id}`);
    }
  });
};
