/**
 * Staff API: authorized global search (ADR-028).
 *
 *   GET /api/v1/staff/search?q=...                      quick search, grouped by source (5 results per source by default)
 *   GET /api/v1/staff/search?q=...&types=cases,tasks    quick search over chosen sources
 *   GET /api/v1/staff/search?q=...&type=cases&page=2    full results for ONE source, paginated (<= 50 per page)
 *
 * `type` (one source, paginated) and `types` (a list, quick) are the two documented modes. Every source applies its own
 * capability and row scope in the database query; this handler only validates and maps errors. Search text is never logged.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');

const { runSearch, SearchInputError } = require('../../../../services/search');
const { createApiError } = require('../../../../middleware/api/apiError');

const router = express.Router();

// Interactive typeahead is debounced to roughly 3 requests a second at worst; 90/min per employee leaves room for that.
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.STAFF_SEARCH_RATE_LIMIT) || 90,
  keyGenerator: (req) => String(req.staff._id),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => next(createApiError(429, 'rate_limited', 'Too many searches. Try again in a moment.')),
});

router.get('/search', searchLimiter, async (req, res, next) => {
  try {
    const { data, unavailableTypes } = await runSearch(req, req.query);
    res.json({ data, meta: { requestId: req.id, unavailableTypes } });
  } catch (err) {
    if (err instanceof SearchInputError) {
      const code = err.status === 403 ? 'forbidden' : 'validation_error';
      return next(createApiError(err.status, code, err.message, err.status === 422 ? [{ field: err.field, message: err.message }] : undefined));
    }
    return next(err);
  }
});

module.exports = router;
