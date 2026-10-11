import { DatePipe } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../../core/api/admin-api.service';
import { MediaItem, MediaList } from '../../core/api/admin.types';
import { AdminAuthService } from '../../core/auth/admin-auth.service';
import { apiErrorMessage } from '../../core/errors/api-error';
import { ConfirmDialogComponent, EmptyStateComponent, ErrorStateComponent, PaginationComponent, SkeletonComponent, ToastService } from '../../shared/staff-ui';
import { CopyButtonComponent, FileDropzoneComponent, formatBytes } from '../../shared/widgets';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

@Component({
  selector: 'iha-media',
  imports: [FormsModule, DatePipe, CopyButtonComponent, FileDropzoneComponent, ConfirmDialogComponent, EmptyStateComponent, ErrorStateComponent, PaginationComponent, SkeletonComponent],
  template: `
    <div class="page-header">
      <div><h1>Media Library</h1><p class="page-subtitle">Images used by blog posts and testimonials. Uploaded files are public.</p></div>
    </div>

    @if (canManage()) {
      <section class="card upload" aria-labelledby="upload-title">
        <div class="card-body stack">
          <h2 class="card-title" id="upload-title">Upload an image</h2>
          <div class="field">
            <label for="upload-alt">Alt text for the next upload</label>
            <input id="upload-alt" name="uploadAlt" maxlength="300" placeholder="Describe the image for people who cannot see it" [(ngModel)]="uploadAlt" />
          </div>
          <iha-file-dropzone [disabled]="uploading()" (fileSelected)="upload($event)" />
          @if (uploading()) {
            <div role="status">
              <progress max="100" [value]="progress()" aria-label="Upload progress"></progress>
              <span class="cell-sub">Uploading… {{ progress() }}%</span>
            </div>
          }
          @if (uploadError()) { <div class="alert alert-error" role="alert">{{ uploadError() }}</div> }
        </div>
      </section>
    }

    <form class="filter-bar" role="search" (ngSubmit)="load(1)">
      <div class="field"><label for="media-search">Search</label><input id="media-search" name="search" type="search" placeholder="File name or alt text" [(ngModel)]="search" /></div>
      <div class="field">
        <label for="media-type">Type</label>
        <select id="media-type" name="type" [(ngModel)]="mimeType" (ngModelChange)="load(1)">
          <option value="">All images</option>
          @for (t of types(); track t) { <option [value]="t">{{ t.replace('image/', '').toUpperCase() }}</option> }
        </select>
      </div>
      @if (folders().length > 1) {
        <div class="field">
          <label for="media-folder">Folder</label>
          <select id="media-folder" name="folder" [(ngModel)]="folder" (ngModelChange)="load(1)">
            <option value="">All folders</option>
            @for (f of folders(); track f) { <option [value]="f">{{ f }}</option> }
          </select>
        </div>
      }
      <button type="submit" class="btn">Search</button>
    </form>

    @if (error()) {
      <ih-error-state title="The Media Library could not be loaded" [message]="error()" (retry)="load(page())" />
    } @else if (loading() && !items().length) {
      <ih-skeleton [rows]="4" rowHeight="5rem" />
    } @else if (!items().length) {
      <ih-empty-state title="No images found" [description]="search || mimeType || folder ? 'No image matches these filters.' : 'Upload the first image above.'" />
    } @else {
      <ul class="grid" role="list">
        @for (item of items(); track item.id) {
          <li class="card tile">
            <img [src]="item.url" [alt]="item.altText || ''" loading="lazy" width="240" height="150" />
            <div class="tile-body">
              <div class="cell-title name">{{ item.originalName }}</div>
              <div class="cell-sub">{{ bytes(item.size) }} · {{ item.createdAt | date: 'mediumDate' }} · {{ item.uploadedBy }}</div>
              @if (altEditing() === item.id) {
                <div class="field">
                  <label [for]="'alt-' + item.id">Alt text</label>
                  <input [id]="'alt-' + item.id" [name]="'alt-' + item.id" maxlength="300" [(ngModel)]="altDraft" (keydown.enter)="saveAlt(item)" />
                  <div class="row"><button type="button" class="btn btn-sm btn-primary" (click)="saveAlt(item)">Save</button><button type="button" class="btn btn-sm" (click)="altEditing.set('')">Cancel</button></div>
                </div>
              } @else {
                <p class="alt">@if (item.altText) { {{ item.altText }} } @else { <span class="badge badge-warning">No alt text</span> }</p>
              }
              <div class="row">
                <iha-copy-button [text]="publicUrl(item)" label="Copy URL" />
                @if (item.actions.edit && altEditing() !== item.id) { <button type="button" class="btn btn-sm" (click)="editAlt(item)">Edit alt text<span class="sr-only"> for {{ item.originalName }}</span></button> }
                @if (item.actions.delete) { <button type="button" class="btn btn-sm btn-danger" (click)="deleting.set(item)">Delete<span class="sr-only"> {{ item.originalName }}</span></button> }
              </div>
            </div>
          </li>
        }
      </ul>
      <ih-pagination [page]="page()" [totalPages]="totalPages()" [totalItems]="total()" (pageChange)="load($event)" />
    }

    <ih-confirm-dialog [isOpen]="!!deleting()" title="Delete this image?" [message]="(deleting()?.originalName ?? '') + ' will be deleted. Any post or testimonial still using it will show a broken image.'"
      confirmText="Delete image" variant="danger" (confirmed)="remove()" (cancelled)="deleting.set(null)" />
  `,
  styles: `
    .upload { margin-bottom: var(--ih-space-6); }
    progress { width: 100%; height: 0.5rem; accent-color: var(--ih-brand-900); }
    .grid { list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: var(--ih-space-4); }
    .tile { overflow: hidden; display: flex; flex-direction: column; }
    .tile img { width: 100%; height: 9.5rem; object-fit: cover; background: var(--ih-gray-100); }
    .tile-body { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.75rem; }
    .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .alt { font-size: var(--ih-font-size-xs); color: var(--ih-text-secondary); }
  `,
})
export class MediaComponent {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AdminAuthService);

  protected search = '';
  protected mimeType = '';
  protected folder = '';
  protected uploadAlt = '';
  protected altDraft = '';
  protected readonly items = signal<MediaItem[]>([]);
  protected readonly folders = signal<string[]>([]);
  protected readonly types = signal<string[]>(TYPES);
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly uploading = signal(false);
  protected readonly progress = signal(0);
  protected readonly uploadError = signal('');
  protected readonly altEditing = signal('');
  protected readonly deleting = signal<MediaItem | null>(null);
  protected readonly bytes = formatBytes;
  protected readonly canManage = () => this.auth.hasCapability('media.manage');
  /** The address the public site embeds: this host serves /uploads. */
  protected readonly publicUrl = (item: MediaItem) => new URL(item.url, window.location.origin).href;

  constructor() {
    this.load(1);
  }

  protected load(page: number): void {
    this.loading.set(true);
    this.error.set('');
    this.api.get<MediaList>('/media', { page, search: this.search.trim(), mimeType: this.mimeType, folder: this.folder }).subscribe({
      next: (list) => {
        this.items.set(list.items);
        this.folders.set(list.folders);
        this.types.set(list.mimeTypes);
        this.page.set(list.page);
        this.totalPages.set(list.totalPages);
        this.total.set(list.total);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorMessage(err, 'Please try again.'));
        this.loading.set(false);
      },
    });
  }

  protected upload(file: File): void {
    this.uploadError.set('');
    // A courtesy check so an obviously wrong file fails instantly; the server enforces the real policy.
    if (!TYPES.includes(file.type)) return this.uploadError.set('Only PNG, JPG, WebP or GIF images can be uploaded.');
    if (file.size > MAX_BYTES) return this.uploadError.set('The image is larger than the 5 MB limit.');
    const form = new FormData();
    form.append('altText', this.uploadAlt.trim());
    form.append('file', file);
    this.uploading.set(true);
    this.progress.set(0);
    this.api.upload<MediaItem>('/media', form).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) this.progress.set(Math.round((100 * event.loaded) / event.total));
        if (event.type === HttpEventType.Response) {
          this.uploading.set(false);
          this.uploadAlt = '';
          this.toast.success('Image uploaded.');
          this.load(1);
        }
      },
      error: (err) => {
        this.uploading.set(false);
        this.uploadError.set(apiErrorMessage(err, 'The image could not be uploaded.'));
      },
    });
  }

  protected editAlt(item: MediaItem): void {
    this.altDraft = item.altText;
    this.altEditing.set(item.id);
  }

  protected saveAlt(item: MediaItem): void {
    this.api.patch<MediaItem>(`/media/${item.id}/alt`, { altText: this.altDraft }).subscribe({
      next: (updated) => {
        this.items.update((list) => list.map((m) => (m.id === updated.id ? updated : m)));
        this.altEditing.set('');
        this.toast.success('Alt text saved.');
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'The alt text could not be saved.')),
    });
  }

  protected remove(): void {
    const item = this.deleting();
    if (!item) return;
    this.deleting.set(null);
    this.api.delete(`/media/${item.id}`).subscribe({
      next: () => {
        this.toast.success('Image deleted.');
        this.load(this.items().length === 1 && this.page() > 1 ? this.page() - 1 : this.page());
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'The image could not be deleted.')),
    });
  }
}
