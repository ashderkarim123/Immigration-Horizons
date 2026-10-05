import { CalendarItem, CalendarTime } from '../../core/api/calendar.types';
import {
  addDays,
  dayInZone,
  defaultState,
  formatDay,
  groupByDay,
  isDate,
  isMonth,
  isOverdue,
  itemDay,
  itemDays,
  monthGrid,
  parseState,
  shiftMonth,
  supportedZones,
  timeLabel,
  toQueryParams,
} from './calendar-model';

const ZONES = ['UTC', 'America/New_York', 'Asia/Karachi', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];

/** Shaped like a CalendarItem from GET /staff/calendar (server/services/calendarService.js). */
type ItemOverrides = Omit<Partial<CalendarItem>, 'time'> & { time?: Partial<CalendarTime> };
function item(over: ItemOverrides = {}): CalendarItem {
  const { time, ...rest } = over;
  return {
    id: 'task:t1:dueDate',
    sourceType: 'task',
    sourceId: 't1',
    sourceField: 'dueDate',
    kind: 'task_due',
    case: { id: 'c1', caseNumber: 'IH-2026-AAA111', title: 'Alpha petition' },
    title: 'Draft cover letter',
    description: '',
    time: { mode: 'date', date: '2026-10-31', endDate: null, startAt: null, endAt: null, timeZone: null, allDay: true, ...time },
    status: 'todo',
    priority: 'high',
    actionRequired: false,
    person: 'Pat Manager',
    link: { path: '/cases/c1', queryParams: { tab: 'tasks' } },
    clientVisible: false,
    actions: { canEdit: false, canCancel: false },
    ...rest,
  };
}
const timed = (startAt: string, over: ItemOverrides = {}) =>
  item({ id: `manual_event:${startAt}`, sourceType: 'manual_event', kind: 'manual_event', title: `at ${startAt}`, time: { mode: 'datetime', date: null, startAt, endAt: null, timeZone: 'America/New_York', allDay: false }, ...over });

