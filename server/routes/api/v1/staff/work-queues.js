const router = require('express').Router();
const { requireApiCapability } = require('../../../../middleware/api/staffAuth');
const { createApiError } = require('../../../../middleware/api/apiError');
const { loadWorkQueues } = require('../../../../services/staffWorkQueues');
router.get('/', requireApiCapability('cases.view'), async (req, res, next) => {
  try {
    const queues = await loadWorkQueues(req);
    const queue = queues.find(q => q.key === req.query.queue);
    if (!queue) return next(createApiError(404, 'not_found', 'Work queue not found.'));
    res.json({ data: queue, meta: { requestId: req.id } });
  } catch (error) { next(error); }
});
module.exports = router;
