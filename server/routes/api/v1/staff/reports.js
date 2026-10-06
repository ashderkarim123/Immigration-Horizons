/**
 * Staff API: operational reports and their CSV export (ADR-028).
 *
 * Every report needs `reports.view` plus the underlying resource capabilities, which the report service applies per section
 * (an unavailable metric is null, never a false zero). The CSV export additionally needs `csv.export` and is built by the SAME
 * report function as the screen, so it can never contain a row the screen would not show. Reports never write; a successful
 * export is recorded in the append-only security log with safe metadata only (no rows, names, receipt numbers or filenames).
 */
const express = require('express');
const rateLimit = require('express-rate-limit');

const { buildReport, buildExport, EXPORTABLE, ReportInputError } = require('../../../../services/reporting');
const { recordSecurityEvent } = require('../../../../utils/securityEvents');
const { createApiError } = require('../../../../middleware/api/apiError');
const { requireApiCapability } = require('../../../../middleware/api/staffAuth');

const router = express.Router();

const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.REPORT_EXPORT_RATE_LIMIT) || 6,
  keyGenerator: (req) => String(req.staff._id),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => next(createApiError(429, 'rate_limited', 'Too many exports. Try again in a minute.')),
});

/** Maps a service input error onto the API error envelope. */
function mapError(err) {
  if (!(err instanceof ReportInputError)) return err;
  if (err.status === 403) return createApiError(403, 'forbidden', err.message);
  if (err.status === 404) return createApiError(404, 'not_found', err.message);
  return createApiError(422, 'validation_error', err.message, [{ field: err.field, message: err.message }]);
}

const handler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(mapError(err));
  }
};

for (const name of ['overview', 'pipeline', 'workload', 'deadlines', 'review-queues']) {
  router.get(`/reports/${name}`, requireApiCapability('reports.view'), handler(async (req, res) => {
    const { data, meta } = await buildReport(req, name, req.query);
    res.json({ data, meta: { requestId: req.id, ...meta } });
  }));
}

// GET /api/v1/staff/reports/export.csv?report=pipeline|workload|deadlines|review-queues (+ the same filters as the screen)
router.get('/reports/export.csv', requireApiCapability('reports.view'), requireApiCapability('csv.export'), exportLimiter, handler(async (req, res) => {
  const report = req.query.report;
  if (!EXPORTABLE.includes(report)) throw new ReportInputError('report', `report must be one of: ${EXPORTABLE.join(', ')}.`);
  const result = await buildExport(req, report, req.query);

  await recordSecurityEvent({
    type: 'report_exported',
    result: 'success',
    surface: 'staff',
    actorType: 'admin_user',
    actorAdminId: req.staff._id,
    actorName: req.staff.name,
    req,
    meta: { report, scope: result.meta.scope, from: result.meta.from, to: result.meta.to, rowCount: result.rowCount },
  });

  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${result.filename}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Report-Rows': String(result.rowCount),
  });
  res.send(result.csv);
}));

module.exports = router;
