import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CaseCalendarEventDto, CreateCalendarEventInput } from '../../core/api/calendar.types';
import { CaseMember } from '../../core/api/case.types';
import { CalendarEventDialogComponent } from './calendar-event-dialog.component';

const meta = { requestId: 'r' };
const MEMBERS = '/api/v1/staff/cases/c1/members';

const member = (id: string, name: string, over: Partial<CaseMember> = {}): CaseMember => ({
  id: `m-${id}`, memberType: 'employee', workspaceRole: 'contributor', status: 'active', clientVisible: false, joinedAt: '2026-01-01T00:00:00.000Z',
  employee: { id, name, email: `${id}@ih.test`, role: 'petition_writer', avatar: null, jobTitle: '', department: '' }, client: null, ...over,
});

/** Shaped like a CaseCalendarEvent from GET /staff/calendar-events/:id (server/services/calendarEvents.js toDto). */
function event(over: Partial<CaseCalendarEventDto> = {}): CaseCalendarEventDto {
  return {
    id: 'e1', caseId: 'c1', eventType: 'appointment', title: 'Client interview prep', description: 'Internal prep notes', allDay: false,
    startDate: null, endDate: null, startAt: '2026-10-20T18:30:00.000Z', endAt: '2026-10-20T19:30:00.000Z', startLocal: '2026-10-20T14:30', endLocal: '2026-10-20T15:30',
    timeZone: 'America/New_York', location: 'Room 2', meetingUrl: 'https://meet.example.com/abc', attendees: [{ id: 'u1', name: 'Alex Writer' }],
    clientVisible: false, clientTitle: '', clientDescription: '', status: 'scheduled', actions: { canEdit: true, canCancel: true }, ...over,
  };
}

