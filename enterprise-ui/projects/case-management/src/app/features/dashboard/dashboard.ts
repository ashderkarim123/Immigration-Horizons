import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardMetrics } from '../../core/api/dashboard.types';
import { AuthService } from '../../core/auth/auth.service';
import { CASE_TYPES } from '../../core/api/case-catalog';

@Component({
  selector: 'ih-dashboard',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  readonly auth = inject(AuthService);
  private api = inject(ApiService);
  
  metrics = signal<DashboardMetrics | null>(null);
  activeQueues = computed(() => (this.metrics()?.workQueues || []).filter(queue => queue.count > 0));
  isLoading = signal(true);
  error = signal<string | null>(null);
  caseTypeLabel(value: string) { return CASE_TYPES.find(type => type.value === value)?.label || value; }

  ngOnInit() {
    this.load();
  }
  load() {
    this.isLoading.set(true);
    this.error.set(null);
    this.api.get<DashboardMetrics>('/staff/dashboard').subscribe({
      next: (res) => {
        this.metrics.set(res.data);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load dashboard metrics.');
        this.isLoading.set(false);
      }
    });
  }
}
