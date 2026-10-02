import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';

import { PetitionActions, PetitionDependency, PetitionDetail, PetitionSection, PetitionSummary } from '../../../../core/api/petition.types';
import { PetitionTabComponent } from './petition-tab.component';

const meta = { requestId: 'r' };
const NO_ACTIONS: PetitionActions = { canManage: false, canEdit: false, canLink: false, canSubmit: false, canReturn: false, canApprove: false, canFinalize: false };

function section(overrides: Partial<PetitionSection> = {}): PetitionSection {
  return {
    key: 'case_overview',
    title: 'Case overview',
    order: 1,
    required: true,
    body: 'Opening text',
    reviewStatus: 'draft',
    assignee: { id: 'u1', name: 'Wendy Writer' },
    lastEditedAt: '2026-01-01T10:00:00.000Z',
    lastEditedByName: 'Wendy Writer',
    reviewedAt: null,
    reviewedByName: '',
    reviewNote: '',
    actions: { canEdit: true, canMarkReady: true, canReturn: false, canApprove: false, canAssign: false },
    ...overrides,
  };
}

function dependency(overrides: Partial<PetitionDependency> = {}): PetitionDependency {
  return { id: 'd1', type: 'evidence_requirement', refId: 'e1', label: 'Publication record', role: null, requiredForFinalization: true, ready: true, status: 'satisfied', reason: '', ...overrides };
}

function summary(overrides: Partial<PetitionSummary> = {}): PetitionSummary {
  return {
    id: 'p1',
    caseId: 'case1',
    sequence: 1,
    kind: 'primary',
    title: 'EB-2 NIW — Petition',
    status: 'drafting',
    revision: 1,
    sectionProgress: { approved: 0, total: 2 },
    dependencyProgress: { ready: 0, total: 0 },
    updatedAt: '2026-01-01T10:00:00.000Z',
    actions: NO_ACTIONS,
    ...overrides,
  };
}

function detail(overrides: Partial<PetitionDetail> = {}): PetitionDetail {
  return {
    ...summary(),
    description: '',
    sections: [section(), section({ key: 'evidence_analysis', title: 'Evidence analysis', order: 2, body: '', assignee: null, actions: { canEdit: false, canMarkReady: false, canReturn: false, canApprove: false, canAssign: false } })],
    dependencies: [],
    internalReviewNote: '',
    approvedAt: null,
    finalizedAt: null,
    versions: [],
    ...overrides,
  };
}

