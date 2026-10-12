import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, ParamMap, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { MailCaseLink, MailListItem, MailMessage, MailStatus } from '../../core/api/mail.types';
import { MailComponent } from './mail.component';
import { parseAddresses } from './mail-compose.component';

const meta = { requestId: 'r' };
const BASE = '/api/v1/staff/mail';
const item = (over: Partial<MailListItem> = {}): MailListItem => ({
  id: 'AAMk-1=', subject: 'Question about my petition', from: { name: 'Alex Applicant', address: 'alex@example.com' }, to: [{ name: '', address: 'info@immigrationhorizons.com' }],
  receivedAt: '2026-10-01T12:00:00.000Z', sentAt: null, isRead: false, hasAttachments: false, important: false, preview: 'Hello, I have a question', linkCount: 0, ...over,
});
const message = (over: Partial<MailMessage> = {}): MailMessage => ({
  ...item(), cc: [], bodyType: 'html', body: '<p>Hello <b>team</b></p>', attachments: [], links: [], hiddenLinkCount: 0, ...over,
});
const link: MailCaseLink = { id: 'l1', messageId: 'AAMk-1=', caseId: 'c1', subject: 'Question about my petition', from: { name: 'Alex', address: 'alex@example.com' }, messageDate: null, linkedByName: 'Pat PM', linkedAt: '2026-10-02T00:00:00.000Z' };
const status = (over: Partial<MailStatus> = {}): MailStatus => ({ configured: true, mailbox: 'info@immigrationhorizons.com', canSend: true, ...over });

