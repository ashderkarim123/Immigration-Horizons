import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { Paginated } from '../../core/api/case.types';
import { UscisFilingActions, UscisQueueRow } from '../../core/api/uscis.types';
import { TRACKING_VIEWS, TrackingComponent } from './tracking.component';

const meta = { requestId: 'r' };
const ACTIONS: UscisFilingActions = { canEdit: true, canAddStatus: true, canArchive: true, canSync: false };

/** Shaped like a row of GET /api/v1/staff/uscis (server/services/uscisTracking.js queryFilings). */
function row(overrides: Partial<UscisQueueRow> = {}): UscisQueueRow {
  return {
    id: 'f1',
    caseId: 'case1',
    title: 'I-140 petition',
    formType: 'I-140',
    formSubType: null,
    receiptNumber: 'IOE1234567890',
    providerEligible: true,
    filedAt: null,
    receiptDate: null,
    serviceCenter: null,
    clientVisible: false,
    archived: false,
    provider: { type: 'none', enabled: false, lastCheckedAt: null, lastSuccessfulSyncAt: null, lastErrorAt: null, lastErrorCode: null },
    currentStatus: { category: 'rfe_issued', title: 'RFE mailed', description: '', occurredAt: '2026-03-10T00:00:00.000Z', source: 'manual', actionRequired: true, responseDueAt: '2020-01-01T00:00:00.000Z' },
    updatedAt: '2026-03-10T00:00:00.000Z',
    createdAt: '2026-01-05T00:00:00.000Z',
    actions: ACTIONS,
    case: { id: 'case1', caseNumber: 'IH-2026-AAA111', title: 'Alpha petition' },
    client: { displayName: 'Casey Client' },
    projectManager: { name: 'Pat Manager' },
    ...overrides,
  };
}

describe('Tracking queue', () => {
  let http: HttpTestingController;

  function setup(params: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: ActivatedRoute, useValue: { queryParams: new BehaviorSubject(params) } }],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TrackingComponent);
    fixture.detectChanges();
    return fixture;
  }

  const answer = (items: UscisQueueRow[], over: Partial<Paginated<UscisQueueRow>> = {}) =>
    http.expectOne((r) => r.url === '/api/v1/staff/uscis').flush({ data: { items, total: items.length, page: 1, totalPages: 1, pageSize: 20, ...over }, meta });

  afterEach(() => http.verify());

  it('every view is a set of server query parameters, so the server does all filtering and narrowing', () => {
    const expected: Record<string, Record<string, string>> = {
      action: { actionRequired: 'true', sort: 'due' },
      dates: { hasDue: 'true', sort: 'due' },
      recent: { sort: 'status' },
      all: { archived: 'true', sort: 'updated' },
      closed: { statusCategory: 'approved,closed', sort: 'status' },
    };
    for (const v of TRACKING_VIEWS) {
      TestBed.resetTestingModule();
      const fixture = setup({ view: v.key });
      const req = http.expectOne((r) => r.url === '/api/v1/staff/uscis');
      for (const [k, val] of Object.entries(expected[v.key])) expect(req.request.params.get(k)).toBe(val);
      expect(req.request.params.get('limit')).toBe('20');
      req.flush({ data: { items: [], total: 0, page: 1, totalPages: 1, pageSize: 20 }, meta });
      expect(fixture.componentInstance.view()).toBe(v.key);
    }
  });

  it('defaults to Action Required, falls back from an unknown view, and sends search and page', () => {
    setup({ view: 'bogus', q: 'ioe-123', page: '3' });
    const req = http.expectOne((r) => r.url === '/api/v1/staff/uscis');
    expect(req.request.params.get('actionRequired')).toBe('true');
    expect(req.request.params.get('search')).toBe('ioe-123');
    expect(req.request.params.get('page')).toBe('3');
    req.flush({ data: { items: [], total: 0, page: 3, totalPages: 3, pageSize: 20 }, meta });
  });

  it('renders case, client, form, receipt, status, due (overdue as text), source and PM; rows link to the case tab', () => {
    const fixture = setup();
    answer([row(), row({ id: 'f2', receiptNumber: null, currentStatus: null, archived: true, case: { id: 'case2', caseNumber: 'IH-2026-BBB222', title: 'Beta' } })], { total: 41, totalPages: 3 });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const first = el.querySelector('tbody tr') as HTMLElement;
    for (const t of ['IH-2026-AAA111', 'Casey Client', 'I-140', 'IOE1234567890', 'RFE mailed', 'Yes', 'Jan 1, 2020 (overdue)', 'Manual', 'Pat Manager']) expect(first.textContent).toContain(t);
    const link = first.querySelector('a.case-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/cases/case1?tab=tracking&filing=f1');
    expect(el.querySelectorAll('tbody tr')[1].textContent).toContain('(archived)');
    expect(el.querySelectorAll('tbody tr')[1].textContent).toContain('No status yet');
    expect(fixture.componentInstance.totalItems()).toBe(41);
    expect(fixture.componentInstance.totalPages()).toBe(3);
  });

  it('switching view or searching resets to page 1 and keeps state in the URL; the default view adds nothing', () => {
    const fixture = setup({ page: '4' });
    answer([]);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const c = fixture.componentInstance;

    c.setView('closed');
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { view: 'closed' } }));
    c.searchQuery.set('lin');
    c.onSearch();
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { view: 'closed', q: 'lin' } }));
    c.setView('action');
    c.searchQuery.set('');
    c.onSearch();
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: {} }));
    c.onPageChange(2);
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { page: 2 } }));
  });

  it('empty states are specific: per view, and for a search', () => {
    const fixture = setup({ view: 'dates' });
    answer([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No filings have a response due date.');

    fixture.componentInstance.searchQuery.set('zzz');
    fixture.componentInstance.load();
    answer([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No filings match your search');
  });

  it('a failed load is retryable and says why', () => {
    const fixture = setup();
    http.expectOne((r) => r.url === '/api/v1/staff/uscis').flush({ error: { code: 'forbidden', message: 'Missing capability: uscis_tracking.view' } }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(fixture.componentInstance.errorMessage()).toBe('Missing capability: uscis_tracking.view');
    expect(fixture.nativeElement.querySelector('ih-error-state')).toBeTruthy();
  });
});
