import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { DashboardClientCase, DashboardMetrics } from '../../core/api/dashboard.types';
import { TaskItem } from '../../core/api/task.types';
import { Dashboard } from './dashboard';

const URL = '/api/v1/staff/dashboard';
const meta = { requestId: 'r' };
const CASE_ID = '64b0f0f0f0f0f0f0f0f0f0a1';

const task = (over: Partial<TaskItem> = {}): TaskItem => ({
  id: 't1', title: 'Review employment letters', type: 'Evidence Review', description: '', status: 'todo', priority: 'high', dueDate: '2020-01-05T00:00:00.000Z',
  completedAt: null, createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z', assignee: { id: 'me', displayName: 'Sarah' },
  case: { id: CASE_ID, caseNumber: 'IH-2026-AAA111', title: 'Alpha petition', clientName: 'John Smith', caseType: 'eb2_niw' }, lead: null,
  actions: { canEdit: true, canChangeStatus: true, canAssign: false }, ...over,
});
const clientCase = (over: Partial<DashboardClientCase> = {}): DashboardClientCase => ({
  id: CASE_ID, caseNumber: 'IH-2026-AAA111', title: 'Alpha petition', caseType: 'eb2_niw', currentStage: 'drafting', priority: 'high', targetFilingDate: '2026-10-18T00:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z', client: { id: 'c1', name: 'John Smith' }, projectManager: { id: 'pm1', name: 'Sarah Manager' },
  nextAction: { taskId: 't1', title: 'Review employment letters', dueDate: null, assignee: 'Sarah' }, pending: { openTasks: 3, documentRequests: 2 }, ...over,
});
const payload = (over: Partial<DashboardMetrics> = {}): DashboardMetrics => ({
  role: 'pm', scope: 'mine', myCases: 4, activeClients: 3, tasksDueToday: 2, newAssignedCases: 1, casesAwaitingClientDocuments: 2, casesAwaitingReview: 1,
  upcomingDeadlines: 1, unansweredQueries: 0, queriesAwaitingScheduling: 0,
  unreadClientMessages: 2, myOpenTasks: 3, myOverdueTasks: 1, workQueues: [], clientCases: [clientCase()], recentActivity: [], myTasks: [task()], ...over,
});

function mount(data: DashboardMetrics, caps = ['cases.view', 'clients.view']) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: AuthService, useValue: { capabilities: signal(caps) } }] });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(Dashboard);
  fixture.detectChanges();
  http.expectOne(URL).flush({ data, meta });
  fixture.detectChanges();
  return { http, fixture, el: fixture.nativeElement as HTMLElement };
}
const card = (el: HTMLElement, label: string) => Array.from(el.querySelectorAll<HTMLAnchorElement>('a.metric-card')).find((a) => a.querySelector('.metric-label')?.textContent?.trim() === label);

