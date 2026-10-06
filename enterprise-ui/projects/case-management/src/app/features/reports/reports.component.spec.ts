import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, ParamMap, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import {
  DeadlinesReport, OverviewReport, PipelineReport, ReportMeta, ReviewQueuesReport, WorkloadReport,
} from '../../core/api/reports.types';
import { AuthService } from '../../core/auth/auth.service';
import { ReportsComponent } from './reports.component';

const BASE = '/api/v1/staff/reports';

const meta = (over: Partial<ReportMeta> = {}): ReportMeta => ({ requestId: 'r', asOf: '2026-10-14T19:30:00.000Z', timeZone: 'America/New_York', scope: 'accessible', basis: 'mixed', ...over });

/** Shaped like GET /staff/reports/overview (server/services/reporting/overview.js). */
const overview = (over: Partial<OverviewReport> = {}): OverviewReport => ({
  snapshot: [
    { key: 'activeCases', label: 'Active cases', basis: 'snapshot', value: 12, href: '/cases' },
    { key: 'overdueTasks', label: 'Overdue tasks', basis: 'snapshot', value: 0, href: '/tasks' },
    { key: 'uscisActionRequired', label: 'USCIS action required', basis: 'snapshot', value: null, href: '/tracking' },
  ],
  period: { from: '2026-07-17', to: '2026-10-14', metrics: [{ key: 'casesOpened', label: 'Cases opened', basis: 'period', value: 4, href: '/cases' }, { key: 'tasksCompleted', label: 'Tasks completed', basis: 'period', value: 0, href: '/tasks' }] },
  ...over,
});

const pipeline = (): PipelineReport => ({
  snapshot: {
    total: 3,
    byStage: [{ key: 'intake', label: 'Intake', count: 1 }, { key: 'drafting', label: 'Drafting', count: 2 }, { key: 'filed', label: 'Filed', count: 0 }],
    byCaseType: [{ key: 'eb2_niw', label: 'EB-2 NIW', count: 3 }],
    byPriority: [{ key: 'high', label: 'High', count: 3 }],
    byProjectManager: [{ key: 'u1', label: 'Pat Manager', count: 3 }],
  },
  period: { from: '2026-07-17', to: '2026-10-14', granularity: 'month', series: [{ bucket: '2026-09', start: '2026-09-01', opened: 2, closed: 0 }, { bucket: '2026-10', start: '2026-10-01', opened: 1, closed: 1 }], totals: { opened: 3, closed: 1 } },
});

const workload = (over: Partial<WorkloadReport['snapshot']> = {}): WorkloadReport => ({
  snapshot: { rows: [{ employeeId: 'u1', name: 'Pat Manager', openCases: 2, openTasks: 5, overdueTasks: 1, dueSoonTasks: 2 }], unassignedTasks: 3, casesWithoutProjectManager: 1, scopeNote: 'All employees with open work in this scope.', ...over },
});

const row = (over: Partial<DeadlinesReport['snapshot']['rows'][number]> = {}): DeadlinesReport['snapshot']['rows'][number] => ({
  date: '2026-10-10', kind: 'task_due', kindLabel: 'Task due', title: 'Draft letter', case: { id: 'c1', caseNumber: 'IH-2026-ALPHA1', title: 'Alpha' }, status: 'todo', person: 'Pat', overdue: true,
  link: { path: '/cases/c1', queryParams: { tab: 'tasks' } }, ...over,
});
const deadlines = (): DeadlinesReport => ({
  snapshot: {
    overdue: 1, dueToday: 0, dueWithin7Days: 1, dueWithin30Days: 2,
    bySource: [{ key: 'task_due', label: 'Task due', count: 2 }, { key: 'uscis_response', label: 'USCIS response due', count: 1 }],
    overdueLookbackDays: 180, truncated: false,
    rows: [row(), row({ date: '2026-10-16', title: 'File I-140', kind: 'uscis_response', kindLabel: 'USCIS response due', overdue: false, link: { path: '/cases/c1', queryParams: { tab: 'tracking', filing: 'f1' } } })],
    rowsShown: 2, rowsTotal: 250,
  },
});

const queues = (): ReviewQueuesReport => ({
  snapshot: {
    rowLimit: 100,
    queues: [
      { key: 'document_review', label: 'Documents to review', available: true, count: 3, rows: [{ caseId: 'c1', caseNumber: 'IH-2026-ALPHA1', caseTitle: 'Alpha', count: 3, link: { path: '/cases/c1', queryParams: { tab: 'documents' } } }], rowsTotal: 1 },
      { key: 'forms_review', label: 'Forms to review', available: false, count: null, rows: [], rowsTotal: 0 },
      { key: 'queries_overdue', label: 'Queries past their response date', available: true, count: 0, rows: [], rowsTotal: 0 },
    ],
  },
});