describe('CalendarEventDialogComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CalendarEventDialogComponent>;
  let saved: CaseCalendarEventDto[];
  let cancelled: CaseCalendarEventDto[];
  let closed: number;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const q = <T extends HTMLElement>(sel: string) => el().querySelector(sel) as T;
  /** ngModel writes model values to the view asynchronously; settle before reading inputs. */
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const type = async (sel: string, value: string) => {
    const input = q<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(sel);
    input.value = value;
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
    await settle();
  };
  const tick = async (checked: boolean, sel: string) => {
    const box = q<HTMLInputElement>(sel);
    box.checked = checked;
    box.dispatchEvent(new Event('change'));
    await settle();
  };
  const button = (label: string) => Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

  async function setup(opts: { eventId?: string | null; canManage?: boolean; members?: CaseMember[]; loaded?: CaseCalendarEventDto | 'missing'; defaultDate?: string } = {}) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CalendarEventDialogComponent);
    const ref = fixture.componentRef as ComponentRef<CalendarEventDialogComponent>;
    ref.setInput('caseId', 'c1');
    ref.setInput('defaultZone', 'America/New_York');
    ref.setInput('canManage', opts.canManage ?? true);
    if (opts.eventId) ref.setInput('eventId', opts.eventId);
    if (opts.defaultDate) ref.setInput('defaultDate', opts.defaultDate);
    saved = [];
    cancelled = [];
    closed = 0;
    fixture.componentInstance.saved.subscribe((e) => saved.push(e));
    fixture.componentInstance.cancelled.subscribe((e) => cancelled.push(e));
    fixture.componentInstance.closed.subscribe(() => (closed += 1));
    fixture.detectChanges();

    if (opts.eventId) {
      const get = http.expectOne(`/api/v1/staff/calendar-events/${opts.eventId}`);
      if (opts.loaded === 'missing') get.flush({ error: { code: 'not_found', message: 'Event not found.' } }, { status: 404, statusText: 'Not Found' });
      else get.flush({ data: opts.loaded ?? event(), meta });
      if (opts.loaded !== 'missing') http.expectOne(MEMBERS).flush({ data: { members: opts.members ?? [member('u1', 'Alex Writer')] }, meta });
    } else {
      http.expectOne(MEMBERS).flush({ data: { members: opts.members ?? [member('u1', 'Alex Writer')] }, meta });
    }
    await settle();
    return fixture.componentInstance;
  }

  afterEach(() => http.verify());

  it('create: sends wall-clock times with the chosen zone (the server converts them), and reports the saved event', async () => {
    await setup({ defaultDate: '2026-10-20' });
    expect(text()).toContain('Add calendar event');
    expect((q<HTMLSelectElement>('#ev-zone')).value).toBe('America/New_York');
    await type('#ev-title', '  Client interview prep  ');
    await type('#ev-type', 'interview');
    await type('#ev-start', '2026-10-20T14:30');
    await type('#ev-end', '2026-10-20T15:30');
    await type('#ev-location', 'Room 2');
    await type('#ev-url', 'https://meet.example.com/abc');
    await tick(true, 'fieldset.attendees input');
    button('Add event')!.click();

    const post = http.expectOne('/api/v1/staff/cases/c1/calendar-events');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual<CreateCalendarEventInput>({
      eventType: 'interview', title: 'Client interview prep', description: '', allDay: false, startDate: null, endDate: null,
      startLocal: '2026-10-20T14:30', endLocal: '2026-10-20T15:30', timeZone: 'America/New_York', location: 'Room 2', meetingUrl: 'https://meet.example.com/abc',
      attendeeIds: ['u1'], clientVisible: false, clientTitle: '', clientDescription: '',
    });
    post.flush({ data: event(), meta }, { status: 201, statusText: 'Created' });
    expect(saved.map((e) => e.id)).toEqual(['e1']);
  });

  it('create: an all-day event sends plain dates and no zone, so it can never shift', async () => {
    await setup({ defaultDate: '2026-10-31' });
    await tick(true, '.fields .check input');
    expect(el().querySelector('#ev-start')).toBeNull();
    expect(q<HTMLInputElement>('#ev-start-date').value).toBe('2026-10-31');
    await type('#ev-title', 'Filing window');
    await type('#ev-end-date', '2026-11-02');
    button('Add event')!.click();
    const body = http.expectOne('/api/v1/staff/cases/c1/calendar-events').request.body as CreateCalendarEventInput;
    expect([body.allDay, body.startDate, body.endDate, body.startLocal, body.endLocal, body.timeZone]).toEqual([true, '2026-10-31', '2026-11-02', null, null, null]);
  });

  it('the Add button waits for a title, and is absent for someone who may not add events', async () => {
    await setup();
    expect(button('Add event')!.disabled).toBe(true);
    await type('#ev-title', 'x');
    expect(button('Add event')!.disabled).toBe(false);
    TestBed.resetTestingModule();
    await setup({ canManage: false });
    expect(button('Add event')).toBeUndefined();
    expect(text()).toContain('You can view this event but not change it.');
    expect(el().querySelector('fieldset.fields')?.hasAttribute('disabled')).toBe(true);
  });

  it('client visibility asks for a client title, sends only client text when shared, and clears it when not', async () => {
    await setup();
    expect(el().querySelector('#ev-client-title')).toBeNull();
    // the visibility checkbox is the last top-level one in the form
    const boxes = Array.from(el().querySelectorAll('.fields > label.check input')) as HTMLInputElement[];
    const visible = boxes.at(-1)!;
    visible.checked = true;
    visible.dispatchEvent(new Event('change'));
    await settle();
    expect(q('#ev-client-title')).toBeTruthy();
    expect(text()).toContain('Internal notes, location and meeting link are not');
    await type('#ev-title', 'Prep');
    await type('#ev-client-title', 'Interview preparation');
    await type('#ev-client-desc', 'Bring your passport.');
    button('Add event')!.click();
    const shared = http.expectOne('/api/v1/staff/cases/c1/calendar-events').request.body as CreateCalendarEventInput;
    expect([shared.clientVisible, shared.clientTitle, shared.clientDescription]).toEqual([true, 'Interview preparation', 'Bring your passport.']);
  });

  it('shows the server\'s field errors beside their inputs and keeps the form open', async () => {
    await setup();
    await type('#ev-title', 'Prep');
    await type('#ev-start', '2026-10-20T14:30');
    await type('#ev-url', 'http://insecure.example.com');
    button('Add event')!.click();
    http.expectOne('/api/v1/staff/cases/c1/calendar-events').flush(
      { error: { code: 'validation_error', message: 'Please correct the highlighted fields.', fieldErrors: [{ field: 'meetingUrl', message: 'Enter a secure link starting with https://.' }, { field: 'attendeeIds', message: 'Attendees must be active members of this case.' }] } },
      { status: 422, statusText: 'Unprocessable' },
    );
    fixture.detectChanges();
    expect(text()).toContain('Please correct the highlighted fields.');
    expect(q('#ev-url').getAttribute('aria-invalid')).toBe('true');
    const errors = Array.from(el().querySelectorAll('.field-error')).map((e) => e.textContent?.trim());
    expect(errors).toContain('Enter a secure link starting with https://.');
    expect(errors).toContain('Attendees must be active members of this case.');
    expect(saved).toEqual([]);
    expect(button('Add event')!.disabled).toBe(false);
  });

  it('only active employee members are offered as attendees; clients and removed members are not', async () => {
    await setup({ members: [member('u1', 'Alex Writer'), member('u2', 'Removed Rita', { status: 'removed' }), member('c9', 'Casey Client', { memberType: 'client', employee: null, client: { id: 'cl1', displayName: 'Casey Client', email: 'c@x.test' } })] });
    expect(Array.from(el().querySelectorAll('fieldset.attendees label')).map((l) => l.textContent?.trim())).toEqual(['Alex Writer']);
  });

  it('a failure to list members does not block the event', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CalendarEventDialogComponent);
    (fixture.componentRef as ComponentRef<CalendarEventDialogComponent>).setInput('caseId', 'c1');
    (fixture.componentRef as ComponentRef<CalendarEventDialogComponent>).setInput('canManage', true);
    fixture.detectChanges();
    http.expectOne(MEMBERS).flush({ error: { code: 'server_error', message: 'x' } }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(text()).toContain('No active team members on this case yet.');
    expect(q('#ev-title')).toBeTruthy();
  });

  it('edit: loads the event ready for the editor in its own zone, saves the whole form, and reports the change', async () => {
    await setup({ eventId: 'e1' });
    expect(text()).toContain('Calendar event');
    expect(q<HTMLInputElement>('#ev-title').value).toBe('Client interview prep');
    expect(q<HTMLInputElement>('#ev-start').value).toBe('2026-10-20T14:30');
    expect(q<HTMLSelectElement>('#ev-zone').value).toBe('America/New_York');
    expect((Array.from(el().querySelectorAll('fieldset.attendees input')) as HTMLInputElement[]).map((i) => i.checked)).toEqual([true]);

    await type('#ev-title', 'Moved prep');
    await type('#ev-start', '2026-10-21T09:00');
    button('Save changes')!.click();
    const patch = http.expectOne('/api/v1/staff/calendar-events/e1');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual(expect.objectContaining({ title: 'Moved prep', startLocal: '2026-10-21T09:00', timeZone: 'America/New_York', attendeeIds: ['u1'], allDay: false }));
    patch.flush({ data: event({ title: 'Moved prep' }), meta });
    expect(saved[0].title).toBe('Moved prep');
  });

  it('edit: shows an event scheduled in a zone the list does not contain', async () => {
    await setup({ eventId: 'e1', loaded: event({ timeZone: 'Pacific/Chatham', startLocal: '2026-10-20T08:00' }) });
    expect(q<HTMLSelectElement>('#ev-zone').value).toBe('Pacific/Chatham');
  });

  it('cancel: asks for confirmation, then cancels without editing anything else', async () => {
    await setup({ eventId: 'e1' });
    button('Cancel event')!.click();
    fixture.detectChanges();
    expect(text()).toContain('cannot be restored');
    expect(http.match('/api/v1/staff/calendar-events/e1/cancel').length).toBe(0);
    const confirm = Array.from(el().querySelectorAll('ih-confirm-dialog button')).find((b) => b.textContent?.trim() === 'Cancel event') as HTMLButtonElement;
    confirm.click();
    const post = http.expectOne('/api/v1/staff/calendar-events/e1/cancel');
    expect(post.request.method).toBe('POST');
    post.flush({ data: event({ status: 'cancelled', actions: { canEdit: false, canCancel: false } }), meta });
    expect(cancelled[0].status).toBe('cancelled');
  });

  it('a cancelled event is read-only and says so; a viewer without edit rights cannot save or cancel', async () => {
    await setup({ eventId: 'e1', loaded: event({ status: 'cancelled', actions: { canEdit: false, canCancel: false } }) });
    expect(text()).toContain('This event was cancelled and can no longer be changed.');
    expect(button('Save changes')).toBeUndefined();
    expect(button('Cancel event')).toBeUndefined();
    expect(el().querySelector('fieldset.fields')?.hasAttribute('disabled')).toBe(true);
  });

  it('a missing or inaccessible event is one message, and nothing can be saved', async () => {
    await setup({ eventId: 'gone', loaded: 'missing' });
    expect(text()).toContain('This event does not exist or you no longer have access to it.');
    expect(button('Save changes')).toBeUndefined();
  });

  it('a conflict on save is shown at the top, not as a field error', async () => {
    await setup({ eventId: 'e1' });
    button('Save changes')!.click();
    http.expectOne('/api/v1/staff/calendar-events/e1').flush({ error: { code: 'invalid_state', message: 'This event was cancelled and can no longer be changed.' } }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(el().querySelector('.modal-body > .field-error')?.textContent).toContain('This event was cancelled');
  });

  it('closes from the close button and the backdrop', async () => {
    await setup();
    (q('.btn-close') as HTMLButtonElement).click();
    q('.modal-backdrop').click();
    expect(closed).toBe(2);
  });
});