describe('calendar model: date-only versus timed', () => {
  it('a date-only deadline stays on its own day in every zone', () => {
    for (const zone of ZONES) {
      expect(itemDay(item(), zone)).toBe('2026-10-31');
      expect(timeLabel(item(), zone)).toBe('All day');
    }
  });

  it('a timed item lands on the viewer-zone day and shows the wall-clock time with the zone', () => {
    const t = timed('2026-10-20T18:30:00.000Z');
    expect(itemDay(t, 'UTC')).toBe('2026-10-20');
    expect(itemDay(t, 'America/New_York')).toBe('2026-10-20');
    expect(itemDay(t, 'Asia/Tokyo')).toBe('2026-10-21');
    expect(timeLabel(t, 'America/New_York')).toBe('2:30 PM EDT');
    expect(timeLabel(t, 'UTC')).toMatch(/^6:30 PM UTC$/);
    expect(timeLabel(t, 'Asia/Karachi')).toMatch(/^11:30 PM (GMT\+5|PKT)$/);
  });

  it('follows DST in America/New_York', () => {
    expect(timeLabel(timed('2026-03-07T17:00:00.000Z'), 'America/New_York')).toBe('12:00 PM EST');
    expect(timeLabel(timed('2026-03-09T16:00:00.000Z'), 'America/New_York')).toBe('12:00 PM EDT');
    expect(dayInZone('2026-11-01T05:30:00.000Z', 'America/New_York')).toBe('2026-11-01');
    expect(dayInZone('2026-11-02T04:30:00.000Z', 'America/New_York')).toBe('2026-11-01');
  });

  it('an all-day multi-day event covers each day and never shifts', () => {
    const e = item({ id: 'manual_event:e', sourceType: 'manual_event', kind: 'manual_event', time: { date: '2026-10-30', endDate: '2026-11-02' } });
    for (const zone of ZONES) expect(itemDays(e, zone, '2026-10-01', '2026-11-30')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(itemDays(e, 'UTC', '2026-11-01', '2026-11-30')).toEqual(['2026-11-01', '2026-11-02']); // clamped to the loaded range
  });

  it('only a still-open deadline can be overdue', () => {
    expect(isOverdue(item({ time: { date: '2026-10-13' } }), '2026-10-14')).toBe(true);
    expect(isOverdue(item({ time: { date: '2026-10-14' } }), '2026-10-14')).toBe(false);
    expect(isOverdue(item({ time: { date: '2026-10-13' }, status: 'completed' }), '2026-10-14')).toBe(false);
    expect(isOverdue(item({ time: { date: '2026-10-13' }, kind: 'manual_event' }), '2026-10-14')).toBe(false);
    expect(isOverdue(timed('2026-10-01T00:00:00.000Z', { kind: 'appointment' }), '2026-10-14')).toBe(false);
  });
});

describe('calendar model: grid and grouping', () => {
  it('builds a six-week Sunday-first grid that contains the whole month', () => {
    const g = monthGrid('2026-10');
    expect(g.weeks.length).toBe(6);
    expect(g.weeks.every((w) => w.length === 7)).toBe(true);
    expect(g.from).toBe('2026-09-27'); // 2026-10-01 is a Thursday
    expect(g.to).toBe('2026-11-07');
    expect(g.weeks.flat()).toContain('2026-10-31');
    expect(g.weeks.flat().length).toBe(42);
  });

  it('a month that starts on Sunday has no leading days', () => {
    expect(monthGrid('2026-02').from).toBe('2026-02-01');
  });

  it('shifts months across a year boundary and does day arithmetic without DST drift', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('validates dates and months strictly', () => {
    expect(isDate('2026-02-29')).toBe(false);
    expect(isDate('2028-02-29')).toBe(true);
    expect(isDate('2026-1-1')).toBe(false);
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth('2026-10')).toBe(true);
  });

  it('groups by day in the viewer zone: all-day first, then by time; drops items outside the range', () => {
    const evening = timed('2026-10-20T18:30:00.000Z', { title: 'Evening call' });
    const morning = timed('2026-10-20T13:00:00.000Z', { title: 'Morning call' });
    const task = item({ title: 'A task', time: { date: '2026-10-20' } });
    const outside = item({ id: 'x', time: { date: '2026-12-25' } });
    const g = groupByDay([evening, task, morning, outside], 'America/New_York', '2026-09-27', '2026-11-07');
    expect([...g.keys()]).toEqual(['2026-10-20']);
    expect(g.get('2026-10-20')!.map((i) => i.title)).toEqual(['A task', 'Morning call', 'Evening call']);
    // The same evening call is a different day in Tokyo, while the task does not move.
    const tokyo = groupByDay([evening, task], 'Asia/Tokyo', '2026-09-27', '2026-11-07');
    expect([...tokyo.keys()]).toEqual(['2026-10-20', '2026-10-21']);
    expect(tokyo.get('2026-10-20')!.map((i) => i.title)).toEqual(['A task']);
  });

  it('formats a calendar day as that day, whatever the machine zone', () => {
    expect(formatDay('2026-10-31', 'long')).toBe('Saturday, October 31, 2026');
    expect(formatDay('2026-10-31', 'short')).toBe('Sat, Oct 31');
  });

  it('lists IANA zones with UTC first, plus any extra', () => {
    const zones = supportedZones(['Asia/Karachi']);
    expect(zones[0]).toBe('UTC');
    expect(zones).toContain('Asia/Karachi');
    expect(new Set(zones).size).toBe(zones.length);
  });
});

describe('calendar model: URL state', () => {
  const today = '2026-10-14';
  const params = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

  it('defaults are the current month in the month view, "mine", every kind, no completed', () => {
    expect(parseState(params({}), today)).toEqual({ view: 'month', month: '2026-10', day: null, scope: 'mine', kinds: null, includeCompleted: false, caseId: null });
    expect(defaultState(today).month).toBe('2026-10');
  });

  it('reads view, month, day, scope, kinds, completed and case from the URL', () => {
    expect(parseState(params({ view: 'agenda', month: '2026-11', day: '2026-11-03', scope: 'team', kinds: 'task_due,uscis_response', completed: '1', caseId: 'c1' }), today)).toEqual({
      view: 'agenda', month: '2026-11', day: '2026-11-03', scope: 'team', kinds: ['task_due', 'uscis_response'], includeCompleted: true, caseId: 'c1',
    });
  });

  it('never throws on junk: bad values fall back to defaults, unknown kinds are dropped, a day implies its month', () => {
    const s = parseState(params({ view: 'week', month: '2026-99', day: '2026-02-30', scope: 'everyone', kinds: 'bogus,task_due' }), today);
    expect([s.view, s.month, s.day, s.scope, s.kinds]).toEqual(['month', '2026-10', null, 'mine', ['task_due']]);
    expect(parseState(params({ day: '2026-12-05' }), today).month).toBe('2026-12');
  });

  it('writes only non-default values, so the default URL is clean and round-trips', () => {
    expect(toQueryParams(defaultState(today), today)).toEqual({ view: null, month: null, day: null, scope: null, kinds: null, completed: null, caseId: null });
    const state = { view: 'agenda' as const, month: '2026-11', day: '2026-11-03', scope: 'team' as const, kinds: ['task_due' as const], includeCompleted: true, caseId: 'c1' };
    const written = toQueryParams(state, today);
    expect(written).toEqual({ view: 'agenda', month: '2026-11', day: '2026-11-03', scope: 'team', kinds: 'task_due', completed: '1', caseId: 'c1' });
    expect(parseState(params(written as Record<string, string>), today)).toEqual(state);
  });
});
