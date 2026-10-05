import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { StaffNotifications } from './notifications';

const meta = { requestId: 'r' };

/** Shaped like an item of GET /staff/notifications (server/routes/api/v1/staff/planning.js). */
const notice = (over: Record<string, unknown> = {}) => ({
  id: 'n1', title: 'Task due tomorrow', message: 'Case IH-2026-AAA111: "Draft" is due tomorrow (2026-10-15).', read: false, createdAt: '2026-10-14T12:00:00.000Z',
  caseId: 'c1', leadId: null, interactionId: null, href: null, ...over,
});

describe('StaffNotifications', () => {
  let http: HttpTestingController;

  function setup(items: ReturnType<typeof notice>[], preferences: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: AuthService, useValue: { capabilities: signal(['cases.view']) } }],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(StaffNotifications);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/v1/staff/notifications').flush({ data: { items, preferences: { mentionEmails: true, digestEmails: true, digestFrequency: 'daily', deadlineReminders: true, appointmentReminders: true, ...preferences } }, meta });
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('a reminder opens the exact tab it names, through the router', () => {
    const fixture = setup([notice({ href: '/cases/c1?tab=tasks' }), notice({ id: 'n2', title: 'Appointment in 1 hour', href: '/consultations/q1', caseId: null })]);
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('article a')).map((a) => [a.textContent?.trim(), a.getAttribute('href')]);
    expect(links).toEqual([['Open', '/cases/c1?tab=tasks'], ['Open', '/consultations/q1']]);
  });

  it('a notice without a server path keeps the existing related-record links', () => {
    const fixture = setup([notice()]);
    const link = (fixture.nativeElement as HTMLElement).querySelector('article a');
    expect([link?.textContent?.trim(), link?.getAttribute('href')]).toEqual(['Open case', '/cases/c1']);
  });

  it('ignores a path that is not an absolute in-app path', () => {
    const fixture = setup([notice({ href: 'https://evil.example/phish', caseId: null }), notice({ id: 'n3', href: '//evil.example/x', caseId: null })]);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('article a').length).toBe(0);
  });

  it('offers deadline and appointment reminder switches and saves them with the email preferences', () => {
    const fixture = setup([], { deadlineReminders: true, appointmentReminders: false });
    const el = fixture.nativeElement as HTMLElement;
    return fixture.whenStable().then(() => {
      fixture.detectChanges();
      const boxes = Array.from(el.querySelectorAll('form input[type=checkbox]')) as HTMLInputElement[];
      const byLabel = (needle: string) => boxes.find((b) => b.parentElement?.textContent?.includes(needle))!;
      expect(byLabel('before deadlines').checked).toBe(true);
      expect(byLabel('before appointments').checked).toBe(false);

      byLabel('before deadlines').checked = false;
      byLabel('before deadlines').dispatchEvent(new Event('change'));
      byLabel('before appointments').checked = true;
      byLabel('before appointments').dispatchEvent(new Event('change'));
      (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

      const patch = http.expectOne('/api/v1/staff/notifications/preferences');
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body).toEqual({ mentionEmails: true, digestEmails: true, digestFrequency: 'daily', deadlineReminders: false, appointmentReminders: true });
      patch.flush({ data: { updated: true }, meta });
    });
  });
});
