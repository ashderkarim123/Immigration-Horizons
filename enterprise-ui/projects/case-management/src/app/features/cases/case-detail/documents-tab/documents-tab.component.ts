import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../../core/api/api.service';
import { DocumentCenter, DocumentCategory, DocumentRequest, StaffDocument } from '../../../../core/api/document.types';
import { ToastService } from '../../../../shared/toast.service';
import { StatusBadgeComponent } from '../../../../shared/status-badge.component';
import { SkeletonComponent } from '../../../../shared/skeleton.component';
import { EmptyStateComponent } from '../../../../shared/empty-state.component';
import { ErrorStateComponent } from '../../../../shared/error-state.component';
import { ConfirmDialogComponent } from '../../../../shared/confirm-dialog.component';

@Component({
  selector: 'ih-documents-tab',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, StatusBadgeComponent, SkeletonComponent, EmptyStateComponent, ErrorStateComponent, ConfirmDialogComponent],
  templateUrl: './documents-tab.component.html',
  styleUrls: ['./documents-tab.component.scss'],
})
export class DocumentsTabComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  caseId = input.required<string>();
  center = signal<DocumentCenter | null>(null);
  isLoading = signal(true);
  isError = signal(false);
  isSubmitting = signal(false);
  selectedCategoryId = signal('all');
  selectedFile = signal<File | null>(null);
  showUploadModal = signal(false);
  showRequestModal = signal(false);
  showCategoryModal = signal(false);
  requestToCancel = signal<DocumentRequest | null>(null);

  uploadCategoryId = signal('');
  uploadRequestId = signal('');
  uploadDisplayName = signal('');
  requestCategoryId = signal('');
  requestMemberId = signal('');
  requestTitle = signal('');
  requestInstructions = signal('');
  requestDueDate = signal('');
  categoryName = signal('');
  categoryDescription = signal('');
  categoryVisibility = signal<'client_visible' | 'employees_only'>('client_visible');
  categoryUploaderTypes = signal<'client' | 'employee' | 'both'>('both');

  categories = computed(() => this.center()?.categories || []);
  filteredDocuments = computed(() => {
    const selected = this.selectedCategoryId();
    return (this.center()?.documents || []).filter((document) => selected === 'all' || document.category?.id === selected);
  });
  activeCategories = computed(() => this.categories().filter((category) => category.active));
  capabilities = computed(() => this.center()?.capabilities || null);

  ngOnInit(): void {
    this.loadDocuments();
  }

  loadDocuments(): void {
    this.isLoading.set(true);
    this.isError.set(false);
    this.api.get<DocumentCenter>(`/staff/cases/${this.caseId()}/documents`).subscribe({
      next: (result) => {
        this.center.set(result.data);
        this.isLoading.set(false);
      },
      error: () => {
        this.isError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  fileSize(size: number): string {
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  openUpload(): void {
    const category = this.activeCategories()[0];
    this.uploadCategoryId.set(category?.id || '');
    this.uploadRequestId.set('');
    this.uploadDisplayName.set('');
    this.selectedFile.set(null);
    this.showUploadModal.set(true);
  }

  selectFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.item(0) || null);
  }

  submitUpload(): void {
    const file = this.selectedFile();
    if (!file || !this.uploadCategoryId() || this.isSubmitting()) return;
    const form = new FormData();
    form.append('file', file);
    form.append('categoryId', this.uploadCategoryId());
    if (this.uploadRequestId()) form.append('documentRequestId', this.uploadRequestId());
    if (this.uploadDisplayName().trim()) form.append('displayName', this.uploadDisplayName().trim());
    this.isSubmitting.set(true);
    this.api.postForm(`/staff/cases/${this.caseId()}/documents`, form).subscribe({
      next: () => {
        this.toast.success('Document uploaded securely.');
        this.isSubmitting.set(false);
        this.showUploadModal.set(false);
        this.loadDocuments();
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.toast.error(error.error?.error?.message || 'Document upload failed.');
      },
    });
  }

  openRequest(): void {
    const category = this.activeCategories()[0];
    const member = this.center()?.clientMembers[0];
    this.requestCategoryId.set(category?.id || '');
    this.requestMemberId.set(member?.id || '');
    this.requestTitle.set('');
    this.requestInstructions.set('');
    this.requestDueDate.set('');
    this.showRequestModal.set(true);
  }

  submitRequest(): void {
    if (!this.requestCategoryId() || !this.requestMemberId() || !this.requestTitle().trim() || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.api.post(`/staff/cases/${this.caseId()}/document-requests`, {
      categoryId: this.requestCategoryId(),
      requestedFromMemberId: this.requestMemberId(),
      title: this.requestTitle().trim(),
      instructions: this.requestInstructions().trim(),
      dueDate: this.requestDueDate() || null,
    }).subscribe({
      next: () => {
        this.toast.success('Document request created.');
        this.isSubmitting.set(false);
        this.showRequestModal.set(false);
        this.loadDocuments();
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.toast.error(error.error?.error?.message || 'Failed to create document request.');
      },
    });
  }

  openCategoryManager(): void {
    this.categoryName.set('');
    this.categoryDescription.set('');
    this.showCategoryModal.set(true);
  }

  initializeCategories(): void {
    this.isSubmitting.set(true);
    this.api.post(`/staff/cases/${this.caseId()}/document-categories/initialize`, {}).subscribe({
      next: () => { this.isSubmitting.set(false); this.toast.success('Default categories are ready.'); this.loadDocuments(); },
      error: (error) => { this.isSubmitting.set(false); this.toast.error(error.error?.error?.message || 'Could not initialize categories.'); },
    });
  }

  createCategory(): void {
    if (!this.categoryName().trim() || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.api.post(`/staff/cases/${this.caseId()}/document-categories`, {
      name: this.categoryName().trim(),
      description: this.categoryDescription().trim(),
      visibility: this.categoryVisibility(),
      allowedUploaderTypes: this.categoryUploaderTypes(),
    }).subscribe({
      next: () => { this.isSubmitting.set(false); this.toast.success('Category created.'); this.showCategoryModal.set(false); this.loadDocuments(); },
      error: (error) => { this.isSubmitting.set(false); this.toast.error(error.error?.error?.message || 'Could not create category.'); },
    });
  }

  toggleCategory(category: DocumentCategory): void {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);
    const action = category.active ? 'disable' : 'reactivate';
    this.api.post(`/staff/document-categories/${category.id}/${action}`, {}).subscribe({
      next: () => { this.isSubmitting.set(false); this.toast.success(`Category ${action}d.`); this.loadDocuments(); },
      error: (error) => { this.isSubmitting.set(false); this.toast.error(error.error?.error?.message || 'Could not update category.'); },
    });
  }

  confirmCancel(request: DocumentRequest): void {
    this.requestToCancel.set(request);
  }

  cancelRequest(): void {
    const request = this.requestToCancel();
    if (!request || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.api.post(`/staff/document-requests/${request.id}/cancel`, {}).subscribe({
      next: () => { this.isSubmitting.set(false); this.requestToCancel.set(null); this.toast.success('Document request cancelled.'); this.loadDocuments(); },
      error: (error) => { this.isSubmitting.set(false); this.toast.error(error.error?.error?.message || 'Could not cancel request.'); },
    });
  }

  download(document: StaffDocument): void {
    this.api.download(`/staff/documents/${document.id}/download`).subscribe({
      next: (blob) => this.saveBlob(blob, document.displayName),
      error: (error) => this.toast.error(error.error?.error?.message || 'Download failed.'),
    });
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
