/**
 * Operational reporting (ADR-028): read-time reports over the real models, no reporting collection, no snapshot worker, no
 * warehouse. One function builds a report for the screen and the CSV export alike, so the export can never include a row the
 * screen would not show. Reports never write, and a database error is an error, never a report full of zeroes.
 */
const { buildContext, metaFor, ReportInputError } = require('./context');
const { toCsv } = require('../../utils/csv');
const { can } = require('../../utils/permissions');

const overview = require('./overview');
const pipeline = require('./pipeline');
const workload = require('./workload');
const deadlines = require('./deadlines');
const reviewQueues = require('./reviewQueues');

const DEFAULT_EXPORT_ROW_CAP = 10000;
/** The hard row cap for an export; the environment may only LOWER it (tests, or a cautious deployment). */
const exportRowCap = () => Math.min(DEFAULT_EXPORT_ROW_CAP, Number(process.env.REPORT_EXPORT_MAX_ROWS) || DEFAULT_EXPORT_ROW_CAP);

/** name -> { module, period (takes from/to), basis, needsCases, exportable }. */
const REPORTS = {
  overview: { run: overview.run, period: true, basis: 'mixed', needsCases: false, exportable: false },
  pipeline: { run: pipeline.run, period: true, basis: 'mixed', needsCases: true, exportable: true },
  workload: { run: workload.run, period: false, basis: 'snapshot', needsCases: true, exportable: true },
  deadlines: { run: deadlines.run, period: false, basis: 'snapshot', needsCases: true, exportable: true },
  'review-queues': { run: reviewQueues.run, period: false, basis: 'snapshot', needsCases: false, exportable: true },
};
const REPORT_NAMES = Object.keys(REPORTS);
const EXPORTABLE = REPORT_NAMES.filter((n) => REPORTS[n].exportable);

/** Builds one report for an authorized actor. Returns `{ data, meta, table }` (table is the export's source). */
async function buildReport(req, name, query = {}) {
  const spec = REPORTS[name];
  if (!spec) throw new ReportInputError('report', 'Unknown report.', 404);
  const ctx = await buildContext(req, query, { period: spec.period });
  // A case-centred report is meaningless (and would be a false empty) for someone who cannot see cases at all.
  if (spec.needsCases && !can(req, 'cases.view')) throw new ReportInputError('report', 'This report needs access to cases.', 403);
  const { data, table } = await spec.run(req, ctx, query);
  return { data, table, meta: metaFor(ctx, spec.basis), ctx };
}

/** The same report as CSV text, with the row cap enforced; returns the audit-safe facts alongside it. */
async function buildExport(req, name, query = {}) {
  const spec = REPORTS[name];
  if (!spec || !spec.exportable) throw new ReportInputError('report', `report must be one of: ${EXPORTABLE.join(', ')}.`);
  const { table, meta } = await buildReport(req, name, query);
  const cap = exportRowCap();
  if (table.rows.length > cap) throw new ReportInputError('report', `This export has ${table.rows.length} rows; the limit is ${cap}. Narrow the filters and try again.`);
  const date = meta.asOf.slice(0, 10);
  return { csv: toCsv(table.columns, table.rows), rowCount: table.rows.length, meta, filename: `immigration-horizons-${name}-${date}.csv` };
}

module.exports = { buildReport, buildExport, REPORT_NAMES, EXPORTABLE, DEFAULT_EXPORT_ROW_CAP, exportRowCap, ReportInputError };
