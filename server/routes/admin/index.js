const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

// Models
const BlogPost = require('../../models/BlogPost');
const Consultation = require('../../models/Consultation');
const Comment = require('../../models/Comment');
const Testimonial = require('../../models/admin/Testimonial');
const FAQ = require('../../models/admin/FAQ');
const Setting = require('../../models/admin/Setting');
const SEOMeta = require('../../models/admin/SEOMeta');
const AdminUser = require('../../models/admin/User');
const InternalNote = require('../../models/admin/InternalNote');
const Media = require('../../models/admin/Media');
const Task = require('../../models/admin/Task');
const Sprint = require('../../models/admin/Sprint');
const Notification = require('../../models/admin/Notification');
const DeliveryRecord = require('../../models/admin/DeliveryRecord');
const ActivityLog = require('../../models/admin/ActivityLog');

const { requireAdmin } = require('../../middleware/auth');
const upload = require('../../middleware/upload');
const categories = require('../../utils/blogCategories');
const servicesList = require('../../utils/services');
const { notify, notifyMany } = require('../../utils/notify');
const { logActivity } = require('../../utils/activity');
const { ROLE_LABELS, getRole, can, requireCapability, canManageTask } = require('../../utils/permissions');
const { csvCell } = require('../../utils/csv');
const { DUE_SOON_DAYS, overdueTaskMatch, dueSoonTaskMatch, isOverdue, isDueSoon } = require('../../utils/taskDeadlines');
const attachLeadOps = require('./leadOps');
const { ASSIGNMENT_SLOTS } = attachLeadOps;
const attachCases = require('./cases');
const casePolicy = require('../../services/casePolicy');
const ClientCase = require('../../models/ClientCase');
const attachQueries = require('./queries');
const attachDocuments = require('./documents');
const attachCollaboration = require('./collaboration');
const attachClients = require('./clients');
const { getOperationalCounts } = require('../../services/operationsQueues');

// ========================================================================
// AUTHENTICATION
// ========================================================================

// Constant-time string compare (pads to equal length first so the timing
// side-channel doesn't leak length either) — used for the plaintext
// ADMIN_PASSWORD fallback path, which has no other timing protection.
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal-length buffers so failure here takes
    // roughly the same time as a length-matched failure below.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Configurable so integration tests (which legitimately log in via the
  // real route many times per run, all from the same loopback IP) don't
  // trip the same limiter a real credential-stuffing attempt would.
  // Production is unaffected — this still defaults to 10.
  limit: Number(process.env.LOGIN_RATE_LIMIT) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  handler: (req, res) => {
    res.status(429).render('admin/login', {
      title: 'Admin Login | Immigration Horizons',
      layout: false,
      error: 'Too many login attempts. Please try again in 15 minutes.',
    });
  },
});

router.get('/admin/login', (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', {
    title: 'Admin Login | Immigration Horizons',
    layout: false,
    error: null,
  });
});

router.post('/admin/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  const finishLogin = (sessionData) => {
    // Regenerate the session ID on privilege change so a pre-login session
    // (e.g. one an attacker planted via a shared/public machine) can't be
    // fixated into an authenticated one.
    req.session.regenerate((err) => {
      if (err) {
        console.error('[login] session regenerate failed:', err.message);
        return res.redirect('/admin/login');
      }
      Object.assign(req.session, sessionData);
      req.session.save(() => res.redirect('/admin'));
    });
  };

  // Check admin users in DB first
  if (mongoose.connection.readyState === 1) {
    try {
      const user = await AdminUser.findOne({ email: username, isActive: true });
      if (user && (await user.comparePassword(password))) {
        return finishLogin({ isAdmin: true, adminUser: { id: user._id, name: user.name, role: user.role } });
      }
    } catch (_) { /* fall through to env-based auth */ }
  }

  // Fallback to env-based auth
  const validUsername = process.env.ADMIN_USERNAME || 'admin';
  const validPasswordPlain = process.env.ADMIN_PASSWORD || 'admin';
  let ok = false;
  if (process.env.ADMIN_PASSWORD_HASH) {
    ok = safeEqual(username, validUsername) && (await bcrypt.compare(password || '', process.env.ADMIN_PASSWORD_HASH));
  } else {
    ok = safeEqual(username, validUsername) && safeEqual(password, validPasswordPlain);
  }

  if (!ok) {
    return res.render('admin/login', {
      title: 'Admin Login | Immigration Horizons',
      layout: false,
      error: 'Invalid username or password.',
    });
  }

  finishLogin({ isAdmin: true, adminUser: { name: 'Admin', role: 'super_admin' } });
});

router.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ========================================================================
// ADMIN LAYOUT MIDDLEWARE
// ========================================================================

router.use('/admin', requireAdmin, async (req, res, next) => {
  // Fail-closed display fallback: a session missing `adminUser` (never
  // produced by the current login routes — every real login sets it
  // alongside `isAdmin` — but not something to paper over with a fake
  // elevated role either) now displays/authorizes as no-role, not
  // super_admin. Templates that gate on `adminUser.role` (e.g.
  // `['super_admin','admin','pm'].includes(adminUser.role)`) correctly
  // deny when role is null; server-side enforcement uses `can()` directly
  // against the session, independent of this display object.
  res.locals.adminUser = req.session.adminUser || { name: 'Admin', role: null };
  res.locals.currentRole = getRole(req);
  // Centralized template permission helper (Step 6) — templates call
  // `can('blog.manage')` etc. instead of duplicating role arrays.
  res.locals.can = (capability) => can(req, capability);
  // Task ownership is record-specific (needs the actual task, not just a
  // capability name) — exposed separately for the task-board/lead-detail
  // templates that render per-task controls.
  res.locals.canManageTask = (task) => canManageTask(req, task);
  res.locals.currentAdminPath = req.path;
  // Use admin layout instead of default public layout
  res.locals.layout = 'admin/layout';

  // Notification bell data, available on every admin page (the topbar
  // partial is included from the shared layout, so it has no route of its
  // own to fetch this itself). A failure here must never block the page.
  try {
    const recipientName = res.locals.adminUser.name;
    const [unreadCount, recentNotifications, newLeadsCount] = await Promise.all([
      Notification.countDocuments({ recipientName, read: false }),
      Notification.find({ recipientName }).sort({ createdAt: -1 }).limit(8).lean(),
      Consultation.countDocuments({ status: 'new' }),
    ]);
    res.locals.unreadNotificationCount = unreadCount;
    res.locals.recentNotifications = recentNotifications;
    res.locals.newLeadsCount = newLeadsCount;
  } catch (err) {
    res.locals.unreadNotificationCount = 0;
    res.locals.recentNotifications = [];
    res.locals.newLeadsCount = 0;
  }

  next();
});

