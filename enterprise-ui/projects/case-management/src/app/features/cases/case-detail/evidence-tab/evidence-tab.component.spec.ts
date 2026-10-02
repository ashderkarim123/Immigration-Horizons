import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { EligibleDocument, EvidenceListResponse, EvidenceRequirementDetail, EvidenceTemplateSummary } from '../../../../core/api/evidence.types';
import { EvidenceTabComponent } from './evidence-tab.component';

const meta = { requestId: 'r' };
const BASE = '/api/v1/staff/cases/case1/evidence';

/** Shaped like GET /api/v1/staff/cases/:caseId/evidence requirements — `id`, never `_id`. */
function requirement(overrides: Partial<EvidenceRequirementDetail> = {}): EvidenceRequirementDetail {
  return {
    id: 'req1',
    caseId: 'case1',
    workspaceId: 'ws1',
    source: 'template',
    templateKey: 'eb2_niw_base',
    templateVersion: 1,
    templateItemKey: 'degree',
    section: 'Basic Eligibility',
    order: 10,
    title: 'Advanced degree',
    description: 'Proof of a U.S. equivalent Master’s degree.',
    importance: 'required',
    status: 'missing',
    clientVisible: false,
    clientGuidance: '',
    staffGuidance: 'Usually a degree evaluation.',
    internalNotes: '',
    linkedDocuments: [],
    waivedReason: null,
    notApplicableReason: null,
    satisfiedAt: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z',
    ...overrides,
  };
}

function list(requirements: EvidenceRequirementDetail[], canManage: boolean): EvidenceListResponse {
  const required = requirements.filter((r) => r.importance === 'required');
  return {
    requirements,
    actions: { canManage },
    summary: {
      total: requirements.length,
      requiredTotal: required.length,
      requiredSatisfied: required.filter((r) => r.status === 'satisfied').length,
      missing: requirements.filter((r) => r.status === 'missing').length,
      inProgress: 0,
      satisfied: requirements.filter((r) => r.status === 'satisfied').length,
      waived: 0,
      notApplicable: 0,
      completionPercent: 0,
    },
  };
}

const template: EvidenceTemplateSummary = { key: 'eb2_niw_base', name: 'EB-2 NIW Canonical Evidence', description: '', caseType: 'eb2_niw', version: 1, itemCount: 4 };
const docs: EligibleDocument[] = [
  { id: 'doc1', displayName: 'Degree.pdf', status: 'accepted' },
  { id: 'doc2', displayName: 'Transcript.pdf', status: 'uploaded' },
];

