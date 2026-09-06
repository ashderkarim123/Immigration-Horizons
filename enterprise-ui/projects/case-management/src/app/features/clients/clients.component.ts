import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'ih-clients',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page-header">
      <h1>Clients</h1>
      <p class="page-subtitle">Client directory</p>
    </div>

    <div class="section-card">
      @if (isLoading()) {
        <p>Loading clients...</p>
      } @else {
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Portal Status</th>
            </tr>
          </thead>
          <tbody>
            @for (c of clients(); track c._id) {
              <tr>
                <td><a [routerLink]="['/clients', c._id]">{{ c.name }}</a></td>
                <td>{{ c.email }}</td>
                <td><span class="badge">{{ c.status }}</span></td>
                <td><span class="badge">{{ c.portalStatus }}</span></td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
  styleUrls: ['../dashboard/dashboard.scss']
})
export class ClientsComponent implements OnInit {
  private api = inject(ApiService);
  
  clients = signal<any[]>([]);
  isLoading = signal(true);

  ngOnInit() {
    this.api.get('/staff/clients').subscribe({
      next: (res: any) => {
        this.clients.set(res.data.items);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      }
    });
  }
}
