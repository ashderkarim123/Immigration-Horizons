const express = require('express');
const router = express.Router();
const { staffAuthMiddleware } = require('../../../../middleware/api/staffAuth');
const { CAPABILITIES, ROLE_LABELS } = require('../../../../utils/permissions');

router.get('/', staffAuthMiddleware, (req, res, next) => {
  try {
    const user = req.staff;
    const role = user.role || 'viewer';
    
    // Resolve capabilities
    const capabilities = [];
    if (role === 'super_admin') {
      capabilities.push(...Object.keys(CAPABILITIES));
    } else {
      for (const [cap, roles] of Object.entries(CAPABILITIES)) {
        if (Array.isArray(roles) && roles.includes(role)) {
          capabilities.push(cap);
        }
      }
    }

    res.json({
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar || null,
          jobTitle: user.jobTitle || '',
          department: user.department || ''
        },
        role: {
          code: role,
          label: ROLE_LABELS[role] || role
        },
        capabilities: [...new Set(capabilities)], // unique
        mustChangePassword: user.mustChangePassword
      },
      meta: { requestId: req.id }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
