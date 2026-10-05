import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { apiErrorMessage } from '../../core/api/api-error';
import { Paginated } from '../../core/api/case.types';
import { UscisQueueRow, uscisCategoryLabel } from '../../core/api/uscis.types';
import { PaginationComponent } from '../../shared/pagination.component';
import { SkeletonComponent } from '../../shared/skeleton.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state.component';

export type TrackingView = 'action' | 'dates' | 'recent' | 'all' | 'closed';

/** Each view is just a set of query parameters for the one server-side queue; the server narrows to authorized cases. */
export const TRACKING_VIEWS: { key: TrackingView; label: string; params: Record<string, string>; empty: string }[] = [
  { key: 'action', label: 'Action Required', params: { actionRequired: 'true', sort: 'due' }, empty: 'No filings need action right now.' },
  { key: 'dates', label: 'Response Dates', params: { hasDue: 'true', sort: 'due' }, empty: 'No filings have a response due date.' },
  { key: 'recent', label: 'Recently Updated', params: { sort: 'status' }, empty: 'No tracked filings have a status yet.' },
  { key: 'all', label: 'All Tracking', params: { archived: 'true', sort: 'updated' }, empty: 'No USCIS filings are tracked on your cases yet.' },
  { key: 'closed', label: 'Approved / Closed', params: { statusCategory: 'approved,closed', sort: 'status' }, empty: 'No filings are approved or closed.' },
];

