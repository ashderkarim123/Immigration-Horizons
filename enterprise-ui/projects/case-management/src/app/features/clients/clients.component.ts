import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { DatePipe } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { PaginationComponent } from '../../shared/pagination.component';
import { SkeletonComponent } from '../../shared/skeleton.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state.component';

@Component({
  selector: 'ih-clients',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    FormsModule,
    StatusBadgeComponent,
    PaginationComponent,
    SkeletonComponent,
    EmptyStateComponent,
    ErrorStateComponent
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Clients</h1>
        <p class="page-subtitle">Managed client accounts and portal access directory</p>
      </div>
    </div>

    <div class="filters-bar card">
      <div class="filter-group">
        <input
          type="search"
          class="form-control"
          placeholder="Search client name or email..."
          [ngModel]="searchQuery()"
          (ngModelChange)="searchQuery.set($event)"
          (keyup.enter)="onFilterChange()"
        />
      </div>

      <div class="filter-group">
        <select
          class="form-select"
          [ngModel]="selectedStatus()"
          (ngModelChange)="selectedStatus.set($event); onFilterChange()"
        >
          @for (st of statuses; track st.value) {
            <option [value]="st.value">{{ st.label }}</option>
          }
        </select>
      </div>
    </div>

    <div class="section-card card">
      @if (isLoading()) {
        <ih-skeleton [rows]="5" rowHeight="2.5rem"></ih-skeleton>
      } @else if (isError()) {
        <ih-error-state
          title="Failed to load clients"
          [message]="errorMessage()"
          (retry)="loadClients()"
        ></ih-error-state>
      } @else if (clients().length === 0) {
        <ih-empty-state
          title="No clients match your request"
          description="Try broadening your search query or clearing the status filter."
        ></ih-empty-state>
      } @else {
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Client Name</th>
                <th>Email Address</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Created Date</th>
              </tr>
            </thead>
            <tbody>
              @for (c of clients(); track c.id) {
                <tr>
                  <td class="font-medium">
                    <a [routerLink]="['/clients', c.id]" class="client-link">
                      {{ c.displayName || c.email }}
                    </a>
                  </td>
                  <td>{{ c.email }}</td>
                  <td>
                    <ih-status-badge [status]="c.status"></ih-status-badge>
                  </td>
                  <td class="text-secondary">
                    {{ c.lastLoginAt ? (c.lastLoginAt | date:'short') : 'Never' }}
                  </td>
                  <td class="text-secondary">
                    {{ c.createdAt ? (c.createdAt | date:'mediumDate') : '—' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <ih-pagination
          [page]="page()"
          [totalPages]="totalPages()"
          [totalItems]="totalItems()"
          (pageChange)="onPageChange($event)"
        ></ih-pagination>
      }
    </div>
  `,
  styleUrls: ['../dashboard/dashboard.scss', '../cases/cases.scss']
})
export class ClientsComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  clients = signal<any[]>([]);
  isLoading = signal(true);
  isError = signal(false);
  errorMessage = signal('');

  // Pagination state
  page = signal(1);
  pageSize = signal(10);
  totalItems = signal(0);
  totalPages = signal(1);

  // Filters
  searchQuery = signal('');
  selectedStatus = signal('');

  statuses = [
    { label: 'All Statuses', value: '' },
    { label: 'Active', value: 'active' },
    { label: 'Pending Password Setup', value: 'pending_initial_setup' },
    { label: 'Locked Out', value: 'locked' },
    { label: 'Deactivated', value: 'deactivated' }
  ];

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.page.set(params['page'] ? parseInt(params['page'], 10) : 1);
      this.searchQuery.set(params['q'] || '');
      this.selectedStatus.set(params['status'] || '');
      this.loadClients();
    });
  }

  loadClients(): void {
    this.isLoading.set(true);
    this.isError.set(false);

    const queryParams: Record<string, any> = {
      page: this.page(),
      limit: this.pageSize(),
    };

    if (this.searchQuery()) queryParams['q'] = this.searchQuery();
    if (this.selectedStatus()) queryParams['status'] = this.selectedStatus();

    this.api.get('/staff/clients', queryParams).subscribe({
      next: (res: any) => {
        const data = res.data || {};
        this.clients.set(data.items || []);
        this.totalItems.set(data.pagination?.total || data.items?.length || 0);
        this.totalPages.set(data.pagination?.pages || 1);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isError.set(true);
        this.errorMessage.set(err?.error?.message || 'Failed to load clients.');
        this.isLoading.set(false);
      }
    });
  }

  onFilterChange(): void {
    this.page.set(1);
    this.updateUrlAndLoad();
  }

  onPageChange(newPage: number): void {
    this.page.set(newPage);
    this.updateUrlAndLoad();
  }

  private updateUrlAndLoad(): void {
    const queryParams: Record<string, any> = {};

    if (this.page() > 1) queryParams['page'] = this.page();
    if (this.searchQuery()) queryParams['q'] = this.searchQuery();
    if (this.selectedStatus()) queryParams['status'] = this.selectedStatus();

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: ''
    });
  }
}
