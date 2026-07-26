const Consultation = require('../../models/Consultation');
const AdminUser = require('../../models/admin/User');
const InternalNote = require('../../models/admin/InternalNote');
const Task = require('../../models/admin/Task');
const Sprint = require('../../models/admin/Sprint');
const Notification = require('../../models/admin/Notification');
const DeliveryRecord = require('../../models/admin/DeliveryRecord');
const ActivityLog = require('../../models/admin/ActivityLog');

const { notify, notifyMany } = require('../../utils/notify');
const { logActivity } = require('../../utils/activity');
const { blockReadOnly, requireManager, ROLE_LABELS } = require('../../utils/permissions');

// PM/assignment slots, mapped to the role that normally does that work —
// mirrors the brief's example mapping exactly.
const ASSIGNMENT_SLOTS = [
  { taskType: 'Petition Writing', role: 'petition_writer' },
  { taskType: 'Business Plan', role: 'business_plan_specialist' },
  { taskType: 'Recommendation Letters', role: 'recommendation_letter_specialist' },
  { taskType: 'USCIS Forms', role: 'uscis_forms_specialist' },
  { taskType: 'Evidence Review', role: 'evidence_collector' },
  { taskType: 'QC Review', role: 'reviewer' },
];

function slugifySlot(taskType) {
  return taskType.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function stageIndex(status) {
  const idx = Consultation.STATUS_STAGES.findIndex((s) => s.value === status);
  return idx === -1 ? 0 : idx;
}

/**
 * Attaches the Phase 9 lead-operations routes onto the SAME router instance
 * used by routes/admin/index.js, so they inherit that router's existing
 * `requireAdmin` + session-locals middleware rather than duplicating it.
 */
module.exports = function attachLeadOps(router) {
  // ======================================================================
  // TASK BOARD
  // ======================================================================

  router.get('/admin/tasks', async (req, res) => {
    try {
      const { status, assignee, lead, sprint, priority } = req.query;
      const filter = {};
      if (status && status !== 'all') filter.status = status;
      if (assignee && assignee !== 'all') filter.assignee = assignee;
      if (lead && lead !== 'all') filter.lead = lead;
      if (priority && priority !== 'all') filter.priority = priority;
      if (sprint && sprint !== 'all') filter.sprint = sprint === 'none' ? null : sprint;

      const [tasks, teamMembers, sprints, leads] = await Promise.all([
        Task.find(filter).populate('assignee', 'name role').populate('lead', 'name').sort({ order: 1, createdAt: -1 }).lean(),
        AdminUser.find({ isActive: true }).select('name role').sort({ name: 1 }).lean(),
        Sprint.find().sort({ startDate: -1 }).lean(),
        Consultation.find().select('name').sort({ name: 1 }).lean(),
      ]);

      const columns = Task.STATUSES.map((s) => ({
        status: s,
        tasks: tasks.filter((t) => t.status === s),
      }));

      res.render('admin/tasks/index', {
        title: 'Task Board | Admin',
        columns,
        taskTypes: Task.TYPES,
        taskStatuses: Task.STATUSES,
        taskPriorities: Task.PRIORITIES,
        teamMembers,
        sprints,
        leads,
        filters: {
          status: status || 'all',
          assignee: assignee || 'all',
          lead: lead || 'all',
          sprint: sprint || 'all',
          priority: priority || 'all',
        },
        currentPage: 'tasks',
      });
    } catch (err) {
      console.error('[admin/tasks]', err.message);
      res.redirect('/admin');
    }
  });

  router.post('/admin/leads/:leadId/tasks', blockReadOnly, async (req, res) => {
    try {
      const { title, type, description, assignee, dueDate, priority, notes } = req.body;
      if (!title || !title.trim()) return res.redirect(`/admin/leads/${req.params.leadId}`);

      let assigneeName = '';
      if (assignee) {
        const user = await AdminUser.findById(assignee).select('name').lean();
        assigneeName = user ? user.name : '';
      }

      const task = await Task.create({
        lead: req.params.leadId,
        title: title.trim(),
        type: type || 'Other',
        description: description || '',
        assignee: assignee || null,
        assigneeName,
        dueDate: dueDate || null,
        priority: priority || 'medium',
        notes: notes || '',
        createdBy: req.session.adminUser?.name || 'Admin',
      });

      await logActivity(req.params.leadId, 'task_created', `Task "${task.title}" created (${task.type}).`, req.session.adminUser?.name);
      if (assigneeName) {
        await notify({
          recipientName: assigneeName,
          title: 'New task assigned',
          message: `You were assigned "${task.title}".`,
          type: 'task_assigned',
          relatedLead: req.params.leadId,
          relatedTask: task._id,
        });
      }

      res.redirect(req.headers.referer || `/admin/leads/${req.params.leadId}`);
    } catch (err) {
      console.error('[admin/leads/tasks/create]', err.message);
      res.redirect(req.headers.referer || `/admin/leads/${req.params.leadId}`);
    }
  });

  router.put('/admin/tasks/:id', blockReadOnly, async (req, res) => {
    try {
      const { title, type, description, assignee, dueDate, priority, status, notes } = req.body;
      const task = await Task.findById(req.params.id);
      if (!task) return res.redirect('/admin/tasks');

      let assigneeName = task.assigneeName;
      const assigneeChanged = String(task.assignee || '') !== String(assignee || '');
      if (assigneeChanged) {
        assigneeName = '';
        if (assignee) {
          const user = await AdminUser.findById(assignee).select('name').lean();
          assigneeName = user ? user.name : '';
        }
      }

      const wasCompleted = task.status === 'completed';

      task.title = title || task.title;
      task.type = type || task.type;
      task.description = description ?? task.description;
      task.assignee = assignee || null;
      task.assigneeName = assigneeName;
      task.dueDate = dueDate || null;
      task.priority = priority || task.priority;
      task.status = status || task.status;
      task.notes = notes ?? task.notes;
      await task.save();

      if (assigneeChanged && assigneeName) {
        await notify({
          recipientName: assigneeName,
          title: 'Task assigned to you',
          message: `You were assigned "${task.title}".`,
          type: 'task_assigned',
          relatedLead: task.lead,
          relatedTask: task._id,
        });
      }
      if (!wasCompleted && task.status === 'completed') {
        await logActivity(task.lead, 'task_completed', `Task "${task.title}" marked complete.`, req.session.adminUser?.name);
      }

      res.redirect(req.headers.referer || '/admin/tasks');
    } catch (err) {
      console.error('[admin/tasks/update]', err.message);
      res.redirect('/admin/tasks');
    }
  });

  router.post('/admin/tasks/:id/status', blockReadOnly, async (req, res) => {
    try {
      const { status } = req.body;
      if (!Task.STATUSES.includes(status)) return res.redirect(req.headers.referer || '/admin/tasks');

      const task = await Task.findById(req.params.id);
      if (!task) return res.redirect('/admin/tasks');

      const wasCompleted = task.status === 'completed';
      task.status = status;
      await task.save();

      if (!wasCompleted && status === 'completed') {
        await logActivity(task.lead, 'task_completed', `Task "${task.title}" marked complete.`, req.session.adminUser?.name);
      }

      res.redirect(req.headers.referer || '/admin/tasks');
    } catch (err) {
      console.error('[admin/tasks/status]', err.message);
      res.redirect('/admin/tasks');
    }
  });

  router.post('/admin/tasks/:id/sprint', blockReadOnly, async (req, res) => {
    try {
      const { sprintId } = req.body;
      await Task.findByIdAndUpdate(req.params.id, { sprint: sprintId || null });
      res.redirect(req.headers.referer || '/admin/sprints');
    } catch (err) {
      console.error('[admin/tasks/sprint]', err.message);
      res.redirect('/admin/sprints');
    }
  });

  router.delete('/admin/tasks/:id', requireManager, async (req, res) => {
    try {
      await Task.findByIdAndDelete(req.params.id);
      res.redirect(req.headers.referer || '/admin/tasks');
    } catch (err) {
      res.redirect('/admin/tasks');
    }
  });

  // ======================================================================
  // SPRINT BOARD
  // ======================================================================

  router.get('/admin/sprints', async (req, res) => {
    try {
      const sprints = await Sprint.find().sort({ startDate: -1 }).lean();
      const tasksBySprintList = await Task.find({ sprint: { $ne: null } }).populate('assignee', 'name').lean();
      const unassignedTasks = await Task.find({ sprint: null, status: { $ne: 'completed' } })
        .populate('lead', 'name')
        .sort({ createdAt: -1 })
        .lean();

      const sprintCards = sprints.map((sprint) => {
        const tasks = tasksBySprintList.filter((t) => String(t.sprint) === String(sprint._id));
        const completed = tasks.filter((t) => t.status === 'completed').length;
        const blocked = tasks.filter((t) => t.status === 'waiting').length;
        return {
          ...sprint,
          tasks,
          total: tasks.length,
          completed,
          blocked,
          progress: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
        };
      });

      res.render('admin/sprints/index', {
        title: 'Sprint Board | Admin',
        sprintCards,
        unassignedTasks,
        currentPage: 'sprints',
      });
    } catch (err) {
      console.error('[admin/sprints]', err.message);
      res.redirect('/admin');
    }
  });

  router.post('/admin/sprints', requireManager, async (req, res) => {
    try {
      const { name, goal, startDate, endDate } = req.body;
      if (name && startDate && endDate) {
        await Sprint.create({
          name: name.trim(),
          goal: goal || '',
          startDate,
          endDate,
          createdBy: req.session.adminUser?.name || 'Admin',
        });
      }
      res.redirect('/admin/sprints');
    } catch (err) {
      console.error('[admin/sprints/create]', err.message);
      res.redirect('/admin/sprints');
    }
  });

  router.post('/admin/sprints/:id/status', requireManager, async (req, res) => {
    try {
      const { status } = req.body;
      if (['planning', 'active', 'completed'].includes(status)) {
        await Sprint.findByIdAndUpdate(req.params.id, { status });
      }
      res.redirect('/admin/sprints');
    } catch (err) {
      res.redirect('/admin/sprints');
    }
  });

  router.delete('/admin/sprints/:id', requireManager, async (req, res) => {
    try {
      await Task.updateMany({ sprint: req.params.id }, { sprint: null });
      await Sprint.findByIdAndDelete(req.params.id);
      res.redirect('/admin/sprints');
    } catch (err) {
      res.redirect('/admin/sprints');
    }
  });

  // ======================================================================
  // NOTIFICATIONS
  // ======================================================================

  router.get('/admin/notifications', async (req, res) => {
    try {
      const recipientName = req.session.adminUser?.name || 'Admin';
      const { type, lead, unread } = req.query;
      const filter = { recipientName };
      if (type && type !== 'all') filter.type = type;
      if (lead && lead !== 'all') filter.relatedLead = lead;
      if (unread === '1') filter.read = false;

      const [notifications, leads] = await Promise.all([
        Notification.find(filter).populate('relatedLead', 'name').sort({ createdAt: -1 }).limit(100).lean(),
        Consultation.find().select('name').sort({ name: 1 }).lean(),
      ]);

      res.render('admin/notifications/index', {
        title: 'Notifications | Admin',
        notifications,
        notificationTypes: Notification.TYPES,
        leads,
        filters: { type: type || 'all', lead: lead || 'all', unread: unread === '1' },
        currentPage: 'notifications',
      });
    } catch (err) {
      console.error('[admin/notifications]', err.message);
      res.redirect('/admin');
    }
  });

  router.post('/admin/notifications/:id/read', async (req, res) => {
    try {
      await Notification.findByIdAndUpdate(req.params.id, { read: true });
      res.redirect(req.headers.referer || '/admin/notifications');
    } catch (err) {
      res.redirect('/admin/notifications');
    }
  });

  router.post('/admin/notifications/read-all', async (req, res) => {
    try {
      const recipientName = req.session.adminUser?.name || 'Admin';
      await Notification.updateMany({ recipientName, read: false }, { read: true });
      res.redirect(req.headers.referer || '/admin/notifications');
    } catch (err) {
      res.redirect('/admin/notifications');
    }
  });

  // ======================================================================
  // LEAD ASSIGNMENT
  // ======================================================================

  router.post('/admin/leads/:id/assign', requireManager, async (req, res) => {
    try {
      const lead = await Consultation.findById(req.params.id);
      if (!lead) return res.redirect('/admin/leads');

      const { owner } = req.body;
      let ownerName = '';
      if (owner) {
        const ownerUser = await AdminUser.findById(owner).select('name').lean();
        ownerName = ownerUser ? ownerUser.name : '';
      }

      const assignees = [];
      const newlyAssignedNames = [];
      for (const slot of ASSIGNMENT_SLOTS) {
        const fieldName = `assignee_${slugifySlot(slot.taskType)}`;
        const userId = req.body[fieldName];
        if (!userId) continue;
        const user = await AdminUser.findById(userId).select('name').lean();
        if (!user) continue;
        assignees.push({ user: user._id, name: user.name, taskType: slot.taskType });

        const alreadyAssigned = (lead.assignees || []).some(
          (a) => String(a.user) === String(user._id) && a.taskType === slot.taskType
        );
        if (!alreadyAssigned) newlyAssignedNames.push(user.name);
      }

      lead.owner = owner || null;
      lead.ownerName = ownerName;
      lead.assignees = assignees;

      // Auto-advance status forward only — never regress a lead that's
      // already further along in the pipeline than "assigned".
      if (assignees.length && stageIndex(lead.status) < stageIndex('assigned')) {
        lead.status = 'assigned';
      }

      await lead.save();

      const actor = req.session.adminUser?.name || 'Admin';
      const assigneeSummary = assignees.length
        ? assignees.map((a) => `${a.taskType} → ${a.name}`).join(', ')
        : 'no assignees';
      await logActivity(lead._id, 'assigned', `Assigned by ${actor}. Owner: ${ownerName || 'none'}. ${assigneeSummary}.`, actor);

      await notifyMany([ownerName, ...newlyAssignedNames], {
        title: 'Lead assigned',
        message: `You were assigned to "${lead.name}"'s case.`,
        type: 'lead_assigned',
        relatedLead: lead._id,
      });

      res.redirect(`/admin/leads/${lead._id}`);
    } catch (err) {
      console.error('[admin/leads/assign]', err.message);
      res.redirect(`/admin/leads/${req.params.id}`);
    }
  });

  // ======================================================================
  // DELIVERY WORKFLOW
  // ======================================================================

  router.get('/admin/delivery', async (req, res) => {
    try {
      const records = await DeliveryRecord.find().populate('lead', 'name status').sort({ updatedAt: -1 }).lean();
      res.render('admin/delivery/index', {
        title: 'Delivery Records | Admin',
        records,
        currentPage: 'delivery',
      });
    } catch (err) {
      console.error('[admin/delivery]', err.message);
      res.redirect('/admin');
    }
  });

  async function getOrCreateDelivery(leadId) {
    let record = await DeliveryRecord.findOne({ lead: leadId });
    if (!record) record = await DeliveryRecord.create({ lead: leadId });
    return record;
  }

  router.post('/admin/leads/:id/delivery', blockReadOnly, async (req, res) => {
    try {
      const { state, method } = req.body;
      const record = await getOrCreateDelivery(req.params.id);
      const wasDelivered = record.state === 'delivered';

      if (state) record.state = state;
      if (method) record.method = method;
      if (state === 'delivered' && !wasDelivered) {
        record.deliveredAt = new Date();
        record.deliveredBy = req.session.adminUser?.name || 'Admin';
      }
      await record.save();

      if (record.lead) await Consultation.findByIdAndUpdate(req.params.id, { deliveryStatus: record.state });

      const actor = req.session.adminUser?.name || 'Admin';
      if (state === 'ready') {
        await logActivity(req.params.id, 'status_changed', `Package marked ready for delivery by ${actor}.`, actor);
      }
      if (state === 'delivered' && !wasDelivered) {
        await logActivity(req.params.id, 'package_delivered', `Package delivered by ${actor}.`, actor);
        const lead = await Consultation.findByIdAndUpdate(req.params.id, { status: 'delivered' }, { new: true });
        await notifyMany([lead?.ownerName, ...(lead?.assignees || []).map((a) => a.name)], {
          title: 'Package delivered',
          message: `The petition package for "${lead?.name}" was delivered.`,
          type: 'lead_delivered',
          relatedLead: req.params.id,
        });
      }

      res.redirect(`/admin/leads/${req.params.id}`);
    } catch (err) {
      console.error('[admin/leads/delivery]', err.message);
      res.redirect(`/admin/leads/${req.params.id}`);
    }
  });

  router.post('/admin/leads/:id/delivery/files', blockReadOnly, async (req, res) => {
    try {
      const { fileName, fileUrl, fileStatus } = req.body;
      if (fileName && fileName.trim()) {
        const record = await getOrCreateDelivery(req.params.id);
        record.files.push({ name: fileName.trim(), url: fileUrl || '', status: fileStatus || 'pending' });
        await record.save();
      }
      res.redirect(`/admin/leads/${req.params.id}`);
    } catch (err) {
      console.error('[admin/leads/delivery/files]', err.message);
      res.redirect(`/admin/leads/${req.params.id}`);
    }
  });

  // Placeholder export — records the request; real PDF/ZIP generation is
  // deferred (per the brief, a clean delivery record beats a rushed
  // half-working file generator).
  router.post('/admin/leads/:id/delivery/export', blockReadOnly, async (req, res) => {
    try {
      const actor = req.session.adminUser?.name || 'Admin';
      const record = await getOrCreateDelivery(req.params.id);
      record.confirmationNote = `Export requested by ${actor} on ${new Date().toLocaleString()} (placeholder — automatic file generation is not wired up yet; assemble the package manually and attach files above).`;
      await record.save();
      await logActivity(req.params.id, 'file_uploaded', 'Package export requested (placeholder flow).', actor);
      res.redirect(`/admin/leads/${req.params.id}`);
    } catch (err) {
      console.error('[admin/leads/delivery/export]', err.message);
      res.redirect(`/admin/leads/${req.params.id}`);
    }
  });

  // Exposed for index.js to reuse when rendering the lead detail page.
  router.locals = router.locals || {};
  router.locals.ASSIGNMENT_SLOTS = ASSIGNMENT_SLOTS;
  router.locals.slugifySlot = slugifySlot;
};

module.exports.ASSIGNMENT_SLOTS = ASSIGNMENT_SLOTS;
module.exports.slugifySlot = slugifySlot;
