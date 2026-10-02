import { Component, inject, input, OnInit, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../../core/api/api.service';
import { apiErrorMessage } from '../../../../core/api/api-error';
import { ToastService } from '../../../../shared/toast.service';
import { StatusBadgeComponent } from '../../../../shared/status-badge.component';
import { SkeletonComponent } from '../../../../shared/skeleton.component';
import { EmptyStateComponent } from '../../../../shared/empty-state.component';
import { ErrorStateComponent } from '../../../../shared/error-state.component';
import {
  EligibleDocument,
  EvidenceImportance,
  EvidenceListResponse,
  EvidenceProvisionResult,
  EvidenceRequirementDetail,
  EvidenceStatus,
  EvidenceSummary,
  EvidenceTemplateSummary,
} from '../../../../core/api/evidence.types';

@Component({
  selector: 'ih-evidence-tab',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, StatusBadgeComponent, SkeletonComponent, EmptyStateComponent, ErrorStateComponent],
  templateUrl: './evidence-tab.component.html',
  styleUrls: ['./evidence-tab.component.scss']
})
export class EvidenceTabComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  caseId = input.required<string>();

  isLoading = signal(true);
  isError = signal(false);

  requirements = signal<EvidenceRequirementDetail[]>([]);
  summary = signal<EvidenceSummary | null>(null);
  /** From the server for this actor and case; the UI never infers it from a role name. */
  canManage = signal(false);

  groupedRequirements = computed(() => {
    const groups = new Map<string, EvidenceRequirementDetail[]>();
    for (const req of this.requirements()) {
      groups.set(req.section, [...(groups.get(req.section) ?? []), req]);
    }
    return [...groups].map(([section, items]) => ({ section, items }));
  });

  // Provision modal: templates come from the server for this case's type
  showProvisionModal = signal(false);
  templates = signal<EvidenceTemplateSummary[]>([]);
  templatesLoading = signal(false);
  templateKeyToProvision = signal('');
  isProvisioning = signal(false);

  // Custom requirement modal
  showCustomModal = signal(false);
  customTitle = signal('');
  customSection = signal('General');
  customImportance = signal<EvidenceImportance>('required');
  customDescription = signal('');
  isCreating = signal(false);

  // Status modal
  showStatusModal = signal(false);
  activeRequirement = signal<EvidenceRequirementDetail | null>(null);
  newStatus = signal<EvidenceStatus>('missing');
  statusReason = signal('');
  isUpdating = signal(false);

  // Linked documents (expanded row)
  expandedId = signal<string | null>(null);
  eligibleDocuments = signal<EligibleDocument[] | null>(null);
  documentToLink = signal('');
  isLinking = signal(false);

  linkableDocuments = computed(() => {
    const open = this.requirements().find((r) => r.id === this.expandedId());
    const linked = new Set(open?.linkedDocuments.map((d) => d.id));
    return (this.eligibleDocuments() ?? []).filter((d) => !linked.has(d.id));
  });

  ngOnInit() {
    this.loadEvidence();
  }

  /** silent = background reload after a mutation, keeping the open row and scroll position. */
  loadEvidence(silent = false) {
    if (!silent) {
      this.isLoading.set(true);
      this.isError.set(false);
    }
    this.api.get<EvidenceListResponse>(`/staff/cases/${this.caseId()}/evidence`).subscribe({
      next: ({ data }) => {
        this.requirements.set(data.requirements);
        this.summary.set(data.summary);
        this.canManage.set(data.actions.canManage);
        this.isLoading.set(false);
      },
      error: () => {
        if (silent) {
          this.toast.error('Saved, but the checklist could not be refreshed. Reload the page.');
          return;
        }
        this.isError.set(true);
        this.isLoading.set(false);
      }
    });
  }

  // --- Provision ---

  openProvisionModal() {
    this.showProvisionModal.set(true);
    this.templatesLoading.set(true);
    this.api.get<{ templates: EvidenceTemplateSummary[] }>(`/staff/cases/${this.caseId()}/evidence/templates`).subscribe({
      next: ({ data }) => {
        this.templates.set(data.templates);
        this.templateKeyToProvision.set(data.templates[0]?.key ?? '');
        this.templatesLoading.set(false);
      },
      error: (err) => {
        this.templates.set([]);
        this.templatesLoading.set(false);
        this.toast.error(apiErrorMessage(err, 'Failed to load evidence templates.'));
      }
    });
  }

  submitProvision() {
    if (this.isProvisioning() || !this.templateKeyToProvision()) return;
    this.isProvisioning.set(true);
    this.api.post<EvidenceProvisionResult>(`/staff/cases/${this.caseId()}/evidence/provision`, {
      templateKey: this.templateKeyToProvision()
    }).subscribe({
      next: ({ data }) => {
        this.toast.success(data.created ? `Added ${data.created} requirement(s).` : 'Checklist already up to date.');
        this.isProvisioning.set(false);
        this.showProvisionModal.set(false);
        this.loadEvidence(true);
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to provision checklist.'));
        this.isProvisioning.set(false);
      }
    });
  }

  // --- Custom requirement ---

  openCustomModal() {
    this.customTitle.set('');
    this.customSection.set('General');
    this.customImportance.set('required');
    this.customDescription.set('');
    this.showCustomModal.set(true);
  }

  submitCustom() {
    const title = this.customTitle().trim();
    if (!title || this.isCreating()) return;
    this.isCreating.set(true);
    this.api.post(`/staff/cases/${this.caseId()}/evidence/requirements`, {
      title,
      section: this.customSection().trim() || 'General',
      importance: this.customImportance(),
      description: this.customDescription().trim()
    }).subscribe({
      next: () => {
        this.toast.success('Requirement added.');
        this.isCreating.set(false);
        this.showCustomModal.set(false);
        this.loadEvidence(true);
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to add requirement.'));
        this.isCreating.set(false);
      }
    });
  }

  // --- Status ---

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
    this.api.patch(`/staff/evidence/requirements/${req.id}/status`, {
      status,
      reason: this.statusReason()
    }).subscribe({
      next: () => {
        this.toast.success('Requirement updated.');
        this.isUpdating.set(false);
        this.showStatusModal.set(false);
        this.loadEvidence(true);
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to update requirement.'));
        this.isUpdating.set(false);
      }
    });
  }

  // --- Linked documents ---

  toggleDocuments(req: EvidenceRequirementDetail) {
    if (this.expandedId() === req.id) {
      this.expandedId.set(null);
      return;
    }
    this.expandedId.set(req.id);
    this.documentToLink.set('');
    if (this.canManage() && this.eligibleDocuments() === null) this.loadEligibleDocuments();
  }

  private loadEligibleDocuments() {
    this.api.get<{ documents: EligibleDocument[] }>(`/staff/cases/${this.caseId()}/evidence/eligible-documents`).subscribe({
      next: ({ data }) => this.eligibleDocuments.set(data.documents),
      error: (err) => {
        this.eligibleDocuments.set([]);
        this.toast.error(apiErrorMessage(err, 'Failed to load case documents.'));
      }
    });
  }

  linkDocument(req: EvidenceRequirementDetail) {
    const documentId = this.documentToLink();
    if (!documentId || this.isLinking()) return;
    this.isLinking.set(true);
    this.api.post(`/staff/evidence/requirements/${req.id}/documents`, { documentId }).subscribe({
      next: () => {
        this.isLinking.set(false);
        this.documentToLink.set('');
        this.toast.success('Document linked.');
        this.loadEvidence(true);
      },
      error: (err) => {
        this.isLinking.set(false);
        this.toast.error(apiErrorMessage(err, 'Failed to link document.'));
      }
    });
  }

  unlinkDocument(req: EvidenceRequirementDetail, documentId: string) {
    if (this.isLinking()) return;
    this.isLinking.set(true);
    this.api.delete(`/staff/evidence/requirements/${req.id}/documents/${documentId}`).subscribe({
      next: () => {
        this.isLinking.set(false);
        this.toast.success('Document unlinked.');
        this.loadEvidence(true);
      },
      error: (err) => {
        this.isLinking.set(false);
        this.toast.error(apiErrorMessage(err, 'Failed to unlink document.'));
      }
    });
  }
}
