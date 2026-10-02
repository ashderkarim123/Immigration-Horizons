import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SkeletonComponent } from '../../shared/skeleton.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state.component';

@Component({
  selector: 'ih-deadlines',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    FormsModule,
    SkeletonComponent,
    EmptyStateComponent,
    ErrorStateComponent
  ],
  templateUrl: './deadlines.component.html',
  styleUrls: ['../dashboard/dashboard.scss', '../cases/cases.scss']
})
export class DeadlinesComponent implements OnInit {
  private api = inject(ApiService);

  deadlines = signal<any[]>([]);
  isLoading = signal(true);
  isError = signal(false);
  errorMessage = signal('');

  selectedScope = signal('mine');
  selectedDue = signal('upcoming');

  ngOnInit() {
    this.loadDeadlines();
  }

  loadDeadlines(): void {
    this.isLoading.set(true);
    this.isError.set(false);

    const queryParams: Record<string, any> = {
      scope: this.selectedScope(),
      due: this.selectedDue()
    };

    this.api.get('/staff/deadlines', queryParams).subscribe({
      next: (res: any) => {
        const data = res.data || {};
        this.deadlines.set(data.deadlines || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isError.set(true);
        this.errorMessage.set(err?.error?.message || 'Failed to load deadlines.');
        this.isLoading.set(false);
      }
    });
  }

  isOverdue(item: any): boolean {
    if (!item.date) return false;
    // For tasks, we don't return completed ones so anything in the past is overdue.
    // For cases, target filing in the past is overdue unless filed. We don't have exact status here, but backend filters them.
    return new Date(item.date) < new Date();
  }
}
