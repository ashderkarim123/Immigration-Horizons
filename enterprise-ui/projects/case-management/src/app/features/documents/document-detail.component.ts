import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { DocumentCategory, DocumentDetail, DocumentVersion } from '../../core/api/document.types';
import { ToastService } from '../../shared/toast.service';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { SkeletonComponent } from '../../shared/skeleton.component';
import { ErrorStateComponent } from '../../shared/error-state.component';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';

@Component({
  selector: 'ih-document-detail',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink, StatusBadgeComponent, SkeletonComponent, ErrorStateComponent, ConfirmDialogComponent],
  templateUrl: './document-detail.component.html',
  styleUrls: ['./document-detail.component.scss'],
})
export class DocumentDetailComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  documentId = signal('');
  detail = signal<DocumentDetail | null>(null);
  categories = signal<DocumentCategory[]>([]);
  isLoading = signal(true);
  isError = signal(false);
  isSubmitting = signal(false);
  reviewDecision = signal<'accepted' | 'needs_replacement' | 'rejected'>('accepted');
  clientComment = signal('');
  internalComment = signal('');
  selectedCategoryId = signal('');
  selectedFile = signal<File | null>(null);
  changeNote = signal('');
  showArchiveConfirm = signal(false);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) { this.documentId.set(id); this.load(); }
  }

  load(): void {
    this.isLoading.set(true);
    this.isError.set(false);
    this.api.get<DocumentDetail>(`/staff/documents/${this.documentId()}`).subscribe({
      next: (result) => {
        this.detail.set(result.data);
        this.selectedCategoryId.set(result.data.document.category?.id || '');
        this.loadCategories(result.data.case.id);
        this.isLoading.set(false);
      },
      error: () => { this.isError.set(true); this.isLoading.set(false); },
    });
  }

  loadCategories(caseId: string): void {
    this.api.get<{ categories: DocumentCategory[] }>(`/staff/cases/${caseId}/documents`).subscribe({
      next: (result) => this.categories.set(result.data.categories.filter((category) => category.active)),
      error: () => {},
    });
  }

  selectFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.item(0) || null);
  }

  review(): void {
    const decision = this.reviewDecision();
    if ((decision === 'needs_replacement' || decision === 'rejected') && !this.clientComment().trim()) {
      this.toast.error('A client-visible reason is required for this decision.');
      return;
    }
    this.isSubmitting.set(true);
    this.api.patch(`/staff/documents/${this.documentId()}/review`, {
      decision,
      clientVisibleReviewComment: this.clientComment().trim(),
      internalReviewComment: this.internalComment().trim(),
    }).subscribe({
      next: () => { this.isSubmitting.set(false); this.toast.success('Document review saved.'); this.load(); },
      error: (error) => { this.isSubmitting.set(false); this.toast.error(error.error?.error?.message || 'Review could not be saved.'); },
    });
  }

  moveCategory(): void {
    if (!this.selectedCategoryId() || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.api.patch(`/staff/documents/${this.documentId()}/category`, { categoryId: this.selectedCategoryId() }).subscribe({
      next: () => { this.isSubmitting.set(false); this.toast.success('Document category updated.'); this.load(); },
      error: (error) => { this.isSubmitting.set(false); this.toast.error(error.error?.error?.message || 'Category could not be updated.'); },
    });
  }

  replaceVersion(): void {
    const file = this.selectedFile();
    if (!file || this.isSubmitting()) return;
    const form = new FormData();
    form.append('file', file);
    if (this.changeNote().trim()) form.append('changeNote', this.changeNote().trim());
    this.isSubmitting.set(true);
    this.api.postForm(`/staff/documents/${this.documentId()}/versions`, form).subscribe({
      next: () => { this.isSubmitting.set(false); this.selectedFile.set(null); this.changeNote.set(''); this.toast.success('Replacement version uploaded.'); this.load(); },
      error: (error) => { this.isSubmitting.set(false); this.toast.error(error.error?.error?.message || 'Replacement upload failed. Refresh and try again.'); },
    });
  }

  archive(): void {
    this.isSubmitting.set(true);
    this.api.post(`/staff/documents/${this.documentId()}/archive`, {}).subscribe({
      next: () => { this.isSubmitting.set(false); this.showArchiveConfirm.set(false); this.toast.success('Document archived.'); this.load(); },
      error: (error) => { this.isSubmitting.set(false); this.toast.error(error.error?.error?.message || 'Document could not be archived.'); },
    });
  }

  download(version?: DocumentVersion): void {
    const endpoint = version
      ? `/staff/documents/${this.documentId()}/versions/${version.id}/download`
      : `/staff/documents/${this.documentId()}/download`;
    this.api.download(endpoint).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = version?.displayName || this.detail()?.document.displayName || 'document';
        anchor.click();
        URL.revokeObjectURL(url);
      },
      error: (error) => this.toast.error(error.error?.error?.message || 'Download failed.'),
    });
  }
}
