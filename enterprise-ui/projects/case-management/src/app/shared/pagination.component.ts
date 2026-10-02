import { Component, input, output, computed } from '@angular/core';

@Component({
  selector: 'ih-pagination',
  standalone: true,
  template: `
    @if (totalPages() > 1) {
      <nav class="pagination" aria-label="Pagination Navigation">
        <div class="pagination-info">
          Showing page <strong>{{ page() }}</strong> of <strong>{{ totalPages() }}</strong> ({{ totalItems() }} items)
        </div>
        <div class="pagination-controls">
          <button
            type="button"
            class="btn-page"
            [disabled]="page() <= 1"
            (click)="onPageChange(page() - 1)"
            aria-label="Previous page"
          >
            Previous
          </button>

          @for (p of pageNumbers(); track p) {
            <button
              type="button"
              class="btn-page"
              [class.active]="p === page()"
              (click)="onPageChange(p)"
            >
              {{ p }}
            </button>
          }

          <button
            type="button"
            class="btn-page"
            [disabled]="page() >= totalPages()"
            (click)="onPageChange(page() + 1)"
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      </nav>
    }
  `,
  styles: [`
    .pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 0;
      border-top: 1px solid #e5e7eb;
      font-size: 0.875rem;
      color: #374151;
    }
    .pagination-controls {
      display: flex;
      gap: 0.25rem;
    }
    .btn-page {
      padding: 0.375rem 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      background: white;
      color: #374151;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.15s ease-in-out;
    }
    .btn-page:hover:not(:disabled) {
      background: #f3f4f6;
      border-color: #9ca3af;
    }
    .btn-page:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-page.active {
      background: #2563eb;
      color: white;
      border-color: #2563eb;
      font-weight: 600;
    }
  `]
})
export class PaginationComponent {
  page = input.required<number>();
  totalPages = input.required<number>();
  totalItems = input<number>(0);

  pageChange = output<number>();

  pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = this.page();
    const pages: number[] = [];

    let start = Math.max(1, current - 2);
    let end = Math.min(total, start + 4);
    if (end - start < 4) {
      start = Math.max(1, end - 4);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  });

  onPageChange(newPage: number): void {
    if (newPage >= 1 && newPage <= this.totalPages() && newPage !== this.page()) {
      this.pageChange.emit(newPage);
    }
  }
}
