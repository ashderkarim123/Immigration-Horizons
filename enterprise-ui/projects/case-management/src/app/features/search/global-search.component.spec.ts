import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { SearchGroup, SearchResult, SearchType } from '../../core/api/search.types';
import { GlobalSearchComponent } from './global-search.component';

const meta = { requestId: 'r' };
const SEARCH = '/api/v1/staff/search';

/** Shaped like a result from GET /staff/search (server/services/search/index.js toResult). */
function result(over: Partial<SearchResult> = {}): SearchResult {
  return {
    type: 'cases', id: 'c1', title: 'Alpha petition', subtitle: 'IH-2026-ALPHA1', statusLabel: 'Drafting', case: { id: 'c1', caseNumber: 'IH-2026-ALPHA1', title: 'Alpha petition' },
    context: ['EB-2 NIW'], updatedAt: '2026-10-01T00:00:00.000Z', href: '/cases/c1', match: { field: 'Case number', quality: 'exact' }, ...over,
  };
}
const group = (type: SearchType, label: string, items: SearchResult[], hasMore = false): SearchGroup => ({ type, label, items, hasMore });

describe('GlobalSearchComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<GlobalSearchComponent>;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;
  let navigate: ReturnType<typeof vi.spyOn>;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const q = <T extends HTMLElement>(sel: string) => el().querySelector(sel) as T;
  const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    fixture.detectChanges();
    return e;
  };

  function setup() {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(GlobalSearchComponent);
    fixture.detectChanges();
  }

  /** Opens the palette and types a query through the real input. */
  async function type(value: string) {
    const input = q<HTMLInputElement>('#ih-search-input');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  const settleDebounce = () => {
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
  };
  const answer = (groups: SearchGroup[], unavailableTypes: SearchType[] = []) => {
    http.expectOne((r) => r.url === SEARCH).flush({ data: { groups, availableTypes: groups.map((g) => ({ type: g.type, label: g.label })) }, meta: { ...meta, unavailableTypes } });
    fixture.detectChanges();
  };
  const options = () => Array.from(el().querySelectorAll('[role=option]'));

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('opens with Ctrl+K and Cmd+K, focuses the input, and closes with Escape, returning focus to the trigger', async () => {
    setup();
    const trigger = q<HTMLButtonElement>('.search-trigger');
    trigger.focus();
    expect(q('[role=dialog]')).toBeNull();

    const e = press('k', { ctrlKey: true });
    await fixture.whenStable();
    expect(e.defaultPrevented).toBe(true);
    expect(q('[role=dialog]')?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(q('#ih-search-input'));
    expect(q('#ih-search-input').getAttribute('role')).toBe('combobox');

    press('Escape', {}, q('[role=dialog]'));
    expect(q('[role=dialog]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    press('k', { metaKey: true });
    expect(q('[role=dialog]')).toBeTruthy();
    press('k', { metaKey: true });
    expect(q('[role=dialog]')).toBeNull();
    press('k', {}); // a bare K does nothing
    expect(q('[role=dialog]')).toBeNull();
    http.expectNone(SEARCH);
  });

  it('opens from the header button too, and the button advertises its shortcut', () => {
    setup();
    expect(q('.search-trigger').getAttribute('aria-keyshortcuts')).toBe('Control+K Meta+K');
    q<HTMLButtonElement>('.search-trigger').click();
    fixture.detectChanges();
    expect(q('[role=dialog]')).toBeTruthy();
    expect(text()).toContain('Type at least 2 characters');
  });

  it('sends nothing below two characters, and waits for a pause in typing before searching', async () => {
    setup();
    press('k', { ctrlKey: true });
    await type('a');
    vi.advanceTimersByTime(1000);
    http.expectNone(SEARCH);
    expect(text()).toContain('Type at least 2 characters');

    await type('al');
    expect(text()).toContain('Searching');
    vi.advanceTimersByTime(299);
    http.expectNone(SEARCH);
    await type('alp');
    vi.advanceTimersByTime(299);
    http.expectNone(SEARCH);
    settleDebounce();
    const req = http.expectOne((r) => r.url === SEARCH);
    expect([req.request.params.get('q'), req.request.params.get('limit')]).toEqual(['alp', '5']);
    req.flush({ data: { groups: [], availableTypes: [] }, meta: { ...meta, unavailableTypes: [] } });
  });

  it('shows grouped real results with the type named in words, and renders text as text', async () => {
    setup();
    press('k', { ctrlKey: true });
    await type('alpha');
    settleDebounce();
    answer([
      group('cases', 'Cases', [result({ title: '<b>Alpha</b> petition' })], true),
      group('documents', 'Documents', [result({ type: 'documents', id: 'd1', title: 'Alpha passport', subtitle: 'alpha.pdf', statusLabel: 'Pending review', href: '/documents/d1' })]),
    ]);
    expect(Array.from(el().querySelectorAll('.group-title')).map((g) => g.textContent?.trim())).toEqual(['Cases · more in full results', 'Documents']);
    expect(options().length).toBe(2);
    expect(options()[0].textContent).toContain('Case');
    expect(options()[1].textContent).toContain('Document');
    expect(options()[1].textContent).toContain('Pending review');
    expect(options()[0].textContent).toContain('<b>Alpha</b> petition');
    expect(q('.option-title b')).toBeNull();
    expect(q('[role=listbox]')).toBeTruthy();
    expect(q('[role=group]')?.getAttribute('aria-labelledby')).toBe('ih-search-group-cases');
  });

  it('arrow keys move the active option, wrap around, and Enter opens it', async () => {
    setup();
    press('k', { ctrlKey: true });
    await type('alpha');
    settleDebounce();
    answer([group('cases', 'Cases', [result()]), group('tasks', 'Tasks', [result({ type: 'tasks', id: 't1', title: 'Draft letter', href: '/cases/c1?tab=tasks' })])]);
    const input = q<HTMLInputElement>('#ih-search-input');
    const active = () => options().findIndex((o) => o.getAttribute('aria-selected') === 'true');
    expect(active()).toBe(0);
    expect(input.getAttribute('aria-activedescendant')).toBe('ih-search-opt-0');
    press('ArrowDown', {}, input);
    expect([active(), input.getAttribute('aria-activedescendant')]).toEqual([1, 'ih-search-opt-1']);
    press('ArrowDown', {}, input);
    expect(active()).toBe(0);
    press('ArrowUp', {}, input);
    expect(active()).toBe(1);
    press('Enter', {}, input);
    expect(navigateByUrl).toHaveBeenCalledWith('/cases/c1?tab=tasks');
    expect(q('[role=dialog]')).toBeNull();
  });

  it('clicking a result opens it; an href that is not a plain in-app path is never followed', async () => {
    setup();
    press('k', { ctrlKey: true });
    await type('alpha');
    settleDebounce();
    answer([group('cases', 'Cases', [result({ title: 'Evil', href: 'https://evil.example/phish' }), result({ id: 'c2', title: 'Also evil', href: '//evil.example' }), result({ id: 'c3', title: 'Fine', href: '/cases/c3' })])]);
    (options()[0] as HTMLElement).click();
    (options()[1] as HTMLElement).click();
    expect(navigateByUrl).not.toHaveBeenCalled();
    (options()[2] as HTMLElement).click();
    expect(navigateByUrl).toHaveBeenCalledWith('/cases/c3');
  });

  it('shows no-results, an error, and sources that could not be searched', async () => {
    setup();
    press('k', { ctrlKey: true });
    await type('zzzz');
    settleDebounce();
    answer([]);
    expect(text()).toContain('No results.');
    expect(q('[role=listbox]')).toBeNull();

    await type('boom');
    settleDebounce();
    http.expectOne((r) => r.url === SEARCH).flush({ error: { code: 'server_error', message: 'Search is down.' } }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(q('[role=alert]')?.textContent).toContain('Search is down.');

    await type('rate');
    settleDebounce();
    http.expectOne((r) => r.url === SEARCH).flush({ error: { code: 'rate_limited', message: 'x' } }, { status: 429, statusText: 'Too Many Requests' });
    fixture.detectChanges();
    expect(q('[role=alert]')?.textContent).toContain('Too many searches');

    await type('partial');
    settleDebounce();
    answer([group('cases', 'Cases', [result()])], ['documents']);
    expect(text()).toContain('These sources could not be searched right now: Documents');
    expect(options().length).toBe(1);
  });

  it('a newer search replaces an older one in flight, so stale results never appear', async () => {
    setup();
    press('k', { ctrlKey: true });
    await type('first');
    settleDebounce();
    const first = http.expectOne((r) => r.url === SEARCH);
    await type('second');
    settleDebounce();
    const second = http.expectOne((r) => r.url === SEARCH);
    expect(first.cancelled).toBe(true);
    second.flush({ data: { groups: [group('cases', 'Cases', [result({ title: 'Second result' })])], availableTypes: [] }, meta: { ...meta, unavailableTypes: [] } });
    fixture.detectChanges();
    expect(text()).toContain('Second result');
  });

  it('View all results goes to the full page with the query; Enter with no results does too', async () => {
    setup();
    press('k', { ctrlKey: true });
    await type('  alpha ');
    settleDebounce();
    answer([group('cases', 'Cases', [result()])]);
    const link = q<HTMLAnchorElement>('.view-all');
    expect(link.getAttribute('href')).toBe('/search?q=alpha');

    await type('nothing here');
    settleDebounce();
    answer([]);
    press('Enter', {}, q('#ih-search-input'));
    expect(navigate).toHaveBeenCalledWith(['/search'], { queryParams: { q: 'nothing here' } });
    expect(q('[role=dialog]')).toBeNull();
  });

  it('keeps no history: reopening starts empty and nothing is stored', async () => {
    setup();
    press('k', { ctrlKey: true });
    await type('alpha');
    settleDebounce();
    answer([group('cases', 'Cases', [result()])]);
    press('Escape', {}, q('[role=dialog]'));
    press('k', { ctrlKey: true });
    await fixture.whenStable();
    expect(q<HTMLInputElement>('#ih-search-input').value).toBe('');
    expect(options().length).toBe(0);
    expect(text()).not.toContain('Alpha petition');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('Tab stays inside the dialog', async () => {
    setup();
    press('k', { ctrlKey: true });
    await type('alpha');
    settleDebounce();
    answer([group('cases', 'Cases', [result()])]);
    const dialog = q('[role=dialog]');
    const close = q<HTMLButtonElement>('.palette-close');
    const link = q<HTMLAnchorElement>('.view-all');
    link.focus();
    const forward = press('Tab', {}, dialog);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(q('#ih-search-input'));
    q<HTMLInputElement>('#ih-search-input').focus();
    const back = press('Tab', { shiftKey: true }, dialog);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(link);
    expect(close).toBeTruthy();
  });
});
