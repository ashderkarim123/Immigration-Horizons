import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../../core/api/api.service';
import { ClientDetail } from '../../../core/api/client.types';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '../../../shared/status-badge.component';
import { ErrorStateComponent } from '../../../shared/error-state.component';

@Component({
  selector: 'ih-client-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, StatusBadgeComponent, ErrorStateComponent],
  template: `
    <div class="page-header">
      <h1>Client Detail</h1>
      @if (clientData(); as client) {
        <p class="page-subtitle">{{ client.displayName }}</p>
      }
    </div>

    @if (isLoading()) {
      <p>Loading client...</p>
    } @else if (isError()) {
      <ih-error-state
        title="Client not found"
        message="This client does not exist or you do not have access to it."
        (retry)="load()"
      ></ih-error-state>
    } @else if (clientData(); as client) {
      <div class="dashboard-sections" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">

        <div class="section-card">
          <h3>Contact Info</h3>
          <p><strong>Email:</strong> {{ client.email }}</p>
          <p><strong>Phone:</strong> {{ client.phone || 'N/A' }}</p>
          <p><strong>Status:</strong> <ih-status-badge [status]="client.status"></ih-status-badge></p>
          <p><strong>Last login:</strong> {{ client.lastLoginAt ? (client.lastLoginAt | date:'short') : 'Never' }}</p>
        </div>

        <div class="section-card">
          <h3>Cases</h3>
          @if (client.cases.length === 0) {
            <p>No cases you have access to.</p>
          }
          <ul style="list-style: none; padding: 0; margin: 0;">
            @for (c of client.cases; track c.id) {
              <li style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--ih-border-light);">
                <strong><a [routerLink]="['/cases', c.id]">{{ c.caseNumber }}</a></strong><br/>
                <span style="font-size: var(--ih-font-size-sm); color: var(--ih-text-secondary);">
                  {{ c.caseType }} &bull; <ih-status-badge [status]="c.currentStage"></ih-status-badge>
                </span>
              </li>
            }
          </ul>
        </div>
      </div>
    }
  `,
  styleUrls: ['../../dashboard/dashboard.scss']
})
export class ClientDetailComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  clientData = signal<ClientDetail | null>(null);
  isLoading = signal(true);
  isError = signal(false);

  ngOnInit() {
    this.load();
  }

  load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.isLoading.set(true);
    this.isError.set(false);
    this.api.get<ClientDetail>(`/staff/clients/${id}`).subscribe({
      next: ({ data }) => {
        this.clientData.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.isError.set(true);
        this.isLoading.set(false);
      }
    });
  }
}
