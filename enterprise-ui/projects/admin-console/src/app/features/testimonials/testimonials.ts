import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../../core/api/admin-api.service';
import { MediaItem, Testimonial, TestimonialList } from '../../core/api/admin.types';
import { AdminAuthService } from '../../core/auth/admin-auth.service';
import { apiErrorMessage, apiFieldErrors } from '../../core/errors/api-error';
import { UnsavedChangesService } from '../../core/guards/unsaved-changes.guard';
import { MediaPickerComponent } from '../../shared/media-picker.component';
import { ModalComponent } from '../../shared/modal.component';
import { ConfirmDialogComponent, EmptyStateComponent, ErrorStateComponent, PaginationComponent, SkeletonComponent, ToastService } from '../../shared/staff-ui';
import { humanize } from '../../shared/widgets';

type Draft = Pick<Testimonial, 'name' | 'country' | 'profession' | 'service' | 'review' | 'rating' | 'photo' | 'verificationUrl' | 'featured' | 'displayOrder' | 'status'>;
const EMPTY: Draft = { name: '', country: '', profession: '', service: '', review: '', rating: 5, photo: '', verificationUrl: '', featured: false, displayOrder: 0, status: 'published' };
const BADGE: Record<string, string> = { published: 'badge badge-success', draft: 'badge badge-neutral', archived: 'badge badge-warning' };

