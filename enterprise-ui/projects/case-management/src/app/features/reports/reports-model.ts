import { REPORT_TABS, ReportFilters, ReportName, ReportScope } from '../../core/api/reports.types';

/** Pure rules for the Reports page: URL state, labels and bar widths. No Angular, no network. */

const SCOPES: ReportScope[] = ['accessible', 'mine', 'firm'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const SCOPE_LABELS: Record<ReportScope, string> = {
  accessible: 'Everything I can access',
  mine: 'Cases I manage',
  firm: 'Whole firm',
};

/** The scopes offered to this employee: firm only with organization-wide case access. */
export function scopeOptions(canFirm: boolean): { value: ReportScope; label: string }[] {
  return SCOPES.filter((s) => s !== 'firm' || canFirm).map((value) => ({ value, label: SCOPE_LABELS[value] }));
}

export function parseTab(raw: string | null): ReportName {
  return REPORT_TABS.some((t) => t.key === raw) ? (raw as ReportName) : 'overview';
}

export function parseFilters(params: { get(name: string): string | null }, canFirm: boolean): ReportFilters {
  const scope = params.get('scope') as ReportScope | null;
  const date = (k: string) => (DATE.test(params.get(k) ?? '') ? (params.get(k) as string) : null);
  const g = params.get('granularity');
  return {
    scope: scope && SCOPES.includes(scope) && (scope !== 'firm' || canFirm) ? scope : 'accessible',
    from: date('from'),
    to: date('to'),
    caseType: params.get('caseType') || null,
    stage: params.get('stage') || null,
    priority: params.get('priority') || null,
    source: params.get('source') || null,
    granularity: g === 'week' || g === 'month' ? g : null,
  };
}

/** Only non-default values go in the URL, so the default report has a clean address. */
export function toQueryParams(tab: ReportName, f: ReportFilters): Record<string, string | null> {
  return {
    tab: tab === 'overview' ? null : tab,
    scope: f.scope === 'accessible' ? null : f.scope,
    from: f.from,
    to: f.to,
    caseType: f.caseType,
    stage: f.stage,
    priority: f.priority,
    source: f.source,
    granularity: f.granularity,
  };
}

/** Width of a bar as a percentage of the largest value in its table; the count is always shown as text beside it. */
export function barPercent(count: number, max: number): number {
  return max > 0 ? Math.round((count / max) * 100) : 0;
}

const fmtDay = (iso: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
export const formatPeriod = (from: string, to: string) => `${fmtDay(from)} to ${fmtDay(to)}`;
export const formatDate = fmtDay;

/** "Oct 14, 2026, 3:30 PM" in the zone the report was computed in, with the zone named. */
export function formatGenerated(asOf: string, timeZone: string): string {
  return `${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(asOf))} (${timeZone})`;
}