// ========================================================================
// DASHBOARD
// ========================================================================

router.get('/admin', async (req, res) => {
  try {
    const [
      totalLeads,
      newLeadsToday,
      leadsThisMonth,
      blogPosts,
      publishedPosts,
      draftPosts,
      testimonials,
      faqs,
      recentLeads,
      recentPosts,
    ] = await Promise.all([
      Consultation.countDocuments(),
      Consultation.countDocuments({
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      Consultation.countDocuments({
        createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      }),
      BlogPost.countDocuments(),
      BlogPost.countDocuments({ published: true }),
      BlogPost.countDocuments({ published: false }),
      Testimonial.countDocuments(),
      FAQ.countDocuments(),
      Consultation.find().sort({ createdAt: -1 }).limit(10),
      BlogPost.find().sort({ createdAt: -1 }).limit(5),
    ]);

    // Cycle 8 — operational queue counts (ADR-007 §4). Computed in one
    // aggregation module; never throws (returns zeros on failure), so the
    // dashboard renders even if a queue query has a problem.
    const operations = can(req, 'cases.view') ? await getOperationalCounts() : null;

    res.render('admin/dashboard', {
      title: 'Dashboard | Admin',
      stats: {
        totalLeads,
        newLeadsToday,
        leadsThisMonth,
        blogPosts,
        publishedPosts,
        draftPosts,
        testimonials,
        faqs,
      },
      operations,
      recentLeads,
      recentPosts,
      currentPage: 'dashboard',
    });
  } catch (err) {
    console.error('[admin/dashboard]', err.message);
    res.render('admin/dashboard', {
      title: 'Dashboard | Admin',
      stats: {},
      operations: null,
      recentLeads: [],
      recentPosts: [],
      currentPage: 'dashboard',
    });
  }
});

// ========================================================================
// LEADS MANAGEMENT
// ========================================================================

// Canonical 12-stage lifecycle (see Consultation.STATUS_STAGES). Kept as a
// plain value array too, since several existing call sites just need the
// list of valid values rather than the {value,label} pairs.
const LEAD_STATUSES = Consultation.STATUS_STAGES.map((s) => s.value);
const SERVICE_VALUES = Consultation.schema.path('service').enumValues;
const LEAD_SOURCE_VALUES = Consultation.schema.path('leadSource').enumValues;
const PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'];

const MAX_SEARCH_LENGTH = 100;
const MAX_PAGE_LIMIT = 100;
const DEFAULT_PAGE_LIMIT = 20;

/** Falls back to 'all' for anything not in the real enum — never passes an untrusted raw string into an exact-match filter. */
function sanitizeEnumParam(value, allowed) {
  return typeof value === 'string' && allowed.includes(value) ? value : 'all';
}

function parseBoundedInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** A validated Date, or null — never lets an unparsable query param reach a Mongo query. */
function parseDateParam(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

router.get('/admin/leads', async (req, res) => {
  try {
    const status = sanitizeEnumParam(req.query.status, LEAD_STATUSES.concat('all'));
    const service = sanitizeEnumParam(req.query.service, SERVICE_VALUES.concat('all'));
    const leadSource = sanitizeEnumParam(req.query.leadSource, LEAD_SOURCE_VALUES.concat('all'));
    const priority = sanitizeEnumParam(req.query.priority, PRIORITY_VALUES.concat('all'));
    const assignee = mongoose.Types.ObjectId.isValid(req.query.assignee || '') ? req.query.assignee : 'all';
    const unassignedOnly = req.query.unassigned === '1';
    const overdueOnly = req.query.overdueTasks === '1';
    const dueSoonOnly = req.query.dueSoon === '1';
    const createdFrom = parseDateParam(req.query.createdFrom);
    const createdTo = parseDateParam(req.query.createdTo);
    const search = typeof req.query.search === 'string' ? req.query.search.slice(0, MAX_SEARCH_LENGTH) : '';
    const page = parseBoundedInt(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const limit = parseBoundedInt(req.query.limit, DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT);

    const filter = {};
    const andClauses = [];

    if (status !== 'all') filter.status = status;
    if (service !== 'all') filter.service = service;
    if (leadSource !== 'all') filter.leadSource = leadSource;
    if (priority !== 'all') filter.priority = priority;
    if (unassignedOnly) {
      filter.owner = null;
    } else if (assignee !== 'all') {
      andClauses.push({ $or: [{ owner: assignee }, { 'assignees.user': assignee }] });
    }
    if (createdFrom || createdTo) {
      filter.createdAt = {};
      if (createdFrom) filter.createdAt.$gte = createdFrom;
      if (createdTo) filter.createdAt.$lte = createdTo;
    }
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      andClauses.push({
        $or: [
          { name: { $regex: safe, $options: 'i' } },
          { email: { $regex: safe, $options: 'i' } },
          { phone: { $regex: safe, $options: 'i' } },
          { message: { $regex: safe, $options: 'i' } },
        ],
      });
    }

    // Leads with an overdue / due-soon task are identified via the Task
    // collection (indexed on `lead`) rather than joining in application
    // code — `distinct` also naturally de-dupes multi-task leads.
    let overdueLeadIds = null;
    let dueSoonLeadIds = null;
    if (overdueOnly || dueSoonOnly) {
      const [overdueIds, dueSoonIds] = await Promise.all([
        overdueOnly ? Task.distinct('lead', overdueTaskMatch()) : Promise.resolve(null),
        dueSoonOnly ? Task.distinct('lead', dueSoonTaskMatch()) : Promise.resolve(null),
      ]);
      overdueLeadIds = overdueIds;
      dueSoonLeadIds = dueSoonIds;
      const idFilters = [overdueIds, dueSoonIds].filter(Boolean).map((ids) => ({ _id: { $in: ids } }));
      andClauses.push(...idFilters);
    }

    if (andClauses.length) filter.$and = andClauses;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [total, leads, serviceCounts, teamMembers, summaryStatusGroups, summaryUnassigned, summaryNewThisWeek, summaryOverdueIds, summaryDueSoonIds] = await Promise.all([
      Consultation.countDocuments(filter),
      Consultation.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Consultation.aggregate([{ $group: { _id: '$service', count: { $sum: 1 } } }]),
      AdminUser.find({ isActive: true }).select('name role').sort({ name: 1 }).lean(),
      // Operational summary is intentionally unfiltered (whole backlog, not
      // the current filtered view) and reuses the overdue/due-soon id sets
      // computed above when those filters are already active, instead of
      // running the same Task.distinct() query twice.
      Consultation.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Consultation.countDocuments({ owner: null }),
      Consultation.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      overdueLeadIds !== null ? Promise.resolve(overdueLeadIds) : Task.distinct('lead', overdueTaskMatch()),
      dueSoonLeadIds !== null ? Promise.resolve(dueSoonLeadIds) : Task.distinct('lead', dueSoonTaskMatch()),
    ]);
    const countsByService = Object.fromEntries(serviceCounts.map((s) => [s._id, s.count]));
    const countsByStatus = Object.fromEntries(summaryStatusGroups.map((s) => [s._id, s.count]));
    const closedCount = countsByStatus.closed || 0;
    const summary = {
      total: summaryStatusGroups.reduce((sum, s) => sum + s.count, 0),
      active: summaryStatusGroups.reduce((sum, s) => sum + s.count, 0) - closedCount,
      unassigned: summaryUnassigned,
      newThisWeek: summaryNewThisWeek,
      overdueTaskLeads: summaryOverdueIds.length,
      dueSoonTaskLeads: summaryDueSoonIds.length,
    };

    const activeFilterCount = [
      status !== 'all', service !== 'all', leadSource !== 'all', priority !== 'all',
      assignee !== 'all', unassignedOnly, overdueOnly, dueSoonOnly, !!createdFrom, !!createdTo, !!search,
    ].filter(Boolean).length;

    res.render('admin/leads/index', {
      title: 'Leads | Admin',
      leads,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      search,
      statusFilter: status,
      serviceFilter: service,
      assigneeFilter: assignee,
      leadSourceFilter: leadSource,
      priorityFilter: priority,
      unassignedOnly,
      overdueOnly,
      dueSoonOnly,
      createdFrom: req.query.createdFrom && createdFrom ? req.query.createdFrom : '',
      createdTo: req.query.createdTo && createdTo ? req.query.createdTo : '',
      activeFilterCount,
      dueSoonDays: DUE_SOON_DAYS,
      summary,
      serviceCategories: SERVICE_VALUES,
      leadSourceValues: LEAD_SOURCE_VALUES,
      leadStatuses: LEAD_STATUSES,
      leadStatusStages: Consultation.STATUS_STAGES,
      teamMembers,
      countsByService,
      currentPage: 'leads',
    });
  } catch (err) {
    console.error('[admin/leads]', err.message);
    res.redirect('/admin');
  }
});

router.get('/admin/leads/:id', async (req, res) => {
  try {
    const lead = await Consultation.findById(req.params.id)
      .populate('owner', 'name role')
      .populate('assignees.user', 'name role')
      .lean();
    if (!lead) return res.redirect('/admin/leads');

    let [notes, tasks, activity, deliveryRecord, teamMembers] = await Promise.all([
      InternalNote.find({ leadId: req.params.id }).sort({ createdAt: -1 }).limit(50).lean(),
      Task.find({ lead: req.params.id }).populate('assignee', 'name').populate('sprint', 'name status').sort({ createdAt: -1 }).lean(),
      ActivityLog.find({ lead: req.params.id }).sort({ createdAt: -1 }).limit(50).lean(),
      DeliveryRecord.findOne({ lead: req.params.id }).lean(),
      AdminUser.find({ isActive: true }).select('name role').sort({ name: 1 }).lean(),
    ]);

    // Backfill a "received" entry for leads that predate the activity log,
    // so the case-history timeline always has a starting point. Runs once —
    // the empty check makes this idempotent on every later view.
    if (!activity.length) {
      const entry = await ActivityLog.create({
        lead: req.params.id,
        type: 'received',
        message: `Lead received via ${lead.source === 'contact' ? 'contact form' : 'consultation form'}.`,
        actor: 'System',
        createdAt: lead.createdAt,
      });
      activity = [entry.toObject()];
    }

    const membersBySlotRole = {};
    ASSIGNMENT_SLOTS.forEach((slot) => {
      membersBySlotRole[slot.taskType] = teamMembers.filter((m) => m.role === slot.role);
    });

    // Cycle 2 — case conversion. Server-side authorization is the real
    // gate (see requireCapability('cases.create') on the convert route);
    // `canConvert` here only controls whether the form is shown at all.
    const convertedCase = lead.convertedCase ? await ClientCase.findById(lead.convertedCase).lean() : null;
    const caseConversionErrors = req.session.caseConversionErrors || null;
    delete req.session.caseConversionErrors;

    res.render('admin/leads/detail', {
      title: `Lead: ${lead.name} | Admin`,
      lead,
      notes,
      tasks,
      activity,
      deliveryRecord,
      teamMembers,
      assignmentSlots: ASSIGNMENT_SLOTS,
      membersBySlotRole,
      taskTypes: Task.TYPES,
      taskPriorities: Task.PRIORITIES,
      leadStatuses: LEAD_STATUSES,
      leadStatusStages: Consultation.STATUS_STAGES,
      dueSoonDays: DUE_SOON_DAYS,
      currentPage: 'leads',
      canConvertToCase: can(req, 'cases.create'),
      convertedCase,
      caseTypes: attachCases.CASE_TYPES,
      caseConversionErrors,
    });
  } catch (err) {
    console.error('[admin/leads/detail]', err.message);
    res.redirect('/admin/leads');
  }
});

router.post('/admin/leads/:id/status', requireCapability('leads.edit'), async (req, res) => {
  try {
    const { status } = req.body;
    if (LEAD_STATUSES.includes(status)) {
      const previous = await Consultation.findById(req.params.id).select('status name owner ownerName assignees').lean();
      await Consultation.findByIdAndUpdate(req.params.id, { status });

      if (previous && previous.status !== status) {
        const actor = req.session.adminUser?.name || 'Admin';
        const label = (Consultation.STATUS_STAGES.find((s) => s.value === status) || {}).label || status;
        const previousLabel = (Consultation.STATUS_STAGES.find((s) => s.value === previous.status) || {}).label || previous.status;
        await logActivity(
          req.params.id,
          'status_changed',
          `Status changed from "${previousLabel}" to "${label}" by ${actor}.`,
          actor,
          { previousStatus: previous.status, newStatus: status }
        );

        const recipients = [
          previous.ownerName ? { name: previous.ownerName, adminId: previous.owner || null } : null,
          ...(previous.assignees || []).map((a) => ({ name: a.name, adminId: a.user || null })),
        ].filter(Boolean);
        const eventByStatus = {
          waiting_on_client: 'lead_waiting_on_client',
          internal_review: 'lead_in_review',
          ready_for_filing: 'lead_package_ready',
          submitted: 'lead_submitted',
          delivered: 'lead_delivered',
        };
        if (eventByStatus[status]) {
          await notifyMany(recipients, {
            title: `Lead moved to "${label}"`,
            message: `"${previous.name}" is now ${label}.`,
            type: eventByStatus[status],
            relatedLead: req.params.id,
          });
        }
      }
    }
    res.redirect(req.headers.referer || '/admin/leads');
  } catch (err) {
    console.error('[admin/leads/status]', err.message);
    res.redirect('/admin/leads');
  }
});

router.post('/admin/leads/:id/notes', requireCapability('notes.create'), async (req, res) => {
  try {
    const { content, noteType } = req.body;
    if (content && content.trim()) {
      await InternalNote.create({
        leadId: req.params.id,
        author: req.session.adminUser?.name || 'Admin',
        authorId: req.session.adminUser?.id || null,
        content: content.trim(),
        noteType: noteType || 'general',
      });
      await logActivity(req.params.id, 'note_added', 'Internal note added.', req.session.adminUser?.name);
    }
    res.redirect(`/admin/leads/${req.params.id}`);
  } catch (err) {
    console.error('[admin/leads/notes]', err.message);
    res.redirect(`/admin/leads/${req.params.id}`);
  }
});

router.delete('/admin/leads/:id', requireCapability('leads.delete'), async (req, res) => {
  try {
    await InternalNote.deleteMany({ leadId: req.params.id });
    await Consultation.findByIdAndDelete(req.params.id);
    res.redirect('/admin/leads');
  } catch (err) {
    console.error('[admin/leads/delete]', err.message);
    res.redirect('/admin/leads');
  }
});

router.get('/admin/leads/export/csv', requireCapability('csv.export'), async (req, res) => {
  try {
    const status = sanitizeEnumParam(req.query.status, LEAD_STATUSES.concat('all'));
    const service = sanitizeEnumParam(req.query.service, SERVICE_VALUES.concat('all'));
    const search = typeof req.query.search === 'string' ? req.query.search.slice(0, MAX_SEARCH_LENGTH) : '';
    const filter = {};
    if (status !== 'all') filter.status = status;
    if (service !== 'all') filter.service = service;
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { email: { $regex: safe, $options: 'i' } },
      ];
    }

    const leads = await Consultation.find(filter).sort({ createdAt: -1 }).lean();

    const headers = [
      'Name', 'Email', 'Phone', 'Country', 'Occupation', 'Service', 'Message',
      'Status', 'Source', 'Lead Source', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Date Submitted',
    ];

    // Every field below can originate from the anonymous public consultation/
    // contact form — csvCell() neutralizes formula/DDE injection (a leading
    // =, +, -, @, tab, or CR) and CSV-escapes quotes. Do not interpolate a
    // lead field into the export without going through it.
    const rows = leads.map((l) => [
      csvCell(l.name),
      csvCell(l.email),
      csvCell(l.phone),
      csvCell(l.country),
      csvCell(l.occupation),
      csvCell(l.service),
      csvCell(l.message),
      csvCell(l.status || 'new'),
      csvCell(l.source),
      csvCell(l.leadSource),
      csvCell(l.utmSource),
      csvCell(l.utmMedium),
      csvCell(l.utmCampaign),
      csvCell(l.createdAt ? new Date(l.createdAt).toISOString() : ''),
    ]);

    const csv = [headers.map(csvCell).join(','), ...rows.map((r) => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=leads-${Date.now()}.csv`);
    res.send(csv);
  } catch (err) {
    console.error('[admin/leads/export]', err.message);
    res.redirect('/admin/leads');
  }
});

// ========================================================================
// BLOG MANAGEMENT
// ========================================================================

router.get('/admin/blog', async (req, res) => {
  try {
    const { search, status, category, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (status === 'published') filter.published = true;
    else if (status === 'draft') filter.published = false;
    if (category && category !== 'all') filter.category = category;
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { title: { $regex: safe, $options: 'i' } },
        { excerpt: { $regex: safe, $options: 'i' } },
      ];
    }

    const total = await BlogPost.countDocuments(filter);
    const posts = await BlogPost.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    res.render('admin/blog/index', {
      title: 'Blog Posts | Admin',
      posts,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
      search: search || '',
      statusFilter: status || 'all',
      categoryFilter: category || 'all',
      categories,
      currentPage: 'blog',
    });
  } catch (err) {
    console.error('[admin/blog]', err.message);
    res.redirect('/admin');
  }
});

router.get('/admin/blog/new', (req, res) => {
  res.render('admin/blog/form', {
    title: 'New Blog Post | Admin',
    post: null,
    categories,
    error: null,
    currentPage: 'blog',
  });
});

router.post('/admin/blog', requireCapability('blog.manage'), upload.single('coverImage'), async (req, res) => {
  try {
    const { title, slug, category, excerpt, content, tags, author, readingTime, published, publishDate } = req.body;

    const postData = {
      title,
      slug: slug || undefined,
      category,
      excerpt,
      content,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      author: author || 'Immigration Horizons Team',
      readingTime: Number(readingTime) || 0,
      coverImage: req.file ? `/uploads/${req.file.filename}` : (req.body.coverImageUrl || ''),
      published: published === 'on' || published === 'true',
    };

    if (publishDate) postData.publishDate = new Date(publishDate);
    // If published but no publishDate, set it
    if (postData.published && !postData.publishDate) {
      postData.publishDate = new Date();
    }

    await BlogPost.create(postData);
    res.redirect('/admin/blog');
  } catch (err) {
    res.render('admin/blog/form', {
      title: 'New Blog Post | Admin',
      post: req.body,
      categories,
      error: err.message,
      currentPage: 'blog',
    });
  }
});

router.get('/admin/blog/:id/edit', async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id).lean();
    if (!post) return res.redirect('/admin/blog');
    res.render('admin/blog/form', {
      title: 'Edit Blog Post | Admin',
      post,
      categories,
      error: null,
      currentPage: 'blog',
    });
  } catch (err) {
    res.redirect('/admin/blog');
  }
});

router.put('/admin/blog/:id', requireCapability('blog.manage'), upload.single('coverImage'), async (req, res) => {
  try {
    const { title, slug, category, excerpt, content, tags, author, readingTime, published, publishDate } = req.body;

    const update = {
      title,
      category,
      excerpt,
      content,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      author: author || 'Immigration Horizons Team',
      readingTime: Number(readingTime) || 0,
      published: published === 'on' || published === 'true',
    };

    if (slug && slug.trim()) update.slug = slug.trim();
    if (req.file) update.coverImage = `/uploads/${req.file.filename}`;
    else if (req.body.coverImageUrl) update.coverImage = req.body.coverImageUrl;
    if (publishDate) update.publishDate = new Date(publishDate);
    if (update.published && !update.publishDate) {
      update.publishDate = new Date();
    }

    await BlogPost.findByIdAndUpdate(req.params.id, { $set: update }, { runValidators: true });
    res.redirect('/admin/blog');
  } catch (err) {
    const post = await BlogPost.findById(req.params.id).lean();
    res.render('admin/blog/form', {
      title: 'Edit Blog Post | Admin',
      post: { ...post, ...req.body },
      categories,
      error: err.message,
      currentPage: 'blog',
    });
  }
});

router.delete('/admin/blog/:id', requireCapability('blog.manage'), async (req, res) => {
  try {
    await BlogPost.findByIdAndDelete(req.params.id);
    res.redirect('/admin/blog');
  } catch (err) {
    res.redirect('/admin/blog');
  }
});

router.post('/admin/blog/:id/toggle-publish', requireCapability('blog.manage'), async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (post) {
      post.published = !post.published;
      await post.save();
    }
    res.redirect('/admin/blog');
  } catch (err) {
    res.redirect('/admin/blog');
  }
});

// ========================================================================
// SEO MANAGER
// ========================================================================

const SEO_PAGES = [
  { ref: 'home', label: 'Homepage' },
  { ref: 'about', label: 'About' },
  { ref: 'contact', label: 'Contact' },
  { ref: 'services', label: 'Services' },
  { ref: 'blog', label: 'Blog' },
  { ref: 'reviews', label: 'Reviews' },
  { ref: 'consultation', label: 'Consultation' },
  { ref: 'privacy', label: 'Privacy Policy' },
  { ref: 'terms', label: 'Terms' },
  { ref: 'resources', label: 'Resources' },
  { ref: '404', label: '404 Page' },
  { ref: 'eb2-niw', label: 'EB-2 NIW Landing', pageType: 'landing' },
  { ref: 'eb1a', label: 'EB-1A Landing', pageType: 'landing' },
  { ref: 'o1-visa', label: 'O-1 Visa Landing', pageType: 'landing' },
];

// Add service pages to SEO list
servicesList.forEach((s) => {
  SEO_PAGES.push({ ref: `service-${s.slug}`, label: `Service: ${s.name}`, pageType: 'service' });
});

router.get('/admin/seo', async (req, res) => {
  try {
    const seoMetas = await SEOMeta.find().lean();
    const seoMap = {};
    seoMetas.forEach((s) => { seoMap[s.pageRef] = s; });

    res.render('admin/seo/index', {
      title: 'SEO Manager | Admin',
      pages: SEO_PAGES,
      seoMap,
      currentPage: 'seo',
    });
  } catch (err) {
    console.error('[admin/seo]', err.message);
    res.render('admin/seo/index', {
      title: 'SEO Manager | Admin',
      pages: SEO_PAGES,
      seoMap: {},
      currentPage: 'seo',
    });
  }
});

router.get('/admin/seo/:pageRef/edit', async (req, res) => {
  try {
    const seoMeta = await SEOMeta.findOne({ pageRef: req.params.pageRef }).lean();
    const pageInfo = SEO_PAGES.find((p) => p.ref === req.params.pageRef) || {
      ref: req.params.pageRef,
      label: req.params.pageRef,
      pageType: 'custom',
    };

    res.render('admin/seo/form', {
      title: `SEO: ${pageInfo.label} | Admin`,
      seo: seoMeta || { pageRef: req.params.pageRef, pageType: pageInfo.pageType || 'static' },
      pageInfo,
      error: null,
      currentPage: 'seo',
    });
  } catch (err) {
    res.redirect('/admin/seo');
  }
});

router.post('/admin/seo/:pageRef', async (req, res) => {
  try {
    const {
      seoTitle, metaDescription, keywords, canonicalUrl,
      ogTitle, ogDescription, ogImage, twitterImage,
      slug, robots, noindex, schemaType,
    } = req.body;

    await SEOMeta.findOneAndUpdate(
      { pageRef: req.params.pageRef },
      {
        pageRef: req.params.pageRef,
        seoTitle: seoTitle || '',
        metaDescription: metaDescription || '',
        keywords: keywords || '',
        canonicalUrl: canonicalUrl || '',
        ogTitle: ogTitle || '',
        ogDescription: ogDescription || '',
        ogImage: ogImage || '',
        twitterImage: twitterImage || '',
        slug: slug || '',
        robots: robots || 'index,follow',
        noindex: noindex === 'on' || noindex === 'true',
        schemaType: schemaType || 'WebPage',
      },
      { upsert: true, new: true }
    );

    res.redirect('/admin/seo');
  } catch (err) {
    const pageInfo = SEO_PAGES.find((p) => p.ref === req.params.pageRef) || { label: req.params.pageRef };
    res.render('admin/seo/form', {
      title: `SEO: ${pageInfo.label} | Admin`,
      seo: { ...req.body, pageRef: req.params.pageRef },
      pageInfo,
      error: err.message,
      currentPage: 'seo',
    });
  }
});

// ========================================================================
// TESTIMONIALS
// ========================================================================

router.get('/admin/testimonials', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;

    const total = await Testimonial.countDocuments(filter);
    const testimonials = await Testimonial.find(filter)
      .sort({ displayOrder: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    res.render('admin/testimonials/index', {
      title: 'Testimonials | Admin',
      testimonials,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
      statusFilter: status || 'all',
      currentPage: 'testimonials',
    });
  } catch (err) {
    console.error('[admin/testimonials]', err.message);
    res.redirect('/admin');
  }
});

router.get('/admin/testimonials/new', (req, res) => {
  res.render('admin/testimonials/form', {
    title: 'New Testimonial | Admin',
    testimonial: null,
    error: null,
    currentPage: 'testimonials',
  });
});

router.post('/admin/testimonials', requireCapability('testimonials.manage'), upload.single('photo'), async (req, res) => {
  try {
    const { name, country, profession, review, rating, verificationUrl, featured, displayOrder, status } = req.body;
    await Testimonial.create({
      name,
      country: country || '',
      profession: profession || '',
      review,
      rating: Number(rating) || 5,
      photo: req.file ? `/uploads/${req.file.filename}` : (req.body.photoUrl || ''),
      verificationUrl: verificationUrl || '',
      featured: featured === 'on' || featured === 'true',
      displayOrder: Number(displayOrder) || 0,
      status: status || 'published',
    });
    res.redirect('/admin/testimonials');
  } catch (err) {
    res.render('admin/testimonials/form', {
      title: 'New Testimonial | Admin',
      testimonial: req.body,
      error: err.message,
      currentPage: 'testimonials',
    });
  }
});

router.get('/admin/testimonials/:id/edit', async (req, res) => {
  try {
    const testimonial = await Testimonial.findById(req.params.id).lean();
    if (!testimonial) return res.redirect('/admin/testimonials');
    res.render('admin/testimonials/form', {
      title: 'Edit Testimonial | Admin',
      testimonial,
      error: null,
      currentPage: 'testimonials',
    });
  } catch (err) {
    res.redirect('/admin/testimonials');
  }
});

router.put('/admin/testimonials/:id', requireCapability('testimonials.manage'), upload.single('photo'), async (req, res) => {
  try {
    const { name, country, profession, review, rating, verificationUrl, featured, displayOrder, status } = req.body;
    const update = {
      name,
      country: country || '',
      profession: profession || '',
      review,
      rating: Number(rating) || 5,
      verificationUrl: verificationUrl || '',
      featured: featured === 'on' || featured === 'true',
      displayOrder: Number(displayOrder) || 0,
      status: status || 'published',
    };
    if (req.file) update.photo = `/uploads/${req.file.filename}`;
    else if (req.body.photoUrl) update.photo = req.body.photoUrl;

    await Testimonial.findByIdAndUpdate(req.params.id, { $set: update }, { runValidators: true });
    res.redirect('/admin/testimonials');
  } catch (err) {
    const testimonial = await Testimonial.findById(req.params.id).lean();
    res.render('admin/testimonials/form', {
      title: 'Edit Testimonial | Admin',
      testimonial: { ...testimonial, ...req.body },
      error: err.message,
      currentPage: 'testimonials',
    });
  }
});

router.delete('/admin/testimonials/:id', requireCapability('testimonials.manage'), async (req, res) => {
  try {
    await Testimonial.findByIdAndDelete(req.params.id);
    res.redirect('/admin/testimonials');
  } catch (err) {
    res.redirect('/admin/testimonials');
  }
});

// ========================================================================
// FAQS
// ========================================================================

router.get('/admin/faqs', async (req, res) => {
  try {
    const { status, category, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (category && category !== 'all') filter.category = category;

    const total = await FAQ.countDocuments(filter);
    const faqs = await FAQ.find(filter)
      .sort({ displayOrder: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const categories = await FAQ.distinct('category');

    res.render('admin/faqs/index', {
      title: 'FAQs | Admin',
      faqs,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
      statusFilter: status || 'all',
      categoryFilter: category || 'all',
      categories,
      currentPage: 'faqs',
    });
  } catch (err) {
    console.error('[admin/faqs]', err.message);
    res.redirect('/admin');
  }
});

router.get('/admin/faqs/new', (req, res) => {
  res.render('admin/faqs/form', {
    title: 'New FAQ | Admin',
    faq: null,
    error: null,
    currentPage: 'faqs',
    serviceSlugs: servicesList.map((s) => s.slug),
  });
});

router.post('/admin/faqs', requireCapability('faqs.manage'), async (req, res) => {
  try {
    const { question, answer, category, displayOrder, showOnHomepage, showOnServicePage, schemaEnabled, status } = req.body;
    await FAQ.create({
      question,
      answer,
      category: category || 'General',
      displayOrder: Number(displayOrder) || 0,
      showOnHomepage: showOnHomepage === 'on' || showOnHomepage === 'true',
      showOnServicePage: showOnServicePage || '',
      schemaEnabled: schemaEnabled === 'on' || schemaEnabled === 'true',
      status: status || 'published',
    });
    res.redirect('/admin/faqs');
  } catch (err) {
    res.render('admin/faqs/form', {
      title: 'New FAQ | Admin',
      faq: req.body,
      error: err.message,
      currentPage: 'faqs',
      serviceSlugs: servicesList.map((s) => s.slug),
    });
  }
});

router.get('/admin/faqs/:id/edit', async (req, res) => {
  try {
    const faq = await FAQ.findById(req.params.id).lean();
    if (!faq) return res.redirect('/admin/faqs');
    res.render('admin/faqs/form', {
      title: 'Edit FAQ | Admin',
      faq,
      error: null,
      currentPage: 'faqs',
      serviceSlugs: servicesList.map((s) => s.slug),
    });
  } catch (err) {
    res.redirect('/admin/faqs');
  }
});

router.put('/admin/faqs/:id', requireCapability('faqs.manage'), async (req, res) => {
  try {
    const { question, answer, category, displayOrder, showOnHomepage, showOnServicePage, schemaEnabled, status } = req.body;
    await FAQ.findByIdAndUpdate(req.params.id, {
      $set: {
        question,
        answer,
        category: category || 'General',
        displayOrder: Number(displayOrder) || 0,
        showOnHomepage: showOnHomepage === 'on' || showOnHomepage === 'true',
        showOnServicePage: showOnServicePage || '',
        schemaEnabled: schemaEnabled === 'on' || schemaEnabled === 'true',
        status: status || 'published',
      },
    }, { runValidators: true });
    res.redirect('/admin/faqs');
  } catch (err) {
    const faq = await FAQ.findById(req.params.id).lean();
    res.render('admin/faqs/form', {
      title: 'Edit FAQ | Admin',
      faq: { ...faq, ...req.body },
      error: err.message,
      currentPage: 'faqs',
      serviceSlugs: servicesList.map((s) => s.slug),
    });
  }
});

router.delete('/admin/faqs/:id', requireCapability('faqs.manage'), async (req, res) => {
  try {
    await FAQ.findByIdAndDelete(req.params.id);
    res.redirect('/admin/faqs');
  } catch (err) {
    res.redirect('/admin/faqs');
  }
});

// ========================================================================
// SERVICES MANAGEMENT
// ========================================================================

router.get('/admin/services', async (req, res) => {
  const seoMetas = await SEOMeta.find({ pageType: 'service' }).lean();
  const seoMap = {};
  seoMetas.forEach((s) => { seoMap[s.pageRef] = s; });

  res.render('admin/services/index', {
    title: 'Services | Admin',
    services: servicesList,
    seoMap,
    currentPage: 'services',
  });
});

// ========================================================================
// MEDIA LIBRARY
// ========================================================================

router.get('/admin/media', async (req, res) => {
  try {
    const { folder = '/', page = 1, limit = 30 } = req.query;
    const filter = {};
    if (folder && folder !== '/') filter.folder = folder;

    const total = await Media.countDocuments(filter);
    const mediaItems = await Media.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const folders = await Media.distinct('folder');

    res.render('admin/media/index', {
      title: 'Media Library | Admin',
      mediaItems,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
      currentFolder: folder,
      folders,
      currentPage: 'media',
    });
  } catch (err) {
    console.error('[admin/media]', err.message);
    res.redirect('/admin');
  }
});

router.post('/admin/media/upload', requireCapability('media.manage'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) throw new Error('No file uploaded');
    const { folder, altText } = req.body;
    await Media.create({
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: `/uploads/${req.file.filename}`,
      altText: altText || '',
      folder: folder || '/',
      uploadedBy: req.session.adminUser?.name || 'Admin',
    });
    res.redirect(req.headers.referer || '/admin/media');
  } catch (err) {
    console.error('[admin/media/upload]', err.message);
    res.redirect('/admin/media');
  }
});

router.delete('/admin/media/:id', requireCapability('media.manage'), async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (media) {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, '..', '..', 'public', media.url);
      try { fs.unlinkSync(filePath); } catch (_) { /* file may not exist on disk */ }
      await Media.findByIdAndDelete(req.params.id);
    }
    res.redirect('/admin/media');
  } catch (err) {
    res.redirect('/admin/media');
  }
});

router.post('/admin/media/:id/alt', requireCapability('media.manage'), async (req, res) => {
  try {
    const { altText } = req.body;
    await Media.findByIdAndUpdate(req.params.id, { altText: altText || '' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ========================================================================
// COMPANY SETTINGS
// ========================================================================

router.get('/admin/settings', async (req, res) => {
  try {
    const settings = await Setting.find().lean();
    const grouped = {};
    settings.forEach((s) => {
      if (!grouped[s.group]) grouped[s.group] = {};
      grouped[s.group][s.key] = s.value;
    });

    res.render('admin/settings/index', {
      title: 'Settings | Admin',
      settings: grouped,
      error: null,
      currentPage: 'settings',
    });
  } catch (err) {
    res.render('admin/settings/index', {
      title: 'Settings | Admin',
      settings: {},
      error: err.message,
      currentPage: 'settings',
    });
  }
});

router.post('/admin/settings', requireCapability('settings.manage'), async (req, res) => {
  try {
    const { group, ...keys } = req.body;
    if (!group) throw new Error('Group is required');

    for (const [key, value] of Object.entries(keys)) {
      if (key === 'group') continue;
      await Setting.findOneAndUpdate(
        { group, key },
        { value: value || '' },
        { upsert: true }
      );
    }

    res.redirect('/admin/settings');
  } catch (err) {
    console.error('[admin/settings]', err.message);
    res.redirect('/admin/settings');
  }
});

// ========================================================================
// CONTACT FORM SETTINGS (monitoring)
// ========================================================================

router.get('/admin/contact-form', async (req, res) => {
  const integrations = {
    mongodb: {
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      label: 'MongoDB',
    },
    googleSheets: {
      status: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_SHEET_ID
        ? 'configured' : 'not configured',
      label: 'Google Sheets',
    },
    gmail: {
      status: process.env.RESEND_API_KEY ? 'configured' : 'not configured',
      label: 'Gmail (Resend)',
    },
  };

  res.render('admin/settings/contact-form', {
    title: 'Contact Form Settings | Admin',
    integrations,
    currentPage: 'settings',
  });
});

// ========================================================================
// USER MANAGEMENT
// ========================================================================

router.get('/admin/users', requireCapability('users.manage'), async (req, res) => {
  try {
    const users = await AdminUser.find().select('-password').sort({ createdAt: -1 }).lean();
    res.render('admin/users/index', {
      title: 'Users | Admin',
      users,
      roleLabels: ROLE_LABELS,
      error: null,
      currentPage: 'users',
    });
  } catch (err) {
    res.redirect('/admin');
  }
});

router.get('/admin/users/new', requireCapability('users.manage'), (req, res) => {
  res.render('admin/users/form', {
    title: 'New User | Admin',
    user: null,
    roleLabels: ROLE_LABELS,
    error: null,
    currentPage: 'users',
  });
});

router.post('/admin/users', requireCapability('users.manage'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      throw new Error('Name, email, and password are required');
    }
    // A lower-privileged administrator must not be able to mint a
    // super_admin account for themselves or anyone else — only an existing
    // super_admin may create one.
    if (role === 'super_admin' && getRole(req) !== 'super_admin') {
      throw new Error('Only a Super Admin can create another Super Admin account.');
    }
    await AdminUser.create({ name, email, password, role: role || 'editor' });
    res.redirect('/admin/users');
  } catch (err) {
    res.render('admin/users/form', {
      title: 'New User | Admin',
      user: req.body,
      roleLabels: ROLE_LABELS,
      error: err.message,
      currentPage: 'users',
    });
  }
});

router.delete('/admin/users/:id', requireCapability('users.delete'), async (req, res) => {
  try {
    const currentUserId = req.session.adminUser && req.session.adminUser.id;
    if (currentUserId && String(currentUserId) === String(req.params.id)) {
      return res.status(400).send('You cannot delete your own account while logged in as it.');
    }

    const target = await AdminUser.findById(req.params.id);
    if (!target) return res.redirect('/admin/users');

    if (target.role === 'super_admin') {
      const remainingSuperAdmins = await AdminUser.countDocuments({
        role: 'super_admin',
        isActive: true,
        _id: { $ne: target._id },
      });
      if (remainingSuperAdmins === 0) {
        return res.status(400).send('Cannot delete the last remaining Super Admin account.');
      }
    }

    await AdminUser.findByIdAndDelete(req.params.id);
    res.redirect('/admin/users');
  } catch (err) {
    res.redirect('/admin/users');
  }
});

// ========================================================================
// GLOBAL SEARCH
// ========================================================================

router.get('/admin/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, MAX_SEARCH_LENGTH) : '';
  if (!q) return res.redirect('/admin');

  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  try {
    const [blogs, leads, testimonials, faqs] = await Promise.all([
      BlogPost.find({ title: { $regex: safe, $options: 'i' } })
        .select('title slug published createdAt')
        .limit(10)
        .lean(),
      Consultation.find({
        $or: [
          { name: { $regex: safe, $options: 'i' } },
          { email: { $regex: safe, $options: 'i' } },
        ],
      })
        .select('name email status createdAt')
        .limit(10)
        .lean(),
      Testimonial.find({ name: { $regex: safe, $options: 'i' } })
        .select('name review status')
        .limit(10)
        .lean(),
      FAQ.find({ question: { $regex: safe, $options: 'i' } })
        .select('question category status')
        .limit(10)
        .lean(),
    ]);

    res.render('admin/search', {
      title: 'Search Results | Admin',
      query: q,
      blogs,
      leads,
      testimonials,
      faqs,
      currentPage: null,
    });
  } catch (err) {
    console.error('[admin/search]', err.message);
    res.redirect('/admin');
  }
});

// ========================================================================
// LEAD OPERATIONS (Phase 9) — tasks, sprints, notifications, assignment,
// delivery workflow. Attached onto this same router so those routes
// inherit the requireAdmin + session-locals middleware registered above.
// ========================================================================
attachLeadOps(router);

// ========================================================================
// CASES / WORKSPACES / MEMBERSHIP (Cycle 2)
// ========================================================================
attachCases(router);

// ========================================================================
// CONSULTATION/QUERY TRACKING (Cycle 3)
// ========================================================================
attachQueries(router);

// ========================================================================
// DOCUMENT MANAGEMENT (Cycle 5)
// ========================================================================
attachDocuments(router);

// ========================================================================
// TEAM COLLABORATION (Cycle 6)
// ========================================================================
attachCollaboration(router);

// ========================================================================
// CLIENT ACCOUNT OPERATIONS (Cycle 8)
// ========================================================================
attachClients(router);

module.exports = router;