describe('PetitionTabComponent', () => {
  let fixture: ComponentFixture<PetitionTabComponent>;
  let http: HttpTestingController;
  let component: PetitionTabComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PetitionTabComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PetitionTabComponent);
    fixture.componentRef.setInput('caseId', 'case1');
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
    fixture.destroy(); // clears the autosave timer
    http.verify();
  });

  const text = () => fixture.nativeElement.textContent as string;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function showList(petitions: PetitionSummary[], canProvision = true): Promise<void> {
    fixture.detectChanges();
    http.expectOne('/api/v1/staff/cases/case1/petitions').flush({ data: { petitions, canProvision }, meta });
    await settle();
  }

  /** One petition auto-opens: the detail request follows the list. */
  async function openPetition(overrides: Partial<PetitionDetail> = {}): Promise<void> {
    await showList([summary()]);
    http.expectOne('/api/v1/staff/petitions/p1').flush({ data: detail(overrides), meta });
    await settle();
    http.match('/api/v1/staff/cases/case1/member-options').forEach((r) => r.flush({ data: { employees: [{ id: 'u1', name: 'Wendy Writer', email: 'wendy@ih.test', role: 'petition_writer' }] }, meta }));
    await settle();
  }

  it('offers to create the primary petition when there is none, and only to someone who may', async () => {
    await showList([], true);
    expect(text()).toContain('No petition on this case yet');
    expect(text()).toContain('Create primary petition');

    fixture.destroy();
    fixture = TestBed.createComponent(PetitionTabComponent);
    fixture.componentRef.setInput('caseId', 'case1');
    component = fixture.componentInstance;
    await showList([], false);
    expect(text()).not.toContain('Create primary petition');
  });

  it('provisioning posts once, then opens the returned petition', async () => {
    await showList([], true);
    const run = component.provision();
    const req = http.expectOne('/api/v1/staff/cases/case1/petitions/provision');
    expect(req.request.method).toBe('POST');
    req.flush({ data: detail(), meta }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    http.expectOne('/api/v1/staff/cases/case1/petitions').flush({ data: { petitions: [summary()], canProvision: true }, meta });
    await fixture.whenStable();
    http.expectOne('/api/v1/staff/petitions/p1').flush({ data: detail(), meta });
    await run;
    await settle();
    http.match('/api/v1/staff/cases/case1/member-options').forEach((r) => r.flush({ data: { employees: [] }, meta }));
    expect(component.petition()?.id).toBe('p1');
  });

  it('lists several petitions without opening one, and selecting opens it', async () => {
    await showList([summary(), summary({ id: 'p2', sequence: 2, kind: 'rfe_response', title: 'RFE response' })]);
    expect(component.petition()).toBeNull();
    expect(text()).toContain('RFE response');
    expect(text()).toContain('sections approved 0/2');
    const opening = component.open(summary({ id: 'p2', sequence: 2 }));
    http.expectOne('/api/v1/staff/petitions/p2').flush({ data: detail({ id: 'p2' }), meta });
    await opening;
    await settle();
    http.match('/api/v1/staff/cases/case1/member-options').forEach((r) => r.flush({ data: { employees: [] }, meta }));
    expect(component.petition()?.id).toBe('p2');
  });

  it('shows a no-access state instead of an error when the server conceals the case', async () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/staff/cases/case1/petitions').flush({ error: { code: 'forbidden', message: 'no' } }, { status: 403, statusText: 'Forbidden' });
    await settle();
    expect(text()).toContain('isn’t available to you');
  });

  it('renders sections with review state and assignee, and the editor follows section ownership', async () => {
    await openPetition();
    expect(text()).toContain('Case overview');
    expect(text()).toContain('Wendy Writer');
    expect(text()).toContain('Unassigned');
    const area = fixture.nativeElement.querySelector('#section-body') as HTMLTextAreaElement;
    expect(area.value).toBe('Opening text');
    expect(area.disabled).toBe(false); // assigned to the actor: server says canEdit

    await component.selectSection('evidence_analysis'); // not assigned: server says canEdit false
    await settle();
    expect((fixture.nativeElement.querySelector('#section-body') as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('debounces autosave, patches with the current revision and advances it', async () => {
    vi.useFakeTimers();
    await openPetition();
    component.onBodyInput('A');
    component.onBodyInput('AB');
    component.onBodyInput('ABC');
    http.expectNone('/api/v1/staff/petitions/p1/sections/case_overview');
    expect(component.saveState()).toBe('unsaved');

    vi.advanceTimersByTime(1300);
    const req = http.expectOne('/api/v1/staff/petitions/p1/sections/case_overview');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ revision: 1, body: 'ABC' });
    req.flush({ data: detail({ revision: 2, sections: [section({ body: 'ABC' }), detail().sections[1]] }), meta });
    await vi.waitFor(() => expect(component.saveState()).toBe('saved'));
    expect(component.petition()?.revision).toBe(2);

    component.onBodyInput('ABCD');
    vi.advanceTimersByTime(1300);
    const next = http.expectOne('/api/v1/staff/petitions/p1/sections/case_overview');
    expect(next.request.body).toEqual({ revision: 2, body: 'ABCD' });
    next.flush({ data: detail({ revision: 3 }), meta });
    await vi.waitFor(() => expect(component.saveState()).toBe('saved'));
  });

  it('on a revision conflict it stops saving, keeps the local text, and reloads the latest on request', async () => {
    await openPetition();
    component.onBodyInput('My unsaved argument');
    const saving = component.flush();
    http.expectOne('/api/v1/staff/petitions/p1/sections/case_overview').flush({ error: { code: 'conflict', message: 'This petition was changed by someone else.', fieldErrors: { revision: 4, status: 'drafting' } } }, { status: 409, statusText: 'Conflict' });
    expect(await saving).toBe(false);
    await settle();
    expect(component.saveState()).toBe('conflict');
    expect(component.body()).toBe('My unsaved argument'); // never discarded silently
    expect(text()).toContain('Reload latest version');
    expect((fixture.nativeElement.querySelector('#section-body') as HTMLTextAreaElement).disabled).toBe(true);

    expect(await component.flush()).toBe(false);
    http.expectNone('/api/v1/staff/petitions/p1/sections/case_overview'); // halted: no automatic overwrite

    const reloading = component.reload();
    http.expectOne('/api/v1/staff/petitions/p1').flush({ data: detail({ revision: 4, sections: [section({ body: 'Theirs' }), detail().sections[1]] }), meta });
    await reloading;
    await settle();
    http.match('/api/v1/staff/cases/case1/member-options').forEach((r) => r.flush({ data: { employees: [] }, meta }));
    expect(component.saveState()).toBe('saved');
    expect(component.body()).toBe('Theirs');
  });

  it('shows a failed save as retryable and keeps the text for the retry', async () => {
    await openPetition();
    component.onBodyInput('Keep me');
    const saving = component.flush();
    http.expectOne('/api/v1/staff/petitions/p1/sections/case_overview').flush('boom', { status: 500, statusText: 'Server Error' });
    expect(await saving).toBe(false);
    expect(component.saveState()).toBe('error');
    const retry = component.flush();
    const again = http.expectOne('/api/v1/staff/petitions/p1/sections/case_overview');
    expect(again.request.body.body).toBe('Keep me');
    again.flush({ data: detail({ revision: 2 }), meta });
    await retry;
  });

  it('the assignee picker offers each employee by the id the API returns', async () => {
    await openPetition({ sections: [section({ actions: { canEdit: true, canMarkReady: true, canReturn: false, canApprove: false, canAssign: true } }), detail().sections[1]] });
    fixture.detectChanges();
    const options = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('#assignee option') as NodeListOf<HTMLOptionElement>).map((o) => [o.value, o.textContent?.trim()]);
    expect(options).toEqual([['', 'Unassigned'], ['u1', 'Wendy Writer']]);
  });

  it('assignment posts the chosen employee with the revision', async () => {
    await openPetition({ sections: [section({ actions: { canEdit: true, canMarkReady: true, canReturn: false, canApprove: false, canAssign: true } }), detail().sections[1]] });
    component.assigneeChoice.set('u1');
    const assigning = component.assign();
    await fixture.whenStable();
    const req = http.expectOne('/api/v1/staff/petitions/p1/sections/case_overview/assign');
    expect(req.request.body).toEqual({ revision: 1, assigneeId: 'u1' });
    req.flush({ data: detail({ revision: 2 }), meta });
    await assigning;
  });

  it('shows reviewer controls only when granted; return needs a note and sends nothing without one', async () => {
    await openPetition({ sections: [section({ reviewStatus: 'ready_for_review', actions: { canEdit: false, canMarkReady: false, canReturn: true, canApprove: true, canAssign: false } }), detail().sections[1]] });
    expect(text()).toContain('Approve section');
    expect(text()).toContain('Return with note');
    expect(text()).not.toContain('Mark ready for review');

    await component.returnSection();
    http.expectNone('/api/v1/staff/petitions/p1/sections/case_overview/return');
    expect(component.errors()['reviewNote']).toBeTruthy();

    component.reviewNote.set('Add dates.');
    const returning = component.returnSection();
    await fixture.whenStable();
    const req = http.expectOne('/api/v1/staff/petitions/p1/sections/case_overview/return');
    expect(req.request.body).toEqual({ revision: 1, reviewNote: 'Add dates.' });
    req.flush({ data: detail({ revision: 2 }), meta });
    await returning;
  });

  it('groups dependencies by type with readiness and the reason', async () => {
    await openPetition({
      dependencies: [dependency(), dependency({ id: 'd2', type: 'task', label: 'Collect letters', ready: false, status: 'in_progress', reason: 'The task is not completed.', requiredForFinalization: false })],
      dependencyProgress: { ready: 1, total: 1 },
    });
    expect(text()).toContain('Evidence');
    expect(text()).toContain('Tasks');
    expect(text()).toContain('Publication record');
    expect(text()).toContain('Not ready');
    expect(text()).toContain('The task is not completed.');
    expect(text()).toContain('Optional');
    expect(text()).toContain('operational counts, not an assessment');
  });

  it('linking loads same-case candidates and posts the chosen record', async () => {
    await openPetition({ actions: { ...NO_ACTIONS, canLink: true } });
    component.setPickerType('task');
    http.expectOne((r) => r.url === '/api/v1/staff/petitions/p1/dependency-candidates' && r.params.get('type') === 'task').flush({ data: { candidates: [{ refId: 't1', label: 'Collect letters', status: 'completed', linked: false }] }, meta });
    await settle();
    component.pickerRef.set('t1');
    const linking = component.addDependency();
    await fixture.whenStable();
    const req = http.expectOne('/api/v1/staff/petitions/p1/dependencies');
    expect(req.request.body).toEqual({ revision: 1, type: 'task', refId: 't1', requiredForFinalization: true });
    req.flush({ data: detail({ revision: 2 }), meta }, { status: 201, statusText: 'Created' });
    await linking;
    await settle();
    http.match((r) => r.url.endsWith('/dependency-candidates')).forEach((r) => r.flush({ data: { candidates: [] }, meta }));
  });

  it('submit posts the revision and adopts the new status', async () => {
    await openPetition({ actions: { ...NO_ACTIONS, canSubmit: true } });
    expect(text()).toContain('Submit for internal review');
    const submitting = component.run('submit');
    await fixture.whenStable();
    const req = http.expectOne('/api/v1/staff/petitions/p1/submit');
    expect(req.request.body).toEqual({ revision: 1 });
    req.flush({ data: detail({ status: 'internal_review', revision: 2, actions: { ...NO_ACTIONS, canApprove: true, canReturn: true } }), meta });
    await submitting;
    await settle();
    expect(text()).toContain('In internal review');
    expect(text()).toContain('Approve petition');
  });

  it('submit flushes pending text first so nothing typed is lost', async () => {
    await openPetition({ actions: { ...NO_ACTIONS, canSubmit: true } });
    component.onBodyInput('Last words');
    const submitting = component.run('submit');
    await Promise.resolve();
    http.expectOne('/api/v1/staff/petitions/p1/sections/case_overview').flush({ data: detail({ revision: 2 }), meta });
    await fixture.whenStable();
    const post = http.expectOne('/api/v1/staff/petitions/p1/submit');
    expect(post.request.body).toEqual({ revision: 2 });
    post.flush({ data: detail({ status: 'internal_review', revision: 3 }), meta });
    await submitting;
  });

  it('petition return needs a note; approve is offered only to a reviewer', async () => {
    await openPetition({ status: 'internal_review', actions: { ...NO_ACTIONS, canApprove: true, canReturn: true } });
    await component.run('return');
    http.expectNone('/api/v1/staff/petitions/p1/return');
    expect(component.errors()['internalReviewNote']).toBeTruthy();

    component.petitionNote.set('Rework the evidence section.');
    const returning = component.run('return');
    await fixture.whenStable();
    const req = http.expectOne('/api/v1/staff/petitions/p1/return');
    expect(req.request.body).toEqual({ revision: 1, internalReviewNote: 'Rework the evidence section.' });
    req.flush({ data: detail({ status: 'needs_changes', revision: 2 }), meta });
    await returning;
  });

  it('guards finalize: disabled with a visible reason while a required item is not ready, enabled and confirmed when ready', async () => {
    await openPetition({
      status: 'approved',
      actions: { ...NO_ACTIONS, canFinalize: true },
      dependencies: [dependency({ ready: false, status: 'missing', reason: 'Not yet satisfied.' })],
      dependencyProgress: { ready: 0, total: 1 },
    });
    const button = () => Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find((b) => b.textContent?.includes('Finalize petition'))!;
    expect(button().disabled).toBe(true);
    expect(text()).toContain('1 required item is not ready.');

    fixture.destroy();
    fixture = TestBed.createComponent(PetitionTabComponent);
    fixture.componentRef.setInput('caseId', 'case1');
    component = fixture.componentInstance;
    await openPetition({ status: 'approved', actions: { ...NO_ACTIONS, canFinalize: true }, dependencies: [dependency()], dependencyProgress: { ready: 1, total: 1 } });
    expect(button().disabled).toBe(false);
    button().click();
    expect(component.showFinalizeConfirm()).toBe(true);
    http.expectNone('/api/v1/staff/petitions/p1/finalize'); // confirmation first

    const finalizing = component.run('finalize');
    await fixture.whenStable();
    const req = http.expectOne('/api/v1/staff/petitions/p1/finalize');
    expect(req.request.body).toEqual({ revision: 1 });
    req.flush({ data: detail({ status: 'finalized', revision: 2, actions: NO_ACTIONS, versions: [{ id: 'v2', versionNumber: 2, reason: 'finalization', sourceRevision: 2, createdByName: 'Rita Reviewer', createdAt: '2026-01-02T10:00:00.000Z' }] }), meta });
    await finalizing;
    await settle();
    expect(text()).toContain('finalized and read-only');
  });

  it('a finalized petition is read-only and lists its immutable versions; opening one shows the snapshot', async () => {
    await openPetition({
      status: 'finalized',
      actions: NO_ACTIONS,
      sections: [section({ reviewStatus: 'approved', actions: { canEdit: false, canMarkReady: false, canReturn: false, canApprove: false, canAssign: false } })],
      versions: [
        { id: 'v2', versionNumber: 2, reason: 'finalization', sourceRevision: 9, createdByName: 'Rita Reviewer', createdAt: '2026-01-02T10:00:00.000Z' },
        { id: 'v1', versionNumber: 1, reason: 'approval', sourceRevision: 7, createdByName: 'Rita Reviewer', createdAt: '2026-01-01T10:00:00.000Z' },
      ],
    });
    expect((fixture.nativeElement.querySelector('#section-body') as HTMLTextAreaElement).disabled).toBe(true);
    expect(text()).toContain('Version 2 — Final');
    expect(text()).toContain('Version 1 — Approved');
    expect(text()).not.toContain('Submit for internal review');
    expect(text()).not.toContain('Mark ready for review');

    const opening = component.openVersion('v2');
    http.expectOne('/api/v1/staff/petitions/p1/versions/v2').flush({
      data: { id: 'v2', versionNumber: 2, reason: 'finalization', sourceRevision: 9, createdByName: 'Rita Reviewer', createdAt: null, petitionId: 'p1', kind: 'primary', title: 'EB-2 NIW — Petition', status: 'finalized', sections: [{ key: 'case_overview', title: 'Case overview', order: 1, required: true, body: 'Frozen text', reviewStatus: 'approved', assignedToName: '', reviewedByName: '', reviewNote: '' }], dependencies: [] },
      meta,
    });
    await opening;
    await settle();
    expect(text()).toContain('read-only, revision 9');
    expect(text()).toContain('Frozen text');
  });

  it('surfaces a retryable error when the list cannot be loaded', async () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/staff/cases/case1/petitions').flush('down', { status: 500, statusText: 'Server Error' });
    await settle();
    expect(text()).toContain('Petitions unavailable');
    const retry = component.loadList();
    http.expectOne('/api/v1/staff/cases/case1/petitions').flush({ data: { petitions: [], canProvision: true }, meta });
    await retry;
    await settle();
    expect(text()).toContain('No petition on this case yet');
  });
});
