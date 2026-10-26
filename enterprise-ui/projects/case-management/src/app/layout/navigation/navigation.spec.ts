import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { MailUnreadService } from '../../core/api/mail-unread.service';
import { Navigation } from './navigation';

describe('Navigation', () => {
  function labels(caps: string[]): string[] {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: MailUnreadService, useValue: { count: signal(0), start: () => undefined, stop: () => undefined, refresh: () => undefined } }, { provide: AuthService, useValue: { capabilities: signal(caps) } }] });
    const fixture = TestBed.createComponent(Navigation);
    fixture.detectChanges();
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).map((a) => a.textContent?.trim() ?? '');
  }

  it('offers Calendar only to someone with calendar.view, and links it to /calendar', () => {
    expect(labels(['cases.view'])).not.toContain('Calendar');
    TestBed.resetTestingModule();
    expect(labels(['cases.view', 'calendar.view'])).toContain('Calendar');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: MailUnreadService, useValue: { count: signal(0), start: () => undefined, stop: () => undefined, refresh: () => undefined } }, { provide: AuthService, useValue: { capabilities: signal(['calendar.view']) } }] });
    const fixture = TestBed.createComponent(Navigation);
    fixture.detectChanges();
    const link = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).find((a) => a.textContent?.includes('Calendar'));
    expect(link?.getAttribute('href')).toBe('/calendar');
  });

  it('offers Reports only to someone with reports.view, and links it to /reports', () => {
    expect(labels(['cases.view', 'calendar.view'])).not.toContain('Reports');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: MailUnreadService, useValue: { count: signal(0), start: () => undefined, stop: () => undefined, refresh: () => undefined } }, { provide: AuthService, useValue: { capabilities: signal(['reports.view']) } }] });
    const fixture = TestBed.createComponent(Navigation);
    fixture.detectChanges();
    const link = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).find((a) => a.textContent?.includes('Reports'));
    expect(link?.getAttribute('href')).toBe('/reports');
  });

  it('offers Mail only to someone with mail.view, and links it to /mail', () => {
    expect(labels(['cases.view', 'calendar.view'])).not.toContain('Mail');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: MailUnreadService, useValue: { count: signal(0), start: () => undefined, stop: () => undefined, refresh: () => undefined } }, { provide: AuthService, useValue: { capabilities: signal(['mail.view']) } }] });
    const fixture = TestBed.createComponent(Navigation);
    fixture.detectChanges();
    const link = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).find((a) => a.textContent?.includes('Mail'));
    expect(link?.getAttribute('href')).toBe('/mail');
  });

  it('keeps the existing entries: Tracking still follows uscis_tracking.view, Deadlines follows cases.view', () => {
    const all = labels(['cases.view', 'uscis_tracking.view', 'calendar.view']);
    expect(all).toEqual(expect.arrayContaining(['Dashboard', 'Cases', 'Tasks', 'Deadlines', 'Calendar', 'Tracking']));
    TestBed.resetTestingModule();
    expect(labels([])).toEqual(['Dashboard', 'Tasks', 'Notifications']);
  });

  it('restricts CRM navigation to staff with leads.view', () => {
    expect(labels(['cases.view'])).not.toContain('CRM pipeline');
    TestBed.resetTestingModule();
    expect(labels(['leads.view'])).toContain('CRM pipeline');
  });

  it('groups the menu by what a person comes to do, shows only groups with something in them, and reaches leads, consultations and planning', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: MailUnreadService, useValue: { count: signal(0), start: () => undefined, stop: () => undefined, refresh: () => undefined } }, { provide: AuthService, useValue: { capabilities: signal(['cases.view', 'clients.view', 'leads.view', 'queries.view', 'channels.view', 'sprints.manage', 'reports.view']) } }] });
    const fixture = TestBed.createComponent(Navigation);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const groups = Array.from(el.querySelectorAll('.nav-group')).map((g) => [g.getAttribute('aria-label'), Array.from(g.querySelectorAll('a')).map((a) => a.textContent?.trim())]);
    expect(groups).toEqual([
      ['Workspace', ['Dashboard', 'Tasks', 'Notifications']],
      ['Clients and leads', ['Clients', 'Leads', 'CRM pipeline', 'Consultations']],
      ['Case work', ['Cases', 'Deadlines']],
      ['Communication', ['Messages']],
      ['Operations', ['Team planning', 'Reports']],
    ]);
    const href = (label: string) => Array.from(el.querySelectorAll('a')).find((a) => a.textContent?.trim() === label)?.getAttribute('href');
    expect([href('Leads'), href('CRM pipeline'), href('Consultations'), href('Team planning'), href('Notifications')]).toEqual(['/intake', '/crm', '/consultations', '/planning', '/notifications']);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: MailUnreadService, useValue: { count: signal(0), start: () => undefined, stop: () => undefined, refresh: () => undefined } }, { provide: AuthService, useValue: { capabilities: signal([]) } }] });
    const bare = TestBed.createComponent(Navigation);
    bare.detectChanges();
    expect(Array.from((bare.nativeElement as HTMLElement).querySelectorAll('.nav-group')).map((g) => g.getAttribute('aria-label'))).toEqual(['Workspace']);
    // collapsed: icons only, no headings, every link still named
    bare.componentRef.setInput('collapsed', true);
    bare.detectChanges();
    expect((bare.nativeElement as HTMLElement).querySelector('.nav-heading')).toBeNull();
    expect((bare.nativeElement as HTMLElement).querySelector('a')?.getAttribute('aria-label')).toBe('Dashboard');
  });
});

describe('Navigation unread badge', () => {
  const unreadStub = { count: signal(0), start: vi.fn(), stop: vi.fn(), refresh: vi.fn() };
  const link = (caps: string[], count: number) => {
    TestBed.resetTestingModule();
    unreadStub.count.set(count);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: MailUnreadService, useValue: unreadStub }, { provide: AuthService, useValue: { capabilities: signal(caps) } }] });
    const fixture = TestBed.createComponent(Navigation);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('a[href="/mail"]');
  };

  it('shows the unread count beside Mail, says it in the link name, and caps it', () => {
    const three = link(['mail.view'], 3)!;
    expect(three.getAttribute('aria-label')).toBe('Mail, 3 unread');
    expect(three.querySelector('.nav-badge')?.textContent?.trim()).toBe('3');
    expect(link(['mail.view'], 250)!.querySelector('.nav-badge')?.textContent?.trim()).toBe('99+');
    const none = link(['mail.view'], 0)!;
    expect(none.getAttribute('aria-label')).toBe('Mail');
    expect(none.querySelector('.nav-badge')).toBeNull();
  });

  it('only someone who may read the mailbox is ever counted', () => {
    unreadStub.start.mockClear();
    unreadStub.stop.mockClear();
    expect(link(['cases.view'], 5)).toBeNull();
    expect(unreadStub.start).not.toHaveBeenCalled();
    expect(unreadStub.stop).toHaveBeenCalled();
    link(['mail.view'], 1);
    expect(unreadStub.start).toHaveBeenCalled();
  });
});
