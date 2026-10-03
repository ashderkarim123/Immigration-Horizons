const AdminUser = require('../models/admin/User');
const { can } = require('../utils/permissions');

async function requireAdmin(req, res, next) {
  if (!req.session || !req.session.isAdmin) return res.redirect('/admin/login');
  const snapshot = req.session.adminUser;
  try {
    // Re-read named accounts: a demotion/deactivation takes effect on the
    // very next request, including cookies issued before this boundary.
    if (snapshot && snapshot.id) {
      const user = await AdminUser.findById(snapshot.id).select('name role isActive').lean();
      if (user && user.isActive && can({ staff: user }, 'admin.cms.access')) {
        req.session.adminUser = { id: String(user._id), name: user.name, role: user.role };
        return next();
      }
    } else if (snapshot && snapshot.role === 'super_admin') {
      // Existing separately configured break-glass CMS credential.
      return next();
    }
    return req.session.destroy(() => res.redirect('/admin/login'));
  } catch (error) {
    // Database failure cannot turn a stale cookie into authorization.
    return next(error);
  }
}

module.exports = { requireAdmin };
