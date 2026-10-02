import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { CaseActions, CaseActivityItem, CaseDetail, CaseMember, MemberOption, Paginated } from '../../../core/api/case.types';
import { CaseDetailComponent } from './case-detail.component';

const meta = { requestId: 'r' };
const CASE = '/api/v1/staff/cases/case1';

const NO_ACTIONS: CaseActions = { canManageCase: false, canAssignManager: false, canArchive: false, canManageMembers: false, canPublishClientUpdate: false };

/** Shaped like GET /api/v1/staff/cases/:id — including `actions` and `workspaceId`, and no team/activities/documents. */
function detail(actions: Partial<CaseActions> = {}, overrides: Partial<CaseDetail> = {}): CaseDetail {
  return {
    id: 'case1',
    caseNumber: 'IH-2026-AAA111',
    title: 'Alpha petition',
    caseType: 'eb2_niw',
    currentStage: 'drafting',
    priority: 'high',
    targetFilingDate: null,
    archivedAt: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z',
    workspaceId: 'ws1',
    projectManager: { id: 'emp-pm', name: 'Pat Manager', avatar: null },
    primaryClient: { id: 'cli1', displayName: 'Casey Client', firstName: 'Casey', lastName: 'Client', email: 'casey@example.com' },
    actions: { ...NO_ACTIONS, ...actions },
    ...overrides,
  };
}

const members: CaseMember[] = [
  {
    id: 'mem-pm',
    memberType: 'employee',
    workspaceRole: 'project_manager',
    status: 'active',
    clientVisible: true,
    joinedAt: '2026-01-01T10:00:00.000Z',
    employee: { id: 'emp-pm', name: 'Pat Manager', email: 'pat@ih.test', role: 'pm', avatar: null, jobTitle: 'Case PM', department: '' },
    client: null,
  },
  {
    id: 'mem-helper',
    memberType: 'employee',
    workspaceRole: 'reviewer',
    status: 'active',
    clientVisible: true,
    joinedAt: '2026-01-03T10:00:00.000Z',
    employee: { id: 'emp-h', name: 'Hana Helper', email: 'hana@ih.test', role: 'reviewer', avatar: null, jobTitle: '', department: '' },
    client: null,
  },
  {
    id: 'mem-client',
    memberType: 'client',
    workspaceRole: 'client',
    status: 'active',
    clientVisible: true,
    joinedAt: '2026-01-01T10:00:00.000Z',
    employee: null,
    client: { id: 'cli1', displayName: 'Casey Client', email: 'casey@example.com' },
  },
];

const options: MemberOption[] = [
  { id: 'emp-h', name: 'Hana Helper', email: 'hana@ih.test', role: 'reviewer', avatar: null, jobTitle: '', department: '' },
  { id: 'emp-new', name: 'Nia New', email: 'nia@ih.test', role: 'pm', avatar: null, jobTitle: '', department: '' },
];

const FULL: Partial<CaseActions> = { canManageCase: true, canAssignManager: true, canArchive: true, canManageMembers: true, canPublishClientUpdate: true };
// What a real pm member gets today (pinned by staff-angular-contracts.integration.test.js)
const PM: Partial<CaseActions> = { canManageCase: true, canManageMembers: true, canPublishClientUpdate: true };

