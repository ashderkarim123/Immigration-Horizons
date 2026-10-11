import { Component, effect, inject, input, output, signal } from '@angular/core';
import { AdminApi } from '../core/api/admin-api.service';
import { MediaItem, MediaList } from '../core/api/admin.types';
import { apiErrorMessage } from '../core/errors/api-error';
import { ModalComponent } from './modal.component';
import { PaginationComponent } from './staff-ui';

/** Choose an image that is already in the Media Library. Uploading stays on the Media page: one upload path. */
@Component({
  selector: 'iha-media-picker',
  imports: [ModalComponent, PaginationComponent],
  template: `
    <iha-modal [open]="open()" title="Choose from the Media Library" [wide]="true" (closed)="closed.emit()">
      @if (error()) { <div class="alert alert-error" role="alert">{{ error() }}</div> }
      @else if (loading()) { <p class="muted">Loading images…</p> }
      @else if (!items().length) { <p class="muted">The Media Library is empty. Upload images on the Media page first.</p> }
      @else {
        <ul class="grid" role="list">
          @for (item of items(); track item.id) {
            <li>
              <button type="button" class="tile" (click)="picked.emit(item)">
                <img [src]="item.url" [alt]="item.altText || item.originalName" loading="lazy" width="160" height="110" />
                <span>{{ item.originalName }}</span>
              </button>
            </li>
          }
        </ul>
        <ih-pagination [page]="page()" [totalPages]="totalPages()" [totalItems]="total()" (pageChange)="load($event)" />
      }
      <button modal-footer type="button" class="btn" (click)="closed.emit()">Cancel</button>
    </iha-modal>
  `,
  styles: `
    .grid { list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: 0.75rem; }
    .tile { display: flex; flex-direction: column; gap: 0.35rem; width: 100%; padding: 0.4rem; border: 1px solid var(--ih-border-light); border-radius: var(--ih-radius-md); background: #fff; font-size: var(--ih-font-size-xs); text-align: left; }
    .tile:hover { border-color: var(--ih-accent-500); }
    .tile img { width: 100%; height: 6.5rem; object-fit: cover; border-radius: var(--ih-radius-sm); background: var(--ih-gray-100); }
    .tile span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `,
})
export class MediaPickerComponent {
  private readonly api = inject(AdminApi);
  readonly open = input(false);
  readonly picked = output<MediaItem>();
  readonly closed = output<void>();

  protected readonly items = signal<MediaItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);

  constructor() {
    effect(() => { if (this.open()) this.load(1); });
  }

  protected load(page: number): void {
    this.loading.set(true);
    this.error.set('');
    this.api.get<MediaList>('/media', { page, limit: 24 }).subscribe({
      next: (list) => {
        this.items.set(list.items);
        this.page.set(list.page);
        this.totalPages.set(list.totalPages);
        this.total.set(list.total);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorMessage(err, 'The Media Library could not be loaded.'));
        this.loading.set(false);
      },
    });
  }
}
