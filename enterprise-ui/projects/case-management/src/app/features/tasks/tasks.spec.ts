import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { Paginated } from '../../core/api/case.types';
import { TaskActions, TaskItem } from '../../core/api/task.types';
import { TasksComponent } from './tasks.component';

const meta = { requestId: 'r' };
const FULL: TaskActions = { canEdit: true, canChangeStatus: true, canAssign: true };

/** Shaped like GET /api/v1/staff/tasks. */
function task(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 't1',
    title: 'Draft petition',
    type: 'Petition Writing',
    description: '',
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    completedAt: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z',
    assignee: { id: 'emp-w', displayName: 'Wendy Writer' },
    case: { id: 'case1', caseNumber: 'IH-2026-AAA111', title: 'Alpha petition' },
    lead: null,
    actions: FULL,
    ...overrides,
  };
}

describe('Tasks page', () => {
  let http: HttpTestingController;

  function setup(params: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: ActivatedRoute, useValue: { queryParams: new BehaviorSubject(params) } }],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TasksComponent);
    fixture.detectChanges();
    return fixture;
  }

  const load = (items: TaskItem[], overrides: Partial<Paginated<TaskItem>> = {}) =>
    http.expectOne((r) => r.url === '/api/v1/staff/tasks').flush({ data: { items, total: items.length, page: 1, totalPages: 1, pageSize: 10, ...overrides }, meta });

  afterEach(() => http.verify());

  it('requests the supported scope and filters, and reads flat pagination', () => {
    const fixture = setup({ scope: 'all', status: 'review', q: 'petition' });
    const req = http.expectOne((r) => r.url === '/api/v1/staff/tasks');
    expect(req.request.params.get('scope')).toBe('all');
    expect(req.request.params.get('status')).toBe('review');
    expect(req.request.params.get('search')).toBe('petition');
    req.flush({ data: { items: [task()], total: 31, page: 1, totalPages: 4, pageSize: 10 }, meta });
    expect(fixture.componentInstance.totalItems()).toBe(31);
    expect(fixture.componentInstance.totalPages()).toBe(4);
  });

  it('renders status selects and Edit from the server actions per row; case-less tasks cannot be edited here', () => {
    const fixture = setup();
    load([
      task({ id: 't1' }),
      task({ id: 't2', title: 'Not mine', actions: { canEdit: false, canChangeStatus: false, canAssign: false } }),
      task({ id: 't3', title: 'Lead call', case: null, lead: { id: 'l1', displayName: 'Lee Lead' } }),
    ]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('select.form-select[aria-label^="Status of"]').length).toBe(2);
    expect(Array.from(el.querySelectorAll('tbody button')).length).toBe(1); // only t1: editable and on a case
  });

  it('changes status inline and replaces the row; a refusal restores the select', () => {
    const fixture = setup();
    load([task()]);
    fixture.detectChanges();
    const select = (fixture.nativeElement as HTMLElement).querySelector('select[aria-label^="Status of"]') as HTMLSelectElement;

    select.value = 'in_progress';
    select.dispatchEvent(new Event('change'));
    http.expectOne('/api/v1/staff/tasks/t1/status').flush({ data: task({ status: 'in_progress' }), meta });
    expect(fixture.componentInstance.tasks()[0].status).toBe('in_progress');
    fixture.detectChanges(); // the row now holds the refreshed task

    select.value = 'completed';
    select.dispatchEvent(new Event('change'));
    http.expectOne('/api/v1/staff/tasks/t1/status').flush({ error: { code: 'forbidden', message: 'no' } }, { status: 403, statusText: 'Forbidden' });
    expect(select.value).toBe('in_progress');
  });

  it('Edit opens the shared dialog for the task’s case', () => {
    const fixture = setup();
    load([task()]);
    fixture.detectChanges();
    ((fixture.nativeElement as HTMLElement).querySelector('tbody button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.editing()?.id).toBe('t1');
    http.expectOne('/api/v1/staff/cases/case1/members').flush({ data: { members: [] }, meta });
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]')).toBeTruthy();
  });
});
