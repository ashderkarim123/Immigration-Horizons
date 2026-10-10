/**
 * Deadlines report (ADR-028): a SNAPSHOT of what is overdue or coming due, built from the Phase 12 calendar projection so the
 * two can never disagree about a date or about who may see it. Deadline-oriented kinds only (target filing, task, document
 * request, query response, USCIS response, and manual events typed "deadline"); appointments and meetings are not deadlines.
 * Counts are cumulative (due within 7 days includes today); "overdue" covers deadlines up to OVERDUE_LOOKBACK_DAYS past. Only
 * case-native items inside the report's case scope participate.
 */
const { queryCalendar } = require('../calendarService');
const T = require('../../utils/calendarTime');
const { ReportInputError } = require('./context');

const OVERDUE_LOOKBACK_DAYS = 180;
const LOOKAHEAD_DAYS = 30;
const SCREEN_ROWS = 200;
const DEADLINE_KINDS = ['target_filing', 'task_due', 'document_due', 'query_due', 'uscis_response', 'manual_event'];
const KIND_LABELS = {
  target_filing: 'Target filing date',
  task_due: 'Task due',
  document_due: 'Document request due',
  query_due: 'Query response due',
  uscis_response: 'USCIS response due',
  manual_event: 'Deadline event',
};

/** The calendar day of an item in the viewer's zone (date-only items are never converted). */
const dayOf = (item, zone) => (item.time.mode === 'date' ? item.time.date : T.instantToLocal(item.time.startAt, zone).slice(0, 10));

async function run(req, ctx, query = {}) {
  let kinds = DEADLINE_KINDS;
  if (query.source !== undefined && query.source !== '') {
    if (!DEADLINE_KINDS.includes(query.source)) throw new ReportInputError('source', `source must be one of: ${DEADLINE_KINDS.join(', ')}.`);
    kinds = [query.source];
  }

  const calendar = await queryCalendar(
    req,
    { from: T.addDays(ctx.today, -OVERDUE_LOOKBACK_DAYS), to: T.addDays(ctx.today, LOOKAHEAD_DAYS), scope: 'team', kinds: kinds.join(','), timeZone: ctx.zone },
    { maxDays: 366 },
  );

  const rows = calendar.items
    .filter((i) => i.case && ctx.includesCase(i.case.id))
    .filter((i) => i.kind !== 'manual_event' || i.eventType === 'deadline')
    .map((i) => ({ date: dayOf(i, ctx.zone), item: i }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.item.title.localeCompare(b.item.title) || a.item.id.localeCompare(b.item.id));

  const within = (days) => rows.filter((r) => r.date >= ctx.today && r.date <= T.addDays(ctx.today, days)).length;
  const bySource = Object.fromEntries(kinds.map((k) => [k, 0]));
  for (const r of rows) bySource[r.item.kind] += 1;

  const table = rows.map(({ date, item }) => ({
    date,
    kind: item.kind,
    kindLabel: KIND_LABELS[item.kind],
    title: item.title,
    case: item.case,
    status: item.status,
    person: item.person || null,
    overdue: date < ctx.today,
    link: item.link,
  }));

  const data = {
    snapshot: {
      overdue: rows.filter((r) => r.date < ctx.today).length,
      dueToday: rows.filter((r) => r.date === ctx.today).length,
      dueWithin7Days: within(7),
      dueWithin30Days: within(30),
      bySource: kinds.map((k) => ({ key: k, label: KIND_LABELS[k], count: bySource[k] })),
      overdueLookbackDays: OVERDUE_LOOKBACK_DAYS,
      truncated: calendar.truncated,
      rows: table.slice(0, SCREEN_ROWS),
      rowsShown: Math.min(table.length, SCREEN_ROWS),
      rowsTotal: table.length,
    },
  };
  return { data, table: exportTable(table) };
}

function exportTable(all) {
  return {
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'kindLabel', label: 'Type' },
      { key: 'title', label: 'Title' },
      { key: 'caseNumber', label: 'Case number' },
      { key: 'caseTitle', label: 'Case title' },
      { key: 'status', label: 'Status' },
      { key: 'person', label: 'Assignee' },
    ],
    rows: all.map((r) => ({ date: r.date, kindLabel: r.kindLabel, title: r.title, caseNumber: r.case.caseNumber, caseTitle: r.case.title, status: r.status, person: r.person || '' })),
  };
}

module.exports = { run, exportTable, DEADLINE_KINDS };
