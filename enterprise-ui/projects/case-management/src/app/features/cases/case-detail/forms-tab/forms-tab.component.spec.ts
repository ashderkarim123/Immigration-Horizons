import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SmartFormActions, SmartFormDetail, SmartFormListItem } from '../../../../core/api/form.types';
import { FormsTabComponent } from './forms-tab.component';
import { countryOptions, isFieldVisible, withoutErrorsFor } from './forms-state';

const meta = { requestId: 'r' };
const NO_ACTIONS: SmartFormActions = { canEdit: false, canSubmit: false, canReturn: false, canApprove: false, canLock: false };

function item(overrides: Partial<SmartFormListItem> = {}): SmartFormListItem {
  return {
    id: 'f1',
    caseId: 'case1',
    title: 'Personal & Contact Information',
    templateKey: 'personal_contact',
    templateVersion: 1,
    status: 'draft',
    revision: 1,
    progress: { completedRequired: 1, totalRequired: 4, percent: 25 },
    updatedAt: '2026-01-01T10:00:00.000Z',
    submittedAt: null,
    approvedAt: null,
    lockedAt: null,
    ...overrides,
  };
}

function detail(overrides: Partial<SmartFormDetail> = {}): SmartFormDetail {
  return {
    ...item(),
    sections: [
      {
        key: 'identity',
        title: 'Personal information',
        fields: [
          { key: 'given_name', label: 'Given name', type: 'text', required: true },
          { key: 'has_other', label: 'Other names?', type: 'yes_no' },
          { key: 'other_names', label: 'Other names used', type: 'text', visibilityCondition: { field: 'has_other', op: 'equals', value: true } },
        ],
      },
      { key: 'staff_review', title: 'Staff notes', fields: [{ key: 'staff_notes', label: 'Internal notes', type: 'textarea', staffOnly: true }] },
    ],
    answers: { given_name: 'Casey' },
    lastSavedAt: null,
    lastSavedByName: '',
    returnedAt: null,
    clientReviewNote: '',
    internalReviewNote: '',
    lockedRevision: null,
    actions: { ...NO_ACTIONS, canEdit: true, canSubmit: true },
    ...overrides,
  };
}

describe('forms-state', () => {
  it('shows a field only when its condition holds, and an unknown operator never reveals it', () => {
    const when = (op: 'equals' | 'notEquals' | 'isTruthy' | 'isFalsy', value?: unknown) => ({ visibilityCondition: { field: 'b', op, value } });
    expect(isFieldVisible({}, {})).toBe(true);
    expect(isFieldVisible(when('equals', true), { b: true })).toBe(true);
    expect(isFieldVisible(when('equals', true), {})).toBe(false);
    expect(isFieldVisible(when('notEquals', true), {})).toBe(true);
    expect(isFieldVisible(when('equals', 'x'), { b: ['x', 'y'] })).toBe(true);
    expect(isFieldVisible(when('isTruthy'), { b: [] })).toBe(false);
    expect(isFieldVisible(when('isFalsy'), { b: false })).toBe(true);
    expect(isFieldVisible({ visibilityCondition: { field: 'b', op: 'eval' as 'equals', value: 1 } }, { b: 1 })).toBe(false);
  });

  it('clears a field’s own and group-row errors only', () => {
    const errors = { trips: 'x', 'trips[0].when': 'y', name: 'z', tripsExtra: 'keep' };
    expect(withoutErrorsFor(errors, ['trips'])).toEqual({ name: 'z', tripsExtra: 'keep' });
  });

  it('offers real countries and not region groupings', () => {
    const codes = countryOptions().map((c) => c.code);
    expect(codes).toContain('US');
    expect(codes).toContain('PK');
    expect(codes).not.toContain('EU');
    expect(codes).not.toContain('UN');
  });
});

