import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'ih-cases',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './cases.html',
  styleUrls: ['../dashboard/dashboard.scss']
})
export class Cases implements OnInit {
  private api = inject(ApiService);
  
  cases = signal<any[]>([]);
  isLoading = signal(true);

  ngOnInit() {
    this.api.get('/staff/cases').subscribe({
      next: (res: any) => {
        this.cases.set(res.data.items);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      }
    });
  }
}
