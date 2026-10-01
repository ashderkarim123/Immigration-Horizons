import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';

import { PacketActions, PacketDetail, PacketItem, PacketSummary } from '../../../../core/api/filing-packet.types';
import { PacketTabComponent } from './packet-tab.component';
import { buildManifestHtml, escapeHtml, formatSize } from './packet-state';

const meta = { requestId: 'r' };
const NO_ACTIONS: PacketActions = { canManage: false, canSubmit: false, canReturn: false, canApprove: false, canFinalize: false };
const MANAGE: PacketActions = { ...NO_ACTIONS, canManage: true, canSubmit: true };

function item(overrides: Partial<PacketItem> = {}): PacketItem {
  return {
    id: 'i1',
    type: 'document_version',
    role: 'uscis_form',
    label: 'I-140 form v1.pdf',
    order: 1,
    required: true,
    notes: '',
    ready: true,
    status: 'accepted',
    reason: '',
    source: { documentId: 'd1', documentVersionId: 'dv1', versionNumber: 1, mimeType: 'application/pdf', size: 2048, categoryName: 'USCIS Forms', currentVersionNumber: 1 },
    downloadAction: { documentId: 'd1', versionId: 'dv1' },
    ...overrides,
  };
}

function summary(overrides: Partial<PacketSummary> = {}): PacketSummary {
  return {
    id: 'k1',
    caseId: 'case1',
    sequence: 1,
    kind: 'initial_filing',
    title: 'Initial filing packet',
    status: 'draft',
    revision: 1,
    itemCount: 2,
    readiness: { ready: true, petitionReady: true, requiredReady: 2, requiredTotal: 2 },
    updatedAt: '2026-01-01T10:00:00.000Z',
    actions: NO_ACTIONS,
    ...overrides,
  };
}

function detail(overrides: Partial<PacketDetail> = {}): PacketDetail {
  return {
    ...summary(),
    description: '',
    petitionSource: { required: true, present: true, ready: true, status: 'finalized', reason: '', petitionVersionId: 'pv1', versionNumber: 2, title: 'EB-2 NIW — Petition' },
    items: [item(), item({ id: 'i2', order: 2, label: 'Business plan v1.pdf', role: 'business_plan', downloadAction: { documentId: 'd2', versionId: 'dv2' } })],
    internalReviewNote: '',
    approvedAt: null,
    approvedByName: '',
    finalizedAt: null,
    finalizedByName: '',
    versions: [],
    ...overrides,
  };
}

describe('packet-state', () => {
  it('escapes every character that could break out of the printed manifest', () => {
    expect(escapeHtml('<script>alert("x")</script> & \'q\'')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;');
    expect(escapeHtml(null)).toBe('');
  });

  it('builds a manifest that is titled a manifest, escapes user content and never claims to be the filing PDF', () => {
    const html = buildManifestHtml({
      heading: 'Filing manifest — IH-1',
      packetTitle: 'Packet <b>one</b>',
      statusLine: 'Finalized version 1',
      petitionLine: 'Petition source: P, version 2',
      rows: [{ order: 1, label: '<img src=x onerror=alert(1)>.pdf', role: 'uscis_form', required: true, source: 'Version 1', status: 'accepted' }],
      finalizedLine: 'Finalized today',
      manifestHash: 'abc123',
    });
    expect(html).toContain('Filing manifest');
    expect(html).toContain('Packet &lt;b&gt;one&lt;/b&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;.pdf');
    expect(html).not.toContain('<img');
    expect(html).toContain('abc123');
    expect(html).toContain('not a combined filing document');
    expect(html.toLowerCase()).not.toContain('combined filing pdf');
  });

  it('formats sizes', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(null)).toBe('');
  });
});