describe('ReportsComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ReportsComponent>;
  let params: BehaviorSubject<ParamMap>;
  let navigate: ReturnType<typeof vi.spyOn>;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const queryOf = (r: TestRequest) => Object.fromEntries(r.request.params.keys().map((k) => [k, r.request.params.get(k)]));

  function setup(opts: { query?: Record<string, string>; caps?: string[] } = {}) {
    params = new BehaviorSubject(convertToParamMap(opts.query ?? {}));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: params } },
        { provide: AuthService, useValue: { capabilities: signal(opts.caps ?? ['reports.view']) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
  }
  const answer = async (name: string, data: unknown, m: ReportMeta = meta()) => {
    const req = http.expectOne((r) => r.url === `${BASE}/${name}`);
    req.flush({ data, meta: m });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return req;
  };

  afterEach(() => http.verify());

  it('the overview labels the snapshot and the period separately, with the generated time in the report zone', async () => {
    setup();
    const req = await answer('overview', overview(), meta({ from: '2026-07-17', to: '2026-10-14' }));
    expect(queryOf(req)).toEqual({ scope: 'accessible' });
    const headings = Array.from(el().querySelectorAll('h2')).map((h) => h.textContent?.trim());
    expect(headings).toEqual(['Current snapshot', 'Selected period: Jul 17, 2026 to Oct 14, 2026']);
    expect(text()).toContain('These figures do not depend on the period below.');
    expect(text()).toContain('Not a trend of the snapshot above.');
    expect(text()).toContain('Generated Oct 14, 2026, 3:30 PM (America/New_York)');
    const basis = Array.from(el().querySelectorAll('.m-basis')).map((b) => b.textContent?.trim());
    expect(basis).toEqual(['Current snapshot', 'Current snapshot', 'Current snapshot', 'Jul 17, 2026 to Oct 14, 2026', 'Jul 17, 2026 to Oct 14, 2026']);
  });

  it('a metric the server withheld is "Not available to your role", never a zero; a real zero is a zero', async () => {
    setup();
    await answer('overview', overview());
    const card = (label: string) => Array.from(el().querySelectorAll('.metric')).find((m) => m.textContent?.includes(label))!;
    expect(card('USCIS action required').textContent).toContain('Not available to your role');
    expect(card('USCIS action required').querySelector('.m-value')?.textContent).not.toMatch(/^0$/);
    expect(card('Overdue tasks').querySelector('.m-value')?.textContent?.trim()).toBe('0');
    expect(card('Active cases').querySelector('.m-value')?.textContent?.trim()).toBe('12');
    expect(card('Active cases').querySelector('a')?.getAttribute('href')).toBe('/cases');
  });

  it('the scope selector offers firm only with cases.view_all, and choosing one writes the URL', async () => {
    setup({ caps: ['reports.view'] });
    await answer('overview', overview());
    const options = () => Array.from(el().querySelectorAll('#rep-scope option')).map((o) => (o as HTMLOptionElement).value);
    expect(options()).toEqual(['accessible', 'mine']);
    const select = el().querySelector<HTMLSelectElement>('#rep-scope')!;
    select.value = 'mine';
    select.dispatchEvent(new Event('change'));
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: expect.objectContaining({ scope: 'mine' }) }));

    TestBed.resetTestingModule();
    setup({ caps: ['reports.view', 'cases.view_all'] });
    await answer('overview', overview());
    expect(options()).toEqual(['accessible', 'mine', 'firm']);
  });

  it('a firm scope in the URL of someone without cases.view_all is not requested', async () => {
    setup({ query: { scope: 'firm' } });
    const req = await answer('overview', overview());
    expect(req.request.params.get('scope')).toBe('accessible');
  });

  it('period filters appear only where a period applies, and the inputs show the period the numbers cover', async () => {
    setup();
    await answer('overview', overview(), meta({ from: '2026-07-17', to: '2026-10-14' }));
    expect(el().querySelector<HTMLInputElement>('#rep-from')?.value).toBe('2026-07-17');
    expect(el().querySelector<HTMLInputElement>('#rep-to')?.value).toBe('2026-10-14');
    const from = el().querySelector<HTMLInputElement>('#rep-from')!;
    from.value = '2026-08-01';
    from.dispatchEvent(new Event('change'));
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: expect.objectContaining({ from: '2026-08-01' }) }));

    TestBed.resetTestingModule();
    setup({ query: { tab: 'workload' } });
    await answer('workload', workload());
    expect(el().querySelector('#rep-from')).toBeNull();
    expect(el().querySelector('#rep-source')).toBeNull();
  });

  it('case type, stage and priority filters are real selects and write the URL; the request carries them', async () => {
    setup({ query: { caseType: 'o1', stage: 'filed', priority: 'urgent', from: '2026-01-01', to: '2026-03-31' } });
    const req = await answer('overview', overview());
    expect(queryOf(req)).toEqual({ scope: 'accessible', from: '2026-01-01', to: '2026-03-31', caseType: 'o1', stage: 'filed', priority: 'urgent' });
    expect(el().querySelector<HTMLSelectElement>('#rep-type')?.options.length).toBeGreaterThan(5);
    const stage = el().querySelector<HTMLSelectElement>('#rep-stage')!;
    stage.value = 'drafting';
    stage.dispatchEvent(new Event('change'));
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: expect.objectContaining({ stage: 'drafting', caseType: 'o1' }) }));
  });

  it('pipeline: snapshot tables with the count as text beside every bar, and a period table with totals', async () => {
    setup({ query: { tab: 'pipeline' } });
    await answer('pipeline', pipeline());
    expect(text()).toContain('Active cases — Current snapshot');
    expect(text()).toContain('3 active cases right now');
    const stage = Array.from(el().querySelectorAll('table')).find((t) => t.querySelector('caption')?.textContent === 'By stage')!;
    const rows = Array.from(stage.querySelectorAll('tbody tr')).map((r) => [r.querySelector('th')?.textContent?.trim(), r.querySelector('.num')?.textContent?.trim(), r.querySelector('.bar')?.getAttribute('aria-hidden')]);
    expect(rows).toEqual([['Intake', '1', 'true'], ['Drafting', '2', 'true'], ['Filed', '0', 'true']]);
    expect((stage.querySelectorAll('.bar')[1] as HTMLElement).style.width).toBe('100%');
    expect((stage.querySelectorAll('.bar')[0] as HTMLElement).style.width).toBe('50%');
    expect(text()).toContain('Cases opened and closed — Jul 17, 2026 to Oct 14, 2026');
    expect(text()).toContain('Selected period, not the snapshot.');
    const series = Array.from(el().querySelectorAll('tbody tr')).filter((r) => r.textContent?.includes('2026-10'));
    expect(series[0].textContent).toMatch(/1\s*1/);
    expect(el().querySelector('tfoot')?.textContent).toMatch(/Total\s*3\s*1/);
    expect(el().querySelector('#rep-gran')).toBeTruthy();
    expect(text()).not.toMatch(/success|approval|score|efficiency|productivity/i);
  });

  it('workload lists open work per employee neutrally; unassigned work can be withheld', async () => {
    setup({ query: { tab: 'workload' } });
    await answer('workload', workload({ unassignedTasks: null }));
    expect(text()).toContain('Open work by employee — Current snapshot');
    expect(text()).toContain('not a performance measure');
    const cells = Array.from(el().querySelectorAll('tbody tr')[0].children).map((c) => c.textContent?.trim());
    expect(cells).toEqual(['Pat Manager', '2', '5', '1', '2']);
    expect(text()).toContain('Unassigned tasks: Not available to your role');
    expect(text()).toContain('Cases without a project manager: 1');
    expect(text()).not.toMatch(/utilization|rank|best|worst/i);
  });

  it('deadlines: cumulative counts, rows with deep links into the owning tab, overdue as text, and the bounded-table note', async () => {
    setup({ query: { tab: 'deadlines', source: 'task_due' } });
    const req = await answer('deadlines', deadlines());
    expect(queryOf(req)).toEqual({ scope: 'accessible', source: 'task_due' });
    expect(text()).toContain('Counts are cumulative');
    expect(text()).toContain('Overdue covers deadlines up to 180 days past');
    expect(Array.from(el().querySelectorAll('.metric .m-value')).map((v) => v.textContent?.trim())).toEqual(['1', '0', '1', '2']);
    const links = Array.from(el().querySelectorAll('tbody a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('/cases/c1?tab=tasks');
    expect(links).toContain('/cases/c1?tab=tracking&filing=f1');
    expect(links).toContain('/cases/c1');
    expect(el().querySelector('tr.late')?.textContent).toContain('Overdue');
    expect(text()).toContain('Showing the first 2 of 250');
    expect(el().querySelector<HTMLSelectElement>('#rep-source')?.value).toBe('task_due');
  });

  it('review queues: per-case rows link to the module, an unavailable queue says so, a real zero says zero', async () => {
    setup({ query: { tab: 'review-queues' } });
    await answer('review-queues', queues());
    expect(text()).toContain('Documents to review: 3');
    expect(text()).toContain('Forms to review: Not available to your role');
    expect(text()).toContain('Queries past their response date: 0');
    expect(el().querySelector('table a')?.getAttribute('href')).toBe('/cases/c1?tab=documents');
    expect(text()).toContain('These match the queues on your Dashboard');
    expect(text()).not.toMatch(/quality|score/i);
  });

  it('the CSV button needs csv.export and an exportable report, and its link carries exactly the filters on screen', async () => {
    setup({ query: { tab: 'deadlines', caseType: 'o1', priority: 'high', source: 'task_due', scope: 'mine' }, caps: ['reports.view'] });
    await answer('deadlines', deadlines());
    expect(Array.from(el().querySelectorAll('a')).some((a) => a.textContent?.includes('Export CSV'))).toBe(false);

    TestBed.resetTestingModule();
    setup({ query: { tab: 'deadlines', caseType: 'o1', priority: 'high', source: 'task_due', scope: 'mine' }, caps: ['reports.view', 'csv.export'] });
    await answer('deadlines', deadlines());
    const link = Array.from(el().querySelectorAll('a')).find((a) => a.textContent?.includes('Export CSV'))!;
    expect(link.getAttribute('href')).toBe('/api/v1/staff/reports/export.csv?report=deadlines&scope=mine&caseType=o1&priority=high&source=task_due');
    expect(link.hasAttribute('download')).toBe(true);

    TestBed.resetTestingModule();
    setup({ query: { tab: 'overview' }, caps: ['reports.view', 'csv.export'] });
    await answer('overview', overview());
    expect(Array.from(el().querySelectorAll('a')).some((a) => a.textContent?.includes('Export CSV'))).toBe(false); // the overview has no export
  });

  it('the export link follows the period filters of the pipeline', async () => {
    setup({ query: { tab: 'pipeline', from: '2026-01-01', to: '2026-03-31', granularity: 'week' }, caps: ['reports.view', 'csv.export'] });
    await answer('pipeline', pipeline());
    const href = Array.from(el().querySelectorAll('a')).find((a) => a.textContent?.includes('Export CSV'))!.getAttribute('href');
    expect(href).toBe('/api/v1/staff/reports/export.csv?report=pipeline&scope=accessible&from=2026-01-01&to=2026-03-31&granularity=week');
  });

  it('tabs link between reports and do not carry a deadline type or grouping to another report', async () => {
    setup({ query: { tab: 'deadlines', source: 'task_due', granularity: 'week', caseType: 'o1' } });
    await answer('deadlines', deadlines());
    const tabs = Array.from(el().querySelectorAll('nav.tabs a'));
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Overview', 'Case pipeline', 'Workload', 'Deadlines', 'Review queues']);
    expect(tabs[3].getAttribute('aria-current')).toBe('page');
    const workloadHref = tabs[2].getAttribute('href')!;
    expect(workloadHref).toContain('tab=workload');
    expect(workloadHref).toContain('caseType=o1');
    expect(workloadHref).not.toContain('source=');
    expect(workloadHref).not.toContain('granularity=');
  });

  it('switching reports through the URL loads the right endpoint', async () => {
    setup();
    await answer('overview', overview());
    params.next(convertToParamMap({ tab: 'workload' }));
    fixture.detectChanges();
    await answer('workload', workload());
    expect(text()).toContain('Open work by employee');
  });

  it('loading, error with retry, and a clear refusal for a report the employee cannot open', async () => {
    setup();
    expect(el().querySelector('ih-skeleton')).toBeTruthy();
    http.expectOne((r) => r.url === `${BASE}/overview`).flush({ error: { code: 'server_error', message: 'Boom' } }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(text()).toContain('Failed to load the report');
    (Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.includes('Try Again')) as HTMLButtonElement).click();
    await answer('overview', overview());
    expect(text()).toContain('Current snapshot');

    TestBed.resetTestingModule();
    setup({ query: { tab: 'workload' } });
    http.expectOne((r) => r.url === `${BASE}/workload`).flush({ error: { code: 'forbidden', message: 'x' } }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(text()).toContain('Report not available');
    expect(text()).toContain('You do not have access to this report.');
    expect(Array.from(el().querySelectorAll('button')).some((b) => b.textContent?.includes('Try Again'))).toBe(false);
  });

  it('tables scroll inside a container on a phone instead of widening the page', async () => {
    setup({ query: { tab: 'workload' } });
    await answer('workload', workload());
    expect(el().querySelector('.table-responsive table.data-table')).toBeTruthy();
    expect(el().querySelector('.metrics')).toBeNull();
  });
});
