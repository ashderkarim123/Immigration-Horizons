/**
 * Normalizes `req.session.adminUser` into a consistent actor snapshot used
 * by case activity logs and membership `invitedBy*` fields.
 *
 * The env-credential fallback admin (routes/admin/index.js's
 * `finishLogin({ isAdmin: true, adminUser: { name: 'Admin', role: 'super_admin' } })`)
 * has no persistent AdminUser id — `req.session.adminUser.id` is undefined
 * for that session. Every caller must handle `id: null` rather than
 * assuming a real AdminUser document exists (see
 * docs/architecture/ADR-002-case-workspace-domain.md §"Environment-credential
 * fallback admin").
 */
function actorFromSession(req) {
  const adminUser = req.session && req.session.adminUser;
  if (!adminUser) {
    return { type: 'system', id: null, name: 'System' };
  }
  if (adminUser.id) {
    return { type: 'admin_user', id: adminUser.id, name: adminUser.name || 'Admin' };
  }
  return { type: 'env_fallback', id: null, name: adminUser.name || 'Admin' };
}

module.exports = { actorFromSession };
