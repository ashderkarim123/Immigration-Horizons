import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { UscisCaseList, UscisEvent, UscisFiling, UscisFilingActions, UscisFilingDetail, UscisProviderStatus } from '../../../../core/api/uscis.types';
import { TrackingTabComponent } from './tracking-tab.component';

const meta = { requestId: 'r' };
const CASE = '/api/v1/staff/cases/case1/uscis';
const PROVIDER = '/api/v1/staff/uscis/provider-status';
const FULL: UscisFilingActions = { canEdit: true, canAddStatus: true, canArchive: true, canSync: true };
const READ_ONLY: UscisFilingActions = { canEdit: false, canAddStatus: false, canArchive: false, canSync: false };
const ON: UscisProviderStatus = { configured: true, enabled: true, environment: 'sandbox' };
const OFF: UscisProviderStatus = { configured: false, enabled: false, environment: 'sandbox' };

/** Shaped like a filing in GET /staff/cases/:id/uscis (server/services/uscisTracking.js toFilingDto). */
function filing(overrides: Partial<UscisFiling> = {}): UscisFiling {
  return {
    id: 'f1',
    caseId: 'case1',
    title: 'I-140 petition',
    formType: 'I-140',
    formSubType: null,
    receiptNumber: 'IOE1234567890',
    providerEligible: true,
    filedAt: '2026-01-05T00:00:00.000Z',
    receiptDate: null,
    serviceCenter: 'Nebraska',
    clientVisible: false,
    archived: false,
    provider: { type: 'none', enabled: false, lastCheckedAt: null, lastSuccessfulSyncAt: null, lastErrorAt: null, lastErrorCode: null },
    currentStatus: {
      category: 'rfe_issued',
      title: 'Request for Additional Evidence Was Mailed',
      description: 'Send employment letters.',
      occurredAt: '2026-03-10T00:00:00.000Z',
      source: 'manual',
      actionRequired: true,
      responseDueAt: '2020-01-01T00:00:00.000Z',
    },
    updatedAt: '2026-03-10T00:00:00.000Z',
    createdAt: '2026-01-05T00:00:00.000Z',
    actions: FULL,
    ...overrides,
  };
}

const event = (overrides: Partial<UscisEvent> = {}): UscisEvent => ({
  id: 'e1',
  statusCategory: 'received',
  statusTitle: 'Case Was Received',
  statusDescription: '',
  occurredAt: '2026-02-01T00:00:00.000Z',
  observedAt: '2026-02-01T00:00:00.000Z',
  source: 'manual',
  actionRequired: false,
  responseDueAt: null,
  clientVisible: true,
  createdByName: 'Pat Manager',
  createdAt: '2026-02-01T00:00:00.000Z',
  ...overrides,
});

const detailOf = (f: UscisFiling, events: UscisEvent[] = [event()]): UscisFilingDetail => ({ filing: f, events, eventTotal: events.length });

