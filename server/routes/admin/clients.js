const mongoose = require('mongoose');

const ClientUser = require('../../models/ClientUser');
const ClientCase = require('../../models/ClientCase');
const WorkspaceMember = require('../../models/WorkspaceMember');
const CaseWorkspace = require('../../models/CaseWorkspace');

const { requireCapability, can } = require('../../utils/permissions');
const { actorFromSession } = require('../../utils/actorSnapshot');
const clientAccountService = require('../../services/clientAccountService');

const MAX_PAGE_LIMIT = 100;
const DEFAULT_PAGE_LIMIT = 25;
const CLIENT_STATUSES = ['pending', 'active', 'locked', 'disabled'];

function parseBoundedInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Escapes a user-supplied search string before it reaches a RegExp. */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A client's case list is filtered by what the viewer can actually see
 * (ADR-007 §8): `cases.view_all` sees every case; everyone else sees only
 * cases whose workspace they're an active member of. Returns null when no
 * restriction applies.
 */
async function caseVisibilityFilter(req) {
  if (can(req, 'cases.view_all')) return null;
  const adminId = req.session.adminUser && req.session.adminUser.id;
  if (!adminId) return { _id: { $in: [] } }; // fail closed

  const memberships = await WorkspaceMember.find({
    memberType: 'employee',
    adminUser: adminId,
    status: 'active',
  })
    .select('workspace')
    .lean();
  if (memberships.length === 0) return { _id: { $in: [] } };

  const workspaces = await CaseWorkspace.find({ _id: { $in: memberships.map((m) => m.workspace) } })
    .select('case')
    .lean();
  return { _id: { $in: workspaces.map((w) => w.case) } };
}

/**
 * Attaches Cycle 8 client-operations routes onto the SAME router instance
 * used by routes/admin/index.js — same pattern as attachCases/attachQueries.
 */
module.exports = function attachClients(router) {
  // ======================================================================
  // CLIENT LIST
  // ======================================================================

  router.get('/admin/clients', requireCapability('clients.view'), async (req, res) => {
    try {
      const status = CLIENT_STATUSES.includes(req.query.status) ? req.query.status : 'all';
      const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';
      const page = parseBoundedInt(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER);
      const limit = parseBoundedInt(req.query.limit, DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT);

      const filter = {};
      if (status !== 'all') filter.status = status;
      if (search) {
        const rx = new RegExp(escapeRegex(search), 'i');
        filter.$or = [{ email: rx }, { firstName: rx }, { lastName: rx }];
      }

      const [clients, total, statusCounts] = await Promise.all([
        ClientUser.find(filter)
          .select('email firstName lastName status lastLoginAt createdAt lockedUntil passwordHash')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        ClientUser.countDocuments(filter),
        ClientUser.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      ]);

      const counts = { pending: 0, active: 0, locked: 0, disabled: 0 };
      for (const row of statusCounts) {
        if (row._id in counts) counts[row._id] = row.n;
      }

      // passwordHash is selected only to derive a boolean — never rendered.
      const rows = clients.map((c) => ({
        _id: c._id,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        status: c.status,
        lastLoginAt: c.lastLoginAt,
        createdAt: c.createdAt,
        lockedUntil: c.lockedUntil,
        hasPassword: Boolean(c.passwordHash),
      }));

      res.render('admin/clients/index', {
        title: 'Clients | Admin',
        clients: rows,
        counts,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        filters: { status, search },
        statuses: CLIENT_STATUSES,
        canManage: can(req, 'clients.manage'),
        currentPage: 'clients',
      });
    } catch (err) {
      console.error('[admin/clients]', err.message);
      res.redirect('/admin');
    }
  });

  // ======================================================================
  // CLIENT DETAIL
  // ======================================================================

  router.get('/admin/clients/:id', requireCapability('clients.view'), async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.redirect('/admin/clients');

      const caseFilter = await caseVisibilityFilter(req);
      const overview = await clientAccountService.getClientOverview(req.params.id, { caseFilter });
      if (!overview) return res.redirect('/admin/clients');

      res.render('admin/clients/detail', {
        title: `Client: ${overview.clientUser.email} | Admin`,
        ...overview,
        canManage: can(req, 'clients.manage'),
        flash: req.session.clientFlash || null,
        currentPage: 'clients',
      });
      delete req.session.clientFlash;
    } catch (err) {
      console.error('[admin/clients/detail]', err.message);
      res.redirect('/admin/clients');
    }
  });

  // ======================================================================
  // ACCOUNT ACTIONS
  // ======================================================================

  router.post('/admin/clients/:id/resend-invitation', requireCapability('clients.manage'), async (req, res) => {
    try {
      const result = await clientAccountService.resendInvitation({
        clientId: req.params.id,
        actor: actorFromSession(req),
      });
      if (result.outcome === 'not_found') return res.redirect('/admin/clients');
      req.session.clientFlash =
        result.outcome === 'validation_error'
          ? { type: 'error', message: result.message }
          : {
              type: 'success',
              message: result.emailed
                ? 'A new activation invitation was issued and emailed.'
                : 'A new activation invitation was issued, but the email could not be sent (check RESEND_API_KEY).',
            };
      res.redirect(`/admin/clients/${req.params.id}`);
    } catch (err) {
      console.error('[admin/clients/resend-invitation]', err.message);
      res.redirect(`/admin/clients/${req.params.id}`);
    }
  });

  router.post('/admin/clients/:id/revoke-invitation', requireCapability('clients.manage'), async (req, res) => {
    try {
      const result = await clientAccountService.revokeInvitations(req.params.id);
      if (result.outcome === 'not_found') return res.redirect('/admin/clients');
      req.session.clientFlash = {
        type: 'success',
        message: `${result.revokedCount} active invitation${result.revokedCount === 1 ? '' : 's'} revoked.`,
      };
      res.redirect(`/admin/clients/${req.params.id}`);
    } catch (err) {
      console.error('[admin/clients/revoke-invitation]', err.message);
      res.redirect(`/admin/clients/${req.params.id}`);
    }
  });

  router.post('/admin/clients/:id/disable', requireCapability('clients.manage'), async (req, res) => {
    try {
      const result = await clientAccountService.disableClient(req.params.id);
      if (result.outcome === 'not_found') return res.redirect('/admin/clients');
      req.session.clientFlash =
        result.outcome === 'unchanged'
          ? { type: 'info', message: 'This account was already disabled.' }
          : {
              type: 'success',
              message: `Account disabled. ${result.sessionsRevoked} active session${result.sessionsRevoked === 1 ? '' : 's'} revoked.`,
            };
      res.redirect(`/admin/clients/${req.params.id}`);
    } catch (err) {
      console.error('[admin/clients/disable]', err.message);
      res.redirect(`/admin/clients/${req.params.id}`);
    }
  });

  router.post('/admin/clients/:id/reactivate', requireCapability('clients.manage'), async (req, res) => {
    try {
      const result = await clientAccountService.reactivateClient(req.params.id);
      if (result.outcome === 'not_found') return res.redirect('/admin/clients');
      req.session.clientFlash =
        result.outcome === 'unchanged'
          ? { type: 'info', message: 'This account is not disabled.' }
          : {
              type: 'success',
              message:
                result.client.status === 'active'
                  ? 'Account reactivated. The client can log in again.'
                  : 'Account reactivated as pending — the client still needs to activate it.',
            };
      res.redirect(`/admin/clients/${req.params.id}`);
    } catch (err) {
      console.error('[admin/clients/reactivate]', err.message);
      res.redirect(`/admin/clients/${req.params.id}`);
    }
  });
};