describe('Dashboard', () => {
  it('names a case by its client: the client leads, the case number is only a reference, and the link stays under the base href', () => {
    const { http, el } = mount(payload());
    const row = el.querySelector('.client-table tbody tr')!;
    const link = row.querySelector('th a.client-name') as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('John Smith');
    // routerLink resolves through the router (and therefore the <base href="/staff/">), a raw href would not
    expect(link.getAttribute('href')).toBe(`/cases/${CASE_ID}`);
    expect(row.querySelector('th')?.textContent).toContain('EB-2 NIW');
    expect(row.querySelector('.ref')?.textContent).toContain('Ref IH-2026-AAA111');
    expect(Array.from(el.querySelectorAll('a')).some((a) => a.textContent?.trim() === 'IH-2026-AAA111')).toBe(false);
    expect(row.querySelector('a[href="/clients/c1"]')?.textContent).toBe('Client profile');
    expect(row.textContent).toContain('Drafting');
    expect(row.textContent).toContain('Review employment letters');
    expect(row.textContent).toContain('3 open tasks');
    expect(row.querySelector(`a[href="/cases/${CASE_ID}?tab=documents"]`)?.textContent).toContain('2 client documents requested');
    expect(row.textContent).toContain('Sarah Manager');
    http.verify();
  });

  it('every overview card opens the records it counts, and says "My" only to someone who sees their own cases', () => {
    const mine = mount(payload()).el;
    expect(card(mine, 'My Active clients')?.getAttribute('href')).toBe('/clients');
    expect(card(mine, 'My Active cases')?.getAttribute('href')).toBe('/cases');
    expect(card(mine, 'Tasks due today')?.getAttribute('href')).toBe('/tasks?due=today');
    const overdue = card(mine, 'Overdue tasks')!;
    expect(overdue.getAttribute('href')).toBe('/tasks?due=overdue');
    expect(overdue.classList.contains('metric-alert')).toBe(true);
    expect(card(mine, 'Cases awaiting client documents')?.getAttribute('href')).toBe('/work-queues?queue=requested_documents');
    expect(card(mine, 'Cases awaiting internal review')?.getAttribute('href')).toBe('/work-queues?queue=document_review');
    expect(card(mine, 'Upcoming deadlines')?.getAttribute('href')).toBe('/deadlines');
    expect(card(mine, 'New assigned cases (7 days)')?.getAttribute('href')).toBe('/cases?scope=mine');

    const firm = mount(payload({ scope: 'organization' })).el;
    expect(card(firm, 'Active clients')?.textContent).toContain('3');
    expect(card(firm, 'My Active clients')).toBeUndefined();
  });

  it('hides a card whose queue this employee does not have (null), and sends the review card to the queue that has work', () => {
    const none = mount(payload({ casesAwaitingClientDocuments: null, casesAwaitingReview: null })).el;
    expect(card(none, 'Cases awaiting client documents')).toBeUndefined();
    expect(card(none, 'Cases awaiting internal review')).toBeUndefined();

    const withQueue = mount(payload({ workQueues: [{ key: 'petition_review', label: 'Petitions to review', tab: 'petition', count: 2, items: [{ caseId: CASE_ID, title: 'Alpha petition', caseNumber: 'IH-2026-AAA111', clientName: 'John Smith', caseType: 'eb2_niw', count: 2 }] }] })).el;
    expect(card(withQueue, 'Cases awaiting internal review')?.getAttribute('href')).toBe('/work-queues?queue=petition_review');
    const attention = withQueue.querySelector('[aria-labelledby="dash-attention"]')!;
    expect(attention.querySelector('.queue-title')?.textContent).toContain('Petitions to review');
    expect(attention.querySelector(`.queue-cases a[href="/cases/${CASE_ID}?tab=petition"]`)?.textContent).toBe('John Smith');
  });

  it('someone without case access sees their tasks and no client or case sections', () => {
    const { el } = mount(payload({ clientCases: [], myTasks: [task({ case: null })] }), []);
    expect(el.querySelector('[aria-labelledby="dash-clients"]')).toBeNull();
    expect(el.querySelector('[aria-labelledby="dash-activity"]')).toBeNull();
    expect(card(el, 'My Active cases')).toBeUndefined();
    expect(el.querySelector('.task-row')?.textContent).toContain('General work');
  });

  it('a task leads with the client, shows it is overdue, and can be completed from the dashboard', () => {
    const { http, fixture, el } = mount(payload());
    const row = el.querySelector('.task-row')!;
    expect(row.classList.contains('late')).toBe(true);
    expect(row.querySelector('ih-case-label a')?.textContent?.trim()).toBe('John Smith');
    expect(row.querySelector('ih-case-label a')?.getAttribute('href')).toBe(`/cases/${CASE_ID}?tab=tasks`);
    expect(row.querySelector('ih-case-label .ref')?.textContent).toContain('Ref IH-2026-AAA111');
    expect(row.textContent).toContain('Overdue');

    (Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.includes('Mark complete')) as HTMLButtonElement).click();
    const patch = http.expectOne('/api/v1/staff/tasks/t1/status');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ status: 'completed' });
    patch.flush({ data: task({ status: 'completed' }), meta });
    http.expectOne(URL).flush({ data: payload({ myTasks: [], myOpenTasks: 2, myOverdueTasks: 0 }), meta });
    fixture.detectChanges();
    expect(el.querySelector('.notice')?.textContent).toContain('Completed: Review employment letters.');
    expect(el.querySelector('.task-row')).toBeNull();
    expect(el.textContent).toContain('No open tasks are assigned to you.');
    http.verify();
  });

  it('a refused quick action says why and leaves the task where it was; a task I may not change has no controls', () => {
    const { http, fixture, el } = mount(payload());
    (el.querySelector('.task-row button') as HTMLButtonElement).click();
    http.expectOne('/api/v1/staff/tasks/t1/status').flush({ error: { code: 'forbidden', message: 'Insufficient capability.' } }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(el.querySelector('.notice-error')?.textContent).toContain('Insufficient capability.');
    expect(el.querySelector('.task-row')).not.toBeNull();
    http.verify();

    const locked = mount(payload({ myTasks: [task({ actions: { canEdit: false, canChangeStatus: false, canAssign: false } })] })).el;
    expect(locked.querySelector('.task-row button')).toBeNull();
    expect(locked.querySelector('.task-row select')).toBeNull();
  });

  it('the client table narrows as you type and explains an empty result', async () => {
    const { fixture, el } = mount(payload({ clientCases: [clientCase(), clientCase({ id: 'k2', caseNumber: 'IH-2026-BBB222', client: { id: 'c2', name: 'Maria Garcia' }, caseType: 'o1' })] }));
    expect(el.querySelectorAll('.client-table tbody tr')).toHaveLength(2);
    fixture.componentInstance.clientFilter.set('maria');
    fixture.detectChanges();
    const rows = el.querySelectorAll('.client-table tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Maria Garcia');
    fixture.componentInstance.clientFilter.set('nobody');
    fixture.detectChanges();
    expect(el.querySelector('[aria-labelledby="dash-clients"]')?.textContent).toContain('No client or case here matches');
  });

  it('recent activity names the client and links to the case', () => {
    const { el } = mount(payload({ recentActivity: [{ id: 'a1', type: 'document_uploaded', message: 'Client uploaded "Passport".', actorName: 'John Smith', createdAt: '2026-10-01T12:00:00.000Z', case: { id: CASE_ID, caseNumber: 'IH-2026-AAA111', title: 'Alpha petition', clientName: 'John Smith', caseType: 'eb2_niw' } }] }));
    const item = el.querySelector('.activity-list li')!;
    expect(item.querySelector('a')?.textContent).toBe('John Smith');
    expect(item.querySelector('a')?.getAttribute('href')).toBe(`/cases/${CASE_ID}`);
    expect(item.textContent).toContain('Client uploaded "Passport".');
  });

  describe('USCIS action required card', () => {
    it('links to the real queue with the count the server computed with the same filter', () => {
      const c = mount(payload({ uscisActionRequired: 3 })).el.querySelector('a[href="/tracking"]');
      expect(c?.textContent).toContain('3');
      expect(c?.textContent).toContain('USCIS action required');
    });

    it('shows a zero, but no card at all when the actor cannot see USCIS tracking (null)', () => {
      expect(mount(payload({ uscisActionRequired: 0 })).el.querySelector('a[href="/tracking"]')?.textContent).toContain('0');
      expect(mount(payload({ uscisActionRequired: null })).el.querySelector('a[href="/tracking"]')).toBeNull();
    });
  });
});
