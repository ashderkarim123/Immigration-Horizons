import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { CALENDAR_KINDS, CalendarConfig, CalendarItem, CalendarResponse } from '../../../../core/api/calendar.types';
import { CalendarTabComponent } from './calendar-tab.component';

const meta = { requestId: 'r' };
const ALL_KINDS = CALENDAR_KINDS.map((k) => ({ value: k.value, label: k.label }));

function config(over: Partial<CalendarConfig> = {}): CalendarConfig {
  return {
    timeZone: { resolved: 'America/New_York', source: 'user', userValue: 'America/New_York', practice: { value: null, configured: false, invalid: false } },
    kinds: ALL_KINDS, scopes: ['mine', 'team'], canManage: true, maxRangeDays: 93, reminders: { deadlineReminders: true, appointmentReminders: true }, ...over,
  };
}

function item(over: Partial<CalendarItem> & { date?: string } = {}): CalendarItem {
  const { date = '2026-10-20', ...rest } = over;
  return {
    id: 'task:t1:dueDate', sourceType: 'task', sourceId: 't1', sourceField: 'dueDate', kind: 'task_due',
    case: { id: 'c1', caseNumber: 'IH-2026-AAA111', title: 'Alpha petition' }, title: 'Draft cover letter', description: '',
    time: { mode: 'date', date, endDate: null, startAt: null, endAt: null, timeZone: null, allDay: true },
    status: 'todo', priority: 'high', actionRequired: false, person: 'Pat Manager', link: { path: '/cases/c1', queryParams: { tab: 'tasks' } },
    clientVisible: false, actions: { canEdit: false, canCancel: false }, ...rest,
  };
}

