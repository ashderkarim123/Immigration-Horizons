import { Component, inject, input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../../core/api/api.service';
import { ToastService } from '../../../../shared/toast.service';
import { StatusBadgeComponent } from '../../../../shared/status-badge.component';
import { SkeletonComponent } from '../../../../shared/skeleton.component';
import { EmptyStateComponent } from '../../../../shared/empty-state.component';
import { ErrorStateComponent } from '../../../../shared/error-state.component';
import { ConfirmDialogComponent } from '../../../../shared/confirm-dialog.component';
import { 
  EvidenceListResponse, 
  EvidenceRequirementDetail, 
  EvidenceSummary 
} from '../../../../core/api/evidence.types';

@Component({
  selector: 'ih-evidence-tab',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    StatusBadgeComponent,
    SkeletonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ConfirmDialogComponent
  ],
  templateUrl: './evidence-tab.component.html',
  styleUrls: ['./evidence-tab.component.scss']
})
export class EvidenceTabComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  // Inputs
  caseId = input.required<string>();
  canManage = input<boolean>(false);

  // State
  isLoading = signal(true);
  isError = signal(false);
  
  requirements = signal<EvidenceRequirementDetail[]>([]);
  summary = signal<EvidenceSummary | null>(null);

  // Grouped requirements
  groupedRequirements = computed(() => {
    const reqs = this.requirements();
    const groups: { [key: string]: EvidenceRequirementDetail[] } = {};
    for (const req of reqs) {
      if (!groups[req.section]) groups[req.section] = [];
      groups[req.section].push(req);
    }
    return Object.keys(groups).map(section => ({
      section,
      items: groups[section]
    }));
  });

  // Provisioning Modal
  showProvisionModal = signal(false);
  templateKeyToProvision = signal('eb2_niw_base');
  isProvisioning = signal(false);

  // Status Update Modal
  showStatusModal = signal(false);
  activeRequirement = signal<EvidenceRequirementDetail | null>(null);
  newStatus = signal<'missing' | 'in_progress' | 'satisfied' | 'waived' | 'not_applicable'>('missing');
  statusReason = signal('');
  isUpdating = signal(false);

  ngOnInit() {
    this.loadEvidence();
  }

  loadEvidence() {
    this.isLoading.set(true);
    this.isError.set(false);
    this.api.get<EvidenceListResponse>(`/staff/cases/${this.caseId()}/evidence`).subscribe({
      next: (res: any) => {
        this.requirements.set(res.data.requirements);
        this.summary.set(res.data.summary);
        this.isLoading.set(false);
      },
      error: () => {
        this.isError.set(true);
        this.isLoading.set(false);
      }
    });
  }

  openProvisionModal() {
    this.showProvisionModal.set(true);
  }

  submitProvision() {
    if (this.isProvisioning() || !this.templateKeyToProvision()) return;
    this.isProvisioning.set(true);
    this.api.post(`/staff/cases/${this.caseId()}/evidence/provision`, {
      templateKey: this.templateKeyToProvision()
    }).subscribe({
      next: () => {
        this.toast.success('Evidence checklist provisioned.');
        this.isProvisioning.set(false);
        this.showProvisionModal.set(false);
        this.loadEvidence();
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Failed to provision checklist.');
        this.isProvisioning.set(false);
      }
    });
  }

  openStatusModal(req: EvidenceRequirementDetail) {
    if (!this.canManage()) return;
    this.activeRequirement.set(req);
    this.newStatus.set(req.status);
    this.statusReason.set(req.waivedReason || req.notApplicableReason || '');
    this.showStatusModal.set(true);
  }

  submitStatusUpdate() {
    const req = this.activeRequirement();
    if (!req || this.isUpdating()) return;
    
    const status = this.newStatus();
    if ((status === 'waived' || status === 'not_applicable') && !this.statusReason().trim()) {
      this.toast.error('A reason is required for this status.');
      return;
    }

    this.isUpdating.set(true);
    this.api.patch(`/staff/evidence/requirements/${req._id}/status`, {
      status,
      reason: this.statusReason()
    }).subscribe({
      next: () => {
        this.toast.success('Requirement updated.');
        this.isUpdating.set(false);
        this.showStatusModal.set(false);
        this.loadEvidence();
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Failed to update requirement.');
        this.isUpdating.set(false);
      }
    });
  }
}
