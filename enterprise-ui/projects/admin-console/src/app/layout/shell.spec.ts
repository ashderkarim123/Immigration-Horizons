import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AdminAuthService } from '../core/auth/admin-auth.service';
import { UnsavedChangesService } from '../core/guards/unsaved-changes.guard';
import { NAVIGATION, visibleNavigation } from '../core/permissions/navigation';
import { ToastService } from '../shared/staff-ui';
import { AdminAppShell } from './app-shell/app-shell';
import { AdminNavigation } from './navigation/navigation';

const EDITOR = ['admin.cms.access', 'blog.manage', 'faqs.manage', 'testimonials.manage', 'media.manage', 'seo.manage'];
const ADMIN = [...EDITOR, 'settings.manage', 'users.manage', 'security_events.view'];

function setup(capabilities: string[]) {
  const auth = {
    capabilities: signal(capabilities),
    currentAdmin: signal({ name: 'Ada Admin', role: { code: 'admin', label: 'Admin' } }),
    logout: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AdminAuthService, useValue: auth }] });
  return auth;
}
const labels = (root: HTMLElement) => Array.from(root.querySelectorAll('a.nav-link')).map((a) => a.textContent?.trim());

describe('Admin navigation and shell', () => {
  it('an editor sees the website modules and nothing under Platform or Access & Security', () => {
    setup(EDITOR);
    const fixture = TestBed.createComponent(AdminNavigation);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(labels(root)).toEqual(['Dashboard', 'Blog', 'FAQs', 'Testimonials', 'Media', 'Services', 'SEO']);
    expect(Array.from(root.querySelectorAll('.group-label')).map((h) => h.textContent)).toEqual(['Website']);
  });

  it('an admin also sees Settings, Integrations, Users, Roles and Security Events, each linked to its route', () => {
    setup(ADMIN);
    const fixture = TestBed.createComponent(AdminNavigation);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(labels(root)).toEqual(NAVIGATION.flatMap((g) => g.items.map((i) => i.label)));
    expect(root.querySelector('a[href="/security"]')?.textContent).toContain('Security Events');
    expect(root.querySelector('nav')?.getAttribute('aria-label')).toBe('Admin Console');
  });

  it('never offers a case-working destination', () => {
    const paths = visibleNavigation(ADMIN).flatMap((g) => g.items.map((i) => i.path)).join(' ');
    expect(paths).not.toMatch(/case|lead|task|document|petition|client|queries/);
  });

  it('the shell shows who is signed in, opens the mobile menu accessibly and closes it on Escape', () => {
    setup(ADMIN);
    const fixture = TestBed.createComponent(AdminAppShell);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.who')?.textContent).toContain('Ada Admin');
    expect(root.querySelector('.skip-link')?.getAttribute('href')).toBe('#main');

    const menu = root.querySelector('.menu-btn') as HTMLButtonElement;
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    menu.click();
    fixture.detectChanges();
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('.shell')?.classList.contains('menu-open')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(root.querySelector('.shell')?.classList.contains('menu-open')).toBe(false);
  });

  it('signs out through the auth service and returns to the sign-in page', async () => {
    const auth = setup(ADMIN);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AdminAppShell);
    fixture.detectChanges();
    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) => b.textContent?.includes('Sign out'));
    button?.click();
    await fixture.whenStable();
    expect(auth.logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('renders toasts in a live region and the unsaved-changes question as a dialog', () => {
    setup(ADMIN);
    const fixture = TestBed.createComponent(AdminAppShell);
    TestBed.inject(ToastService).show('Saved.', 'success', 0);
    const unsaved = TestBed.inject(UnsavedChangesService);
    const answer = unsaved.confirm();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Saved.');
    expect(root.querySelector('[role="dialog"]')?.textContent).toContain('Leave without saving?');
    (Array.from(root.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent?.includes('Cancel')) as HTMLButtonElement).click();
    return expect(answer).resolves.toBe(false);
  });
});
