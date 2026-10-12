import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { ClientDetail } from '../../../core/api/client.types';
import { MailListItem } from '../../../core/api/mail.types';
import { ClientDetailComponent } from './client-detail.component';

const meta = { requestId: 'r' };
const CLIENT = '/api/v1/staff/clients/c1';
const detail: ClientDetail = {
  id: 'c1', displayName: 'Casey Client', firstName: 'Casey', lastName: 'Client', email: 'casey@example.com', phone: '', status: 'active', lockedUntil: null,
  lastLoginAt: null, createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z',
  cases: [{ id: 'k1', caseNumber: 'IH-2026-AAA111', title: 'Alpha petition', caseType: 'eb2_niw', currentStage: 'drafting', priority: 'high', targetFilingDate: null, archivedAt: null, updatedAt: '2026-01-01T10:00:00.000Z' }],
};
const mailItem = (over: Partial<MailListItem> = {}): MailListItem => ({
  id: 'AAMk-1=', kind: 'mail', contact: null, subject: 'My passport', from: { name: 'Casey', address: 'Casey@Example.com' }, to: [], receivedAt: '2026-10-01T12:00:00.000Z', sentAt: null,
  isRead: true, hasAttachments: false, important: false, preview: '', linkCount: 0, ...over,
});

describe('ClientDetailComponent actions and emails', () => {
  function mount(caps: string[]) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: AuthService, useValue: { capabilities: signal(caps) } }, { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'c1' }) } } }] });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ClientDetailComponent);
    fixture.detectChanges();
    http.expectOne(CLIENT).flush({ data: detail, meta });
    fixture.detectChanges();
    return { http, fixture, el: fixture.nativeElement as HTMLElement };
  }
  const settle = async (f: { detectChanges(): void; whenStable(): Promise<unknown> }) => { f.detectChanges(); await f.whenStable(); f.detectChanges(); };

  it('offers Email client, Create case and per-case Send forms to someone who can do all three', () => {
    const { http, el } = mount(['mail.send', 'cases.create', 'forms.view']);
    const actions = el.querySelector('.client-actions')!;
    expect(Array.from(actions.querySelectorAll('button, a')).map((a) => a.textContent?.trim())).toEqual(['Email client', 'Create case']);
    expect(actions.querySelector('a')?.getAttribute('href')).toBe('/cases/new?clientId=c1&search=casey@example.com');
    const forms = el.querySelector('.case-links a')!;
    expect(forms.getAttribute('href')).toBe('/cases/k1?tab=forms');
    expect(forms.textContent).toContain('Send forms');
    expect(el.querySelector('.emails')).toBeNull(); // no mail.view: no mailbox call at all
    http.verify();
  });

  it('shows none of the actions, and asks Microsoft for nothing, to someone without the capabilities', () => {
    const { http, el } = mount(['clients.view']);
    expect(el.querySelector('.client-actions')).toBeNull();
    expect(el.querySelector('.case-links')).toBeNull();
    expect(el.querySelector('.emails')).toBeNull();
    http.verify();
  });

  it('lists the emails to and from this client, saying which way each went, and opens them in Mail', () => {
    const { http, fixture, el } = mount(['mail.view']);
    http.expectOne('/api/v1/staff/clients/c1/mail').flush({ data: { address: 'casey@example.com', items: [mailItem(), mailItem({ id: 'AAMk-2=', subject: 'Re: My passport', from: { name: 'Immigration Horizons', address: 'info@immigrationhorizons.com' }, to: [{ name: 'Casey', address: 'casey@example.com' }] })] }, meta });
    fixture.detectChanges();
    const rows = Array.from(el.querySelectorAll('.mail-list li'));
    expect(rows.map((r) => r.querySelector('.dir')?.textContent)).toEqual(['From client', 'To client']);
    expect(rows[0].querySelector('a')?.getAttribute('href')).toBe('/mail?message=AAMk-1%3D');
    http.verify();
  });

  it('explains an empty mailbox history and a mailbox that is not connected, without hiding the rest of the page', () => {
    const empty = mount(['mail.view']);
    empty.http.expectOne('/api/v1/staff/clients/c1/mail').flush({ data: { address: 'casey@example.com', items: [] }, meta });
    empty.fixture.detectChanges();
    expect(empty.el.querySelector('.emails')?.textContent).toContain('No emails to or from casey@example.com');
    TestBed.resetTestingModule();

    const down = mount(['mail.view']);
    down.http.expectOne('/api/v1/staff/clients/c1/mail').flush({ error: { code: 'mail_not_configured', message: 'The shared mailbox is not connected yet.' } }, { status: 503, statusText: 'Unavailable' });
    down.fixture.detectChanges();
    expect(down.el.querySelector('.emails')?.textContent).toContain('The shared mailbox is not connected yet.');
    expect(down.el.textContent).toContain('Casey Client');
    down.http.verify();
  });

  it('Email client opens a message to the client, and after sending, says so and refreshes the list', async () => {
    const { http, fixture, el } = mount(['mail.view', 'mail.send']);
    http.expectOne('/api/v1/staff/clients/c1/mail').flush({ data: { address: 'casey@example.com', items: [] }, meta });
    await settle(fixture);
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Email client') as HTMLButtonElement).click();
    await settle(fixture);
    expect((el.querySelector('#mail-to') as HTMLInputElement).value).toBe('casey@example.com');

    const fill = async (selector: string, value: string) => { const f = el.querySelector(selector) as HTMLInputElement; f.value = value; f.dispatchEvent(new Event('input')); await settle(fixture); };
    await fill('#mail-subject', 'Documents needed');
    await fill('#mail-body', 'Please upload your passport.');
    (el.querySelector('[role="dialog"] form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await settle(fixture);
    const send = http.expectOne((r) => r.url === '/api/v1/staff/mail/messages' && r.method === 'POST');
    expect(send.request.body).toMatchObject({ to: ['casey@example.com'], subject: 'Documents needed', body: 'Please upload your passport.' });
    send.flush({ data: { id: 'new1', link: null }, meta });
    await settle(fixture);
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(el.querySelector('.notice')?.textContent).toContain('Message sent.');
    http.expectOne('/api/v1/staff/clients/c1/mail').flush({ data: { address: 'casey@example.com', items: [mailItem()] }, meta });
    fixture.detectChanges();
    expect(el.querySelectorAll('.mail-list li')).toHaveLength(1);
    http.verify();
  });
});
