import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { CaseListItem, Paginated } from '../../core/api/case.types';
import { Cases } from './cases';

const meta = { requestId: 'r' };

/** Shaped exactly like GET /api/v1/staff/cases (server/routes/api/v1/staff/cases.js). */
function item(overrides: Partial<CaseListItem> = {}): CaseListItem {
  return {
    id: '64b0f0f0f0f0f0f0f0f0f0a1',
    caseNumber: 'IH-2026-AAA111',
    title: 'Alpha petition',
    caseType: 'eb2_niw',
    currentStage: 'drafting',
    priority: 'high',
    targetFilingDate: null,
    archivedAt: null,
    updatedAt: '2026-01-01T10:00:00.000Z',
    projectManager: { id: 'pm1', name: 'Pat Manager', avatar: null },
    primaryClient: { id: 'c1', displayName: 'Casey Client', email: 'casey@example.com' },
    ...overrides,
  };
}

function page(items: CaseListItem[], overrides: Partial<Paginated<CaseListItem>> = {}): Paginated<CaseListItem> {
  return { items, total: items.length, page: 1, totalPages: 1, pageSize: 10, ...overrides };
}

describe('Cases directory', () => {
  let http: HttpTestingController;
  let queryParams: BehaviorSubject<Record<string, string>>;

  function setup(initial: Record<string, string> = {}) {
    queryParams = new BehaviorSubject(initial);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParams } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Cases);
    fixture.detectChanges();
    return fixture;
  }

  const listRequest = () => http.expectOne((r) => r.url === '/api/v1/staff/cases');

  afterEach(() => http.verify());

  it('sends the parameters Express supports: search and archived, never q or includeArchived', () => {
    setup({ q: 'alpha', archived: 'true', stage: 'drafting', priority: 'high', scope: 'mine', type: 'eb2_niw' });
    const req = listRequest();
    expect(req.request.params.get('search')).toBe('alpha');
    expect(req.request.params.get('archived')).toBe('true');
    expect(req.request.params.get('stage')).toBe('drafting');
    expect(req.request.params.get('caseType')).toBe('eb2_niw');
    expect(req.request.params.get('priority')).toBe('high');
    expect(req.request.params.get('scope')).toBe('mine');
    expect(req.request.params.has('q')).toBe(false);
    expect(req.request.params.has('includeArchived')).toBe(false);
    req.flush({ data: page([]), meta });
  });

  it('links each row by id and renders the flat pagination totals', () => {
    const fixture = setup();
    listRequest().flush({ data: page([item()], { total: 23, totalPages: 3 }), meta });
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a.case-link') as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('IH-2026-AAA111');
    expect(link.getAttribute('href')).toBe('/cases/64b0f0f0f0f0f0f0f0f0f0a1');
    expect(fixture.componentInstance.totalItems()).toBe(23);
    expect(fixture.componentInstance.totalPages()).toBe(3);
    expect(fixture.nativeElement.textContent).toContain('Casey Client');
  });

  it('shows Unassigned when a case has no primary client', () => {
    const fixture = setup();
    listRequest().flush({ data: page([item({ primaryClient: null })]), meta });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Unassigned');
  });

  it('keeps filters in the URL and resets to page 1 when a filter changes', () => {
    const fixture = setup({ page: '3' });
    listRequest().flush({ data: page([], { page: 3, totalPages: 5 }), meta });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture.componentInstance.selectedStage.set('filed');
    fixture.componentInstance.includeArchived.set(true);
    fixture.componentInstance.onFilterChange();

    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { stage: 'filed', archived: 'true' } }));
  });

  it('shows a retryable error state when the API fails', () => {
    const fixture = setup();
    listRequest().flush({ error: { code: 'server_error', message: 'Database unavailable.' } }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(fixture.componentInstance.isError()).toBe(true);
    expect(fixture.componentInstance.errorMessage()).toBe('Database unavailable.');
    expect(fixture.nativeElement.querySelector('ih-error-state')).toBeTruthy();
  });
});