describe('EvidenceTabComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<EvidenceTabComponent>;

  function setup(requirements: EvidenceRequirementDetail[], canManage: boolean) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(EvidenceTabComponent);
    (fixture.componentRef as ComponentRef<EvidenceTabComponent>).setInput('caseId', 'case1');
    fixture.detectChanges();
    http.expectOne(BASE).flush({ data: list(requirements, canManage), meta });
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  const reload = (requirements: EvidenceRequirementDetail[], canManage = true) => {
    http.expectOne(BASE).flush({ data: list(requirements, canManage), meta });
    fixture.detectChanges();
  };

  afterEach(() => http.verify());

  it('derives manage visibility from the server actions, not from the caller', () => {
    setup([requirement()], false);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Advanced degree');
    expect(text).not.toContain('Provision Template');
    expect(text).not.toContain('Add Requirement');
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).map((b) => b.textContent?.trim());
    expect(buttons).toEqual(['Details']);
  });

  it('shows the manage actions when the server allows them', () => {
    setup([requirement()], true);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Provision Template');
    expect(text).toContain('Add Requirement');
  });

  it('provisions from templates the server lists for this case type, never a hard-coded pair', () => {
    const component = setup([], true);
    component.openProvisionModal();
    http.expectOne(`${BASE}/templates`).flush({ data: { templates: [template] }, meta });
    fixture.detectChanges();

    expect(component.templateKeyToProvision()).toBe('eb2_niw_base');
    expect(fixture.nativeElement.textContent).toContain('EB-2 NIW Canonical Evidence (4 items)');
    expect(fixture.nativeElement.textContent).not.toContain('EB-1A');

    component.submitProvision();
    const req = http.expectOne(`${BASE}/provision`);
    expect(req.request.body).toEqual({ templateKey: 'eb2_niw_base' });
    req.flush({ data: { created: 4, skipped: 0, template: { key: 'eb2_niw_base', version: 1 } }, meta });
    reload([requirement()]);
    expect(component.showProvisionModal()).toBe(false);
  });

  it('says so, and blocks provisioning, when no template exists for the case type', () => {
    const component = setup([], true);
    component.openProvisionModal();
    http.expectOne(`${BASE}/templates`).flush({ data: { templates: [] }, meta });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No evidence templates are available for this case type');
    component.submitProvision();
    http.expectNone(`${BASE}/provision`);
  });

  it('creates a custom requirement with the fields the API accepts, then reloads', () => {
    const component = setup([], true);
    component.openCustomModal();
    component.customTitle.set('  Tax returns ');
    component.customSection.set('Financial');
    component.customImportance.set('recommended');
    component.customDescription.set('Last three years.');
    component.submitCustom();

    const req = http.expectOne(`${BASE}/requirements`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'Tax returns', section: 'Financial', importance: 'recommended', description: 'Last three years.' });
    req.flush({ data: requirement({ id: 'req2', title: 'Tax returns', source: 'custom' }), meta }, { status: 201, statusText: 'Created' });
    reload([requirement({ id: 'req2', title: 'Tax returns', source: 'custom', section: 'Financial' })]);
    expect(component.showCustomModal()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Tax returns');
  });

  it('does not submit a custom requirement without a title', () => {
    const component = setup([], true);
    component.openCustomModal();
    component.customTitle.set('   ');
    component.submitCustom();
    http.expectNone(`${BASE}/requirements`);
  });

  it('updates status by requirement id and requires a reason to waive', () => {
    const component = setup([requirement()], true);
    component.openStatusModal(component.requirements()[0]);

    component.newStatus.set('waived');
    component.statusReason.set('   ');
    component.submitStatusUpdate();
    http.expectNone('/api/v1/staff/evidence/requirements/req1/status');

    component.statusReason.set('Client holds no such record.');
    component.submitStatusUpdate();
    const req = http.expectOne('/api/v1/staff/evidence/requirements/req1/status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'waived', reason: 'Client holds no such record.' });
    req.flush({ data: requirement({ status: 'waived' }), meta });
    reload([requirement({ status: 'waived', waivedReason: 'Client holds no such record.' })]);
    expect(component.showStatusModal()).toBe(false);
  });

  it('keeps the status modal open and the input intact when the server refuses', () => {
    const component = setup([requirement()], true);
    component.openStatusModal(component.requirements()[0]);
    component.newStatus.set('satisfied');
    component.submitStatusUpdate();
    http.expectOne('/api/v1/staff/evidence/requirements/req1/status').flush({ error: { code: 'forbidden', message: 'Insufficient capability.' } }, { status: 403, statusText: 'Forbidden' });

    expect(component.showStatusModal()).toBe(true);
    expect(component.newStatus()).toBe('satisfied');
    expect(component.isUpdating()).toBe(false);
  });

  it('shows linked documents with a link to the document page, offers only unlinked same-case documents, and links / unlinks', () => {
    const linked = requirement({ linkedDocuments: [{ id: 'doc1', displayName: 'Degree.pdf', status: 'accepted' }] });
    const component = setup([linked], true);

    component.toggleDocuments(component.requirements()[0]);
    http.expectOne(`${BASE}/eligible-documents`).flush({ data: { documents: docs }, meta });
    fixture.detectChanges();

    const docLink = fixture.nativeElement.querySelector('.linked-list a') as HTMLAnchorElement;
    expect(docLink.textContent?.trim()).toBe('Degree.pdf');
    expect(docLink.getAttribute('href')).toBe('/documents/doc1');
    expect(component.linkableDocuments().map((d) => d.id)).toEqual(['doc2']);

    component.documentToLink.set('doc2');
    component.linkDocument(component.requirements()[0]);
    const link = http.expectOne('/api/v1/staff/evidence/requirements/req1/documents');
    expect(link.request.method).toBe('POST');
    expect(link.request.body).toEqual({ documentId: 'doc2' });
    link.flush({ data: linked, meta });
    reload([requirement({ linkedDocuments: [...linked.linkedDocuments, { id: 'doc2', displayName: 'Transcript.pdf', status: 'uploaded' }] })]);
    expect(component.expandedId()).toBe('req1');
    expect(component.linkableDocuments()).toEqual([]);

    component.unlinkDocument(component.requirements()[0], 'doc1');
    const unlink = http.expectOne('/api/v1/staff/evidence/requirements/req1/documents/doc1');
    expect(unlink.request.method).toBe('DELETE');
    unlink.flush({ data: linked, meta });
    reload([requirement({ linkedDocuments: [{ id: 'doc2', displayName: 'Transcript.pdf', status: 'uploaded' }] })]);
  });

  it('read-only viewers can see linked documents but never load or offer linking', () => {
    const component = setup([requirement({ linkedDocuments: [{ id: 'doc1', displayName: 'Degree.pdf', status: 'accepted' }] })], false);
    component.toggleDocuments(component.requirements()[0]);
    http.expectNone(`${BASE}/eligible-documents`);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.linked-list a')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('Link a case document');
    expect(fixture.nativeElement.textContent).not.toContain('Unlink');
  });

  it('shows a retryable error when the checklist cannot be loaded', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(EvidenceTabComponent);
    (fixture.componentRef as ComponentRef<EvidenceTabComponent>).setInput('caseId', 'case1');
    fixture.detectChanges();
    http.expectOne(BASE).flush({ error: { code: 'not_found', message: 'Case not found.' } }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('ih-error-state')).toBeTruthy();
  });
});