describe('MailComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<MailComponent>;
  let params: BehaviorSubject<ParamMap>;
  let navigate: ReturnType<typeof vi.spyOn>;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => (el().textContent ?? '').replace(/\s+/g, ' ');
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  const reply = async (path: string, data: unknown, match: (m: string) => boolean = () => true) => {
    const req = http.expectOne((r) => r.url === BASE + path && match(r.method));
    req.flush({ data, meta });
    await settle();
    return req;
  };
  const button = (label: string, scope: ParentNode = el()) => Array.from(scope.querySelectorAll<HTMLElement>('button, a')).find((b) => (b.textContent ?? '').trim().startsWith(label));
  const click = async (label: string, scope: ParentNode = el()) => { const b = button(label, scope); if (!b) throw new Error(`no button: ${label}`); b.click(); await settle(); };

  async function mount(query: Record<string, string> = {}, s: MailStatus = status(), list: MailListItem[] = [item()]) {
    params = new BehaviorSubject(convertToParamMap(query));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: ActivatedRoute, useValue: { queryParamMap: params } }] });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(MailComponent);
    fixture.detectChanges();
    await reply('/status', s);
    if (s.configured) await reply('/messages', { items: list, page: 1, limit: 20, hasMore: false, folder: 'inbox' });
  }
  afterEach(() => http.verify());

  it('says plainly when the mailbox is not connected, and loads no messages', async () => {
    await mount({}, status({ configured: false, mailbox: null }));
    expect(text()).toContain('The shared mailbox is not connected yet');
    http.expectNone(BASE + '/messages');
    expect(button('New message')).toBeUndefined();
  });

  it('lists messages with unread state spoken as well as styled, and attachment and link flags', async () => {
    await mount({}, status(), [item({ hasAttachments: true, linkCount: 2 }), item({ id: 'AAMk-2=', subject: 'Read one', isRead: true })]);
    const rows = Array.from(el().querySelectorAll('.row'));
    expect(rows).toHaveLength(2);
    expect(rows[0].classList.contains('unread')).toBe(true);
    expect(rows[0].textContent).toContain('(unread)');
    expect(rows[0].textContent).toContain('Attachment');
    expect(rows[0].textContent).toContain('Linked to 2 cases');
    expect(rows[1].textContent).not.toContain('(unread)');
    expect(text()).toContain('Shared mailbox: info@immigrationhorizons.com');
  });

  it('opens a message from the address, shows who it is from, renders the server-sanitized body and marks it read', async () => {
    await mount({ message: 'AAMk-1=' });
    await reply('/messages/AAMk-1%3D', message(), (m) => m === 'GET');
    expect(el().querySelector('h2')?.textContent).toBe('Question about my petition');
    expect(el().querySelector('.body')?.innerHTML).toContain('<b>team</b>');
    expect(text()).toContain('Alex Applicant <alex@example.com>');
    expect(text()).toContain('Images in emails are not loaded');
    const mark = await reply('/messages/AAMk-1%3D/read', { isRead: true }, (m) => m === 'POST');
    expect(mark.request.body).toEqual({ isRead: true });
    expect(el().querySelector('.row.unread')).toBeNull();
    expect(button('Mark as unread')).toBeTruthy();
  });

  it('never runs markup that slips through: a script or handler in the body is inert in the page', async () => {
    await mount({ message: 'AAMk-1=' });
    await reply('/messages/AAMk-1%3D', message({ isRead: true, body: '<p onclick="window.__mail = 1">Hi</p><img src=x onerror="window.__mail = 2"><script>window.__mail = 3</script>' }), (m) => m === 'GET');
    const body = el().querySelector('.body')!;
    expect(body.innerHTML).not.toMatch(/onclick|onerror|<script/i);
    expect((window as unknown as { __mail?: number }).__mail).toBeUndefined();
  });

  it('shows plain-text messages as text, not markup', async () => {
    await mount({ message: 'AAMk-1=' });
    await reply('/messages/AAMk-1%3D', message({ isRead: true, bodyType: 'text', body: '<b>not bold</b>' }), (m) => m === 'GET');
    expect(el().querySelector('pre.body')?.textContent).toBe('<b>not bold</b>');
    expect(el().querySelector('.body b')).toBeNull();
  });

  it('downloads an attachment as a file and reports a failure', async () => {
    const create = vi.fn().mockReturnValue('blob:x'); const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    await mount({ message: 'AAMk-1=' });
    await reply('/messages/AAMk-1%3D', message({ isRead: true, hasAttachments: true, attachments: [{ id: 'att/1=', name: 'passport.pdf', contentType: 'application/pdf', size: 2048 }] }), (m) => m === 'GET');
    expect(text()).toContain('2.0 KB');
    expect(text()).toContain('not opened in the browser');
    await click('passport.pdf');
    const req = http.expectOne((r) => r.url === `${BASE}/messages/AAMk-1%3D/attachments/att%2F1%3D`);
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['x']));
    await settle();
    expect(create).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });

  it('replies from the dialog: sends the text, closes, and confirms; reply-all starts ticked', async () => {
    await mount({ message: 'AAMk-1=' });
    await reply('/messages/AAMk-1%3D', message({ isRead: true }), (m) => m === 'GET');
    await click('Reply all');
    const dialog = el().querySelector('[role="dialog"]')!;
    expect(dialog.querySelector('h3')?.textContent).toBe('Reply to all');
    expect((dialog.querySelector('input[name="all"]') as HTMLInputElement).checked).toBe(true);
    const body = dialog.querySelector('textarea') as HTMLTextAreaElement;
    body.value = 'Thanks, we will check.';
    body.dispatchEvent(new Event('input'));
    await settle();
    (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await settle();
    const req = await reply('/messages/AAMk-1%3D/reply', { id: 'new-1', link: null });
    expect(req.request.body).toEqual({ body: 'Thanks, we will check.', all: true, caseId: undefined });
    expect(el().querySelector('[role="dialog"]')).toBeNull();
    expect(el().querySelector('[role="status"]')?.textContent).toContain('Message sent.');
    await click('Dismiss');
    expect(el().querySelector('.notice')).toBeNull();
  });

  it('composes a new message with parsed recipients, and shows the server\'s field errors without closing', async () => {
    await mount();
    await click('New message');
    const dialog = el().querySelector('[role="dialog"]')!;
    const fill = async (selector: string, value: string) => { const f = dialog.querySelector(selector) as HTMLInputElement; f.value = value; f.dispatchEvent(new Event('input')); await settle(); };
    await fill('#mail-to', 'a@b.co; c@d.co ,e@f.co');
    await fill('#mail-subject', 'Your case');
    await fill('#mail-body', 'Hello');
    (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await settle();
    const req = http.expectOne((r) => r.url === `${BASE}/messages` && r.method === 'POST');
    expect(req.request.body).toMatchObject({ to: ['a@b.co', 'c@d.co', 'e@f.co'], cc: [], subject: 'Your case', body: 'Hello' });
    req.flush({ error: { code: 'validation_error', message: 'Please correct the highlighted fields.', fieldErrors: [{ field: 'to', message: 'Every address must be a valid email address.' }] } }, { status: 422, statusText: 'Unprocessable' });
    await settle();
    expect(el().querySelector('[role="dialog"]')).toBeTruthy();
    expect(dialog.querySelector('#mail-to')?.getAttribute('aria-invalid')).toBe('true');
    expect(dialog.textContent).toContain('Every address must be a valid email address.');
    expect((dialog.querySelector('#mail-subject') as HTMLInputElement).value).toBe('Your case');
  });

  it('is read-only for someone without mail.send: no compose, no reply', async () => {
    await mount({ message: 'AAMk-1=' }, status({ canSend: false }));
    await reply('/messages/AAMk-1%3D', message({ isRead: true }), (m) => m === 'GET');
    expect(button('New message')).toBeUndefined();
    expect(button('Reply')).toBeUndefined();
    expect(button('Reply all')).toBeUndefined();
    expect(button('Link to a case')).toBeTruthy();
  });

  it('links a message to a case and removes the link; links on cases the employee is not on are counted, not named', async () => {
    await mount({ message: 'AAMk-1=' });
    await reply('/messages/AAMk-1%3D', message({ isRead: true, links: [link], hiddenLinkCount: 2 }), (m) => m === 'GET');
    expect(el().querySelector('.links a')?.getAttribute('href')).toBe('/cases/c1?tab=mail');
    expect(text()).toContain('Also linked to 2 cases you are not on.');
    await click('Remove link');
    await reply('/links/l1', { deleted: true }, (m) => m === 'DELETE');
    await reply('/messages/AAMk-1%3D', message({ isRead: true }), (m) => m === 'GET');
    await reply('/messages', { items: [item({ isRead: true })], page: 1, limit: 20, hasMore: false, folder: 'inbox' });
    expect(el().querySelector('.links')).toBeNull();

    await click('Link to a case');
    expect(button('Link message')?.hasAttribute('disabled')).toBe(true);
    const picker = el().querySelector('ih-case-picker input') as HTMLInputElement;
    picker.value = 'IH-2026';
    picker.dispatchEvent(new Event('input'));
    await settle();
    await new Promise((r) => setTimeout(r, 300));
    const found = http.expectOne((r) => r.url === '/api/v1/staff/cases');
    expect(found.request.params.get('search')).toBe('IH-2026');
    found.flush({ data: { items: [{ id: 'c9', caseNumber: 'IH-2026-9', title: 'Nine' }], total: 1, page: 1, limit: 8 }, meta });
    await settle();
    await click('IH-2026-9');
    await click('Link message');
    const req = await reply('/messages/AAMk-1%3D/links', link, (m) => m === 'POST');
    expect(req.request.body).toEqual({ caseId: 'c9' });
    // A successful link reloads the open message and the list, so the new link shows up.
    expect(http.match((r) => r.url === `${BASE}/messages/AAMk-1%3D` && r.method === 'GET')).toHaveLength(1);
    expect(http.match((r) => r.url === `${BASE}/messages` && r.method === 'GET')).toHaveLength(1);
  });

  it('shows retryable errors for the list and for a message, and a back button that returns to the list', async () => {
    await mount({ message: 'AAMk-1=' });
    http.expectOne((r) => r.url === `${BASE}/messages/AAMk-1%3D`).flush({ error: { code: 'not_found', message: 'Message not found.' } }, { status: 404, statusText: 'Not Found' });
    await settle();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Message not found.');
    await click('Back to the list');
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { message: null } }));
  });

  it('moves between Inbox and Sent through the address, and pages with Newer/Older', async () => {
    await mount();
    await click('Sent');
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { folder: 'sent', message: null } }));
    params.next(convertToParamMap({ folder: 'sent' }));
    await settle();
    const req = http.expectOne((r) => r.url === `${BASE}/messages`);
    expect(req.request.params.get('folder')).toBe('sent');
    req.flush({ data: { items: [item({ id: 'S1', subject: 'Sent one', isRead: true, sentAt: '2026-10-01T00:00:00.000Z', receivedAt: null })], page: 1, limit: 20, hasMore: true, folder: 'sent' }, meta });
    await settle();
    expect(text()).toContain('Sent one');
    await click('Older');
    expect(http.expectOne((r) => r.url === `${BASE}/messages`).request.params.get('page')).toBe('2');
  });
});

describe('parseAddresses', () => {
  it('splits on commas, semicolons and spaces and drops blanks', () => {
    expect(parseAddresses(' a@b.co, c@d.co;; e@f.co  ')).toEqual(['a@b.co', 'c@d.co', 'e@f.co']);
    expect(parseAddresses('')).toEqual([]);
  });
});
