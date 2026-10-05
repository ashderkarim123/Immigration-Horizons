// Staff entry points for the retained lead, sprint, delivery and notification
// domains. Converted leads and every case task retain live case membership checks.
const router = require("express").Router();
const mongoose = require("mongoose");
const Lead = require("../../../../models/Consultation");
const User = require("../../../../models/admin/User");
const Sprint = require("../../../../models/admin/Sprint");
const Task = require("../../../../models/admin/Task");
const Delivery = require("../../../../models/admin/DeliveryRecord");
const Note = require("../../../../models/admin/InternalNote");
const Activity = require("../../../../models/admin/ActivityLog");
const Notification = require("../../../../models/admin/Notification");
const Interaction = require("../../../../models/ConsultationInteraction");
const WorkspaceChannel = require('../../../../models/WorkspaceChannel');
const { canViewChannel } = require('../../../../services/collaborationPolicy');
const notificationService = require("../../../../services/notificationService");
const {
  createInitialConsultationInteraction,
} = require("../../../../services/interactionService");
const { memberCaseIds } = require("../../../../services/casePolicy");
const {
  taskActionContext,
  taskAccess,
  populated,
  serializeTask,
} = require("../../../../services/taskDto");
const {
  requireApiCapability,
} = require("../../../../middleware/api/staffAuth");
const {
  trustedOriginMiddleware,
} = require("../../../../middleware/api/trustedOrigin");
const { createApiError } = require("../../../../middleware/api/apiError");
const { can } = require("../../../../utils/permissions");
const { logActivity } = require("../../../../utils/activity");
const { notifyMany } = require("../../../../utils/notify");
const route = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
const respond = (req, res, data) =>
  res.json({ data, meta: { requestId: req.id } });
const missing = () =>
  createApiError(404, "not_found", "Record not found or access denied.");
