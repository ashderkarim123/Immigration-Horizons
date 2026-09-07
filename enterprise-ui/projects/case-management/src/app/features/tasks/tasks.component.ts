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
  selector: 'ih-tasks',
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
  templateUrl: './tasks.component.html',
  styleUrls: ['../dashboard/dashboard.scss', '../cases/cases.scss']
})
export class TasksComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  tasks = signal<any[]>([]);
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
  selectedScope = signal('mine');
  selectedStatus = signal('');
  selectedPriority = signal('');
  selectedDue = signal('');

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.page.set(params['page'] ? parseInt(params['page'], 10) : 1);
      this.searchQuery.set(params['q'] || '');
      this.selectedScope.set(params['scope'] || 'mine');
      this.selectedStatus.set(params['status'] || '');
      this.selectedPriority.set(params['priority'] || '');
      this.selectedDue.set(params['due'] || '');
      this.loadTasks();
    });
  }

  loadTasks(): void {
    this.isLoading.set(true);
    this.isError.set(false);

    const queryParams: Record<string, any> = {
      page: this.page(),
      limit: this.pageSize(),
    };

    if (this.searchQuery()) queryParams['search'] = this.searchQuery();
    if (this.selectedScope() !== 'mine') queryParams['scope'] = this.selectedScope();
    if (this.selectedStatus()) queryParams['status'] = this.selectedStatus();
    if (this.selectedPriority()) queryParams['priority'] = this.selectedPriority();
    if (this.selectedDue()) queryParams['due'] = this.selectedDue();

    this.api.get('/staff/tasks', queryParams).subscribe({
      next: (res: any) => {
        const data = res.data || {};
        this.tasks.set(data.items || []);
        this.totalItems.set(data.total || data.items?.length || 0);
        this.totalPages.set(data.totalPages || 1);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isError.set(true);
        this.errorMessage.set(err?.error?.message || 'Failed to load tasks.');
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
    if (this.selectedScope() !== 'mine') queryParams['scope'] = this.selectedScope();
    if (this.selectedStatus()) queryParams['status'] = this.selectedStatus();
    if (this.selectedPriority()) queryParams['priority'] = this.selectedPriority();
    if (this.selectedDue()) queryParams['due'] = this.selectedDue();

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: ''
    });
  }

  isOverdue(task: any): boolean {
    if (!task.dueDate || task.status === 'completed') return false;
    return new Date(task.dueDate) < new Date();
  }
}