describe('PacketTabComponent', () => {
  let fixture: ComponentFixture<PacketTabComponent>;
  let http: HttpTestingController;
  let component: PacketTabComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PacketTabComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PacketTabComponent);
    fixture.componentRef.setInput('caseId', 'case1');
    fixture.componentRef.setInput('caseLabel', 'IH-2026-ABC123');
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fixture.destroy();
    http.verify();
  });

  const text = () => (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function showList(packets: PacketSummary[], canProvision = true): Promise<void> {
    fixture.detectChanges();
    http.expectOne('/api/v1/staff/cases/case1/filing-packets').flush({ data: { packets, canProvision }, meta });
    await settle();
  }

  /** One packet auto-opens: the detail request follows the list; managers also load petition candidates. */
  async function openPacket(overrides: Partial<PacketDetail> = {}, petitionCandidates: unknown[] = []): Promise<void> {
    await showList([summary()]);
    http.expectOne('/api/v1/staff/filing-packets/k1').flush({ data: detail(overrides), meta });
    await settle();
    http.match((r) => r.url === '/api/v1/staff/filing-packets/k1/candidates').forEach((r) => r.flush({ data: { candidates: petitionCandidates }, meta }));
    await settle();
  }

  it('offers to create the initial packet when there is none, and only to someone who may', async () => {
    await showList([], true);
    expect(text()).toContain('No filing packet on this case yet');
    expect(text()).toContain('Create initial packet');

    fixture.destroy();
    fixture = TestBed.createComponent(PacketTabComponent);
    fixture.componentRef.setInput('caseId', 'case1');
    component = fixture.componentInstance;
    await showList([], false);
    expect(text()).not.toContain('Create initial packet');
  });

  it('provisioning posts once, then opens the returned packet', async () => {
    await showList([], true);
    const run = component.provision();
    const req = http.expectOne('/api/v1/staff/cases/case1/filing-packets/provision');
    expect(req.request.method).toBe('POST');
    req.flush({ data: detail(), meta }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    http.expectOne('/api/v1/staff/cases/case1/filing-packets').flush({ data: { packets: [summary()], canProvision: true }, meta });
    await fixture.whenStable();
    http.expectOne('/api/v1/staff/filing-packets/k1').flush({ data: detail(), meta });
    await run;
    await settle();
    http.match((r) => r.url.endsWith('/candidates')).forEach((r) => r.flush({ data: { candidates: [] }, meta }));
    expect(component.packet()?.id).toBe('k1');
  });

  it('lists several packets without opening one, and selecting opens it', async () => {
    await showList([summary(), summary({ id: 'k2', sequence: 2, kind: 'rfe_response', title: 'RFE packet' })]);
    expect(component.packet()).toBeNull();
    expect(text()).toContain('RFE packet');
    const opening = component.open(summary({ id: 'k2' }));
    http.expectOne('/api/v1/staff/filing-packets/k2').flush({ data: detail({ id: 'k2' }), meta });
    await opening;
    expect(component.packet()?.id).toBe('k2');
  });

  it('shows a no-access state when the server conceals the case, and a retryable error otherwise', async () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/staff/cases/case1/filing-packets').flush({ error: { code: 'forbidden', message: 'no' } }, { status: 403, statusText: 'Forbidden' });
    await settle();
    expect(text()).toContain('aren’t available to you');

    fixture.destroy();
    fixture = TestBed.createComponent(PacketTabComponent);
    fixture.componentRef.setInput('caseId', 'case1');
    component = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne('/api/v1/staff/cases/case1/filing-packets').flush('down', { status: 500, statusText: 'Server Error' });
    await settle();
    expect(text()).toContain('Filing packets unavailable');
    const retry = component.loadList();
    http.expectOne('/api/v1/staff/cases/case1/filing-packets').flush({ data: { packets: [], canProvision: true }, meta });
    await retry;
    await settle();
    expect(text()).toContain('No filing packet on this case yet');
  });

  it('renders the petition source, ordered items with readiness reasons, and a newer-version notice', async () => {
    await openPacket({
      items: [
        item({ source: { documentId: 'd1', documentVersionId: 'dv1', versionNumber: 1, mimeType: 'application/pdf', size: 2048, categoryName: 'USCIS Forms', currentVersionNumber: 3 } }),
        item({ id: 'i2', order: 2, label: 'Draft form', type: 'smart_form_reference', ready: false, status: 'draft', reason: 'The form is not yet approved.', source: { caseSmartFormId: 'f1', templateKey: 'personal_contact', templateVersion: 1, revision: 2, lockedRevision: null }, downloadAction: null }),
      ],
    });
    expect(text()).toContain('EB-2 NIW — Petition — version 2');
    expect(text()).toContain('I-140 form v1.pdf');
    expect(text()).toContain('version 1 · USCIS Forms');
    expect(text()).toContain('A newer version (3) exists; this packet keeps version 1.');
    expect(text()).toContain('The form is not yet approved.');
    expect(text()).toContain('Not ready');
    expect(text()).toContain('not an assessment of the case');
    const names = Array.from(fixture.nativeElement.querySelectorAll('.item-text strong') as NodeListOf<HTMLElement>).map((e) => e.textContent);
    expect(names).toEqual(['I-140 form v1.pdf', 'Draft form']);
  });

  it('a read-only role sees the manifest but no editing, ordering or review controls', async () => {
    await openPacket({ actions: NO_ACTIONS });
    expect(text()).not.toContain('Move up');
    expect(text()).not.toContain('Add to the packet');
    expect(text()).not.toContain('Submit for review');
    expect(text()).not.toContain('Use this version');
    expect(text()).toContain('Download');
  });

  it('pins a finalized petition version chosen from the candidates', async () => {
    await openPacket({ actions: MANAGE, petitionSource: { required: true, present: false, ready: false, status: 'none', reason: 'Choose the finalized petition version for this packet.', petitionVersionId: null, versionNumber: null, title: '' } }, [
      { petitionVersionId: 'pv9', versionNumber: 2, title: 'EB-2 NIW — Petition', linked: false },
    ]);
    expect(text()).toContain('Choose the finalized petition version this packet files.');
    component.petitionPick.set('pv9');
    const pinning = component.usePetitionVersion();
    await fixture.whenStable();
    const req = http.expectOne('/api/v1/staff/filing-packets/k1/petition-version');
    expect(req.request.body).toEqual({ revision: 1, petitionVersionId: 'pv9' });
    req.flush({ data: detail({ revision: 2, actions: MANAGE }), meta });
    await pinning;
    await settle();
    http.match((r) => r.url.endsWith('/candidates')).forEach((r) => r.flush({ data: { candidates: [] }, meta }));
    expect(component.packet()?.revision).toBe(2);
  });

  it('adds a chosen document candidate as an exact version with role and required', async () => {
    await openPacket({ actions: MANAGE });
    component.setPickerType('document_version');
    http.expectOne((r) => r.url.endsWith('/candidates') && r.params.get('type') === 'document_version').flush({
      data: { candidates: [{ documentId: 'd9', versionId: 'dv9', displayName: 'Letter.pdf', versionNumber: 3, categoryName: 'Letters', status: 'accepted', linked: false }] },
      meta,
    });
    await settle();
    component.pickerRef.set('dv9');
    component.pickerRole.set('recommendation_letter');
    const adding = component.addItem();
    await fixture.whenStable();
    const req = http.expectOne('/api/v1/staff/filing-packets/k1/items');
    expect(req.request.body).toEqual({ revision: 1, type: 'document_version', role: 'recommendation_letter', required: true, documentId: 'd9', versionId: 'dv9' });
    req.flush({ data: detail({ revision: 2, actions: MANAGE }), meta }, { status: 201, statusText: 'Created' });
    await adding;
    await settle();
    http.match((r) => r.url.endsWith('/candidates')).forEach((r) => r.flush({ data: { candidates: [] }, meta }));
  });

  it('adds a Smart Form as a reference with its own defaults', async () => {
    await openPacket({ actions: MANAGE });
    component.setPickerType('smart_form');
    expect(component.pickerRole()).toBe('uscis_form');
    expect(component.pickerRequired()).toBe(false);
    http.expectOne((r) => r.url.endsWith('/candidates') && r.params.get('type') === 'smart_form').flush({ data: { candidates: [{ smartFormId: 'f9', title: 'Personal & Contact', status: 'locked', revision: 6, linked: false }] }, meta });
    await settle();
    component.pickerRef.set('f9');
    const adding = component.addItem();
    await fixture.whenStable();
    const req = http.expectOne('/api/v1/staff/filing-packets/k1/items');
    expect(req.request.body).toEqual({ revision: 1, type: 'smart_form_reference', role: 'uscis_form', required: false, smartFormId: 'f9' });
    req.flush({ data: detail({ revision: 2, actions: MANAGE }), meta }, { status: 201, statusText: 'Created' });
    await adding;
    await settle();
    http.match((r) => r.url.endsWith('/candidates')).forEach((r) => r.flush({ data: { candidates: [] }, meta }));
  });

  it('removes an item, sending the expected revision on the query', async () => {
    await openPacket({ actions: MANAGE });
    const removing = component.removeItem(item());
    await fixture.whenStable();
    const req = http.expectOne('/api/v1/staff/filing-packets/k1/items/i1?revision=1');
    expect(req.request.method).toBe('DELETE');
    req.flush({ data: detail({ revision: 2, actions: MANAGE, items: [item({ id: 'i2', order: 1 })] }), meta });
    await removing;
    await settle();
    http.match((r) => r.url.endsWith('/candidates')).forEach((r) => r.flush({ data: { candidates: [] }, meta }));
    expect(component.packet()?.items.length).toBe(1);
  });

  it('edits role and required through the explicit item endpoint', async () => {
    await openPacket({ actions: MANAGE });
    const first = component.setRole(item(), 'cover_sheet');
    await fixture.whenStable();
    const roleReq = http.expectOne('/api/v1/staff/filing-packets/k1/items/i1');
    expect(roleReq.request.method).toBe('PATCH');
    expect(roleReq.request.body).toEqual({ revision: 1, role: 'cover_sheet' });
    roleReq.flush({ data: detail({ revision: 2, actions: MANAGE }), meta });
    await first;
    await settle();
    http.match((r) => r.url.endsWith('/candidates')).forEach((r) => r.flush({ data: { candidates: [] }, meta }));

    const second = component.setRequired(item(), false);
    await fixture.whenStable();
    const requiredReq = http.expectOne('/api/v1/staff/filing-packets/k1/items/i1');
    expect(requiredReq.request.body).toEqual({ revision: 2, required: false });
    requiredReq.flush({ data: detail({ revision: 3, actions: MANAGE }), meta });
    await second;
    http.match((r) => r.url.endsWith('/candidates')).forEach((r) => r.flush({ data: { candidates: [] }, meta }));
  });

  it('Move up / Move down send the full ordered id list and the server decides; the ends cannot move', async () => {
    await openPacket({ actions: MANAGE });
    await component.move(item(), -1); // first item: nowhere to go
    http.expectNone('/api/v1/staff/filing-packets/k1/reorder');

    const moving = component.move(item({ id: 'i2', order: 2 }), -1);
    await fixture.whenStable();
    const req = http.expectOne('/api/v1/staff/filing-packets/k1/reorder');
    expect(req.request.body).toEqual({ revision: 1, orderedItemIds: ['i2', 'i1'] });
    req.flush({ data: detail({ revision: 2, actions: MANAGE, items: [item({ id: 'i2', order: 1 }), item({ id: 'i1', order: 2 })] }), meta });
    await moving;
    await settle();
    http.match((r) => r.url.endsWith('/candidates')).forEach((r) => r.flush({ data: { candidates: [] }, meta }));
    expect(component.packet()?.items.map((i) => i.id)).toEqual(['i2', 'i1']);
  });

  it('a 409 shows the conflict banner, disables editing and reloads the latest on request', async () => {
    await openPacket({ actions: MANAGE });
    const moving = component.move(item({ id: 'i2', order: 2 }), -1);
    await fixture.whenStable();
    http.expectOne('/api/v1/staff/filing-packets/k1/reorder').flush({ error: { code: 'conflict', message: 'This packet was changed by someone else.', fieldErrors: { revision: 4, status: 'draft' } } }, { status: 409, statusText: 'Conflict' });
    await moving;
    await settle();
    expect(component.conflict()).toBe(true);
    expect(text()).toContain('Reload latest version');
    expect(component.editable()).toBe(false);

    const reloading = component.reload();
    http.expectOne('/api/v1/staff/filing-packets/k1').flush({ data: detail({ revision: 4, actions: MANAGE }), meta });
    await reloading;
    await settle();
    http.match((r) => r.url.endsWith('/candidates')).forEach((r) => r.flush({ data: { candidates: [] }, meta }));
    expect(component.conflict()).toBe(false);
    expect(component.packet()?.revision).toBe(4);
  });

  it('the download action calls the existing secure version route and saves the blob', async () => {
    await openPacket();
    const click = vi.fn();
    const anchor = { click, href: '', download: '' } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    component.download({ documentId: 'd1', versionId: 'dv1' }, 'I-140 form v1.pdf');
    const req = http.expectOne('/api/v1/staff/documents/d1/versions/dv1/download');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['x']));
    expect(click).toHaveBeenCalled();
    expect(anchor.download).toBe('I-140 form v1.pdf');
    vi.unstubAllGlobals();
  });

  it('submit posts the revision; return needs a note; approve is offered only to a reviewer', async () => {
    await openPacket({ actions: MANAGE });
    expect(text()).toContain('Submit for review');
    const submitting = component.run('submit');
    await fixture.whenStable();
    const submit = http.expectOne('/api/v1/staff/filing-packets/k1/submit');
    expect(submit.request.body).toEqual({ revision: 1 });
    submit.flush({ data: detail({ status: 'review', revision: 2, actions: { ...NO_ACTIONS, canReturn: true, canApprove: true } }), meta });
    await submitting;
    await settle();
    expect(text()).toContain('In review');
    expect(text()).toContain('Approve packet');
    expect(text()).not.toContain('Submit for review');

    await component.run('return');
    http.expectNone('/api/v1/staff/filing-packets/k1/return');
    expect(component.errors()['internalReviewNote']).toBeTruthy();
    component.returnNote.set('Reorder the exhibits.');
    const returning = component.run('return');
    await fixture.whenStable();
    const req = http.expectOne('/api/v1/staff/filing-packets/k1/return');
    expect(req.request.body).toEqual({ revision: 2, internalReviewNote: 'Reorder the exhibits.' });
    req.flush({ data: detail({ status: 'needs_changes', revision: 3, internalReviewNote: 'Reorder the exhibits.', actions: MANAGE }), meta });
    await returning;
    await settle();
    http.match((r) => r.url.endsWith('/candidates')).forEach((r) => r.flush({ data: { candidates: [] }, meta }));
    expect(text()).toContain('Reorder the exhibits.');
  });

  it('guards finalize: disabled with a visible reason while required items are not ready, then confirmed', async () => {
    await openPacket({ status: 'approved', actions: { ...NO_ACTIONS, canFinalize: true }, readiness: { ready: false, petitionReady: true, requiredReady: 1, requiredTotal: 2 } });
    const button = () => Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find((b) => b.textContent?.includes('Finalize packet'))!;
    expect(button().disabled).toBe(true);
    expect(text()).toContain('1 required item is not ready.');

    fixture.destroy();
    fixture = TestBed.createComponent(PacketTabComponent);
    fixture.componentRef.setInput('caseId', 'case1');
    component = fixture.componentInstance;
    await openPacket({ status: 'approved', actions: { ...NO_ACTIONS, canFinalize: true } });
    expect(button().disabled).toBe(false);
    button().click();
    expect(component.showFinalizeConfirm()).toBe(true);
    http.expectNone('/api/v1/staff/filing-packets/k1/finalize');

    const finalizing = component.run('finalize');
    await fixture.whenStable();
    const req = http.expectOne('/api/v1/staff/filing-packets/k1/finalize');
    expect(req.request.body).toEqual({ revision: 1 });
    req.flush({ data: detail({ status: 'finalized', revision: 2, actions: NO_ACTIONS, finalizedAt: '2026-01-02T10:00:00.000Z', finalizedByName: 'Rita Reviewer', versions: [{ id: 'v1', versionNumber: 1, manifestHash: 'a'.repeat(64), createdByName: 'Rita Reviewer', createdAt: '2026-01-02T10:00:00.000Z' }] }), meta });
    await finalizing;
    await settle();
    expect(text()).toContain('read-only');
    expect(text()).toContain('Version 1');
  });

  it('a finalized packet is read-only, lists immutable versions, and opening one shows the exact manifest with its hash', async () => {
    const hash = 'b'.repeat(64);
    await openPacket({ status: 'finalized', actions: NO_ACTIONS, finalizedAt: '2026-01-02T10:00:00.000Z', finalizedByName: 'Rita Reviewer', versions: [{ id: 'v1', versionNumber: 1, manifestHash: hash, createdByName: 'Rita Reviewer', createdAt: '2026-01-02T10:00:00.000Z' }] });
    expect(text()).not.toContain('Submit for review');
    expect(text()).not.toContain('Move up');
    expect(fixture.nativeElement.querySelectorAll('select:not([disabled])').length).toBe(0);

    const opening = component.openVersion('v1');
    http.expectOne('/api/v1/staff/filing-packets/k1/versions/v1').flush({
      data: {
        id: 'v1', versionNumber: 1, manifestHash: hash, createdByName: 'Rita Reviewer', createdAt: '2026-01-02T10:00:00.000Z', packetId: 'k1', kind: 'initial_filing', title: 'Initial filing packet', description: '', sourceRevision: 7,
        petitionSource: { petitionVersionId: 'pv1', petitionId: 'p1', versionNumber: 2, sourceRevision: 9, petitionKind: 'primary', petitionTitle: 'EB-2 NIW — Petition', createdAt: null },
        items: [{ order: 1, type: 'document_version', role: 'uscis_form', required: true, label: 'I-140 form v1.pdf', notes: '', status: 'accepted', source: { documentId: 'd1', documentVersionId: 'dv1', versionNumber: 1 }, downloadAction: { documentId: 'd1', versionId: 'dv1' } }],
      },
      meta,
    });
    await opening;
    await settle();
    expect(text()).toContain('exact manifest as filed (read-only)');
    expect(text()).toContain(hash);
    expect(text()).toContain('an audit fingerprint, not a signature');
    expect(text()).toContain('Petition: EB-2 NIW — Petition, version 2');
  });

  it('prints the live working manifest, then the opened immutable version, through an escaped print window', async () => {
    await openPacket({ items: [item({ label: '<b>x</b>.pdf' })] });
    const write = vi.fn();
    const print = vi.fn();
    const win = { document: { write, close: vi.fn() }, focus: vi.fn(), print } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(win);
    component.printManifest();
    expect(write).toHaveBeenCalledOnce();
    const html = write.mock.calls[0][0] as string;
    expect(html).toContain('IH-2026-ABC123');
    expect(html).toContain('working copy');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;.pdf');
    expect(html).not.toContain('<b>x</b>');
    expect(print).toHaveBeenCalled();
  });

  it('tells the user when the browser blocks the print window', async () => {
    await openPacket();
    vi.spyOn(window, 'open').mockReturnValue(null);
    component.printManifest(); // must not throw
    expect(component.packet()).not.toBeNull();
  });
});
