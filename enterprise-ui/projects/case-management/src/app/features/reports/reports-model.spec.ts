import { REPORT_TABS, ReportFilters } from '../../core/api/reports.types';
import { reportParams } from '../../core/api/reports-api.service';
import { barPercent, formatDate, formatGenerated, formatPeriod, parseFilters, parseTab, scopeOptions, toQueryParams } from './reports-model';

const params = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
const base: ReportFilters = { scope: 'accessible', from: null, to: null, caseType: null, stage: null, priority: null, source: null, granularity: null };

describe('reports model', () => {
  it('offers the firm scope only with organization-wide case access', () => {
    expect(scopeOptions(false).map((s) => s.value)).toEqual(['accessible', 'mine']);
    expect(scopeOptions(true).map((s) => s.value)).toEqual(['accessible', 'mine', 'firm']);
  });

  it('a firm scope in the URL is ignored for someone who cannot use it', () => {
    expect(parseFilters(params({ scope: 'firm' }), false).scope).toBe('accessible');
    expect(parseFilters(params({ scope: 'firm' }), true).scope).toBe('firm');
    expect(parseFilters(params({ scope: 'galaxy' }), true).scope).toBe('accessible');
  });

  it('reads valid dates, filters and granularity; ignores junk', () => {
    const f = parseFilters(params({ scope: 'mine', from: '2026-01-01', to: '2026-02-30x', caseType: 'o1', stage: 'filed', priority: 'high', source: 'task_due', granularity: 'month' }), false);
    expect(f).toEqual({ scope: 'mine', from: '2026-01-01', to: null, caseType: 'o1', stage: 'filed', priority: 'high', source: 'task_due', granularity: 'month' });
    expect(parseFilters(params({ granularity: 'day' }), false).granularity).toBeNull();
  });

  it('tabs: unknown values fall back to the overview', () => {
    expect(parseTab('workload')).toBe('workload');
    expect(parseTab('bogus')).toBe('overview');
    expect(parseTab(null)).toBe('overview');
    expect(REPORT_TABS.map((t) => t.key)).toEqual(['overview', 'pipeline', 'workload', 'deadlines', 'review-queues']);
  });

  it('writes only non-default values to the URL', () => {
    expect(toQueryParams('overview', base)).toEqual({ tab: null, scope: null, from: null, to: null, caseType: null, stage: null, priority: null, source: null, granularity: null });
    expect(toQueryParams('workload', { ...base, scope: 'mine', caseType: 'o1' })).toEqual(expect.objectContaining({ tab: 'workload', scope: 'mine', caseType: 'o1' }));
  });

  it('the report request and its CSV export are built from one function, so they carry the same filters', () => {
    const f: ReportFilters = { ...base, scope: 'firm', from: '2026-01-01', to: '2026-03-31', caseType: 'o1', stage: 'filed', priority: 'urgent', source: 'task_due', granularity: 'week' };
    expect(reportParams('pipeline', f)).toEqual({ scope: 'firm', from: '2026-01-01', to: '2026-03-31', caseType: 'o1', stage: 'filed', priority: 'urgent', granularity: 'week' });
    expect(reportParams('deadlines', f)).toEqual({ scope: 'firm', caseType: 'o1', stage: 'filed', priority: 'urgent', source: 'task_due' });
    expect(reportParams('workload', f)).toEqual({ scope: 'firm', caseType: 'o1', stage: 'filed', priority: 'urgent' });
    expect(reportParams('review-queues', f)).toEqual({ scope: 'firm', caseType: 'o1', stage: 'filed', priority: 'urgent', source: 'task_due' });
  });

  it('bars are a share of the largest value; the count itself is always shown as text', () => {
    expect(barPercent(5, 10)).toBe(50);
    expect(barPercent(0, 10)).toBe(0);
    expect(barPercent(0, 0)).toBe(0);
    expect(barPercent(10, 10)).toBe(100);
  });

  it('dates are calendar days (never shifted) and the generated time names its zone', () => {
    expect(formatDate('2026-10-31')).toBe('Oct 31, 2026');
    expect(formatPeriod('2026-10-01', '2026-10-31')).toBe('Oct 1, 2026 to Oct 31, 2026');
    expect(formatGenerated('2026-10-14T19:30:00.000Z', 'America/New_York')).toBe('Oct 14, 2026, 3:30 PM (America/New_York)');
    expect(formatGenerated('2026-10-14T19:30:00.000Z', 'UTC')).toBe('Oct 14, 2026, 7:30 PM (UTC)');
  });
});