@Component({
  selector: 'iha-testimonials',
  imports: [FormsModule, ModalComponent, MediaPickerComponent, ConfirmDialogComponent, EmptyStateComponent, ErrorStateComponent, PaginationComponent, SkeletonComponent],
  template: `
    <div class="page-header">
      <div><h1>Testimonials</h1><p class="page-subtitle">Real client reviews, each with a link visitors can use to verify it.</p></div>
      @if (canManage()) { <div class="page-actions"><button type="button" class="btn btn-primary" (click)="edit(null)">New testimonial</button></div> }
    </div>

    <form class="filter-bar" role="search" (ngSubmit)="load(1)">
      <div class="field"><label for="t-search">Search</label><input id="t-search" name="search" type="search" placeholder="Name or review" [(ngModel)]="search" /></div>
      <div class="field">
        <label for="t-status">Status</label>
        <select id="t-status" name="status" [(ngModel)]="status" (ngModelChange)="load(1)">
          <option value="">All</option>
          @for (s of statuses(); track s) { <option [value]="s">{{ label(s) }}</option> }
        </select>
      </div>
      <button type="submit" class="btn">Search</button>
    </form>

    @if (error()) {
      <ih-error-state title="Testimonials could not be loaded" [message]="error()" (retry)="load(page())" />
    } @else if (loading() && !items().length) {
      <ih-skeleton [rows]="6" rowHeight="2.75rem" />
    } @else if (!items().length) {
      <ih-empty-state title="No testimonials found" [description]="search || status ? 'No testimonial matches these filters.' : 'Add a real client review with its verification link.'" />
    } @else {
      <div class="table-wrap">
        <table class="data-table stacked">
          <caption class="sr-only">Testimonials in display order</caption>
          <thead><tr><th scope="col">Order</th><th scope="col">Client</th><th scope="col">Service</th><th scope="col">Rating</th><th scope="col">Verification</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            @for (item of items(); track item.id) {
              <tr>
                <td data-label="Order">{{ item.displayOrder }}</td>
                <td data-label="Client"><div><span class="cell-title">{{ item.name }}</span>@if (item.featured) { <span class="badge badge-gold">Featured</span> }<div class="cell-sub">{{ item.profession }}{{ item.profession && item.country ? ' · ' : '' }}{{ item.country }}</div></div></td>
                <td data-label="Service">{{ item.service || '—' }}</td>
                <td data-label="Rating">{{ item.rating }} of 5</td>
                <td data-label="Verification">@if (item.verificationUrl) { <a [href]="item.verificationUrl" target="_blank" rel="noopener noreferrer">Open link</a> } @else { <span class="muted">No link</span> }</td>
                <td data-label="Status"><span [class]="badge(item.status)">{{ label(item.status) }}</span></td>
                <td class="actions">
                  @if (item.actions.edit) { <button type="button" class="btn btn-sm" (click)="edit(item)">Edit<span class="sr-only"> {{ item.name }}</span></button> }
                  @if (item.actions.delete) { <button type="button" class="btn btn-sm btn-danger" (click)="deleting.set(item)">Delete<span class="sr-only"> {{ item.name }}</span></button> }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <ih-pagination [page]="page()" [totalPages]="totalPages()" [totalItems]="total()" (pageChange)="load($event)" />
    }

    <iha-modal [open]="editing()" [title]="editingId() ? 'Edit testimonial' : 'New testimonial'" (closed)="close()">
      <form id="testimonial-form" class="stack" (ngSubmit)="save()" novalidate>
        @if (formError()) { <div class="alert alert-error" role="alert">{{ formError() }}</div> }
        <div class="form-grid">
          <div class="field">
            <label for="name">Name</label><input id="name" name="name" maxlength="120" required [(ngModel)]="draft.name" [attr.aria-invalid]="!!errors()['name']" />
            @if (errors()['name']) { <span class="error">{{ errors()['name'] }}</span> }
          </div>
          <div class="field"><label for="profession">Profession</label><input id="profession" name="profession" maxlength="120" [(ngModel)]="draft.profession" /></div>
          <div class="field"><label for="country">Country</label><input id="country" name="country" maxlength="80" [(ngModel)]="draft.country" /></div>
          <div class="field"><label for="service">Service</label><input id="service" name="service" maxlength="80" placeholder="e.g. EB-1A" [(ngModel)]="draft.service" /></div>
        </div>
        <div class="field">
          <label for="review">Review</label>
          <textarea id="review" name="review" rows="5" maxlength="3000" required [(ngModel)]="draft.review" [attr.aria-invalid]="!!errors()['review']" aria-describedby="review-hint"></textarea>
          <span class="hint" id="review-hint">The client's own words. Do not edit them into a claim they did not make.</span>
          @if (errors()['review']) { <span class="error">{{ errors()['review'] }}</span> }
        </div>
        <div class="field">
          <label for="verificationUrl">Verification link</label>
          <input id="verificationUrl" name="verificationUrl" type="url" placeholder="https://" [(ngModel)]="draft.verificationUrl" [attr.aria-invalid]="!!errors()['verificationUrl']" />
          @if (errors()['verificationUrl']) { <span class="error">{{ errors()['verificationUrl'] }}</span> }
        </div>
        <div class="field">
          <label for="photo">Photo</label>
          <div class="row"><input id="photo" name="photo" placeholder="/uploads/… or https://…" [(ngModel)]="draft.photo" style="flex:1" /><button type="button" class="btn" (click)="picking.set(true)">Choose from Media</button></div>
          @if (errors()['photo']) { <span class="error">{{ errors()['photo'] }}</span> }
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="rating">Rating</label>
            <select id="rating" name="rating" [(ngModel)]="draft.rating">@for (n of [5, 4, 3, 2, 1]; track n) { <option [ngValue]="n">{{ n }} of 5</option> }</select>
            @if (errors()['rating']) { <span class="error">{{ errors()['rating'] }}</span> }
          </div>
          <div class="field"><label for="order">Display order</label><input id="order" name="order" type="number" min="0" [(ngModel)]="draft.displayOrder" /></div>
          <div class="field">
            <label for="tstatus">Status</label>
            <select id="tstatus" name="tstatus" [(ngModel)]="draft.status">@for (s of statuses(); track s) { <option [value]="s">{{ label(s) }}</option> }</select>
          </div>
        </div>
        <label class="check"><input type="checkbox" name="featured" [(ngModel)]="draft.featured" /> Featured</label>
      </form>
      <ng-container modal-footer>
        <button type="button" class="btn" (click)="close()">Cancel</button>
        <button type="submit" form="testimonial-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save testimonial' }}</button>
      </ng-container>
    </iha-modal>

    <iha-media-picker [open]="picking()" (picked)="onPicked($event)" (closed)="picking.set(false)" />
    <ih-confirm-dialog [isOpen]="!!deleting()" title="Delete this testimonial?" [message]="'The review from ' + (deleting()?.name ?? '') + ' will be deleted permanently. To hide it instead, set its status to Archived.'"
      confirmText="Delete testimonial" variant="danger" (confirmed)="remove()" (cancelled)="deleting.set(null)" />
  `,
})
export class TestimonialsComponent {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AdminAuthService);
  private readonly unsaved = inject(UnsavedChangesService);

  protected search = '';
  protected status = '';
  protected readonly items = signal<Testimonial[]>([]);
  protected readonly statuses = signal<string[]>(['published', 'draft', 'archived']);
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected draft: Draft = { ...EMPTY };
  private saved = '';
  protected readonly editing = signal(false);
  protected readonly editingId = signal('');
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly picking = signal(false);
  protected readonly deleting = signal<Testimonial | null>(null);
  protected readonly label = humanize;
  protected readonly badge = (status: string) => BADGE[status] ?? 'badge badge-neutral';
  protected readonly canManage = () => this.auth.hasCapability('testimonials.manage');

  constructor() {
    this.load(1);
  }

  protected load(page: number): void {
    this.loading.set(true);
    this.error.set('');
    this.api.get<TestimonialList>('/testimonials', { page, search: this.search.trim(), status: this.status }).subscribe({
      next: (list) => {
        this.items.set(list.items);
        this.statuses.set(list.statuses);
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

  protected edit(item: Testimonial | null): void {
    this.draft = item
      ? { name: item.name, country: item.country, profession: item.profession, service: item.service, review: item.review, rating: item.rating, photo: item.photo, verificationUrl: item.verificationUrl, featured: item.featured, displayOrder: item.displayOrder, status: item.status }
      : { ...EMPTY };
    this.saved = JSON.stringify(this.draft);
    this.editingId.set(item?.id ?? '');
    this.errors.set({});
    this.formError.set('');
    this.editing.set(true);
  }

  protected async close(): Promise<void> {
    if (JSON.stringify(this.draft) !== this.saved && !(await this.unsaved.confirm())) return;
    this.editing.set(false);
  }

  protected onPicked(item: MediaItem): void {
    this.draft.photo = item.url;
    this.picking.set(false);
  }

  protected save(): void {
    if (this.saving()) return;
    const body = { ...this.draft, rating: Number(this.draft.rating), displayOrder: Math.trunc(Number(this.draft.displayOrder)) || 0 };
    const id = this.editingId();
    this.saving.set(true);
    this.formError.set('');
    (id ? this.api.patch<Testimonial>(`/testimonials/${id}`, body) : this.api.post<Testimonial>('/testimonials', body)).subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(false);
        this.toast.success(id ? 'Testimonial saved.' : 'Testimonial created.');
        this.load(id ? this.page() : 1);
      },
      error: (err) => {
        this.errors.set(apiFieldErrors(err));
        this.formError.set(apiErrorMessage(err, 'The testimonial could not be saved.'));
        this.saving.set(false);
      },
    });
  }

  protected remove(): void {
    const item = this.deleting();
    if (!item) return;
    this.deleting.set(null);
    this.api.delete(`/testimonials/${item.id}`).subscribe({
      next: () => {
        this.toast.success('Testimonial deleted.');
        this.load(this.items().length === 1 && this.page() > 1 ? this.page() - 1 : this.page());
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'The testimonial could not be deleted.')),
    });
  }
}
