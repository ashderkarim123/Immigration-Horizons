import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';

import { CaseMember } from '../../../../core/api/case.types';
import { TaskActions, TaskItem } from '../../../../core/api/task.types';
import { TaskFormDialogComponent } from '../../../../shared/task-form-dialog.component';
import { TasksTabComponent } from './tasks-tab.component';

const meta = { requestId: 'r' };
const LIST = '/api/v1/staff/cases/case1/tasks';
const FULL: TaskActions = { canEdit: true, canChangeStatus: true, canAssign: true };
const NONE: TaskActions = { canEdit: false, canChangeStatus: false, canAssign: false };

/** Shaped like GET /api/v1/staff/cases/:id/tasks (server/services/taskDto.js). */
function task(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 't1',
    title: 'Draft petition',
    type: 'Petition Writing',
    description: '',
    status: 'todo',
    priority: 'medium',
    dueDate: '2030-01-15T00:00:00.000Z',
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

const members = (): CaseMember[] => [
  { id: 'm1', memberType: 'employee', workspaceRole: 'contributor', status: 'active', clientVisible: true, joinedAt: '', employee: { id: 'emp-w', name: 'Wendy Writer', email: '', role: 'petition_writer', avatar: null, jobTitle: '', department: '' }, client: null },
  { id: 'm2', memberType: 'employee', workspaceRole: 'contributor', status: 'removed', clientVisible: true, joinedAt: '', employee: { id: 'emp-x', name: 'Gone Person', email: '', role: 'reviewer', avatar: null, jobTitle: '', department: '' }, client: null },
  { id: 'm3', memberType: 'client', workspaceRole: 'client', status: 'active', clientVisible: true, joinedAt: '', employee: null, client: { id: 'c1', displayName: 'Casey', email: '' } },
];

describe('TasksTabComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<TasksTabComponent>;

  function setup(tasks: TaskItem[], canCreate: boolean) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TasksTabComponent);
    (fixture.componentRef as ComponentRef<TasksTabComponent>).setInput('caseId', 'case1');
    fixture.detectChanges();
    http.expectOne(LIST).flush({ data: { tasks, canCreate }, meta });
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  const dialog = () => fixture.debugElement.query(By.directive(TaskFormDialogComponent)).componentInstance as TaskFormDialogComponent;
  const el = () => fixture.nativeElement as HTMLElement;

  afterEach(() => http.verify());

  it('offers New Task only when the server says the actor may create', () => {
    setup([], false);
    expect(el().textContent).not.toContain('New Task');
  });

  it('shows status selects and Edit only where the task actions allow, a plain badge otherwise', () => {
    setup([task({ id: 't1' }), task({ id: 't2', title: 'Read only', actions: NONE })], false);
    expect(el().querySelectorAll('select.form-select').length).toBe(1);
    expect(Array.from(el().querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['Edit']);
  });

  it('creates a task with the real fields and the case team as assignees (active employees only), then prepends it', () => {
    const component = setup([task()], true);
    component.openCreate();
    fixture.detectChanges();
    http.expectOne('/api/v1/staff/cases/case1/members').flush({ data: { members: members() }, meta });
    fixture.detectChanges();

    expect(dialog().assignees()).toEqual([{ id: 'emp-w', name: 'Wendy Writer' }]);

    const d = dialog();
    d.title.set('  Collect transcripts ');
    d.type.set('Evidence Review');
    d.priority.set('high');
    d.dueDate.set('2030-02-01');
    d.assignee.set('emp-w');
    d.submit();

    const req = http.expectOne(LIST);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'Collect transcripts', type: 'Evidence Review', priority: 'high', dueDate: '2030-02-01', description: '', assignee: 'emp-w' });
    req.flush({ data: task({ id: 't2', title: 'Collect transcripts' }), meta }, { status: 201, statusText: 'Created' });
    fixture.detectChanges();

    expect(component.tasks().map((t) => t.id)).toEqual(['t2', 't1']);
    expect(component.dialogOpen()).toBe(false);
  });

  it('keeps the dialog open with the server’s field error when creation is rejected', () => {
    const component = setup([], true);
    component.openCreate();
    fixture.detectChanges();
    http.expectOne('/api/v1/staff/cases/case1/members').flush({ data: { members: [] }, meta });
    dialog().title.set('Bad one');
    dialog().submit();
    http.expectOne(LIST).flush({ error: { code: 'validation_error', message: 'null', fieldErrors: [{ field: 'assignee', message: 'Add this employee to the case team before assigning the task.' }] } }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();

    expect(component.dialogOpen()).toBe(true);
    expect(dialog().title()).toBe('Bad one');
    expect(el().textContent).toContain('Add this employee to the case team');
  });

  it('changes status through the status endpoint and replaces the row with the returned task', () => {
    const component = setup([task()], false);
    const select = el().querySelector('select.form-select') as HTMLSelectElement;
    select.value = 'completed';
    select.dispatchEvent(new Event('change'));

    const req = http.expectOne('/api/v1/staff/tasks/t1/status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'completed' });
    req.flush({ data: task({ status: 'completed', completedAt: '2026-02-01T00:00:00.000Z' }), meta });
    expect(component.tasks()[0].status).toBe('completed');
  });

  it('puts the select back to the real status when the server refuses', () => {
    setup([task()], false);
    const select = el().querySelector('select.form-select') as HTMLSelectElement;
    select.value = 'completed';
    select.dispatchEvent(new Event('change'));
    http.expectOne('/api/v1/staff/tasks/t1/status').flush({ error: { code: 'forbidden', message: 'Insufficient capability.' } }, { status: 403, statusText: 'Forbidden' });
    expect(select.value).toBe('todo');
  });

  it('edit: saves the fields, then reassigns only if the assignee changed and the server allows assigning', () => {
    const component = setup([task()], true);
    component.openEdit(component.tasks()[0]);
    fixture.detectChanges();
    http.expectOne('/api/v1/staff/cases/case1/members').flush({ data: { members: members() }, meta });

    dialog().title.set('Draft petition v2');
    dialog().assignee.set('');
    dialog().submit();

    const update = http.expectOne('/api/v1/staff/tasks/t1');
    expect(update.request.method).toBe('PATCH');
    expect(update.request.body).toEqual({ title: 'Draft petition v2', type: 'Petition Writing', priority: 'medium', dueDate: '2030-01-15', description: '' });
    update.flush({ data: task({ title: 'Draft petition v2' }), meta });

    const assign = http.expectOne('/api/v1/staff/tasks/t1/assignee');
    expect(assign.request.body).toEqual({ assignee: null });
    assign.flush({ data: task({ title: 'Draft petition v2', assignee: null }), meta });

    expect(component.tasks()[0].title).toBe('Draft petition v2');
    expect(component.tasks()[0].assignee).toBeNull();
    expect(component.dialogOpen()).toBe(false);
  });

  it('edit: an assignee without assign rights never sees the picker and triggers no assign call', () => {
    const component = setup([task({ actions: { canEdit: true, canChangeStatus: true, canAssign: false } })], false);
    component.openEdit(component.tasks()[0]);
    fixture.detectChanges();
    http.expectNone('/api/v1/staff/cases/case1/members');
    expect(el().querySelector('#task-assignee')).toBeNull();

    dialog().priority.set('urgent');
    dialog().submit();
    http.expectOne('/api/v1/staff/tasks/t1').flush({ data: task({ priority: 'urgent' }), meta });
    http.expectNone('/api/v1/staff/tasks/t1/assignee');
  });
});
