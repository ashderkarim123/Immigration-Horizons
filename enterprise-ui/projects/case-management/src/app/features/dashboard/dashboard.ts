import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'ih-dashboard',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private api = inject(ApiService);
  
  metrics = signal<any>(null);
  isLoading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    this.api.get('/staff/dashboard').subscribe({
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
