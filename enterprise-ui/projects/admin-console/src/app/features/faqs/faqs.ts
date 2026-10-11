import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../../core/api/admin-api.service';
import { Faq, FaqList } from '../../core/api/admin.types';
import { AdminAuthService } from '../../core/auth/admin-auth.service';
import { apiErrorMessage, apiFieldErrors } from '../../core/errors/api-error';
import { UnsavedChangesService } from '../../core/guards/unsaved-changes.guard';
import { ModalComponent } from '../../shared/modal.component';
import { ConfirmDialogComponent, EmptyStateComponent, ErrorStateComponent, PaginationComponent, SkeletonComponent, ToastService } from '../../shared/staff-ui';
import { humanize } from '../../shared/widgets';

type Draft = Pick<Faq, 'question' | 'answer' | 'category' | 'displayOrder' | 'showOnHomepage' | 'showOnServicePage' | 'schemaEnabled' | 'status'>;
const EMPTY: Draft = { question: '', answer: '', category: 'General', displayOrder: 0, showOnHomepage: false, showOnServicePage: '', schemaEnabled: true, status: 'published' };

@Component({
  selector: 'iha-faqs',
  imports: [FormsModule, ModalComponent, ConfirmDialogComponent, EmptyStateComponent, ErrorStateComponent, PaginationComponent, SkeletonComponent],
  template: `
    <div class="page-header">
      <div><h1>FAQs</h1><p class="page-subtitle">Questions and answers, where each is shown, and whether it is published.</p></div>
      @if (canManage()) { <div class="page-actions"><button type="button" class="btn btn-primary" (click)="edit(null)">New FAQ</button></div> }
    </div>

    <form class="filter-bar" role="search" (ngSubmit)="load(1)">
      <div class="field"><label for="faq-search">Search</label><input id="faq-search" name="search" type="search" placeholder="Question" [(ngModel)]="search" /></div>
      <div class="field">
        <label for="faq-status">Status</label>
        <select id="faq-status" name="status" [(ngModel)]="status" (ngModelChange)="load(1)">
          <option value="">All</option>
          @for (s of statuses(); track s) { <option [value]="s">{{ label(s) }}</option> }
        </select>
      </div>
      <div class="field">
        <label for="faq-category">Category</label>
        <select id="faq-category" name="category" [(ngModel)]="category" (ngModelChange)="load(1)">
          <option value="">All</option>
          @for (c of categories(); track c) { <option [value]="c">{{ c }}</option> }
        </select>
      </div>
      <button type="submit" class="btn">Search</button>
    </form>

    @if (error()) {
      <ih-error-state title="FAQs could not be loaded" [message]="error()" (retry)="load(page())" />
    } @else if (loading() && !items().length) {
      <ih-skeleton [rows]="6" rowHeight="2.75rem" />
    } @else if (!items().length) {
      <ih-empty-state title="No FAQs found" [description]="search || status || category ? 'No FAQ matches these filters.' : 'Add the first question visitors ask.'" />
    } @else {
      <div class="table-wrap">
        <table class="data-table stacked">
          <caption class="sr-only">FAQs in display order</caption>
          <thead><tr><th scope="col">Order</th><th scope="col">Question</th><th scope="col">Category</th><th scope="col">Shown on</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            @for (faq of items(); track faq.id) {
              <tr>
                <td data-label="Order">{{ faq.displayOrder }}</td>
                <td data-label="Question"><span class="cell-title">{{ faq.question }}</span></td>
                <td data-label="Category">{{ faq.category }}</td>
                <td data-label="Shown on">{{ placement(faq) }}</td>
                <td data-label="Status"><span [class]="faq.status === 'published' ? 'badge badge-success' : 'badge badge-neutral'">{{ label(faq.status) }}</span></td>
                <td class="actions">
                  @if (faq.actions.edit) { <button type="button" class="btn btn-sm" (click)="edit(faq)">Edit<span class="sr-only"> {{ faq.question }}</span></button> }
                  @if (faq.actions.delete) { <button type="button" class="btn btn-sm btn-danger" (click)="deleting.set(faq)">Delete<span class="sr-only"> {{ faq.question }}</span></button> }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <ih-pagination [page]="page()" [totalPages]="totalPages()" [totalItems]="total()" (pageChange)="load($event)" />
    }

    <iha-modal [open]="editing()" [title]="editingId() ? 'Edit FAQ' : 'New FAQ'" (closed)="close()">
      <form id="faq-form" class="stack" (ngSubmit)="save()" novalidate>
        @if (formError()) { <div class="alert alert-error" role="alert">{{ formError() }}</div> }
        <div class="field">
          <label for="question">Question</label>
          <input id="question" name="question" maxlength="300" required [(ngModel)]="draft.question" [attr.aria-invalid]="!!errors()['question']" />
          @if (errors()['question']) { <span class="error">{{ errors()['question'] }}</span> }
        </div>
        <div class="field">
          <label for="answer">Answer</label>
          <textarea id="answer" name="answer" rows="6" maxlength="5000" required [(ngModel)]="draft.answer" [attr.aria-invalid]="!!errors()['answer']"></textarea>
          @if (errors()['answer']) { <span class="error">{{ errors()['answer'] }}</span> }
        </div>
        <div class="form-grid">
          <div class="field"><label for="category">Category</label><input id="category" name="category" maxlength="80" [(ngModel)]="draft.category" /></div>
          <div class="field">
            <label for="displayOrder">Display order</label><input id="displayOrder" name="displayOrder" type="number" min="0" [(ngModel)]="draft.displayOrder" />
            @if (errors()['displayOrder']) { <span class="error">{{ errors()['displayOrder'] }}</span> }
          </div>
          <div class="field">
            <label for="servicePage">Service page</label>
            <select id="servicePage" name="servicePage" [(ngModel)]="draft.showOnServicePage">
              <option value="">None</option>
              @for (slug of serviceOptions(); track slug) { <option [value]="slug">{{ slug }}</option> }
            </select>
            @if (errors()['showOnServicePage']) { <span class="error">{{ errors()['showOnServicePage'] }}</span> }
          </div>
          <div class="field">
            <label for="status">Status</label>
            <select id="status" name="status" [(ngModel)]="draft.status">
              @for (s of statuses(); track s) { <option [value]="s">{{ label(s) }}</option> }
            </select>
          </div>
        </div>
        <label class="check"><input type="checkbox" name="showOnHomepage" [(ngModel)]="draft.showOnHomepage" /> Show on the homepage</label>
        <label class="check"><input type="checkbox" name="schemaEnabled" [(ngModel)]="draft.schemaEnabled" /> Include in FAQ structured data</label>
      </form>
      <ng-container modal-footer>
        <button type="button" class="btn" (click)="close()">Cancel</button>
        <button type="submit" form="faq-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save FAQ' }}</button>
      </ng-container>
    </iha-modal>

    <ih-confirm-dialog [isOpen]="!!deleting()" title="Delete this FAQ?" [message]="'“' + (deleting()?.question ?? '') + '” will be deleted permanently.'"
      confirmText="Delete FAQ" variant="danger" (confirmed)="remove()" (cancelled)="deleting.set(null)" />
  `,
})
export class FaqsComponent {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AdminAuthService);
  private readonly unsaved = inject(UnsavedChangesService);

  protected search = '';
  protected status = '';
  protected category = '';
  protected readonly items = signal<Faq[]>([]);
  protected readonly categories = signal<string[]>([]);
  protected readonly statuses = signal<string[]>(['published', 'draft']);
  protected readonly serviceSlugs = signal<string[]>([]);
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
  protected readonly deleting = signal<Faq | null>(null);
  protected readonly label = humanize;
  protected readonly canManage = () => this.auth.hasCapability('faqs.manage');
  /** The real service slugs, plus whatever an older record already targets so editing it does not silently change it. */
  protected readonly serviceOptions = () => [...new Set([...this.serviceSlugs(), this.draft.showOnServicePage].filter(Boolean))];

  constructor() {
    this.load(1);
  }

  protected placement(faq: Faq): string {
    const where = [faq.showOnHomepage ? 'Homepage' : '', faq.showOnServicePage ? `Service: ${faq.showOnServicePage}` : ''].filter(Boolean);
    return where.length ? where.join(', ') : 'FAQ page only';
  }

  protected load(page: number): void {
    this.loading.set(true);
    this.error.set('');
    this.api.get<FaqList>('/faqs', { page, search: this.search.trim(), status: this.status, category: this.category }).subscribe({
      next: (list) => {
        this.items.set(list.items);
        this.categories.set(list.categories);
        this.statuses.set(list.statuses);
        this.serviceSlugs.set(list.serviceSlugs);
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

  protected edit(faq: Faq | null): void {
    this.draft = faq
      ? { question: faq.question, answer: faq.answer, category: faq.category, displayOrder: faq.displayOrder, showOnHomepage: faq.showOnHomepage, showOnServicePage: faq.showOnServicePage, schemaEnabled: faq.schemaEnabled, status: faq.status }
      : { ...EMPTY };
    this.saved = JSON.stringify(this.draft);
    this.editingId.set(faq?.id ?? '');
    this.errors.set({});
    this.formError.set('');
    this.editing.set(true);
  }

  protected async close(): Promise<void> {
    if (JSON.stringify(this.draft) !== this.saved && !(await this.unsaved.confirm())) return;
    this.editing.set(false);
  }

  protected save(): void {
    if (this.saving()) return;
    const body = { ...this.draft, displayOrder: Math.trunc(Number(this.draft.displayOrder)) || 0 };
    const id = this.editingId();
    this.saving.set(true);
    this.formError.set('');
    (id ? this.api.patch<Faq>(`/faqs/${id}`, body) : this.api.post<Faq>('/faqs', body)).subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(false);
        this.toast.success(id ? 'FAQ saved.' : 'FAQ created.');
        this.load(id ? this.page() : 1);
      },
      error: (err) => {
        this.errors.set(apiFieldErrors(err));
        this.formError.set(apiErrorMessage(err, 'The FAQ could not be saved.'));
        this.saving.set(false);
      },
    });
  }

  protected remove(): void {
    const faq = this.deleting();
    if (!faq) return;
    this.deleting.set(null);
    this.api.delete(`/faqs/${faq.id}`).subscribe({
      next: () => {
        this.toast.success('FAQ deleted.');
        this.load(this.items().length === 1 && this.page() > 1 ? this.page() - 1 : this.page());
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'The FAQ could not be deleted.')),
    });
  }
}