describe('CaseDetailComponent', () => {
  let http: HttpTestingController;

  function setup(actions: Partial<CaseActions>, { respondOptions = true } = {}) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'case1' }) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CaseDetailComponent);
    fixture.detectChanges();

    http.expectOne(CASE).flush({ data: detail(actions), meta });
    http.expectOne(`${CASE}/members`).flush({ data: { members }, meta });
    if (actions.canManageMembers || actions.canAssignManager) {
      const opts = http.expectOne(`${CASE}/member-options`);
      if (respondOptions) opts.flush({ data: { employees: options }, meta });
    }
    fixture.detectChanges();
    return fixture;
  }

  const buttons = (fixture: ReturnType<typeof setup>) =>
    Array.from(fixture.nativeElement.querySelectorAll('.header-actions button') as NodeListOf<HTMLButtonElement>).map((b) => b.textContent?.trim());

  afterEach(() => http.verify());

  describe('action visibility comes from server action flags, not role names', () => {
    it('shows a real pm exactly what the server permits', () => {
      expect(buttons(setup(PM))).toEqual(['Change Stage', 'Publish Client Update']);
    });

    it('shows an admin every action', () => {
      expect(buttons(setup(FULL))).toEqual(['Change Stage', 'Change PM', 'Publish Client Update', 'Archive']);
    });

    it('shows a reviewer, specialist or viewer (no flags) no mutating actions and never asks for member options', () => {
      const fixture = setup({});
      expect(buttons(fixture)).toEqual([]);
      // setup() would have failed on an unexpected /member-options request via http.verify()
      expect(fixture.componentInstance.canManageEvidence()).toBe(false);
    });

    it('hides Archive once the case is archived', () => {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'case1' }) } } },
        ],
      });
      http = TestBed.inject(HttpTestingController);
      const fixture = TestBed.createComponent(CaseDetailComponent);
      fixture.detectChanges();
      http.expectOne(CASE).flush({ data: detail(FULL, { archivedAt: '2026-02-01T00:00:00.000Z' }), meta });
      http.expectOne(`${CASE}/members`).flush({ data: { members }, meta });
      http.expectOne(`${CASE}/member-options`).flush({ data: { employees: options }, meta });
      fixture.detectChanges();
      expect(buttons(fixture)).not.toContain('Archive');
    });
  });

  describe('team tab', () => {
    it('renders the members endpoint DTO (employee and client members), not caseData.team', () => {
      const fixture = setup(PM);
      expect(fixture.nativeElement.textContent).toContain('Team (3)');
      fixture.componentInstance.activeTab.set('team');
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Pat Manager');
      expect(text).toContain('Hana Helper');
      expect(text).toContain('Casey Client');
      expect(text).toContain('project_manager');
      // only employee members can be removed here
      expect(fixture.nativeElement.querySelectorAll('.btn-icon-danger').length).toBe(2);
    });

    it('does not offer member management without the flag', () => {
      const fixture = setup({});
      fixture.componentInstance.activeTab.set('team');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('Add Team Member');
      expect(fixture.nativeElement.querySelectorAll('.btn-icon-danger').length).toBe(0);
    });

    it('shows a retryable error when the members request fails, leaving the case itself intact', () => {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'case1' }) } } },
        ],
      });
      http = TestBed.inject(HttpTestingController);
      const fixture = TestBed.createComponent(CaseDetailComponent);
      fixture.detectChanges();
      http.expectOne(CASE).flush({ data: detail({}), meta });
      http.expectOne(`${CASE}/members`).flush({ error: { code: 'server_error', message: 'x' } }, { status: 500, statusText: 'Server Error' });
      fixture.componentInstance.activeTab.set('team');
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('IH-2026-AAA111');
      expect(fixture.nativeElement.querySelector('ih-error-state')).toBeTruthy();
    });
  });

  describe('activity tab', () => {
    const activityPage = (items: CaseActivityItem[], overrides: Partial<Paginated<CaseActivityItem>> = {}): Paginated<CaseActivityItem> => ({
      items,
      total: items.length,
      page: 1,
      totalPages: 1,
      pageSize: 20,
      ...overrides,
    });

    it('fetches /activity on first open only and renders type, actorName and message', () => {
      const fixture = setup({});
      fixture.componentInstance.openActivityTab();
      http.expectOne(`${CASE}/activity?page=1&limit=20`).flush({
        data: activityPage([
          { id: 'a1', type: 'stage_changed', message: 'Stage changed to drafting.', actorName: 'Pat Manager', createdAt: '2026-01-05T10:00:00.000Z', meta: null },
        ]),
        meta,
      });
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('stage_changed');
      expect(text).toContain('Stage changed to drafting.');
      expect(text).toContain('By: Pat Manager');

      fixture.componentInstance.activeTab.set('overview');
      fixture.componentInstance.openActivityTab(); // second open: cached, no request (http.verify)
    });

    it('shows an empty state and a retryable error', () => {
      const fixture = setup({});
      fixture.componentInstance.openActivityTab();
      http.expectOne(`${CASE}/activity?page=1&limit=20`).flush({ error: { code: 'server_error', message: 'x' } }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('ih-error-state')).toBeTruthy();

      fixture.componentInstance.loadActivity(1);
      http.expectOne(`${CASE}/activity?page=1&limit=20`).flush({ data: activityPage([]), meta });
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No recorded activity');
    });
  });

  describe('mutations send the Express contract and reload canonical state', () => {
    const flushReload = (data: CaseDetail, mutated: TestRequest) => {
      mutated.flush({ data: { outcome: 'updated', caseId: 'case1' }, meta });
      http.expectOne(CASE).flush({ data, meta });
      http.expectOne(`${CASE}/members`).flush({ data: { members }, meta });
    };

    it('stage change: the compact { outcome, caseId, stage } response never replaces the case', () => {
      const fixture = setup(FULL);
      fixture.componentInstance.selectedNewStage.set('filed');
      fixture.componentInstance.submitStageChange();

      const req = http.expectOne(`${CASE}/stage`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ stage: 'filed' });
      req.flush({ data: { outcome: 'updated', caseId: 'case1', stage: 'filed' }, meta });

      // still the full case while the reload is in flight
      expect(fixture.componentInstance.caseData()?.caseNumber).toBe('IH-2026-AAA111');
      expect(fixture.componentInstance.caseData()?.actions.canManageCase).toBe(true);

      http.expectOne(CASE).flush({ data: detail(FULL, { currentStage: 'filed' }), meta });
      http.expectOne(`${CASE}/members`).flush({ data: { members }, meta });
      http.expectOne(`${CASE}/member-options`).flush({ data: { employees: options }, meta });
      expect(fixture.componentInstance.caseData()?.currentStage).toBe('filed');
      expect(fixture.componentInstance.showStageModal()).toBe(false);
    });

    it('project manager: sends projectManagerId (not employeeId) and refuses to submit without a selection', () => {
      const fixture = setup(FULL);
      fixture.componentInstance.selectedNewPmId.set('');
      fixture.componentInstance.submitPmChange();
      http.expectNone(`${CASE}/project-manager`);

      fixture.componentInstance.selectedNewPmId.set('emp-new');
      fixture.componentInstance.submitPmChange();
      const req = http.expectOne(`${CASE}/project-manager`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ projectManagerId: 'emp-new' });
      flushReload(detail(FULL, { projectManager: { id: 'emp-new', name: 'Nia New', avatar: null } }), req);
      http.expectOne(`${CASE}/member-options`).flush({ data: { employees: options }, meta });
      expect(fixture.componentInstance.caseData()?.projectManager?.name).toBe('Nia New');
    });

    it('add member: sends adminUserId, a real workspaceRole and clientVisible, then reloads members', () => {
      const fixture = setup(PM);
      fixture.componentInstance.newMemberUserId.set('emp-h');
      fixture.componentInstance.newMemberRole.set('reviewer');
      fixture.componentInstance.submitAddMember();

      const req = http.expectOne(`${CASE}/members`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ adminUserId: 'emp-h', workspaceRole: 'reviewer', clientVisible: true });
      flushReload(detail(PM), req);
      http.expectOne(`${CASE}/member-options`).flush({ data: { employees: options }, meta });
    });

    it('offers only workspace roles the server accepts for employees', () => {
      const fixture = setup(PM);
      expect(fixture.componentInstance.memberRoles.map((r) => r.value)).toEqual(['case_manager', 'contributor', 'reviewer', 'observer']);
    });

    it('remove member: deletes by membership id and reloads', () => {
      const fixture = setup(PM);
      fixture.componentInstance.confirmRemoveMember(members[1]);
      fixture.componentInstance.executeRemoveMember();

      const req = http.expectOne(`${CASE}/members/mem-helper`);
      expect(req.request.method).toBe('DELETE');
      flushReload(detail(PM), req);
      http.expectOne(`${CASE}/member-options`).flush({ data: { employees: options }, meta });
    });

    it('keeps the modal and input open when the server rejects the change', () => {
      const fixture = setup(PM);
      fixture.componentInstance.showAddMemberModal.set(true);
      fixture.componentInstance.newMemberUserId.set('emp-h');
      fixture.componentInstance.submitAddMember();

      http
        .expectOne(`${CASE}/members`)
        .flush({ error: { code: 'validation_error', message: 'null', fieldErrors: [{ field: 'adminUserId', message: 'Not a valid, active team member.' }] } }, { status: 422, statusText: 'Unprocessable' });

      expect(fixture.componentInstance.showAddMemberModal()).toBe(true);
      expect(fixture.componentInstance.newMemberUserId()).toBe('emp-h');
      expect(fixture.componentInstance.isSubmitting()).toBe(false);
    });
  });
});