/** Staff-wide USCIS tracking queue (ADR-026). Everything shown is filtered and paged by the server. */
@Component({
  selector: 'ih-tracking',
  standalone: true,
  imports: [DatePipe, RouterLink, FormsModule, PaginationComponent, SkeletonComponent, EmptyStateComponent, ErrorStateComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>USCIS Tracking</h1>
        <p class="page-subtitle">Filing status across your cases. Open a row to see its full history.</p>
      </div>
    </div>

    <div class="filters-bar card">
      <div class="filter-group" role="group" aria-label="Queue">
        @for (v of views; track v.key) {
          <button type="button" class="btn btn-sm" [class.btn-primary]="view() === v.key" [class.btn-secondary]="view() !== v.key" [attr.aria-pressed]="view() === v.key" (click)="setView(v.key)">{{ v.label }}</button>
        }
      </div>
      <div class="filter-group">
        <input type="search" class="form-control" aria-label="Search tracked filings" placeholder="Search receipt, case number, form or title..." [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" (keyup.enter)="onSearch()" />
      </div>
    </div>

    <div class="section-card card">
      @if (isLoading()) {
        <ih-skeleton [rows]="5" rowHeight="2.5rem"></ih-skeleton>
      } @else if (isError()) {
        <ih-error-state title="Failed to load tracking" [message]="errorMessage()" (retry)="load()"></ih-error-state>
      } @else if (rows().length === 0) {
        <ih-empty-state [title]="searchQuery() ? 'No filings match your search' : 'Nothing here'" [description]="searchQuery() ? 'Try a different receipt number, case number or form.' : currentView().empty"></ih-empty-state>
      } @else {
        <div class="table-responsive">
          <table class="data-table">
            <caption class="sr-only">{{ currentView().label }}</caption>
            <thead>
              <tr>
                <th scope="col">Case</th><th scope="col">Client</th><th scope="col">Form</th><th scope="col">Receipt</th><th scope="col">Current status</th>
                <th scope="col">Updated</th><th scope="col">Action required</th><th scope="col">Due</th><th scope="col">Source</th><th scope="col">PM</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr>
                  <td>
                    @if (r.case; as c) {
                      <a [routerLink]="['/cases', c.id]" [queryParams]="{ tab: 'tracking', filing: r.id }" class="case-link">{{ c.caseNumber }}</a>
                      <div class="case-type-sub">{{ c.title }}</div>
                    } @else { — }
                  </td>
                  <td>{{ r.client?.displayName || '—' }}</td>
                  <td>
                    @if (r.case; as c) { <a [routerLink]="['/cases', c.id]" [queryParams]="{ tab: 'tracking', filing: r.id }">{{ r.formType }}</a> } @else { {{ r.formType }} }
                    @if (r.archived) { <span class="case-type-sub"> (archived)</span> }
                  </td>
                  <td class="receipt">{{ r.receiptNumber || '—' }}</td>
                  <td>
                    @if (r.currentStatus; as s) {
                      <div>{{ s.title }}</div>
                      <div class="case-type-sub">{{ categoryLabel(s.category) }}</div>
                    } @else { <span class="text-secondary">No status yet</span> }
                  </td>
                  <td class="text-secondary">{{ (r.currentStatus?.occurredAt || r.updatedAt) | date:'mediumDate' }}</td>
                  <td>@if (r.currentStatus?.actionRequired) { <strong class="action">Yes</strong> } @else { No }</td>
                  <td [class.overdue]="isOverdue(r)">
                    @if (r.currentStatus?.actionRequired && r.currentStatus?.responseDueAt) {
                      {{ r.currentStatus?.responseDueAt | date:'mediumDate':'UTC' }}@if (isOverdue(r)) { (overdue) }
                    } @else { — }
                  </td>
                  <td>{{ r.currentStatus ? (r.currentStatus.source === 'uscis_api' ? 'USCIS' : 'Manual') : '—' }}</td>
                  <td>{{ r.projectManager?.name || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <ih-pagination [page]="page()" [totalPages]="totalPages()" [totalItems]="totalItems()" (pageChange)="onPageChange($event)"></ih-pagination>
      }
    </div>
  `,
  styleUrls: ['../dashboard/dashboard.scss', '../cases/cases.scss'],
  styles: [`
    .receipt { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; letter-spacing: .04em; font-size: .8125rem; white-space: nowrap; }
    .action { color: #92400e; } .overdue { color: #991b1b; font-weight: 600; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .filters-bar .filter-group[role='group'] { display: flex; flex-wrap: wrap; gap: .375rem; }
  `]
})
export class TrackingComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly views = TRACKING_VIEWS;
  readonly categoryLabel = uscisCategoryLabel;

  rows = signal<UscisQueueRow[]>([]);
  isLoading = signal(true);
  isError = signal(false);
  errorMessage = signal('');

  view = signal<TrackingView>('action');
  page = signal(1);
  pageSize = signal(20);
  totalItems = signal(0);
  totalPages = signal(1);
  searchQuery = signal('');

  currentView = () => this.views.find((v) => v.key === this.view()) ?? this.views[0];

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      const view = params['view'];
      this.view.set(this.views.some((v) => v.key === view) ? view : 'action');
      this.page.set(params['page'] ? parseInt(params['page'], 10) || 1 : 1);
      this.searchQuery.set(params['q'] || '');
      this.load();
    });
  }

  load(): void {
    this.isLoading.set(true);
    this.isError.set(false);
    const params: Record<string, string | number> = { ...this.currentView().params, page: this.page(), limit: this.pageSize() };
    if (this.searchQuery()) params['search'] = this.searchQuery();

    this.api.get<Paginated<UscisQueueRow>>('/staff/uscis', params).subscribe({
      next: ({ data }) => {
        this.rows.set(data.items);
        this.totalItems.set(data.total);
        this.totalPages.set(Math.max(1, data.totalPages));
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isError.set(true);
        this.errorMessage.set(apiErrorMessage(err, 'Failed to load USCIS tracking.'));
        this.isLoading.set(false);
      }
    });
  }

  isOverdue(row: UscisQueueRow): boolean {
    const s = row.currentStatus;
    return !!s?.actionRequired && !!s.responseDueAt && new Date(s.responseDueAt).getTime() < Date.now();
  }

  setView(view: TrackingView) {
    this.view.set(view);
    this.onSearch();
  }

  onSearch() {
    this.page.set(1);
    this.updateUrl();
  }

  onPageChange(page: number) {
    this.page.set(page);
    this.updateUrl();
  }

  private updateUrl() {
    const queryParams: Record<string, string | number> = {};
    if (this.view() !== 'action') queryParams['view'] = this.view();
    if (this.searchQuery()) queryParams['q'] = this.searchQuery();
    if (this.page() > 1) queryParams['page'] = this.page();
    this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: '' });
  }
}
