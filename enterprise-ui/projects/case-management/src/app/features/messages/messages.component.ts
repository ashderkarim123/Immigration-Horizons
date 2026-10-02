import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { apiErrorMessage } from '../../core/api/api-error';
import { Paginated } from '../../core/api/case.types';
import { InboxItem } from '../../core/api/inbox.types';
import { PaginationComponent } from '../../shared/pagination.component';
import { SkeletonComponent } from '../../shared/skeleton.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state.component';

const AUDIENCE_LABEL: Record<InboxItem['audience'], string> = {
  client_and_team: 'Client & team',
  staff_only: 'Staff only',
  restricted: 'Restricted',
};

/** Global staff inbox: conversations across the cases the actor may see, unread first. */
@Component({
  selector: 'ih-messages',
  standalone: true,
  imports: [DatePipe, FormsModule, PaginationComponent, SkeletonComponent, EmptyStateComponent, ErrorStateComponent],
  templateUrl: './messages.component.html',
  styleUrls: ['../dashboard/dashboard.scss', '../cases/cases.scss', './messages.component.scss']
})
export class MessagesComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  items = signal<InboxItem[]>([]);
  isLoading = signal(true);
  isError = signal(false);
  errorMessage = signal('');

  page = signal(1);
  pageSize = signal(20);
  totalItems = signal(0);
  totalPages = signal(1);
  unreadTotal = signal(0);

  searchQuery = signal('');
  filter = signal<'all' | 'unread'>('all');

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      this.page.set(params['page'] ? parseInt(params['page'], 10) : 1);
      this.searchQuery.set(params['q'] || '');
      this.filter.set(params['filter'] === 'unread' ? 'unread' : 'all');
      this.load();
    });
  }

  load(): void {
    this.isLoading.set(true);
    this.isError.set(false);
    const params: Record<string, string | number> = { page: this.page(), limit: this.pageSize(), filter: this.filter() };
    if (this.searchQuery()) params['search'] = this.searchQuery();

    this.api.get<Paginated<InboxItem> & { unreadTotal: number }>('/staff/inbox', params).subscribe({
      next: ({ data }) => {
        this.items.set(data.items);
        this.totalItems.set(data.total);
        this.totalPages.set(Math.max(1, data.totalPages));
        this.unreadTotal.set(data.unreadTotal);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isError.set(true);
        this.errorMessage.set(apiErrorMessage(err, 'Failed to load messages.'));
        this.isLoading.set(false);
      }
    });
  }

  setFilter(value: 'all' | 'unread') {
    this.filter.set(value);
    this.onFilterChange();
  }

  onFilterChange(): void {
    this.page.set(1);
    this.updateUrl();
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.updateUrl();
  }

  private updateUrl(): void {
    const queryParams: Record<string, string | number> = {};
    if (this.page() > 1) queryParams['page'] = this.page();
    if (this.searchQuery()) queryParams['q'] = this.searchQuery();
    if (this.filter() === 'unread') queryParams['filter'] = 'unread';
    this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: '' });
  }

  audienceLabel(item: InboxItem): string {
    return AUDIENCE_LABEL[item.audience];
  }

  /** Opens the case on its Chat tab with this channel selected. */
  open(item: InboxItem): void {
    if (!item.case) return;
    this.router.navigate(['/cases', item.case.id], { queryParams: { tab: 'chat', channel: item.channelId } });
  }
}
