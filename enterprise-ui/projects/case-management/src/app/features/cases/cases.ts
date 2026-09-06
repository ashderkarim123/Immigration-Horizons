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
  selector: 'ih-cases',
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
  templateUrl: './cases.html',
  styleUrls: ['../dashboard/dashboard.scss', './cases.scss']
})
export class Cases implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  cases = signal<any[]>([]);
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
  selectedStage = signal('');
  selectedCaseType = signal('');
  selectedPriority = signal('');
  selectedScope = signal('all');
  includeArchived = signal(false);

  stages = [
    { label: 'All Stages', value: '' },
    { label: 'Initial Review', value: 'initial_review' },
    { label: 'Document Collection', value: 'document_collection' },
    { label: 'Drafting', value: 'drafting' },
    { label: 'Client Review', value: 'client_review' },
    { label: 'Ready to File', value: 'ready_to_file' },
    { label: 'Filed / Pending Decision', value: 'filed' },
    { label: 'Decision Received', value: 'decision_received' },
    { label: 'Completed', value: 'completed' },
    { label: 'Archived', value: 'archived' }
  ];

  priorities = [
    { label: 'All Priorities', value: '' },
    { label: 'Low', value: 'low' },
    { label: 'Medium', value: 'medium' },
    { label: 'High', value: 'high' },
    { label: 'Urgent', value: 'urgent' }
  ];

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.page.set(params['page'] ? parseInt(params['page'], 10) : 1);
      this.searchQuery.set(params['q'] || '');
      this.selectedStage.set(params['stage'] || '');
      this.selectedCaseType.set(params['type'] || '');
      this.selectedPriority.set(params['priority'] || '');
      this.selectedScope.set(params['scope'] || 'all');
      this.includeArchived.set(params['archived'] === 'true');
      this.loadCases();
    });
  }

  loadCases(): void {
    this.isLoading.set(true);
    this.isError.set(false);

    const queryParams: Record<string, any> = {
      page: this.page(),
      limit: this.pageSize(),
    };

    if (this.searchQuery()) queryParams['q'] = this.searchQuery();
    if (this.selectedStage()) queryParams['stage'] = this.selectedStage();
    if (this.selectedCaseType()) queryParams['caseType'] = this.selectedCaseType();
    if (this.selectedPriority()) queryParams['priority'] = this.selectedPriority();
    if (this.selectedScope()) queryParams['scope'] = this.selectedScope();
    if (this.includeArchived()) queryParams['includeArchived'] = 'true';

    this.api.get('/staff/cases', queryParams).subscribe({
      next: (res: any) => {
        const data = res.data || {};
        this.cases.set(data.items || []);
        this.totalItems.set(data.pagination?.total || data.items?.length || 0);
        this.totalPages.set(data.pagination?.pages || 1);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isError.set(true);
        this.errorMessage.set(err?.error?.message || 'Failed to load cases.');
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
    if (this.selectedStage()) queryParams['stage'] = this.selectedStage();
    if (this.selectedCaseType()) queryParams['type'] = this.selectedCaseType();
    if (this.selectedPriority()) queryParams['priority'] = this.selectedPriority();
    if (this.selectedScope() !== 'all') queryParams['scope'] = this.selectedScope();
    if (this.includeArchived()) queryParams['archived'] = 'true';

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: ''
    });
  }

  getClientDisplayName(c: any): string {
    if (!c.primaryClient) return 'Unassigned';
    if (c.primaryClient.displayName) return c.primaryClient.displayName;
    const first = c.primaryClient.firstName || '';
    const last = c.primaryClient.lastName || '';
    const name = [first, last].filter(Boolean).join(' ');
    return name || c.primaryClient.email || 'Client';
  }
}
