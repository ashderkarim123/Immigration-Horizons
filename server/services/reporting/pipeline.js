/**
 * Case pipeline report (ADR-028). SNAPSHOT: active cases in scope right now, grouped by stage, case type, priority and project
 * manager. PERIOD: cases opened and cases closed (archived) per week or month between from and to. There is no time-in-stage,
 * success rate or approval measure: the data does not contain exact stage-entry history, and stage is not a legal outcome.
 */
const ClientCase = require('../../models/ClientCase');
const { DateTime } = require('luxon');
const { CASE_TYPES, CASE_STAGES } = require('../../utils/caseConstants');
const { employeeNames } = require('./shared');
const { ReportInputError } = require('./context');
const T = require('../../utils/calendarTime');

const GRANULARITIES = ['week', 'month'];
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };

const pad = (n) => String(n).padStart(2, '0');

/** Every bucket label of the period, so a quiet week or month is a genuine zero rather than a missing row. */
function bucketsFor(from, to, zone, granularity) {
  const out = [];
  let cursor = DateTime.fromISO(from, { zone }).startOf(granularity === 'week' ? 'week' : 'month');
  const end = DateTime.fromISO(to, { zone });
  while (cursor <= end) {
    out.push({
      bucket: granularity === 'week' ? `${cursor.weekYear}-W${pad(cursor.weekNumber)}` : `${cursor.year}-${pad(cursor.month)}`,
      start: cursor.toISODate(),
    });
    cursor = cursor.plus(granularity === 'week' ? { weeks: 1 } : { months: 1 });
  }
  return out;
}

async function seriesCounts(ctx, field, granularity, extraMatch = {}) {
  const format = granularity === 'week' ? '%G-W%V' : '%Y-%m';
  const rows = await ClientCase.aggregate([
    { $match: { ...ctx.anyCases, ...extraMatch, [field]: { $gte: ctx.range.instantFrom, $lte: ctx.range.instantTo } } },
    { $group: { _id: { $dateToString: { format, date: `$${field}`, timezone: ctx.zone } }, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.count]));
}

async function run(req, ctx, query = {}) {
  const granularity = query.granularity === undefined || query.granularity === '' ? (ctx.range && T.daysBetween(ctx.range.from, ctx.range.to) + 1 <= 92 ? 'week' : 'month') : query.granularity;
  if (!GRANULARITIES.includes(granularity)) throw new ReportInputError('granularity', 'granularity must be week or month.');

  const [facet] = await ClientCase.aggregate([
    { $match: ctx.activeCases },
    {
      $facet: {
        stage: [{ $group: { _id: '$currentStage', count: { $sum: 1 } } }],
        caseType: [{ $group: { _id: '$caseType', count: { $sum: 1 } } }],
        priority: [{ $group: { _id: '$priority', count: { $sum: 1 } } }],
        projectManager: [{ $group: { _id: '$projectManager', count: { $sum: 1 } } }],
      },
    },
  ]);
  const by = (key) => new Map(facet[key].map((r) => [r._id === null ? null : String(r._id), r.count]));
  const stage = by('stage');
  const type = by('caseType');
  const priority = by('priority');
  const managers = by('projectManager');
  const names = await employeeNames([...managers.keys()]);

  const opened = await seriesCounts(ctx, 'openedAt', granularity);
  const closed = await seriesCounts(ctx, 'archivedAt', granularity);
  const series = bucketsFor(ctx.range.from, ctx.range.to, ctx.zone, granularity).map((b) => ({ ...b, opened: opened.get(b.bucket) || 0, closed: closed.get(b.bucket) || 0 }));

  const data = {
    snapshot: {
      total: [...stage.values()].reduce((a, b) => a + b, 0),
      byStage: CASE_STAGES.map((s) => ({ key: s.value, label: s.label, count: stage.get(s.value) || 0 })),
      byCaseType: CASE_TYPES.map((t) => ({ key: t.value, label: t.label, count: type.get(t.value) || 0 })),
      byPriority: Object.entries(PRIORITY_LABELS).map(([key, label]) => ({ key, label, count: priority.get(key) || 0 })),
      byProjectManager: [...managers.entries()]
        .map(([id, count]) => ({ key: id, label: id ? names.get(id) || 'Former employee' : 'No project manager', count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    },
    period: { from: ctx.range.from, to: ctx.range.to, granularity, series, totals: { opened: series.reduce((n, s) => n + s.opened, 0), closed: series.reduce((n, s) => n + s.closed, 0) } },
  };
  return { data, table: exportTable(data) };
}

/** The one flat table behind the CSV: every group and every bucket the screen shows. */
function exportTable(data) {
  const rows = [];
  const add = (section, items) => items.forEach((i) => rows.push({ section, group: i.label, count: i.count }));
  add('Active cases by stage (snapshot)', data.snapshot.byStage);
  add('Active cases by case type (snapshot)', data.snapshot.byCaseType);
  add('Active cases by priority (snapshot)', data.snapshot.byPriority);
  add('Active cases by project manager (snapshot)', data.snapshot.byProjectManager);
  for (const s of data.period.series) {
    rows.push({ section: `Cases opened per ${data.period.granularity} (period)`, group: `${s.bucket} (from ${s.start})`, count: s.opened });
    rows.push({ section: `Cases closed per ${data.period.granularity} (period)`, group: `${s.bucket} (from ${s.start})`, count: s.closed });
  }
  return { columns: [{ key: 'section', label: 'Section' }, { key: 'group', label: 'Group' }, { key: 'count', label: 'Count' }], rows };
}

module.exports = { run, exportTable, GRANULARITIES };
