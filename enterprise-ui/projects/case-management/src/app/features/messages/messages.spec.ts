import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { InboxItem } from '../../core/api/inbox.types';
import { Navigation } from '../../layout/navigation/navigation';
import { AuthService } from '../../core/auth/auth.service';
import { MessagesComponent } from './messages.component';

const meta = { requestId: 'r' };

/** Shaped like GET /api/v1/staff/inbox. */
function item(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    channelId: 'ch1',
    channelName: 'Client & Team',
    audience: 'client_and_team',
    case: { id: 'case1', caseNumber: 'IH-2026-AAA111', title: 'Alpha petition' },
    latestMessage: { senderName: 'Casey', senderType: 'client', preview: 'Where is my receipt?', createdAt: '2026-01-02T10:00:00.000Z' },
    unreadCount: 2,
    ...overrides,
  };
}

describe('Messages inbox', () => {
  let http: HttpTestingController;

  function setup(params: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: ActivatedRoute, useValue: { queryParams: new BehaviorSubject(params) } }],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MessagesComponent);
    fixture.detectChanges();
    return fixture;
  }

  const load = (items: InboxItem[], extra: Record<string, number> = {}) =>
    http.expectOne((r) => r.url === '/api/v1/staff/inbox').flush({ data: { items, total: items.length, page: 1, totalPages: 1, pageSize: 20, unreadTotal: items.filter((i) => i.unreadCount > 0).length, ...extra }, meta });

  afterEach(() => http.verify());

  it('sends filter and search to the API and reads flat pagination', () => {
    const fixture = setup({ filter: 'unread', q: 'alpha', page: '2' });
    const req = http.expectOne((r) => r.url === '/api/v1/staff/inbox');
    expect(req.request.params.get('filter')).toBe('unread');
    expect(req.request.params.get('search')).toBe('alpha');
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ data: { items: [item()], total: 41, page: 2, totalPages: 3, pageSize: 20, unreadTotal: 5 }, meta });
    expect(fixture.componentInstance.totalItems()).toBe(41);
    expect(fixture.componentInstance.unreadTotal()).toBe(5);
  });

  it('shows case, channel, audience as text, sender, preview, time and the unread count', () => {
    const fixture = setup();
    load([item(), item({ channelId: 'ch2', channelName: 'Strategy', audience: 'staff_only', unreadCount: 0 })]);
    fixture.detectChanges();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.inbox-row');
    expect(rows.length).toBe(2);
    const first = rows[0] as HTMLElement;
    expect(first.classList).toContain('unread');
    for (const text of ['IH-2026-AAA111', 'Alpha petition', '#Client & Team', 'Client & team', 'Casey:', 'Where is my receipt?']) expect(first.textContent).toContain(text);
    expect(first.querySelector('.unread-pill')?.textContent?.trim()).toBe('2');
    expect(rows[1].textContent).toContain('Staff only');
    expect(rows[1].querySelector('.unread-pill')).toBeNull();
  });

  it('opens the case on its Chat tab with the channel selected', () => {
    const fixture = setup();
    load([item()]);
    fixture.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    ((fixture.nativeElement as HTMLElement).querySelector('.inbox-row') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/cases', 'case1'], { queryParams: { tab: 'chat', channel: 'ch1' } });
  });

  it('keeps the filter in the URL and resets to page 1', () => {
    const fixture = setup({ page: '3' });
    load([]);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentInstance.setFilter('unread');
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { filter: 'unread' } }));
  });

  it('has an empty state that differs for "unread" and a retryable error', () => {
    const fixture = setup({ filter: 'unread' });
    load([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('You are all caught up');

    fixture.componentInstance.load();
    http.expectOne((r) => r.url === '/api/v1/staff/inbox').flush({ error: { code: 'server_error', message: 'Down.' } }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(fixture.componentInstance.errorMessage()).toBe('Down.');
    expect(fixture.nativeElement.querySelector('ih-error-state')).toBeTruthy();
  });
});

describe('Navigation', () => {
  it('lists Messages only for roles with channels.view', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    const auth = TestBed.inject(AuthService);
    const fixture = TestBed.createComponent(Navigation);

    auth.capabilities.set(['cases.view']);
    expect(fixture.componentInstance.navItems().map((i) => i.label)).not.toContain('Messages');

    auth.capabilities.set(['cases.view', 'channels.view']);
    expect(fixture.componentInstance.navItems().map((i) => i.label)).toEqual(['Dashboard', 'Cases', 'Tasks', 'Messages', 'Deadlines']);
  });
});

describe('Navigation: Tracking', () => {
  it('lists Tracking only for roles with uscis_tracking.view', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    const auth = TestBed.inject(AuthService);
    const fixture = TestBed.createComponent(Navigation);

    auth.capabilities.set(['cases.view']);
    expect(fixture.componentInstance.navItems().map((i) => i.label)).not.toContain('Tracking');
    auth.capabilities.set(['cases.view', 'uscis_tracking.view']);
    expect(fixture.componentInstance.navItems().map((i) => i.label)).toContain('Tracking');
  });
});
