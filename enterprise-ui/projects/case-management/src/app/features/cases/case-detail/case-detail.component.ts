import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { ApiService } from '../../../core/api/api.service';
import { apiErrorMessage } from '../../../core/api/api-error';
import { CaseActivityItem, CaseDetail, CaseMember, MemberOption, Paginated } from '../../../core/api/case.types';
import { ToastService } from '../../../shared/toast.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StatusBadgeComponent } from '../../../shared/status-badge.component';
import { SkeletonComponent } from '../../../shared/skeleton.component';
import { EmptyStateComponent } from '../../../shared/empty-state.component';
import { ErrorStateComponent } from '../../../shared/error-state.component';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog.component';
import { PaginationComponent } from '../../../shared/pagination.component';
import { EvidenceTabComponent } from './evidence-tab/evidence-tab.component';
import { DocumentsTabComponent } from './documents-tab/documents-tab.component';
import { ChatTabComponent } from './chat-tab/chat-tab.component';
import { FormsTabComponent } from './forms-tab/forms-tab.component';
import { PetitionTabComponent } from './petition-tab/petition-tab.component';
import { PacketTabComponent } from './packet-tab/packet-tab.component';

@Component({
  selector: 'ih-case-detail',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    FormsModule,
    StatusBadgeComponent,
    SkeletonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
    PaginationComponent,
    EvidenceTabComponent,
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
  private toast = inject(ToastService);

  caseId = signal<string>('');
  caseData = signal<CaseDetail | null>(null);
  members = signal<CaseMember[]>([]);
  memberOptions = signal<MemberOption[]>([]);

  isLoading = signal(true);
  isError = signal(false);
  errorMessage = signal('');

  activeTab = signal<'overview' | 'team' | 'activity' | 'tasks' | 'evidence' | 'documents' | 'chat' | 'forms' | 'petition' | 'packet'>('overview');

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

  caseTasks = signal<any[]>([]);
  isTasksLoading = signal(false);

  // UI visibility comes from the server's per-case action flags, never from role names.
  // The server re-checks every mutation.
  canManageStage = computed(() => this.caseData()?.actions.canManageCase ?? false);
  canAssignPM = computed(() => this.caseData()?.actions.canAssignManager ?? false);
  canManageMembers = computed(() => this.caseData()?.actions.canManageMembers ?? false);
  canArchiveCase = computed(() => this.caseData()?.actions.canArchive ?? false);
  canPublishUpdate = computed(() => this.caseData()?.actions.canPublishClientUpdate ?? false);
  canManageEvidence = computed(() => this.caseData()?.actions.canManageCase ?? false);

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

  validStages = [
    { value: 'initial_review', label: 'Initial Review' },
    { value: 'document_collection', label: 'Document Collection' },
    { value: 'drafting', label: 'Drafting' },
    { value: 'client_review', label: 'Client Review' },
    { value: 'ready_to_file', label: 'Ready to File' },
    { value: 'filed', label: 'Filed' },
    { value: 'decision_received', label: 'Decision Received' },
    { value: 'completed', label: 'Completed' },
    { value: 'archived', label: 'Archived' }
  ];

  /** Employee-assignable subset of WORKSPACE_ROLES; project_manager is set via Change PM. */
  memberRoles = [
    { value: 'case_manager', label: 'Case Manager' },
    { value: 'contributor', label: 'Contributor' },
    { value: 'reviewer', label: 'Reviewer' },
    { value: 'observer', label: 'Observer' }
  ];

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.caseId.set(id);
      this.loadCaseDetail();
      this.loadMembers();
    }
  }

  /** silent = background refresh after a mutation: keeps the page, tab and modal state intact. */
  loadCaseDetail(silent = false): void {
    if (!silent) {
      this.isLoading.set(true);
      this.isError.set(false);
    }

    this.api.get<CaseDetail>(`/staff/cases/${this.caseId()}`).subscribe({
      next: ({ data }) => {
        this.caseData.set(data);
        this.selectedNewStage.set(data.currentStage);
        this.selectedNewPmId.set(data.projectManager?.id ?? '');
        this.isLoading.set(false);
        // member-options 404s for anyone who can neither add members nor assign a PM
        if (data.actions.canManageMembers || data.actions.canAssignManager) this.loadMemberOptions();
      },
      error: (err) => {
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
    this.membersLoading.set(true);
    this.membersError.set(false);
    this.api.get<{ members: CaseMember[] }>(`/staff/cases/${this.caseId()}/members`).subscribe({
      next: ({ data }) => {
        this.members.set(data.members);
        this.membersLoading.set(false);
      },
      error: () => {
        this.membersError.set(true);
        this.membersLoading.set(false);
      }
    });
  }

  loadMemberOptions(): void {
    this.api.get<{ employees: MemberOption[] }>(`/staff/cases/${this.caseId()}/member-options`).subscribe({
      next: ({ data }) => this.memberOptions.set(data.employees),
      error: () => this.memberOptions.set([])
    });
  }

  openActivityTab(): void {
    this.activeTab.set('activity');
    if (!this.activityLoaded) this.loadActivity(1);
  }

  loadActivity(page: number): void {
    this.activityLoading.set(true);
    this.activityError.set(false);
    this.api.get<Paginated<CaseActivityItem>>(`/staff/cases/${this.caseId()}/activity`, { page, limit: 20 }).subscribe({
      next: ({ data }) => {
        this.activity.set(data.items);
        this.activityPage.set(data.page);
        this.activityTotal.set(data.total);
        this.activityTotalPages.set(Math.max(1, data.totalPages));
        this.activityLoaded = true;
        this.activityLoading.set(false);
      },
      error: () => {
        this.activityError.set(true);
        this.activityLoading.set(false);
      }
    });
  }

  loadCaseTasks(): void {
    if (this.caseTasks().length > 0) return; // already loaded
    this.isTasksLoading.set(true);
    this.api.get<{ tasks: any[] }>(`/staff/cases/${this.caseId()}/tasks`).subscribe({
      next: ({ data }) => {
        this.caseTasks.set(data.tasks);
        this.isTasksLoading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load case tasks.');
        this.isTasksLoading.set(false);
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
