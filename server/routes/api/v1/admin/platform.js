/**
 * Admin API — platform administration (ADR-029 Gate C): settings, integration status, employee accounts, the role
 * reference and the read-only security log. Every route names the capability it needs; none trusts the role snapshot.
 */
const express = require('express');
const { handle } = require('../../../../middleware/api/apiError');
const { requireAdminCapability: needs } = require('../../../../middleware/api/adminAuth');
const { contextOf } = require('../../../../services/cms/common');
const settings = require('../../../../services/cms/settings');
const integrationStatus = require('../../../../services/integrationStatus');
const users = require('../../../../services/adminUserManagement');
const securityEvents = require('../../../../services/securityEventViewer');

const router = express.Router();

// ---- Settings and integration status ----
router.get('/settings', needs('settings.manage'), handle(async () => ({ groups: await settings.list() })));
router.put('/settings/:group', needs('settings.manage'), handle((req) => settings.saveGroup(contextOf(req), req.params.group, (req.body || {}).values)));
router.get('/integration-status', needs('settings.manage'), handle(() => integrationStatus.status()));

// ---- Employee accounts ----
/** The one-time credential: present in this response only, which the router already marks no-store. */
const withCredential = (ctx, { user, temporaryPassword }, purpose) => ({ user: users.toDto(user, ctx), temporaryCredential: { password: temporaryPassword, purpose } });

router.get('/users', needs('users.manage'), handle((req) => users.list(req.query, contextOf(req))));
router.post('/users', needs('users.manage'), handle(async (req) => { const ctx = contextOf(req); return withCredential(ctx, await users.create(ctx, req.body), 'created'); }, 201));
router.get('/users/:id', needs('users.manage'), handle((req) => users.get(req.params.id, contextOf(req))));
router.patch('/users/:id', needs('users.manage'), handle(async (req) => { const ctx = contextOf(req); return users.toDto((await users.update(ctx, req.params.id, req.body)).user, ctx); }));
router.post('/users/:id/reset-credentials', needs('users.manage'), handle(async (req) => { const ctx = contextOf(req); return withCredential(ctx, await users.resetCredentials(ctx, req.params.id), 'reset'); }));
router.post('/users/:id/revoke-sessions', needs('users.manage'), handle(async (req) => {
  const ctx = contextOf(req);
  const { user, revoked } = await users.revokeSessions(ctx, req.params.id);
  return { user: users.toDto(user, ctx), revokedStaffSessions: revoked };
}));
router.delete('/users/:id', needs('users.manage'), needs('users.delete'), handle(async (req) => { await users.remove(contextOf(req), req.params.id); return { deleted: true }; }));

router.get('/roles', needs('users.manage'), handle(() => ({ roles: users.rolesReference() })));

// ---- Security events: GET only. There is no route that changes or removes an entry. ----
router.get('/security-events', needs('security_events.view'), handle((req) => securityEvents.list(req.query)));
router.get('/security-events/:id', needs('security_events.view'), handle((req) => securityEvents.get(req.params.id)));

module.exports = router;
