import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, ParamMap, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { SearchGroup, SearchResult, SearchType } from '../../core/api/search.types';
import { SearchPageComponent } from './search-page.component';

const meta = { requestId: 'r' };
const SEARCH = '/api/v1/staff/search';
const ALL: { type: SearchType; label: string }[] = [
  { type: 'cases', label: 'Cases' }, { type: 'tasks', label: 'Tasks' }, { type: 'documents', label: 'Documents' },
];

function result(over: Partial<SearchResult> = {}): SearchResult {
  return {
    type: 'cases', id: 'c1', title: 'Alpha petition', subtitle: 'IH-2026-ALPHA1', statusLabel: 'Drafting', case: { id: 'c1', caseNumber: 'IH-2026-ALPHA1', title: 'Alpha petition' },
    context: ['EB-2 NIW'], updatedAt: null, href: '/cases/c1', match: { field: 'Case number', quality: 'exact' }, ...over,
  };
}
const group = (type: SearchType, label: string, items: SearchResult[], hasMore = false): SearchGroup => ({ type, label, items, hasMore });

describe('SearchPageComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<SearchPageComponent>;
  let params: BehaviorSubject<ParamMap>;
  let navigate: ReturnType<typeof vi.spyOn>;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const queryOf = (r: TestRequest) => Object.fromEntries(r.request.params.keys().map((k) => [k, r.request.params.get(k)]));

  function setup(query: Record<string, string>) {
    params = new BehaviorSubject(convertToParamMap(query));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: ActivatedRoute, useValue: { queryParamMap: params } }] });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(SearchPageComponent);
    fixture.detectChanges();
  }
  const answer = (groups: SearchGroup[], over: { types?: typeof ALL; unavailable?: SearchType[]; page?: number } = {}) => {
    const req = http.expectOne((r) => r.url === SEARCH);
    req.flush({ data: { groups, availableTypes: over.types ?? ALL, ...(over.page ? { page: over.page, pageSize: 25 } : {}) }, meta: { ...meta, unavailableTypes: over.unavailable ?? [] } });
    fixture.detectChanges();
    return req;
  };

  /** ngModel writes values to the view asynchronously; settle before reading or typing into inputs. */
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  afterEach(() => http.verify());

  it('a missing or one-character query sends nothing and says what is needed', () => {
    setup({});
    http.expectNone(SEARCH);
    expect(text()).toContain('Enter at least 2 characters to search.');
    params.next(convertToParamMap({ q: 'a' }));
    fixture.detectChanges();
    http.expectNone(SEARCH);
  });

  it('the URL is the state: q loads grouped results with a larger per-source limit and links to the owning pages', async () => {
    setup({ q: 'alpha' });
    const req = answer([
      group('cases', 'Cases', [result()], true),
      group('tasks', 'Tasks', [result({ type: 'tasks', id: 't1', title: 'Draft letter', subtitle: 'Evidence Review', href: '/cases/c1?tab=tasks', statusLabel: 'Todo' })]),
    ]);
    expect(queryOf(req)).toEqual({ q: 'alpha', limit: '10' });
    await settle();
    expect(el().querySelector<HTMLInputElement>('#page-search-input')?.value).toBe('alpha');
    expect(Array.from(el().querySelectorAll('.group-title')).map((h) => h.textContent)).toEqual(['Cases', 'Tasks']);
    const links = Array.from(el().querySelectorAll('.result-main')).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/cases/c1', '/cases/c1?tab=tasks']);
    expect(text()).toContain('Show all cases results');
    expect(text()).toContain('Task');
    expect(text()).toContain('Case IH-2026-ALPHA1');
  });

  it('only the sources the server offers appear as filters, and a source can be chosen from the list', () => {
    setup({ q: 'alpha' });
    answer([group('cases', 'Cases', [result()])], { types: [{ type: 'cases', label: 'Cases' }, { type: 'tasks', label: 'Tasks' }] });
    const chips = Array.from(el().querySelectorAll('nav.filters a')).map((a) => a.textContent?.trim());
    expect(chips).toEqual(['All sources', 'Cases', 'Tasks']);
    expect(chips).not.toContain('Clients');
    expect(chips).not.toContain('Documents');
    expect(el().querySelector('nav.filters a.on')?.textContent).toContain('All sources');
    const tasksChip = Array.from(el().querySelectorAll('nav.filters a')).find((a) => a.textContent?.trim() === 'Tasks')!;
    expect(tasksChip.getAttribute('href')).toBe('/search?q=alpha&type=tasks');
  });

  it('one source shows its full results, paginated by the server, with the page in the URL', () => {
    setup({ q: 'noise', type: 'tasks', page: '2' });
    const req = answer([group('tasks', 'Tasks', [result({ type: 'tasks', id: 't30', title: 'Noise 30', href: '/cases/c1?tab=tasks' })], true)], { page: 2 });
    expect(queryOf(req)).toEqual({ q: 'noise', type: 'tasks', page: '2', limit: '25' });
    expect(el().querySelector('nav.filters a.on')?.textContent).toContain('Tasks');
    expect(text()).toContain('Page 2');

    const buttons = Array.from(el().querySelectorAll('nav.pager button')) as HTMLButtonElement[];
    expect(buttons.map((b) => [b.textContent?.trim(), b.disabled])).toEqual([['Previous', false], ['Next', false]]);
    buttons[1].click();
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { q: 'noise', type: 'tasks', page: 3 } }));
    buttons[0].click();
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { q: 'noise', type: 'tasks', page: null } }));
  });

  it('Next is disabled on the last page and Previous on the first', () => {
    setup({ q: 'noise', type: 'tasks' });
    answer([group('tasks', 'Tasks', [result({ type: 'tasks' })], false)], { page: 1 });
    const [prev, next] = Array.from(el().querySelectorAll('nav.pager button')) as HTMLButtonElement[];
    expect([prev.disabled, next.disabled]).toEqual([true, true]);
  });

  it('back and forward: a changed URL loads the new search', async () => {
    setup({ q: 'alpha' });
    answer([group('cases', 'Cases', [result()])]);
    params.next(convertToParamMap({ q: 'beta' }));
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === SEARCH);
    expect(req.request.params.get('q')).toBe('beta');
    req.flush({ data: { groups: [group('cases', 'Cases', [result({ id: 'c9', title: 'Beta case' })])], availableTypes: ALL }, meta: { ...meta, unavailableTypes: [] } });
    await settle();
    expect(text()).toContain('Beta case');
    expect(el().querySelector<HTMLInputElement>('#page-search-input')?.value).toBe('beta');
  });

  it('submitting the form writes the query to the URL, keeping the chosen source', async () => {
    setup({ q: 'alpha', type: 'tasks' });
    answer([]);
    await settle();
    const input = el().querySelector<HTMLInputElement>('#page-search-input')!;
    input.value = '  gamma ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    (el().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { q: 'gamma', type: 'tasks', page: null } }));
  });

  it('shows no-results, an error that can be retried, and unavailable sources', () => {
    setup({ q: 'zzzz' });
    answer([]);
    expect(text()).toContain('No results');

    params.next(convertToParamMap({ q: 'boom' }));
    fixture.detectChanges();
    http.expectOne((r) => r.url === SEARCH).flush({ error: { code: 'server_error', message: 'Search is down.' } }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(text()).toContain('Search failed');
    expect(text()).toContain('Search is down.');
    (Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.includes('Try Again')) as HTMLButtonElement).click();
    answer([group('cases', 'Cases', [result()])], { unavailable: ['documents'] });
    expect(text()).toContain('These sources could not be searched right now: Documents');
    expect(text()).toContain('Alpha petition');
  });

  it('a source the actor may not search is explained, not shown as empty', () => {
    setup({ q: 'alpha', type: 'clients' });
    http.expectOne((r) => r.url === SEARCH).flush({ error: { code: 'forbidden', message: 'You cannot search that type.' } }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(text()).toContain('You cannot search that type.');
    expect(text()).not.toContain('No results');
  });

  it('says plainly what is not searched, and ignores an unsafe link from the server', () => {
    setup({ q: 'alpha' });
    answer([group('cases', 'Cases', [result({ href: 'https://evil.example/x' })])]);
    expect(text()).toContain('It does not search inside documents, messages, form answers, petition text or internal notes.');
    expect(el().querySelector('.result-main')?.getAttribute('href')).toBe('/search');
  });
});
