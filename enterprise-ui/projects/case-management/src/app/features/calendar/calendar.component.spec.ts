import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, ParamMap, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { CalendarConfig, CalendarItem, CalendarKind, CalendarResponse, CALENDAR_KINDS } from '../../core/api/calendar.types';
import { CalendarComponent } from './calendar.component';

const meta = { requestId: 'r' };
const CONFIG_URL = '/api/v1/staff/calendar/config';
const LIST_URL = '/api/v1/staff/calendar';
const ALL_KINDS = CALENDAR_KINDS.map((k) => ({ value: k.value, label: k.label }));

/** Shaped like GET /staff/calendar/config (server/services/calendarService.js calendarConfig). */
function config(over: Partial<CalendarConfig> = {}): CalendarConfig {
  return {
    timeZone: { resolved: 'America/New_York', source: 'user', userValue: 'America/New_York', practice: { value: null, configured: false, invalid: false } },
    kinds: ALL_KINDS,
    scopes: ['mine', 'team'],
    canManage: true,
    maxRangeDays: 93,
    reminders: { deadlineReminders: true, appointmentReminders: true },
    ...over,
  };
}

/** Shaped like an item of GET /staff/calendar. */
function task(over: Partial<CalendarItem> & { date?: string } = {}): CalendarItem {
  const { date = '2026-10-20', ...rest } = over;
  return {
    id: 'task:t1:dueDate', sourceType: 'task', sourceId: 't1', sourceField: 'dueDate', kind: 'task_due',
    case: { id: 'c1', caseNumber: 'IH-2026-AAA111', title: 'Alpha petition' }, title: 'Draft cover letter', description: '',
    time: { mode: 'date', date, endDate: null, startAt: null, endAt: null, timeZone: null, allDay: true },
    status: 'todo', priority: 'high', actionRequired: false, person: 'Pat Manager', link: { path: '/cases/c1', queryParams: { tab: 'tasks' } },
    clientVisible: false, actions: { canEdit: false, canCancel: false }, ...rest,
  };
}
const manual = (over: Partial<CalendarItem> = {}): CalendarItem => ({
  ...task({ id: 'manual_event:e1', sourceType: 'manual_event', sourceId: 'e1', sourceField: null, kind: 'manual_event', title: 'Interview prep', person: null, link: { path: '/cases/c1', queryParams: { tab: 'calendar', event: 'e1' } }, actions: { canEdit: true, canCancel: true } }),
  time: { mode: 'datetime', date: null, endDate: null, startAt: '2026-10-20T18:30:00.000Z', endAt: null, timeZone: 'America/New_York', allDay: false },
  ...over,
});

function response(items: CalendarItem[], over: Partial<CalendarResponse> = {}): CalendarResponse {
  return { items, range: { from: '2026-09-27', to: '2026-11-07', timeZone: 'America/New_York' }, kinds: ALL_KINDS.map((k) => k.value) as CalendarKind[], scope: 'mine', truncated: false, ...over };
}

