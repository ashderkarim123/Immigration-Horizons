import { Component, DestroyRef, inject, OnInit, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { apiErrorMessage } from '../../../core/api/api-error';
import { CaseActivityItem, CaseDetail, CaseMember, MemberOption, Paginated } from '../../../core/api/case.types';
import { ToastService } from '../../../shared/toast.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CASE_STAGES, CASE_TYPES } from '../../../core/api/case-catalog';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StatusBadgeComponent } from '../../../shared/status-badge.component';
import { SkeletonComponent } from '../../../shared/skeleton.component';
import { ErrorStateComponent } from '../../../shared/error-state.component';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog.component';
import { PaginationComponent } from '../../../shared/pagination.component';
import { EvidenceTabComponent } from './evidence-tab/evidence-tab.component';
import { TasksTabComponent } from './tasks-tab/tasks-tab.component';
import { TrackingTabComponent } from './tracking-tab/tracking-tab.component';
import { CalendarTabComponent } from './calendar-tab/calendar-tab.component';
import { DocumentsTabComponent } from './documents-tab/documents-tab.component';
import { ChatTabComponent } from './chat-tab/chat-tab.component';
import { FormsTabComponent } from './forms-tab/forms-tab.component';
import { PetitionTabComponent } from './petition-tab/petition-tab.component';
import { PacketTabComponent } from './packet-tab/packet-tab.component';

const TABS = ['overview', 'team', 'activity', 'tasks', 'evidence', 'documents', 'chat', 'forms', 'petition', 'packet', 'tracking', 'calendar'] as const;

@Component({
  selector: 'ih-case-detail',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    FormsModule,
    StatusBadgeComponent,
    SkeletonComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
    PaginationComponent,
    EvidenceTabComponent,
    TasksTabComponent,
    TrackingTabComponent,
    CalendarTabComponent,
    DocumentsTabComponent,
    ChatTabComponent,
    FormsTabComponent,
    PetitionTabComponent,
    PacketTabComponent
  ],
  templateUrl: './case-detail.component.html',
  styleUrls: ['../../dashboard/dashboard.scss', './case-detail.component.scss']
})
export class CaseDetailComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  workflowGroups = [
    { label: 'Overview', tabs: [{ key: 'overview', label: 'Overview' }] },
    { label: 'Client inputs', tabs: [{ key: 'documents', label: 'Documents' }, { key: 'evidence', label: 'Evidence' }, { key: 'forms', label: 'Smart forms' }] },
    { label: 'Case work', tabs: [{ key: 'tasks', label: 'Tasks' }, { key: 'petition', label: 'Petition' }, { key: 'packet', label: 'Filing packet' }, { key: 'tracking', label: 'Case Tracking' }, { key: 'calendar', label: 'Calendar' }] },
    { label: 'Communication', tabs: [{ key: 'chat', label: 'Messages' }] },
    { label: 'Management', tabs: [{ key: 'team', label: 'Team' }, { key: 'activity', label: 'Activity' }] },
  ];
  selectTab(tab: string) {
    if (!(TABS as readonly string[]).includes(tab)) return;
    this.activeTab.set(tab as (typeof TABS)[number]);
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab, channel: null, filing: null, event: null }, queryParamsHandling: 'merge', replaceUrl: true });
    if (tab === 'activity') this.openActivityTab();
  }
  private toast = inject(ToastService);

  caseId = signal<string>('');
  /** Deep link from the Messages inbox: /cases/:id?tab=chat&channel=:channelId */
  initialChannelId = signal<string | null>(null);
  /** Deep link from the Tracking queue: /cases/:id?tab=tracking&filing=:filingId */
  initialFilingId = signal<string | null>(null);
  /** Deep link from a reminder or the Calendar page: /cases/:id?tab=calendar&event=:eventId */
  initialEventId = signal<string | null>(null);
  createAction = signal('');
  caseData = signal<CaseDetail | null>(null);
  members = signal<CaseMember[]>([]);
  memberOptions = signal<MemberOption[]>([]);
  managerOptions = computed(() => this.memberOptions().filter(employee => employee.canManageCases));

  isLoading = signal(true);
  isError = signal(false);
  errorMessage = signal('');

  activeTab = signal<(typeof TABS)[number]>('overview');

  // Team tab
  membersLoading = signal(false);
  membersError = signal(false);

  // Activity tab: its own endpoint, paginated independently of the case
  activity = signal<CaseActivityItem[]>([]);
  activityLoading = signal(false);
  activityError = signal(false);
  activityPage = signal(1);
  activityTotal = signal(0);
  activityTotalPages = signal(1);
  private activityLoaded = false;

  // UI visibility comes from the server's per-case action flags, never from role names.
  // The server re-checks every mutation.
  canManageStage = computed(() => this.caseData()?.actions.canManageCase ?? false);
  canAssignPM = computed(() => this.caseData()?.actions.canAssignManager ?? false);
  canManageMembers = computed(() => this.caseData()?.actions.canManageMembers ?? false);
  canArchiveCase = computed(() => this.caseData()?.actions.canArchive ?? false);
  canPublishUpdate = computed(() => this.caseData()?.actions.canPublishClientUpdate ?? false);

  // Modal visibility flags
  showStageModal = signal(false);
  showPmModal = signal(false);
  showAddMemberModal = signal(false);
  showRemoveMemberModal = signal(false);
  showArchiveModal = signal(false);
  showUpdateModal = signal(false);

  // Form states
  selectedNewStage = signal('');
  selectedNewPmId = signal('');
  newMemberUserId = signal('');
  newMemberRole = signal('contributor');
  memberToRemove = signal<CaseMember | null>(null);
  clientUpdateMessage = signal('');
  isSubmitting = signal(false);

  validStages = CASE_STAGES;
  caseTypeLabel(value: string) { return CASE_TYPES.find(type => type.value === value)?.label || value; }

  /** Employee-assignable subset of WORKSPACE_ROLES; project_manager is set via Change PM. */
  memberRoles = [
    { value: 'case_manager', label: 'Case Manager' },
    { value: 'contributor', label: 'Contributor' },
    { value: 'reviewer', label: 'Reviewer' },
    { value: 'observer', label: 'Observer' }
  ];

  ngOnInit() {
    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(([params, query]) => {
      const id = params.get('id');
      const tab = query.get('tab');
      this.activeTab.set(tab && (TABS as readonly string[]).includes(tab) ? tab as (typeof TABS)[number] : 'overview');
      this.initialChannelId.set(query.get('channel'));
      this.initialFilingId.set(query.get('filing'));
      this.initialEventId.set(query.get('event'));
      this.createAction.set(query.get('action') || '');
      if (id && id !== this.caseId()) {
        this.caseId.set(id);
        this.caseData.set(null);
        this.members.set([]);
        this.memberOptions.set([]);
        this.activity.set([]);
        this.activityLoaded = false;
        this.loadCaseDetail();
        this.loadMembers();
      }
      if (id && this.activeTab() === 'activity' && !this.activityLoaded) this.loadActivity(1);
    });
  }

  /** silent = background refresh after a mutation: keeps the page, tab and modal state intact. */
  loadCaseDetail(silent = false): void {
    if (!silent) {
      this.isLoading.set(true);
      this.isError.set(false);
    }

    const id = this.caseId();
    this.api.get<CaseDetail>(`/staff/cases/${id}`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data }) => {
        if (id !== this.caseId()) return;
        this.caseData.set(data);
        if (data.availableTabs && !data.availableTabs.includes(this.activeTab())) this.activeTab.set('overview');
        this.selectedNewStage.set(data.currentStage);
        this.selectedNewPmId.set(data.projectManager?.id ?? '');
        this.isLoading.set(false);
        // member-options 404s for anyone who can neither add members nor assign a PM
        if (data.actions.canManageMembers || data.actions.canAssignManager) this.loadMemberOptions();
      },
      error: (err) => {
        if (id !== this.caseId()) return;
        if (silent) {
          this.toast.error('Saved, but the case could not be refreshed. Reload the page.');
          return;
        }
        this.isError.set(true);
        this.errorMessage.set(apiErrorMessage(err, 'Case not found or access denied.'));
        this.isLoading.set(false);
      }
    });
  }

  loadMembers(): void {
    const id = this.caseId();
    this.membersLoading.set(true);
    this.membersError.set(false);
    this.api.get<{ members: CaseMember[] }>(`/staff/cases/${this.caseId()}/members`).subscribe({
      next: ({ data }) => {
        if (this.caseId() !== id) return;
        this.members.set(data.members);
        this.membersLoading.set(false);
      },
      error: () => {
        if (this.caseId() !== id) return;
        this.membersError.set(true);
        this.membersLoading.set(false);
      }
    });
  }

  loadMemberOptions(): void {
    const id = this.caseId();
    this.api.get<{ employees: MemberOption[] }>(`/staff/cases/${this.caseId()}/member-options`).subscribe({
      next: ({ data }) => { if (this.caseId() === id) this.memberOptions.set(data.employees); },
      error: () => { if (this.caseId() === id) this.memberOptions.set([]); }
    });
  }

  openActivityTab(): void {
    this.activeTab.set('activity');
    if (!this.activityLoaded) this.loadActivity(1);
  }

  loadActivity(page: number): void {
    const id = this.caseId();
    this.activityLoading.set(true);
    this.activityError.set(false);
    this.api.get<Paginated<CaseActivityItem>>(`/staff/cases/${this.caseId()}/activity`, { page, limit: 20 }).subscribe({
      next: ({ data }) => {
        if (this.caseId() !== id) return;
        this.activity.set(data.items);
        this.activityPage.set(data.page);
        this.activityTotal.set(data.total);
        this.activityTotalPages.set(Math.max(1, data.totalPages));
        this.activityLoaded = true;
        this.activityLoading.set(false);
      },
      error: () => {
        if (this.caseId() !== id) return;
        this.activityError.set(true);
        this.activityLoading.set(false);
      }
    });
  }

  /**
   * Mutation endpoints return a compact { outcome, caseId, ... } result, not the case DTO, so
   * every successful mutation re-reads the canonical state instead of trusting the response.
   */
  private refreshAfterMutation(): void {
    this.loadCaseDetail(true);
    this.loadMembers();
    if (this.activityLoaded) this.loadActivity(1);
  }

  // --- Actions ---

  submitStageChange(): void {
    if (!this.selectedNewStage() || this.isSubmitting()) return;
    this.isSubmitting.set(true);

    this.api.patch(`/staff/cases/${this.caseId()}/stage`, {
      stage: this.selectedNewStage()
    }).subscribe({
      next: () => {
        this.showStageModal.set(false);
        this.isSubmitting.set(false);
        this.toast.success('Case stage updated successfully.');
        this.refreshAfterMutation();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.toast.error(apiErrorMessage(err, 'Failed to update stage.'));
      }
    });
  }

  submitPmChange(): void {
    if (!this.selectedNewPmId() || this.isSubmitting()) return;
    this.isSubmitting.set(true);

    this.api.patch(`/staff/cases/${this.caseId()}/project-manager`, {
      projectManagerId: this.selectedNewPmId()
    }).subscribe({
      next: () => {
        this.showPmModal.set(false);
        this.isSubmitting.set(false);
        this.toast.success('Project Manager updated.');
        this.refreshAfterMutation();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.toast.error(apiErrorMessage(err, 'Failed to update Project Manager.'));
      }
    });
  }

  submitAddMember(): void {
    if (!this.newMemberUserId() || this.isSubmitting()) return;
    this.isSubmitting.set(true);

    this.api.post(`/staff/cases/${this.caseId()}/members`, {
      adminUserId: this.newMemberUserId(),
      workspaceRole: this.newMemberRole(),
      clientVisible: true
    }).subscribe({
      next: () => {
        this.showAddMemberModal.set(false);
        this.newMemberUserId.set('');
        this.isSubmitting.set(false);
        this.toast.success('Team member added.');
        this.refreshAfterMutation();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.toast.error(apiErrorMessage(err, 'Failed to add member.'));
      }
    });
  }

  confirmRemoveMember(member: CaseMember): void {
    this.memberToRemove.set(member);
    this.showRemoveMemberModal.set(true);
  }

  executeRemoveMember(): void {
    const mem = this.memberToRemove();
    if (!mem || this.isSubmitting()) return;
    this.isSubmitting.set(true);

    this.api.delete(`/staff/cases/${this.caseId()}/members/${mem.id}`).subscribe({
      next: () => {
        this.showRemoveMemberModal.set(false);
        this.memberToRemove.set(null);
        this.isSubmitting.set(false);
        this.toast.success('Team member removed.');
        this.refreshAfterMutation();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.showRemoveMemberModal.set(false);
        this.toast.error(apiErrorMessage(err, 'Failed to remove member.'));
      }
    });
  }

  executeArchive(): void {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);

    this.api.post(`/staff/cases/${this.caseId()}/archive`, {}).subscribe({
      next: () => {
        this.showArchiveModal.set(false);
        this.isSubmitting.set(false);
        this.toast.success('Case archived.');
        this.refreshAfterMutation();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.toast.error(apiErrorMessage(err, 'Failed to archive case.'));
      }
    });
  }

  submitClientUpdate(): void {
    const msg = this.clientUpdateMessage().trim();
    if (!msg || this.isSubmitting()) return;
    this.isSubmitting.set(true);

    this.api.post(`/staff/cases/${this.caseId()}/client-updates`, {
      message: msg
    }).subscribe({
      next: () => {
        this.showUpdateModal.set(false);
        this.clientUpdateMessage.set('');
        this.isSubmitting.set(false);
        this.toast.success('Client update published.');
        if (this.activityLoaded) this.loadActivity(1);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.toast.error(apiErrorMessage(err, 'Failed to publish client update.'));
      }
    });
  }
}