describe('FormsTabComponent', () => {
  let fixture: ComponentFixture<FormsTabComponent>;
  let http: HttpTestingController;
  let component: FormsTabComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsTabComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FormsTabComponent);
    fixture.componentRef.setInput('caseId', 'case1');
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy(); // clears the autosave timer
    http.verify();
  });

  const text = () => fixture.nativeElement.textContent as string;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function showList(forms: SmartFormListItem[] = [item()], canProvision = true): Promise<void> {
    fixture.detectChanges();
    http.expectOne('/api/v1/staff/cases/case1/forms').flush({ data: { forms, canProvision }, meta });
    await settle();
  }

  async function openForm(overrides: Partial<SmartFormDetail> = {}): Promise<void> {
    await showList();
    const opening = component.open(item());
    http.expectOne('/api/v1/staff/forms/f1').flush({ data: detail(overrides), meta });
    await opening;
    await settle();
  }

  it('lists the case forms with status and progress', async () => {
    await showList([item(), item({ id: 'f2', title: 'Immigration & Travel History', status: 'needs_changes' })]);
    expect(text()).toContain('Personal & Contact Information');
    expect(text()).toContain('Changes requested');
    expect(fixture.nativeElement.querySelectorAll('[role="progressbar"]').length).toBe(2);
  });

  it('offers to add forms when the case has none, and only to someone who may', async () => {
    await showList([], true);
    expect(text()).toContain('No forms on this case yet');
    expect(text()).toContain('Add case forms');

    fixture.destroy();
    fixture = TestBed.createComponent(FormsTabComponent);
    fixture.componentRef.setInput('caseId', 'case1');
    component = fixture.componentInstance;
    await showList([], false);
    expect(text()).not.toContain('Add case forms');
  });

  it('provisioning posts once and refreshes the list from the response', async () => {
    await showList([], true);
    const run = component.provision();
    const req = http.expectOne('/api/v1/staff/cases/case1/forms/provision');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { created: ['personal_contact'], existing: [], forms: [item()] }, meta }, { status: 201, statusText: 'Created' });
    await run;
    await settle();
    expect(component.list()?.forms.length).toBe(1);
  });

  it('shows a no-access state instead of an error when the server conceals the case', async () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/staff/cases/case1/forms').flush({ error: { code: 'forbidden', message: 'no' } }, { status: 403, statusText: 'Forbidden' });
    await settle();
    expect(text()).toContain('aren’t available to you');
  });

  it('renders staff-only fields with a marker and hides conditional fields until their condition holds', async () => {
    await openForm();
    expect(text()).toContain('Staff only');
    expect(text()).toContain('Internal notes');
    expect(text()).not.toContain('Other names used');
    component.setAnswer('has_other', true);
    await settle();
    expect(text()).toContain('Other names used');
  });

  it('shows only the review controls the server granted', async () => {
    await openForm({ status: 'submitted', actions: { ...NO_ACTIONS, canReturn: true, canApprove: true } });
    expect(text()).toContain('Return for changes');
    expect(text()).toContain('Approve');
    expect(text()).not.toContain('Lock as final');
    expect(text()).not.toContain('Submit for review');
    expect(fixture.nativeElement.querySelector('input[type="text"]').disabled).toBe(true);
  });

  it('autosaves only the dirty keys with the current revision and advances the revision', async () => {
    await openForm();
    component.setAnswer('given_name', 'Casey R');
    expect(component.saveState()).toBe('unsaved');

    const first = component.flush();
    const req = http.expectOne('/api/v1/staff/forms/f1/answers');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ revision: 1, answers: { given_name: 'Casey R' } });
    req.flush({ data: detail({ revision: 2, progress: { completedRequired: 2, totalRequired: 4, percent: 50 } }), meta });
    expect(await first).toBe(true);
    expect(component.saveState()).toBe('saved');

    component.setAnswer('has_other', false);
    const second = component.flush();
    const next = http.expectOne('/api/v1/staff/forms/f1/answers');
    expect(next.request.body).toEqual({ revision: 2, answers: { has_other: false } });
    next.flush({ data: detail({ revision: 3 }), meta });
    await second;
  });

  it('on a revision conflict halts saving, explains it, and reloads the latest version on request', async () => {
    await openForm();
    component.setAnswer('given_name', 'Mine');
    const saving = component.flush();
    http.expectOne('/api/v1/staff/forms/f1/answers').flush({ error: { code: 'conflict', message: 'This form was changed by someone else.', fieldErrors: { revision: 5, status: 'draft' } } }, { status: 409, statusText: 'Conflict' });
    expect(await saving).toBe(false);
    await settle();
    expect(component.saveState()).toBe('conflict');
    expect(text()).toContain('Reload latest version');
    expect(fixture.nativeElement.querySelector('input[type="text"]').disabled).toBe(true);

    expect(await component.flush()).toBe(false); // halted: nothing further is sent
    http.expectNone('/api/v1/staff/forms/f1/answers');

    const reloading = component.reload();
    http.expectOne('/api/v1/staff/forms/f1').flush({ data: detail({ revision: 5, answers: { given_name: 'Theirs' } }), meta });
    await reloading;
    expect(component.saveState()).toBe('saved');
    expect(component.answers()['given_name']).toBe('Theirs');
  });

  it('maps server validation errors onto the field and keeps the edit pending for retry', async () => {
    await openForm();
    component.setAnswer('given_name', 'x');
    const saving = component.flush();
    http.expectOne('/api/v1/staff/forms/f1/answers').flush({ error: { code: 'validation_error', message: 'bad', fieldErrors: { given_name: 'Use at most 500 characters.' } } }, { status: 400, statusText: 'Bad Request' });
    expect(await saving).toBe(false);
    await settle();
    expect(component.saveState()).toBe('error');
    expect(text()).toContain('Use at most 500 characters.');
  });

  it('submit flushes the pending edit first, then posts the new revision', async () => {
    await openForm();
    component.setAnswer('given_name', 'Casey R');
    const submitting = component.submit();
    await Promise.resolve();
    http.expectOne('/api/v1/staff/forms/f1/answers').flush({ data: detail({ revision: 2 }), meta });
    await fixture.whenStable();
    const post = http.expectOne('/api/v1/staff/forms/f1/submit');
    expect(post.request.body).toEqual({ revision: 2 });
    post.flush({ data: detail({ revision: 3, status: 'submitted', actions: NO_ACTIONS }), meta });
    await submitting;
    expect(component.form()?.status).toBe('submitted');
  });

  it('return for changes needs a client note and never sends without one', async () => {
    await openForm({ status: 'submitted', actions: { ...NO_ACTIONS, canReturn: true } });
    component.startReview('return');
    await component.confirmReview();
    http.expectNone('/api/v1/staff/forms/f1/return');
    expect(component.errors()['clientReviewNote']).toBeTruthy();

    component.clientNote.set('Please confirm your name.');
    component.internalNote.set('Check passport');
    const returning = component.confirmReview();
    await fixture.whenStable();
    const req = http.expectOne('/api/v1/staff/forms/f1/return');
    expect(req.request.body).toEqual({ revision: 1, clientReviewNote: 'Please confirm your name.', internalReviewNote: 'Check passport' });
    req.flush({ data: detail({ status: 'needs_changes', revision: 2, actions: NO_ACTIONS }), meta });
    await returning;
    expect(component.form()?.status).toBe('needs_changes');
  });

  it('locking asks for confirmation and posts the revision', async () => {
    await openForm({ status: 'approved', actions: { ...NO_ACTIONS, canLock: true } });
    fixture.nativeElement.querySelectorAll('button').forEach((b: HTMLButtonElement) => {
      if (b.textContent?.includes('Lock as final')) b.click();
    });
    expect(component.showLockConfirm()).toBe(true);
    http.expectNone('/api/v1/staff/forms/f1/lock');

    const locking = component.lock();
    await fixture.whenStable();
    const req = http.expectOne('/api/v1/staff/forms/f1/lock');
    expect(req.request.body).toEqual({ revision: 1 });
    req.flush({ data: detail({ status: 'locked', revision: 2, lockedRevision: 2, actions: NO_ACTIONS }), meta });
    await locking;
    await settle();
    expect(text()).toContain('locked at revision 2');
  });
});