describe('TrackingTabComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<TrackingTabComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const buttons = () => Array.from(el().querySelectorAll('button')).map((b) => b.textContent?.trim());

  /** Mounts the tab and answers its two startup requests; the first filing's detail is answered when `details` has it. */
  function setup(filings: UscisFiling[], opts: { canCreate?: boolean; provider?: UscisProviderStatus | null; details?: UscisFilingDetail[]; initialFilingId?: string } = {}) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TrackingTabComponent);
    const ref = fixture.componentRef as ComponentRef<TrackingTabComponent>;
    ref.setInput('caseId', 'case1');
    if (opts.initialFilingId) ref.setInput('initialFilingId', opts.initialFilingId);
    fixture.detectChanges();

    const provider = http.expectOne(PROVIDER);
    if (opts.provider === null) provider.flush({ error: { code: 'server_error', message: 'x' } }, { status: 500, statusText: 'Server Error' });
    else provider.flush({ data: opts.provider ?? ON, meta });
    const list: UscisCaseList = { filings, actions: { canCreate: opts.canCreate ?? true } };
    http.expectOne(CASE).flush({ data: list, meta });

    for (const d of opts.details ?? filings.slice(0, 1).map((f) => detailOf(f))) http.expectOne(`/api/v1/staff/uscis/${d.filing.id}`).flush({ data: d, meta });
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  afterEach(() => http.verify());

  it('empty: invites the first filing only to someone who may add one', () => {
    setup([], { canCreate: true });
    expect(text()).toContain('No USCIS filings tracked yet');
    expect(buttons()).toContain('Add filing');
  });

  it('empty and view-only: says so and offers nothing to do', () => {
    setup([], { canCreate: false });
    expect(text()).toContain('No USCIS filing has been added to this case.');
    expect(buttons()).not.toContain('Add filing');
  });

  it('loaded: lists every filing, selects the first, shows receipt, current status, due date and visibility as text', () => {
    setup([filing(), filing({ id: 'f2', title: 'I-485', formType: 'I-485', receiptNumber: null, currentStatus: null, clientVisible: true })], {
      details: [detailOf(filing(), [event({ id: 'e2', statusTitle: 'Request for Additional Evidence Was Mailed', statusCategory: 'rfe_issued', occurredAt: '2026-03-10T00:00:00.000Z', actionRequired: true, responseDueAt: '2020-01-01T00:00:00.000Z', clientVisible: false }), event()])],
    });
    const cards = el().querySelectorAll('.filing-card');
    expect(cards.length).toBe(2);
    expect(cards[0].getAttribute('aria-current')).toBe('true');
    for (const t of ['IOE1234567890', 'Action required', 'Internal only', 'No status recorded yet', 'Shared with client']) expect(text()).toContain(t);
    expect(text()).toContain('response due Jan 1, 2020 (overdue)');
    const times = Array.from(el().querySelectorAll('.timeline-item strong')).map((n) => n.textContent);
    expect(times).toEqual(['Request for Additional Evidence Was Mailed', 'Case Was Received']);
    expect(el().querySelector('ol.timeline')?.getAttribute('aria-label')).toContain('newest first');
  });

  it('selecting another filing loads its own detail; a deep link opens the filing it names', () => {
    const second = filing({ id: 'f2', title: 'I-485', formType: 'I-485' });
    const component = setup([filing(), second], { initialFilingId: 'f2', details: [detailOf(second)] });
    expect(component.selectedId()).toBe('f2');
    (el().querySelectorAll('.filing-card')[0] as HTMLButtonElement).click();
    http.expectOne('/api/v1/staff/uscis/f1').flush({ data: detailOf(filing()), meta });
    expect(component.selectedId()).toBe('f1');
  });

  it('refresh: never offered when the server says this actor or filing cannot sync, whatever the provider says', () => {
    setup([filing({ actions: { ...FULL, canSync: false } })], { provider: ON });
    expect(buttons()).not.toContain('Refresh from USCIS');
    expect(buttons()).toContain('Add status update');
  });

  it('refresh: offered when the server allows it for this filing', () => {
    setup([filing()], { provider: ON });
    expect(buttons()).toContain('Refresh from USCIS');
  });

  it('provider off: manual tracking works, there is no refresh control and only a calm note', () => {
    setup([filing({ actions: { ...FULL, canSync: false } })], { provider: OFF });
    expect(buttons()).not.toContain('Refresh from USCIS');
    expect(text()).toContain('Automatic USCIS refresh is not enabled in this environment');
    expect(text()).not.toContain('connected');
  });

  it('view-only: sees the filing and its history but no control that changes anything', () => {
    setup([filing({ actions: READ_ONLY })], { canCreate: false });
    expect(text()).toContain('IOE1234567890');
    for (const label of ['Add filing', 'Add status update', 'Refresh from USCIS', 'Edit details', 'Archive']) expect(buttons()).not.toContain(label);
  });

  it('add filing: the receipt is uppercased, the body matches the API, and the new filing is listed and selected', () => {
    const component = setup([], { canCreate: true });
    component.openAdd();
    fixture.detectChanges();

    component.fFormType.set('I-485');
    component.fTitle.set('  Adjustment of status ');
    component.fReceipt.set('lin2222222222');
    component.fClientVisible.set(true);
    // the receipt input uppercases as the user types
    const input = el().querySelector('#f-receipt') as HTMLInputElement;
    input.value = 'lin2222222222';
    input.dispatchEvent(new Event('input'));
    expect(component.fReceipt()).toBe('LIN2222222222');

    component.submitFiling();
    const req = http.expectOne(CASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'Adjustment of status', formType: 'I-485', formSubType: null, receiptNumber: 'LIN2222222222', serviceCenter: null, filedAt: null, receiptDate: null, clientVisible: true });

    const created = filing({ id: 'f9', title: 'Adjustment of status', formType: 'I-485', receiptNumber: 'LIN2222222222', currentStatus: null });
    req.flush({ data: detailOf(created, []), meta }, { status: 201, statusText: 'Created' });
    fixture.detectChanges();
    expect(component.filingDialog()).toBeNull();
    expect(component.selectedId()).toBe('f9');
    expect(component.filings().map((f) => f.id)).toEqual(['f9']);
  });

  it('add filing: required fields gate the button; a duplicate receipt is explained beside the receipt input and the dialog stays open', () => {
    const component = setup([], { canCreate: true });
    component.openAdd();
    fixture.detectChanges();
    const submit = () => Array.from(el().querySelectorAll('.modal-footer button')).find((b) => b.textContent?.includes('Add filing')) as HTMLButtonElement;
    expect(submit().disabled).toBe(true);

    component.fFormType.set('I-140');
    component.fTitle.set('I-140 petition');
    component.fReceipt.set('IOE1234567890');
    fixture.detectChanges();
    expect(submit().disabled).toBe(false);

    component.submitFiling();
    http.expectOne(CASE).flush({ error: { code: 'conflict', message: 'That receipt number is already tracked on another filing.', fieldErrors: [{ field: 'receiptNumber', message: 'Another filing already uses this receipt number.' }] } }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(component.filingDialog()).toBe('add');
    expect(component.fReceipt()).toBe('IOE1234567890');
    expect(component.saving()).toBe(false);
    expect(el().querySelector('#f-receipt-err')?.textContent).toContain('Another filing already uses this receipt number.');
    expect(el().querySelector('#f-receipt')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('edit: prefilled from the filing, saves through PATCH, and the list row follows the response', () => {
    const component = setup([filing()]);
    component.openEdit();
    fixture.detectChanges();
    expect(component.fReceipt()).toBe('IOE1234567890');
    expect(component.fFiledAt()).toBe('2026-01-05');

    component.fTitle.set('I-140 (premium)');
    component.fServiceCenter.set('');
    component.submitFiling();
    const req = http.expectOne('/api/v1/staff/uscis/f1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toMatchObject({ title: 'I-140 (premium)', serviceCenter: null, receiptNumber: 'IOE1234567890', filedAt: '2026-01-05' });
    req.flush({ data: detailOf(filing({ title: 'I-140 (premium)', serviceCenter: null })), meta });

    expect(component.filings()[0].title).toBe('I-140 (premium)');
    expect(component.filingDialog()).toBeNull();
  });

  it('add status: due date only with action required, the date is sent as entered, and the timeline updates', () => {
    const component = setup([filing()]);
    component.openStatus();
    fixture.detectChanges();
    expect(el().querySelector('#s-due')).toBeNull();

    component.sCategory.set('rfe_issued');
    component.sTitle.set('Request for Evidence');
    component.sOccurredAt.set('2026-04-02T09:30');
    component.sActionRequired.set(true);
    component.sDue.set('2026-06-30');
    component.sClientVisible.set(true);
    fixture.detectChanges();
    expect(el().querySelector('#s-due')).toBeTruthy();

    component.submitStatus();
    const req = http.expectOne('/api/v1/staff/uscis/f1/status-events');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ statusCategory: 'rfe_issued', statusTitle: 'Request for Evidence', statusDescription: '', occurredAt: new Date('2026-04-02T09:30').toISOString(), actionRequired: true, responseDueAt: '2026-06-30', clientVisible: true });
    const added = event({ id: 'e9', statusTitle: 'Request for Evidence', actionRequired: true, responseDueAt: '2026-06-30T00:00:00.000Z' });
    req.flush({ data: detailOf(filing(), [added, event()]), meta }, { status: 201, statusText: 'Created' });
    fixture.detectChanges();

    expect(component.statusOpen()).toBe(false);
    expect(Array.from(el().querySelectorAll('.timeline-item strong')).map((n) => n.textContent)).toEqual(['Request for Evidence', 'Case Was Received']);
  });

  it('add status: unchecking action required drops the due date; a server field error appears beside its input and keeps what was typed', () => {
    const component = setup([filing()]);
    component.openStatus();
    component.sTitle.set('Interview');
    component.sActionRequired.set(true);
    component.sDue.set('2026-06-30');
    component.sActionRequired.set(false);

    component.submitStatus();
    const req = http.expectOne('/api/v1/staff/uscis/f1/status-events');
    expect(req.request.body.responseDueAt).toBeNull();
    req.flush({ error: { code: 'validation_error', message: 'Please correct the highlighted fields.', fieldErrors: [{ field: 'occurredAt', message: 'A status cannot have occurred in the future.' }] } }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();

    expect(component.statusOpen()).toBe(true);
    expect(component.sTitle()).toBe('Interview');
    expect(text()).toContain('A status cannot have occurred in the future.');
  });

  it('refresh: reports a change or no change, and a provider outage leaves the known status in place and shows the safe message', () => {
    const component = setup([filing()]);
    component.sync();
    expect(component.syncing()).toBe(true);
    http.expectOne('/api/v1/staff/uscis/f1/sync').flush({ data: detailOf(filing()), meta });
    fixture.detectChanges();
    expect(component.notice()).toEqual({ kind: 'success', text: 'Checked with USCIS. There is no change.' });

    component.sync();
    http.expectOne('/api/v1/staff/uscis/f1/sync').flush({ data: detailOf(filing(), [event({ id: 'e5', statusTitle: 'Case Was Approved' }), event()]), meta });
    expect(component.notice()?.text).toBe('Status updated from USCIS.');

    component.sync();
    http.expectOne('/api/v1/staff/uscis/f1/sync').flush({ error: { code: 'provider_unavailable', message: 'USCIS status could not be retrieved right now. The last known status is unchanged.' } }, { status: 502, statusText: 'Bad Gateway' });
    expect(component.notice()).toEqual({ kind: 'error', text: 'USCIS status could not be retrieved right now. The last known status is unchanged.' });
    // the server recorded a safe error code, so the detail is re-read to show it
    http.expectOne('/api/v1/staff/uscis/f1').flush({ data: detailOf(filing({ provider: { type: 'uscis_case_status', enabled: true, lastCheckedAt: '2026-04-01T00:00:00.000Z', lastSuccessfulSyncAt: null, lastErrorAt: '2026-04-01T00:00:00.000Z', lastErrorCode: 'provider_unavailable' } })), meta });
    fixture.detectChanges();
    expect(text()).toContain('The last refresh failed because USCIS could not be reached.');
    expect(text()).toContain('Request for Additional Evidence Was Mailed');
    expect(component.notice()?.kind).toBe('error');
  });

  it('refresh: a rate limit is shown as such and does not trigger a re-read', () => {
    const component = setup([filing()]);
    component.sync();
    http.expectOne('/api/v1/staff/uscis/f1/sync').flush({ error: { code: 'rate_limited', message: 'Too many refresh requests. Try again in a minute.' } }, { status: 429, statusText: 'Too Many Requests' });
    expect(component.notice()).toEqual({ kind: 'error', text: 'Too many refresh requests. Try again in a minute.' });
  });

  it('archive: asks for confirmation, then removes the filing from the active list and opens the next one', () => {
    const second = filing({ id: 'f2', title: 'I-485', formType: 'I-485' });
    const component = setup([filing(), second]);
    component.archiveOpen.set(true);
    component.archive();
    const req = http.expectOne('/api/v1/staff/uscis/f1/archive');
    expect(req.request.method).toBe('POST');
    req.flush({ data: detailOf(filing({ archived: true })), meta });
    http.expectOne('/api/v1/staff/uscis/f2').flush({ data: detailOf(second), meta });

    expect(component.filings().map((f) => f.id)).toEqual(['f2']);
    expect(component.selectedId()).toBe('f2');
  });

  it('a filing that is gone or no longer accessible says so instead of failing silently', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TrackingTabComponent);
    (fixture.componentRef as ComponentRef<TrackingTabComponent>).setInput('caseId', 'case1');
    fixture.detectChanges();
    http.expectOne(PROVIDER).flush({ data: ON, meta });
    http.expectOne(CASE).flush({ data: { filings: [filing()], actions: { canCreate: false } }, meta });
    http.expectOne('/api/v1/staff/uscis/f1').flush({ error: { code: 'not_found', message: 'Filing not found.' } }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(text()).toContain('Filing not available');
  });

  it('a failed list load is retryable; a failed provider-status read is not an error', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TrackingTabComponent);
    (fixture.componentRef as ComponentRef<TrackingTabComponent>).setInput('caseId', 'case1');
    fixture.detectChanges();
    http.expectOne(PROVIDER).flush({ error: { code: 'server_error', message: 'x' } }, { status: 500, statusText: 'Server Error' });
    http.expectOne(CASE).flush({ error: { code: 'server_error', message: 'x' } }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(el().querySelector('ih-error-state')).toBeTruthy();
    fixture.componentInstance.load();
    http.expectOne(PROVIDER).flush({ data: ON, meta });
    http.expectOne(CASE).flush({ data: { filings: [], actions: { canCreate: true } }, meta });
    fixture.detectChanges();
    expect(text()).toContain('No USCIS filings tracked yet');
  });
});
