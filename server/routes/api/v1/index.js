const express = require('express');
const { requestIdMiddleware } = require('../../../middleware/api/requestId');
const { apiErrorHandler } = require('../../../middleware/api/apiError');

const router = express.Router();

// Apply request ID to all API routes
router.use(requestIdMiddleware);

// Health check (unauthenticated)
router.get('/health', (req, res) => {
  res.json({ data: { status: 'ok', timestamp: new Date() }, meta: { requestId: req.id } });
});

// Staff routes
router.use('/staff', require('./staff'));

// API Error handler must be the last middleware in the API router
router.use(apiErrorHandler);

module.exports = router;