describe('CalendarComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CalendarComponent>;
  let params: BehaviorSubject<ParamMap>;
  let navigate: ReturnType<typeof vi.spyOn>;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';

  function setup(opts: { query?: Record<string, string>; config?: CalendarConfig | 'forbidden'; items?: CalendarItem[]; narrow?: boolean; list?: Partial<CalendarResponse> } = {}) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    if (opts.narrow !== undefined) {
      vi.stubGlobal('matchMedia', () => ({ matches: opts.narrow, addEventListener: () => {}, removeEventListener: () => {} }));
    }
    params = new BehaviorSubject(convertToParamMap(opts.query ?? {}));
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: ActivatedRoute, useValue: { queryParamMap: params } }],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(CalendarComponent);
    fixture.detectChanges();

    const cfg = http.expectOne(CONFIG_URL);
    if (opts.config === 'forbidden') {
      cfg.flush({ error: { code: 'forbidden', message: 'Missing capability: calendar.view' } }, { status: 403, statusText: 'Forbidden' });
      fixture.detectChanges();
      return fixture.componentInstance;
    }
    cfg.flush({ data: opts.config ?? config(), meta });
    return answerList(opts.items ?? [], opts.list);
  }

  function answerList(items: CalendarItem[], list: Partial<CalendarResponse> = {}): CalendarComponent {
    const req = http.expectOne((r) => r.url === LIST_URL);
    req.flush({ data: response(items, list), meta });
    fixture.detectChanges();
    return fixture.componentInstance;
  }
  const lastList = (): TestRequest => http.expectOne((r) => r.url === LIST_URL);
  const queryOf = (req: TestRequest) => Object.fromEntries(req.request.params.keys().map((k) => [k, req.request.params.get(k)]));

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('loads the resolved zone first, then the six-week month grid in that zone, for "mine" by default', () => {
    TestBed.configureTestingModule({});
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    TestBed.resetTestingModule();
    params = new BehaviorSubject(convertToParamMap({}));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: ActivatedRoute, useValue: { queryParamMap: params } }] });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(CalendarComponent);
    fixture.detectChanges();
    expect(http.match((r) => r.url === LIST_URL).length).toBe(0); // nothing is asked for before the zone is known
    http.expectOne(CONFIG_URL).flush({ data: config(), meta });
    const req = lastList();
    expect(queryOf(req)).toEqual({ from: '2026-09-27', to: '2026-11-07', timeZone: 'America/New_York', scope: 'mine' });
    req.flush({ data: response([]), meta });
    fixture.detectChanges();
    expect(el().querySelector('h2.cal-title')?.textContent).toContain('October 2026');
  });

  it('puts a date-only task on its own day and a timed event on the day it has in the viewer zone', () => {
    setup({ items: [task({ title: 'Task on the 20th' }), manual()] });
    const cell = (iso: string) => Array.from(el().querySelectorAll('table.month td')).find((td) => td.querySelector('button')?.getAttribute('aria-label')?.startsWith(iso))!;
    // 18:30Z is 2:30 PM EDT on Oct 20 in New York.
    expect(cell('Tuesday, October 20, 2026').textContent).toContain('Task on the 20th');
    expect(cell('Tuesday, October 20, 2026').textContent).toContain('Interview prep');
    expect(cell('Tuesday, October 20, 2026').querySelector('button')?.getAttribute('aria-label')).toContain('2 items');
    expect(cell('Wednesday, October 21, 2026').textContent).not.toContain('Interview prep');
  });

  it('in Tokyo the same timed event moves to the next day while the date-only task does not', () => {
    setup({ config: config({ timeZone: { resolved: 'Asia/Tokyo', source: 'user', userValue: 'Asia/Tokyo', practice: { value: null, configured: false, invalid: false } } }), items: [task({ title: 'Task on the 20th' }), manual()] });
    const cell = (iso: string) => Array.from(el().querySelectorAll('table.month td')).find((td) => td.querySelector('button')?.getAttribute('aria-label')?.startsWith(iso))!;
    expect(cell('Tuesday, October 20, 2026').textContent).toContain('Task on the 20th');
    expect(cell('Tuesday, October 20, 2026').textContent).not.toContain('Interview prep');
    expect(cell('Wednesday, October 21, 2026').textContent).toContain('Interview prep');
  });

  it('marks today, shows the weekday header as columns and caps a busy day with a count', () => {
    setup({ items: Array.from({ length: 5 }, (_, i) => task({ id: `task:${i}:dueDate`, sourceId: String(i), title: `Task ${i}`, date: '2026-10-14' })) });
    const headers = Array.from(el().querySelectorAll('table.month th')).map((h) => h.getAttribute('scope'));
    expect(headers).toEqual(Array(7).fill('col'));
    expect(el().querySelector('td.today button')?.getAttribute('aria-current')).toBe('date');
    expect(el().querySelector('td.today')?.textContent).toContain('+2 more');
    expect(el().querySelectorAll('table.month tbody tr').length).toBe(6);
  });

  it('selecting a day writes it to the URL; the day panel lists its items with links to the owning module', () => {
    setup({ items: [task({ title: 'Draft cover letter' })] });
    (Array.from(el().querySelectorAll('table.month button')).find((b) => b.getAttribute('aria-label')?.startsWith('Tuesday, October 20')) as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: expect.objectContaining({ day: '2026-10-20' }) }));

    params.next(convertToParamMap({ day: '2026-10-20' }));
    answerList([task({ title: 'Draft cover letter' })]);
    const panel = el().querySelector('.day-panel')!;
    expect(panel.querySelector('h3')?.textContent).toContain('Tuesday, October 20, 2026');
    const link = panel.querySelector('a[href]') as HTMLAnchorElement;
    expect(link.textContent).toContain('Draft cover letter');
    expect(link.getAttribute('href')).toBe('/cases/c1?tab=tasks');
    expect(panel.textContent).toContain('All day');
    expect(panel.textContent).toContain('IH-2026-AAA111');
  });


  it('sends those filters on the request', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    params = new BehaviorSubject(convertToParamMap({ view: 'agenda', month: '2026-11', scope: 'team', kinds: 'task_due,uscis_response', completed: '1', caseId: 'c1' }));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: ActivatedRoute, useValue: { queryParamMap: params } }] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CalendarComponent);
    fixture.detectChanges();
    http.expectOne(CONFIG_URL).flush({ data: config(), meta });
    const req = lastList();
    expect(queryOf(req)).toEqual({ from: '2026-11-01', to: '2026-12-12', timeZone: 'America/New_York', scope: 'team', kinds: 'task_due,uscis_response', caseId: 'c1', includeCompleted: 'true' });
    req.flush({ data: response([task({ title: 'Agenda task' }), task({ id: 'task:t2:dueDate', sourceId: 't2', title: 'Later task', date: '2026-11-18' })]), meta });
    fixture.detectChanges();
    expect(el().querySelector('table.month')).toBeNull();
    expect(Array.from(el().querySelectorAll('.agenda-day')).map((h) => h.textContent?.trim())).toEqual(['Wednesday, November 18, 2026']);
    expect(el().querySelector('[aria-pressed="true"]')?.textContent).toContain('Agenda');
  });

  it('each control writes the URL: view, month navigation, scope, a kind, completed, and clearing the case filter', () => {
    setup({ items: [] });
    const clickText = (label: string) => (Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label) as HTMLButtonElement).click();
    const last = () => navigate.mock.calls.at(-1)![1] as { queryParams: Record<string, string | null> };

    clickText('Agenda');
    expect(last().queryParams['view']).toBe('agenda');
    clickText('Next month');
    expect(last().queryParams['month']).toBe('2026-11');
    clickText('Previous month');
    expect(last().queryParams['month']).toBe('2026-09');
    clickText('Today');
    expect(last().queryParams).toEqual(expect.objectContaining({ day: '2026-10-14' }));

    const scope = el().querySelector('#cal-scope') as HTMLSelectElement;
    scope.value = 'team';
    scope.dispatchEvent(new Event('change'));
    expect(last().queryParams['scope']).toBe('team');

    const kinds = Array.from(el().querySelectorAll('fieldset.kinds input')) as HTMLInputElement[];
    expect(kinds.length).toBe(ALL_KINDS.length);
    expect(kinds.every((k) => k.checked)).toBe(true);
    kinds[0].checked = false;
    kinds[0].dispatchEvent(new Event('change'));
    expect(last().queryParams['kinds']).toBe(ALL_KINDS.slice(1).map((k) => k.value).join(','));

    const completed = Array.from(el().querySelectorAll('.filters-bar input[type=checkbox]')).find((i) => i.parentElement?.textContent?.includes('Include completed')) as HTMLInputElement;
    completed.checked = true;
    completed.dispatchEvent(new Event('change'));
    expect(last().queryParams['completed']).toBe('1');
  });

  it('only the kinds the server allows are offered', () => {
    setup({ config: config({ kinds: [{ value: 'task_due', label: 'Tasks' }, { value: 'document_due', label: 'Document deadlines' }], canManage: false }) });
    expect(Array.from(el().querySelectorAll('fieldset.kinds label')).map((l) => l.textContent?.trim())).toEqual(['Tasks', 'Document deadlines']);
  });

  it('opening a manual event shows the event dialog; other items are links, never buttons that edit', () => {
    setup({ query: { view: 'agenda' }, items: [task({ title: 'A task' }), manual()] });
    expect(el().querySelectorAll('.row button.link-btn').length).toBe(1);
    expect(el().querySelectorAll('.row a[href]').length).toBeGreaterThanOrEqual(1);
    (el().querySelector('.row button.link-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    const dialogRequest = http.expectOne('/api/v1/staff/calendar-events/e1');
    expect(dialogRequest.request.method).toBe('GET');
    dialogRequest.flush({ error: { code: 'not_found', message: 'x' } }, { status: 404, statusText: 'Not Found' });
    http.match('/api/v1/staff/cases/c1/members');
    fixture.detectChanges();
    expect(text()).toContain('This event does not exist or you no longer have access to it.');
  });

  it('shows a clear message when nothing falls in the month, depending on scope', () => {
    setup({ items: [] });
    expect(text()).toContain('No dates this month');
    expect(text()).toContain('Try "Everything I can see"');
  });

  it('warns when the server truncated a source', () => {
    setup({ items: [task()], list: { truncated: true } });
    expect(text()).toContain('Some dates are not shown');
  });

  it('a person without the capability sees a non-retryable message, not a calendar', () => {
    setup({ config: 'forbidden' });
    expect(text()).toContain('Calendar not available');
    expect(text()).toContain('You do not have access to the calendar.');
    expect(el().querySelector('table.month')).toBeNull();
    expect(Array.from(el().querySelectorAll('button')).map((b) => b.textContent?.trim())).not.toContain('Try Again');
  });

  it('a failed load can be retried', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    params = new BehaviorSubject(convertToParamMap({}));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: ActivatedRoute, useValue: { queryParamMap: params } }] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CalendarComponent);
    fixture.detectChanges();
    http.expectOne(CONFIG_URL).flush({ data: config(), meta });
    lastList().flush({ error: { code: 'server_error', message: 'Boom' } }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(text()).toContain('Failed to load the calendar');
    (Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.includes('Try Again')) as HTMLButtonElement).click();
    answerList([task()]);
    expect(text()).not.toContain('Failed to load the calendar');
  });

  it('a narrow screen shows the Agenda instead of the month grid', () => {
    setup({ narrow: true, items: [task({ title: 'On a phone', date: '2026-10-20' })] });
    expect(el().querySelector('table.month')).toBeNull();
    expect(el().querySelector('.agenda')?.textContent).toContain('On a phone');
    expect((Array.from(el().querySelectorAll('.btn-group button')).find((b) => b.textContent?.trim() === 'Month') as HTMLButtonElement).disabled).toBe(true);
  });

  describe('time zone and reminder settings', () => {
    const open = () => {
      (Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.includes('Time zone & reminders')) as HTMLButtonElement).click();
      fixture.detectChanges();
    };

    it('says which zone is in use and why, and that date-only deadlines never move', () => {
      setup({ items: [] });
      open();
      expect(text()).toContain('America/New_York');
      expect(text()).toContain('your saved time zone');
      expect(text()).toContain('never move when you change zone');
    });

    it('falls back visibly: with no zone anywhere it says UTC and that no practice zone is configured', () => {
      setup({ config: config({ timeZone: { resolved: 'UTC', source: 'utc', userValue: null, practice: { value: null, configured: false, invalid: false } } }), items: [] });
      open();
      expect(text()).toContain('UTC (no time zone has been set)');
      expect(text()).toContain('No practice time zone is configured');
    });

    it('names the practice zone when that is what applies, and flags an invalid practice setting', () => {
      setup({ config: config({ timeZone: { resolved: 'America/Chicago', source: 'practice', userValue: null, practice: { value: 'America/Chicago', configured: true, invalid: false } } }), items: [] });
      open();
      expect(text()).toContain("the practice's default time zone");
      expect(text()).not.toContain('No practice time zone is configured');
    });

    it('saves the chosen zone and reminder switches, then reloads the calendar in the new zone', () => {
      setup({ items: [manual()] });
      open();
      const zone = el().querySelector('#pref-zone') as HTMLSelectElement;
      zone.value = 'Asia/Karachi';
      zone.dispatchEvent(new Event('change'));
      const [deadline] = Array.from(el().querySelectorAll('.reminders input')) as HTMLInputElement[];
      deadline.checked = false;
      deadline.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      (Array.from(el().querySelectorAll('#calendar-settings button')).find((b) => b.textContent?.trim() === 'Save') as HTMLButtonElement).click();

      const patch = http.expectOne('/api/v1/staff/calendar/preferences');
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body).toEqual({ timeZone: 'Asia/Karachi', deadlineReminders: false, appointmentReminders: true });
      patch.flush({ data: config({ timeZone: { resolved: 'Asia/Karachi', source: 'user', userValue: 'Asia/Karachi', practice: { value: null, configured: false, invalid: false } }, reminders: { deadlineReminders: false, appointmentReminders: true } }), meta });
      const reload = lastList();
      expect(reload.request.params.get('timeZone')).toBe('Asia/Karachi');
      reload.flush({ data: response([manual()], { range: { from: '2026-09-27', to: '2026-11-07', timeZone: 'Asia/Karachi' } }), meta });
      fixture.detectChanges();
      // 18:30Z is 11:30 PM the same day in Karachi.
      expect(text()).toContain('Asia/Karachi');
    });

    it('shows the server\'s validation message beside the zone field', () => {
      setup({ items: [] });
      open();
      (Array.from(el().querySelectorAll('#calendar-settings button')).find((b) => b.textContent?.trim() === 'Save') as HTMLButtonElement).click();
      http.expectOne('/api/v1/staff/calendar/preferences').flush({ error: { code: 'validation_error', message: 'Please correct the highlighted fields.', fieldErrors: [{ field: 'timeZone', message: 'Choose a time zone such as America/New_York.' }] } }, { status: 422, statusText: 'Unprocessable' });
      fixture.detectChanges();
      expect(el().querySelector('#calendar-settings .field-error')?.textContent).toContain('Choose a time zone such as America/New_York.');
    });
  });
});
