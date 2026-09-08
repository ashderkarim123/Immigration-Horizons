import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { ApiService } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/toast.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StatusBadgeComponent } from '../../../shared/status-badge.component';
import { SkeletonComponent } from '../../../shared/skeleton.component';
import { EmptyStateComponent } from '../../../shared/empty-state.component';
import { ErrorStateComponent } from '../../../shared/error-state.component';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog.component';
import { IhIconComponent } from '../../../shared/icon/ih-icon.component';
import { EvidenceTabComponent } from './evidence-tab/evidence-tab.component';
import { DocumentsTabComponent } from './documents-tab/documents-tab.component';

@Component({
  selector: 'ih-case-detail',
  standalone: true,
  imports: [
    DatePipe,
    JsonPipe,
    RouterLink,
    FormsModule,
    StatusBadgeComponent,
    SkeletonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
    IhIconComponent,
    EvidenceTabComponent,
    DocumentsTabComponent
  ],
  templateUrl: './case-detail.component.html',
  styleUrls: ['../../dashboard/dashboard.scss', './case-detail.component.scss']
})
export class CaseDetailComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  caseId = signal<string>('');
  caseData = signal<any>(null);
  activities = signal<any[]>([]);
  memberOptions = signal<any[]>([]);

  isLoading = signal(true);
  isError = signal(false);
  errorMessage = signal('');

  activeTab = signal<'overview' | 'team' | 'activity' | 'tasks' | 'evidence' | 'documents'>('overview');
  caseTasks = signal<any[]>([]);
  isTasksLoading = signal(false);
  // Capability signals
  currentUser = computed(() => this.auth.user());
  canManageStage = computed(() => {
    const roles = this.currentUser()?.roles || [];
    return roles.some((r: string) => ['admin', 'super_admin', 'case_manager', 'paralegal'].includes(r));
  });
  canAssignPM = computed(() => {
    const roles = this.currentUser()?.roles || [];
    return roles.some((r: string) => ['admin', 'super_admin', 'case_manager'].includes(r));
  });
  canManageMembers = computed(() => {
    const roles = this.currentUser()?.roles || [];
    return roles.some((r: string) => ['admin', 'super_admin', 'case_manager'].includes(r));
  });
  canArchiveCase = computed(() => {
    const roles = this.currentUser()?.roles || [];
    return roles.some((r: string) => ['admin', 'super_admin'].includes(r));
  });
  canPublishUpdate = computed(() => {
    const roles = this.currentUser()?.roles || [];
    return roles.some((r: string) => ['admin', 'super_admin', 'case_manager', 'paralegal', 'attorney'].includes(r));
  });
  canManageEvidence = computed(() => {
    // Follows cases.manage semantics per casePolicy.js map
    const roles = this.currentUser()?.roles || [];
    return roles.some((r: string) => ['admin', 'super_admin', 'case_manager', 'paralegal', 'attorney'].includes(r));
  });

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
  memberToRemove = signal<any>(null);
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

  memberRoles = [
    { value: 'lead', label: 'Lead' },
    { value: 'contributor', label: 'Contributor' },
    { value: 'reviewer', label: 'Reviewer' },
    { value: 'viewer', label: 'Viewer' }
  ];

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.caseId.set(id);
      this.loadCaseDetail();
      this.loadMemberOptions();
    }
  }

  loadCaseDetail(): void {
    this.isLoading.set(true);
    this.isError.set(false);

    this.api.get(`/staff/cases/${this.caseId()}`).subscribe({
      next: (res: any) => {
        const d = res.data || {};
        this.caseData.set(d);
        this.selectedNewStage.set(d.currentStage || '');
        this.selectedNewPmId.set(d.projectManager?._id || '');
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isError.set(true);
        this.errorMessage.set(err?.error?.message || 'Case not found or access denied.');
        this.isLoading.set(false);
      }
    });
  }

  loadMemberOptions(): void {
    this.api.get(`/staff/cases/${this.caseId()}/member-options`).subscribe({
      next: (res: any) => {
        this.memberOptions.set(res.data?.employees || []);
      },
      error: () => {}
    });
  }

  loadCaseTasks(): void {
    if (this.caseTasks().length > 0) return; // already loaded
    this.isTasksLoading.set(true);
    this.api.get(`/staff/cases/${this.caseId()}/tasks`).subscribe({
      next: (res: any) => {
        this.caseTasks.set(res.data?.tasks || []);
        this.isTasksLoading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load case tasks.');
        this.isTasksLoading.set(false);
      }
    });
  }

  // --- Actions ---

  submitStageChange(): void {
    if (!this.selectedNewStage() || this.isSubmitting()) return;
    this.isSubmitting.set(true);

    this.api.patch(`/staff/cases/${this.caseId()}/stage`, {
      stage: this.selectedNewStage()
    }).subscribe({
      next: (res: any) => {
        this.caseData.set(res.data);
        this.showStageModal.set(false);
        this.isSubmitting.set(false);
        this.toast.success('Case stage updated successfully.');
      },
      error: (err: any) => {
        this.isSubmitting.set(false);
        this.toast.error(err?.error?.message || 'Failed to update stage.');
      }
    });
  }

  submitPmChange(): void {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);

    this.api.patch(`/staff/cases/${this.caseId()}/project-manager`, {
      employeeId: this.selectedNewPmId() || null
    }).subscribe({
      next: (res: any) => {
        this.caseData.set(res.data);
        this.showPmModal.set(false);
        this.isSubmitting.set(false);
        this.toast.success('Project Manager updated.');
      },
      error: (err: any) => {
        this.isSubmitting.set(false);
        this.toast.error(err?.error?.message || 'Failed to update Project Manager.');
      }
    });
  }

  submitAddMember(): void {
    if (!this.newMemberUserId() || this.isSubmitting()) return;
    this.isSubmitting.set(true);

    this.api.post(`/staff/cases/${this.caseId()}/members`, {
      employeeId: this.newMemberUserId(),
      role: this.newMemberRole()
    }).subscribe({
      next: (res: any) => {
        this.caseData.set(res.data);
        this.showAddMemberModal.set(false);
        this.newMemberUserId.set('');
        this.isSubmitting.set(false);
        this.toast.success('Team member added.');
      },
      error: (err: any) => {
        this.isSubmitting.set(false);
        this.toast.error(err?.error?.message || 'Failed to add member.');
      }
    });
  }

  confirmRemoveMember(member: any): void {
    this.memberToRemove.set(member);
    this.showRemoveMemberModal.set(true);
  }

  executeRemoveMember(): void {
    const mem = this.memberToRemove();
    if (!mem || this.isSubmitting()) return;
    this.isSubmitting.set(true);

    const memberId = mem._id || mem.id;
    this.api.delete(`/staff/cases/${this.caseId()}/members/${memberId}`).subscribe({
      next: (res: any) => {
        this.caseData.set(res.data);
        this.showRemoveMemberModal.set(false);
        this.memberToRemove.set(null);
        this.isSubmitting.set(false);
        this.toast.success('Team member removed.');
      },
      error: (err: any) => {
        this.isSubmitting.set(false);
        this.toast.error(err?.error?.message || 'Failed to remove member.');
      }
    });
  }

  executeArchive(): void {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);

    this.api.post(`/staff/cases/${this.caseId()}/archive`, {}).subscribe({
      next: (res: any) => {
        this.caseData.set(res.data);
        this.showArchiveModal.set(false);
        this.isSubmitting.set(false);
        this.toast.success('Case archived.');
      },
      error: (err: any) => {
        this.isSubmitting.set(false);
        this.toast.error(err?.error?.message || 'Failed to archive case.');
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
      },
      error: (err: any) => {
        this.isSubmitting.set(false);
        this.toast.error(err?.error?.message || 'Failed to publish client update.');
      }
    });
  }
}
