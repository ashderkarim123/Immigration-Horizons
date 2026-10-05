import { CALENDAR_KINDS, CalendarItem, CalendarKind, CalendarScope } from '../../core/api/calendar.types';

/**
 * Pure calendar rules for the Staff Calendar page and the case Calendar tab. No Angular, no network.
 *
 * Two kinds of time, kept apart on purpose:
 *  - date-only items (tasks, document requests, USCIS and query response dates, target filing, all-day events) carry a plain
 *    "YYYY-MM-DD" and are placed on exactly that day, whatever zone the viewer selects;
 *  - timed items carry a UTC instant and are placed on the day, and shown at the time, they have in the selected IANA zone.
 */

export type CalendarView = 'month' | 'agenda';

export interface CalendarState {
  view: CalendarView;
  /** "YYYY-MM": the month whose six-week grid is loaded. */
  month: string;
  /** "YYYY-MM-DD": the highlighted day in the month view, or null. */
  day: string | null;
  scope: CalendarScope;
  /** null = every kind the server allows. */
  kinds: CalendarKind[] | null;
  includeCompleted: boolean;
  caseId: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const KIND_VALUES = CALENDAR_KINDS.map((k) => k.value) as readonly string[];

const pad = (n: number) => String(n).padStart(2, '0');
const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export const isDate = (s: unknown): s is string => typeof s === 'string' && DATE.test(s) && fmt(utc(s)) === s;
export const isMonth = (s: unknown): s is string => typeof s === 'string' && MONTH.test(s) && +s.slice(5) >= 1 && +s.slice(5) <= 12;

export const addDays = (date: string, n: number): string => fmt(new Date(utc(date).getTime() + n * 86400000));
/** 0 = Sunday. */
export const weekday = (date: string): number => utc(date).getUTCDay();
export const monthOf = (date: string): string => date.slice(0, 7);

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Today's calendar date in an IANA zone. */
export function dayInZone(instant: string | Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The 42 dates of the grid for a month, Sunday-first, including the neighbouring months' days that fill the weeks. */
export function monthGrid(month: string): { from: string; to: string; weeks: string[][] } {
  const first = `${month}-01`;
  const from = addDays(first, -weekday(first));
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w += 1) weeks.push(Array.from({ length: 7 }, (_, d) => addDays(from, w * 7 + d)));
  return { from, to: addDays(from, 41), weeks };
}

/** The day an item belongs on, in the viewer's zone. Date-only items are never converted. */
export function itemDay(item: CalendarItem, zone: string): string {
  return item.time.mode === 'date' ? (item.time.date as string) : dayInZone(item.time.startAt as string, zone);
}

/** Every day an item covers inside [from, to]: one day, or each day of a multi-day all-day event. */
export function itemDays(item: CalendarItem, zone: string, from: string, to: string): string[] {
  const start = itemDay(item, zone);
  const end = item.time.mode === 'date' && item.time.endDate ? item.time.endDate : start;
  const days: string[] = [];
  for (let d = start < from ? from : start; d <= end && d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** "All day", or the wall-clock time in the viewer's zone with the zone named, e.g. "2:30 PM EDT". */
export function timeLabel(item: CalendarItem, zone: string): string {
  if (item.time.mode === 'date') return 'All day';
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(item.time.startAt as string));
}

/** A readable date for a "YYYY-MM-DD" (always interpreted as that calendar day, never shifted). */
export const formatDay = (date: string, style: 'long' | 'short' = 'long'): string =>
  new Intl.DateTimeFormat('en-US', style === 'long' ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' } : { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(utc(date));

export const formatMonth = (month: string): string => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc(`${month}-01`));

/** Items grouped by day, each day ordered all-day first, then by time, then title. Items outside [from, to] are dropped. */
export function groupByDay(items: CalendarItem[], zone: string, from: string, to: string): Map<string, CalendarItem[]> {
  const days = new Map<string, CalendarItem[]>();
  for (const item of items) for (const d of itemDays(item, zone, from, to)) days.set(d, [...(days.get(d) ?? []), item]);
  const order = (i: CalendarItem) => (i.time.mode === 'date' ? '' : (i.time.startAt as string));
  for (const [d, list] of days) days.set(d, [...list].sort((a, b) => order(a).localeCompare(order(b)) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)));
  return new Map([...days].sort(([a], [b]) => a.localeCompare(b)));
}

// ─── URL state ───────────────────────────────────────────────────────────────

export function defaultState(today: string): CalendarState {
  return { view: 'month', month: monthOf(today), day: null, scope: 'mine', kinds: null, includeCompleted: false, caseId: null };
}

/** Reads the page state from the query string; anything unreadable falls back to the default, never an error. */
export function parseState(params: { get(name: string): string | null }, today: string): CalendarState {
  const base = defaultState(today);
  const month = params.get('month');
  const day = params.get('day');
  const kinds = (params.get('kinds') ?? '').split(',').filter((k): k is CalendarKind => KIND_VALUES.includes(k));
  return {
    view: params.get('view') === 'agenda' ? 'agenda' : 'month',
    month: isMonth(month) ? month : isDate(day) ? monthOf(day) : base.month,
    day: isDate(day) ? day : null,
    scope: params.get('scope') === 'team' ? 'team' : 'mine',
    kinds: kinds.length ? kinds : null,
    includeCompleted: params.get('completed') === '1',
    caseId: params.get('caseId') || null,
  };
}

/** Only non-default values are written, so the URL of the default view stays clean. */
export function toQueryParams(state: CalendarState, today: string): Record<string, string | null> {
  const base = defaultState(today);
  return {
    view: state.view === 'agenda' ? 'agenda' : null,
    month: state.month !== base.month ? state.month : null,
    day: state.day,
    scope: state.scope === 'team' ? 'team' : null,
    kinds: state.kinds?.length ? state.kinds.join(',') : null,
    completed: state.includeCompleted ? '1' : null,
    caseId: state.caseId,
  };
}

/** Only a still-open deadline can be overdue: a date-only item before today in the viewer's zone. Events and appointments just happen. */
export function isOverdue(item: CalendarItem, today: string): boolean {
  if (item.status === 'completed' || item.status === 'cancelled' || item.kind === 'manual_event' || item.kind === 'appointment') return false;
  return item.time.mode === 'date' && (item.time.endDate ?? (item.time.date as string)) < today;
}

/** The IANA zones the browser knows, with a short fallback for engines without Intl.supportedValuesOf. */
export function supportedZones(extra: string[] = []): string[] {
  const fallback = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Karachi', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney'];
  let all: string[] = [];
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    all = [];
  }
  return [...new Set(['UTC', ...(all.length ? all : fallback), ...extra])].sort((a, b) => (a === 'UTC' ? -1 : b === 'UTC' ? 1 : a.localeCompare(b)));
}

/** The browser's current zone, offered as a suggestion only; the server validates whatever is saved. */
export function browserZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