describe('CalendarTabComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CalendarTabComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const button = (label: string) => Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

  function setup(opts: { items?: CalendarItem[]; config?: CalendarConfig; initialEventId?: string; truncated?: boolean } = {}) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CalendarTabComponent);
    const ref = fixture.componentRef as ComponentRef<CalendarTabComponent>;
    ref.setInput('caseId', 'c1');
    if (opts.initialEventId) ref.setInput('initialEventId', opts.initialEventId);
    fixture.detectChanges();
    http.expectOne('/api/v1/staff/calendar/config').flush({ data: opts.config ?? config(), meta });
    const list = http.expectOne((r) => r.url === '/api/v1/staff/calendar');
    const data: CalendarResponse = { items: opts.items ?? [], range: { from: '2026-09-30', to: '2026-12-31', timeZone: 'America/New_York' }, kinds: [], scope: 'team', truncated: opts.truncated ?? false };
    list.flush({ data, meta });
    fixture.detectChanges();
    return list.request;
  }

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('asks only for this case, for the team scope, in a window that includes recent overdue dates and ends within the 93-day limit', () => {
    const req = setup();
    expect(req.params.get('caseId')).toBe('c1');
    expect(req.params.get('scope')).toBe('team');
    expect(req.params.get('timeZone')).toBe('America/New_York');
    const from = req.params.get('from')!;
    const to = req.params.get('to')!;
    expect([from, to]).toEqual(['2026-09-30', '2026-12-31']);
    expect((Date.parse(to) - Date.parse(from)) / 86400000 + 1).toBe(93);
  });

  it('lists the case dates by day with links to the owning tab, and never an edit control for them', () => {
    setup({
      items: [
        item({ title: 'Draft cover letter' }),
        item({ id: 'document_request:d1:dueDate', sourceType: 'document_request', sourceId: 'd1', kind: 'document_due', title: 'Document due: Passport', link: { path: '/cases/c1', queryParams: { tab: 'documents' } }, date: '2026-10-22', person: null }),
        item({ id: 'uscis:f1:responseDueAt', sourceType: 'uscis', sourceId: 'f1', kind: 'uscis_response', title: 'USCIS response due: I-140', actionRequired: true, link: { path: '/cases/c1', queryParams: { tab: 'tracking', filing: 'f1' } }, date: '2026-10-27', person: null }),
      ],
    });
    expect(Array.from(el().querySelectorAll('.agenda-day')).map((h) => h.textContent?.trim())).toEqual(['Tuesday, October 20, 2026', 'Thursday, October 22, 2026', 'Tuesday, October 27, 2026']);
    const hrefs = Array.from(el().querySelectorAll('.row a[href]')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/cases/c1?tab=tasks', '/cases/c1?tab=documents', '/cases/c1?tab=tracking&filing=f1']);
    expect(text()).toContain('Action required');
    expect(text()).not.toContain('IH-2026-AAA111'); // already on the case: no case column
    expect(el().querySelectorAll('.row button').length).toBe(0);
  });

  it('flags a date-only deadline from the last two weeks as overdue, and never an appointment or event', () => {
    setup({ items: [item({ title: 'Late task', date: '2026-10-10' }), item({ id: 'manual_event:e1', sourceType: 'manual_event', sourceId: 'e1', kind: 'manual_event', title: 'Past event', date: '2026-10-10', actions: { canEdit: true, canCancel: true } })] });
    const rows = Array.from(el().querySelectorAll('.row'));
    expect(rows.find((r) => r.textContent?.includes('Late task'))?.textContent).toContain('Overdue');
    expect(rows.find((r) => r.textContent?.includes('Past event'))?.textContent).not.toContain('Overdue');
  });

  it('empty: explains what the tab is for, and only invites an event from someone who may add one', () => {
    setup();
    expect(text()).toContain('No upcoming dates');
    expect(text()).toContain('Add an event for a date that no other part of the case already tracks.');
    expect(button('Add event')).toBeTruthy();
    TestBed.resetTestingModule();
    setup({ config: config({ canManage: false }) });
    expect(text()).toContain('Nothing is due or scheduled for this case.');
    expect(text()).not.toContain('Add an event');
    expect(button('Add event')).toBeUndefined();
  });

  it('Add event opens the dialog for this case, and a saved event reloads the list', () => {
    setup();
    button('Add event')!.click();
    fixture.detectChanges();
    http.expectOne('/api/v1/staff/cases/c1/members').flush({ data: { members: [] }, meta });
    fixture.detectChanges();
    expect(text()).toContain('Add calendar event');
    expect((el().querySelector('#ev-start-date, #ev-start') as HTMLInputElement | null)).toBeTruthy();
    (el().querySelector('.btn-close') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el().querySelector('ih-calendar-event-dialog')).toBeNull();
  });

  it('a deep link from a reminder opens that event once; closing it does not reopen it', () => {
    setup({ initialEventId: 'e9' });
    const get = http.expectOne('/api/v1/staff/calendar-events/e9');
    get.flush({ error: { code: 'not_found', message: 'x' } }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(text()).toContain('This event does not exist or you no longer have access to it.');
    (el().querySelector('.btn-close') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el().querySelector('ih-calendar-event-dialog')).toBeNull();
  });

  it('clicking a manual event opens it for editing', () => {
    setup({ items: [item({ id: 'manual_event:e1', sourceType: 'manual_event', sourceId: 'e1', kind: 'manual_event', title: 'Interview prep', actions: { canEdit: true, canCancel: true } })] });
    (el().querySelector('.row button.link-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(http.expectOne('/api/v1/staff/calendar-events/e1').request.method).toBe('GET');
    http.match('/api/v1/staff/cases/c1/members');
  });

  it('warns when the server truncated the dates', () => {
    setup({ items: [item()], truncated: true });
    expect(text()).toContain('Some dates are not shown');
  });

  it('a failed load shows an error and can be retried', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CalendarTabComponent);
    (fixture.componentRef as ComponentRef<CalendarTabComponent>).setInput('caseId', 'c1');
    fixture.detectChanges();
    http.expectOne('/api/v1/staff/calendar/config').flush({ data: config(), meta });
    http.expectOne((r) => r.url === '/api/v1/staff/calendar').flush({ error: { code: 'server_error', message: 'Boom' } }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(text()).toContain('Failed to load the calendar');
    (Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.includes('Try Again')) as HTMLButtonElement).click();
    http.expectOne((r) => r.url === '/api/v1/staff/calendar').flush({ data: { items: [item({ title: 'Back again' })], range: { from: '', to: '', timeZone: 'America/New_York' }, kinds: [], scope: 'team', truncated: false }, meta });
    fixture.detectChanges();
    expect(text()).toContain('Back again');
  });
});