const invalid = (message) => createApiError(422, "validation_error", message);
const text = (value, limit = 200) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";
async function leadScope(req) {
  if (can(req, "cases.view_all")) return {};
  // Unconverted leads follow the existing leads.view policy. Converted leads
  // cannot provide a second path around case membership or removal.
  return {
    $or: [
      { convertedCase: null },
      { convertedCase: { $in: await memberCaseIds(req) } },
    ],
  };
}
async function loadLead(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw missing();
  const lead = await Lead.findOne({
    $and: [{ _id: req.params.id }, await leadScope(req)],
  });
  if (!lead) throw missing();
  return lead;
}
const leadDto = (lead) => ({
  id: lead._id,
  name: lead.name,
  email: lead.email,
  service: lead.service,
  message: lead.message,
  status: lead.status,
  priority: lead.priority,
  ownerId: lead.owner,
  ownerName: lead.ownerName,
  assignees: lead.assignees.map((a) => ({
    user: a.user,
    name: a.name,
    taskType: a.taskType,
  })),
  clientLinked: !!lead.clientUser,
  caseId: lead.convertedCase || null,
  createdAt: lead.createdAt,
});
router.get(
  "/leads",
  requireApiCapability("leads.view"),
  route(async (req, res) => {
    const filter = {};
    if (Lead.STATUS_STAGES.some((stage) => stage.value === req.query.status))
      filter.status = req.query.status;
    if (req.query.search) {
      const pattern = new RegExp(
        text(req.query.search, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      filter.$or = [{ name: pattern }, { email: pattern }];
    }
    const match = { $and: [filter, await leadScope(req)] };
    const page = Math.max(1, Number.parseInt(req.query.page) || 1),
      limit = 25;
    const [items, total] = await Promise.all([
      Lead.find(match)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Lead.countDocuments(match),
    ]);
    respond(req, res, {
      items: items.map(leadDto),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      stages: Lead.STATUS_STAGES,
    });
  }),
);
router.get(
  "/leads/:id",
  requireApiCapability("leads.view"),
  route(async (req, res) => {
    const lead = await loadLead(req);
    const [team, notes, activity, delivery, interaction] = await Promise.all([
      User.find({ isActive: true })
        .select("name role")
        .sort({ name: 1 })
        .lean(),
      Note.find({ leadId: lead._id }).sort({ createdAt: -1 }).limit(100).lean(),
      Activity.find({ lead: lead._id })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      Delivery.findOne({ lead: lead._id }).lean(),
      Interaction.findOne({ consultation: lead._id }).select("_id").lean(),
    ]);
    respond(req, res, {
      ...leadDto(lead),
      team: team.map((user) => ({
        id: user._id,
        name: user.name,
        canManageCases: can({ staff: user }, "cases.manage"),
      })),
      notes: notes.map((n) => ({
        id: n._id,
        content: n.content,
        author: n.author,
        createdAt: n.createdAt,
      })),
      activity: activity.map((a) => ({
        id: a._id,
        message: a.message,
        actor: a.actor,
        createdAt: a.createdAt,
      })),
      delivery: delivery
        ? {
            id: delivery._id,
            state: delivery.state,
            method: delivery.method,
            confirmationNote: delivery.confirmationNote,
            deliveredAt: delivery.deliveredAt,
            files: delivery.files.map((f) => ({
              id: f._id,
              name: f.name,
              url: f.url,
              status: f.status,
            })),
          }
        : null,
      interactionId: interaction?._id || null,
      stages: Lead.STATUS_STAGES,
      taskTypes: Task.TYPES,
      actions: {
        canEdit: can(req, "leads.edit"),
        canAssign: can(req, "leads.assign"),
        canNote: can(req, "notes.create"),
        canDeliver: can(req, "deliveries.manage"),
        canInitialize: can(req, "queries.create") && !!lead.clientUser,
        canConvert:
          can(req, "cases.create") &&
          !!lead.clientUser &&
          !lead.convertedCase &&
          (can(req, "cases.view_all") ||
            String(lead.owner) === String(req.staff._id) ||
            lead.assignees.some(
              (a) => String(a.user) === String(req.staff._id),
            )),
      },
    });
  }),
);
router.patch(
  "/leads/:id",
  trustedOriginMiddleware,
  requireApiCapability("leads.edit"),
  route(async (req, res) => {
    const lead = await loadLead(req),
      before = lead.status;
    if (req.body.status !== undefined) {
      if (!Lead.STATUS_STAGES.some((stage) => stage.value === req.body.status))
        throw invalid("Choose a valid lead status.");
      lead.status = req.body.status;
    }
    if (req.body.priority !== undefined) {
      if (!Task.PRIORITIES.includes(req.body.priority))
        throw invalid("Choose a valid priority.");
      lead.priority = req.body.priority;
    }
    await lead.save();
    await logActivity(
      lead._id,
      "status_changed",
      `Lead updated by ${req.staff.name}.`,
      req.staff.name,
      { actorId: req.staff._id, previousStatus: before, status: lead.status },
    );
    respond(req, res, leadDto(lead));
  }),
);
router.post(
  "/leads/:id/assign",
  trustedOriginMiddleware,
  requireApiCapability("leads.assign"),
  route(async (req, res) => {
    const lead = await loadLead(req);
    const assignments = Array.isArray(req.body.assignees)
      ? req.body.assignees
      : [];
    if (
      assignments.length > 20 ||
      assignments.some(
        (a) =>
          !mongoose.isValidObjectId(a.user) || !Task.TYPES.includes(a.taskType),
      )
    )
      throw invalid("Choose active employees and valid work areas.");
    const ownerId = req.body.ownerId || null;
    if (ownerId && !mongoose.isValidObjectId(ownerId))
      throw invalid("Choose a valid lead owner.");
    const ids = [
      ...new Set(
        [ownerId, ...assignments.map((a) => a.user)]
          .filter(Boolean)
          .map(String),
      ),
    ];
    const users = await User.find({ _id: { $in: ids }, isActive: true });
    if (users.length !== ids.length)
      throw invalid("Every assignee must be an active employee.");
    const owner = users.find((user) => String(user._id) === String(ownerId));
    if (owner && !can({ staff: owner }, "cases.manage"))
      throw invalid("The lead owner must be an authorized case manager.");
    const previous = new Set(
      [lead.owner, ...lead.assignees.map((a) => a.user)]
        .filter(Boolean)
        .map(String),
    );
    lead.owner = ownerId;
    lead.ownerName = owner?.name || "";
    lead.assignees = assignments.map((a) => ({
      user: a.user,
      taskType: a.taskType,
      name: users.find((user) => String(user._id) === String(a.user)).name,
    }));
    if (
      assignments.length &&
      Lead.STATUS_STAGES.findIndex((s) => s.value === lead.status) < 3
    )
      lead.status = "assigned";
    await lead.save();
    await logActivity(
      lead._id,
      "assigned",
      `Lead team updated by ${req.staff.name}.`,
      req.staff.name,
      { actorId: req.staff._id, ownerId, assignees: lead.assignees },
    );
    await notifyMany(
      users
        .filter((user) => !previous.has(String(user._id)))
        .map((user) => ({ adminId: user._id, name: user.name })),
      {
        title: "Lead assigned",
        message: `You were assigned to ${lead.name}.`,
        type: "lead_assigned",
        relatedLead: lead._id,
      },
    );
    respond(req, res, leadDto(lead));
  }),
);
router.post(
  "/leads/:id/notes",
  trustedOriginMiddleware,
  requireApiCapability("notes.create"),
  route(async (req, res) => {
    const lead = await loadLead(req),
      content = text(req.body.content, 5000);
    if (!content) throw invalid("Enter an internal note.");
    const note = await Note.create({
      leadId: lead._id,
      content,
      authorId: req.staff._id,
      author: req.staff.name,
      visibility: "internal",
    });
    await logActivity(
      lead._id,
      "note_added",
      "Internal note added.",
      req.staff.name,
      { actorId: req.staff._id },
    );
    respond(req, res, { id: note._id });
  }),
);
router.post(
  "/leads/:id/initialize-interaction",
  trustedOriginMiddleware,
  requireApiCapability("queries.create"),
  route(async (req, res) => {
    const lead = await loadLead(req);
    if (!lead.clientUser)
      throw invalid("Link a client account through case conversion first.");
    const result = await createInitialConsultationInteraction({
      consultationId: lead._id,
      clientUserId: lead.clientUser,
      subject: `Initial consultation — ${lead.service}`,
      description: lead.message,
    });
    const interaction =
      result.interaction ||
      (await Interaction.findOne({ consultation: lead._id }));
    respond(req, res, {
      outcome: result.outcome,
      interactionId: interaction?._id,
    });
  }),
);
router.post(
  "/leads/:id/delivery",
  trustedOriginMiddleware,
  requireApiCapability("deliveries.manage"),
  route(async (req, res) => {
    const lead = await loadLead(req);
    if (
      ![
        "drafting",
        "internal_review",
        "client_review",
        "ready",
        "delivered",
      ].includes(req.body.state) ||
      !["email", "dashboard", "both"].includes(req.body.method)
    )
      throw invalid("Choose a valid delivery state and method.");
    let record = await Delivery.findOne({ lead: lead._id });
    record ||= new Delivery({ lead: lead._id });
    const firstDelivery = req.body.state === "delivered" && !record.deliveredAt;
    record.state = req.body.state;
    record.method = req.body.method;
    record.confirmationNote = text(req.body.confirmationNote, 2000);
    if (firstDelivery) {
      record.deliveredAt = new Date();
      record.deliveredBy = req.staff.name;
    }
    await record.save();
    lead.deliveryStatus = record.state;
    if (firstDelivery) lead.status = "delivered";
    await lead.save();
    await logActivity(
      lead._id,
      firstDelivery ? "package_delivered" : "status_changed",
      `Delivery marked ${record.state} by ${req.staff.name}.`,
      req.staff.name,
      { actorId: req.staff._id },
    );
    if (firstDelivery)
      await notifyMany(
        [
          { adminId: lead.owner, name: lead.ownerName },
          ...lead.assignees.map((a) => ({ adminId: a.user, name: a.name })),
        ].filter((a) => a.adminId),
        {
          title: "Package delivered",
          message: `The package for ${lead.name} was delivered.`,
          type: "lead_delivered",
          relatedLead: lead._id,
        },
      );
    respond(req, res, { id: record._id });
  }),
);
router.post(
  "/leads/:id/delivery/files",
  trustedOriginMiddleware,
  requireApiCapability("deliveries.manage"),
  route(async (req, res) => {
    const lead = await loadLead(req),
      name = text(req.body.name),
      url = text(req.body.url, 2000);
    if (
      !name ||
      !["pending", "ready", "sent"].includes(req.body.status) ||
      (url && !/^https?:\/\//i.test(url))
    )
      throw invalid("Enter a file name, valid status and optional HTTP link.");
    let record = await Delivery.findOne({ lead: lead._id });
    record ||= new Delivery({ lead: lead._id });
    if (record.files.length >= 100)
      throw invalid("This record already has 100 files.");
    record.files.push({ name, url, status: req.body.status });
    await record.save();
    respond(req, res, { id: record._id });
  }),
);
router.get(
  "/planning",
  requireApiCapability("leads.view"),
  route(async (req, res) => {
    const ctx = await taskActionContext(req);
    const filter = ctx.viewAll
      ? {}
      : { $or: [{ case: null }, { case: { $in: [...ctx.caseIds] } }] };
    if (!can(req, "tasks.view_all")) filter.assignee = req.staff._id;
    const [sprints, tasks] = await Promise.all([
      Sprint.find().sort({ startDate: -1 }).limit(100).lean(),
      populated(Task.find(filter).sort({ dueDate: 1 }).limit(500)).lean(),
    ]);
    respond(req, res, {
      sprints: sprints.map((s) => ({
        id: s._id,
        name: s.name,
        goal: s.goal,
        startDate: s.startDate,
        endDate: s.endDate,
        status: s.status,
      })),
      tasks: tasks.map((task) => ({
        ...serializeTask(task, taskAccess(req, task, ctx)),
        sprintId: task.sprint || null,
      })),
      canManage: can(req, "sprints.manage"),
    });
  }),
);
router.post(
  "/planning/sprints",
  trustedOriginMiddleware,
  requireApiCapability("sprints.manage"),
  route(async (req, res) => {
    const name = text(req.body.name),
      startDate = new Date(req.body.startDate),
      endDate = new Date(req.body.endDate);
    if (
      !name ||
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate < startDate
    )
      throw invalid("Enter a name and valid start/end dates.");
    const sprint = await Sprint.create({
      name,
      goal: text(req.body.goal, 2000),
      startDate,
      endDate,
      createdBy: req.staff.name,
    });
    respond(req, res, { id: sprint._id });
  }),
);
router.patch(
  "/planning/sprints/:id",
  trustedOriginMiddleware,
  requireApiCapability("sprints.manage"),
  route(async (req, res) => {
    if (
      !mongoose.isValidObjectId(req.params.id) ||
      !["planning", "active", "completed"].includes(req.body.status)
    )
      throw invalid("Choose a valid sprint status.");
    const sprint = await Sprint.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { returnDocument: "after" },
    );
    if (!sprint) throw missing();
    respond(req, res, { id: sprint._id });
  }),
);
router.patch(
  "/planning/tasks/:id",
  trustedOriginMiddleware,
  requireApiCapability("sprints.manage"),
  route(async (req, res) => {
    const task = mongoose.isValidObjectId(req.params.id)
      ? await Task.findById(req.params.id)
      : null;
    if (!task) throw missing();
    const access = taskAccess(req, task, await taskActionContext(req));
    if (!access.canView) throw missing();
    if (!access.canAssign)
      throw createApiError(
        403,
        "forbidden",
        "Task assignment is not permitted.",
      );
    if (
      req.body.sprintId &&
      (!mongoose.isValidObjectId(req.body.sprintId) ||
        !(await Sprint.exists({ _id: req.body.sprintId })))
    )
      throw invalid("Choose an existing sprint.");
    task.sprint = req.body.sprintId || null;
    await task.save();
    respond(req, res, { id: task._id });
  }),
);
async function notificationScope(req) {
  const recipient = {
    $or: [
      { recipientType: "employee", recipientAdmin: req.staff._id },
      { recipientType: null, recipientId: req.staff._id },
    ],
  };
  const predicates = [recipient];
  if (!can(req, 'cases.view_all')) {
    const caseIds = await memberCaseIds(req);
    const hiddenLeads = await Lead.find({convertedCase: {$ne:null, $nin:caseIds}}).distinct('_id');
    predicates.push({$or:[{relatedCase:null},{relatedCase:{$in:caseIds}}]}, {relatedLead:{$nin:hiddenLeads}});
  }
  // A case member may still have lost access to a restricted conversation.
  // Reuse canonical channel policy for list and mark-read, including org-wide capabilities.
  const channelIds = (await Notification.find(recipient).distinct('relatedChannel')).filter(Boolean);
  if (channelIds.length) {
    const channels = await WorkspaceChannel.find({_id:{$in:channelIds}, archivedAt:null});
    const checks = await Promise.all(channels.map(async channel => ({id:String(channel._id), visible:await canViewChannel(req, channel)})));
    const readable = new Set(checks.filter(check => check.visible).map(check => check.id));
    predicates.push({relatedChannel:{$nin:channelIds.filter(channelId => !readable.has(String(channelId)))}});
  }
  return {$and:predicates};
}
router.get(
  "/notifications",
  route(async (req, res) => {
    const filter = await notificationScope(req);
    if (req.query.unread === "1") filter.read = false;
    const [items, preferences] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(100).lean(),
      notificationService.getOrCreatePreferences({
        recipientType: "employee",
        recipientAdminId: req.staff._id,
      }),
    ]);
    respond(req, res, {
      items: items.map((n) => ({
        id: n._id,
        title: n.title,
        message: n.message,
        read: n.read,
        createdAt: n.createdAt,
        caseId: n.relatedCase,
        leadId: n.relatedLead,
        interactionId: n.relatedInteraction,
        href: n.actionPath || null,
      })),
      preferences: {
        mentionEmails: preferences.mentionEmails,
        digestEmails: preferences.digestEmails,
        digestFrequency: preferences.digestFrequency,
        deadlineReminders: preferences.deadlineReminders !== false,
        appointmentReminders: preferences.appointmentReminders !== false,
      },
    });
  }),
);
router.post(
  "/notifications/read",
  trustedOriginMiddleware,
  route(async (req, res) => {
    const filter = await notificationScope(req);
    if (req.body.id) {
      if (!mongoose.isValidObjectId(req.body.id)) throw missing();
      filter._id = req.body.id;
    }
    const result = await Notification.updateMany(filter, {
      read: true,
      readAt: new Date(),
    });
    if (req.body.id && !result.matchedCount) throw missing();
    respond(req, res, { updated: result.modifiedCount });
  }),
);
router.patch(
  "/notifications/preferences",
  trustedOriginMiddleware,
  route(async (req, res) => {
    if (
      typeof req.body.mentionEmails !== "boolean" ||
      typeof req.body.digestEmails !== "boolean" ||
      !["daily", "weekly", "off"].includes(req.body.digestFrequency)
    )
      throw invalid("Choose valid notification preferences.");
    for (const key of ["deadlineReminders", "appointmentReminders"])
      if (req.body[key] !== undefined && typeof req.body[key] !== "boolean") throw invalid("Choose valid notification preferences.");
    await notificationService.updatePreferences({
      recipientType: "employee",
      recipientAdminId: req.staff._id,
      updates: req.body,
    });
    respond(req, res, { updated: true });
  }),
);
module.exports = router;
