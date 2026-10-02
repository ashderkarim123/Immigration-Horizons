import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../../core/api/api.service';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'ih-client-detail',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page-header">
      <h1>Client Detail</h1>
      @if (clientData()) {
        <p class="page-subtitle">{{ clientData()?.name }}</p>
      }
    </div>

    @if (isLoading()) {
      <p>Loading client...</p>
    } @else if (clientData()) {
      <div class="dashboard-sections" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
        
        <div class="section-card">
          <h3>Contact Info</h3>
          <p><strong>Email:</strong> {{ clientData()?.email }}</p>
          <p><strong>Phone:</strong> {{ clientData()?.phone || 'N/A' }}</p>
          <p><strong>Status:</strong> <span class="badge">{{ clientData()?.status }}</span></p>
          <p><strong>Portal Status:</strong> <span class="badge">{{ clientData()?.portalStatus }}</span></p>
        </div>

        <div class="section-card">
          <h3>Cases</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            @for (c of clientData()?.cases; track c._id) {
              <li style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--ih-border-light);">
                <strong><a [routerLink]="['/cases', c._id]">{{ c.caseNumber }}</a></strong><br/>
                <span style="font-size: var(--ih-font-size-sm); color: var(--ih-text-secondary);">
                  {{ c.caseType }} &bull; <span class="badge">{{ c.currentStage }}</span>
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
  
  clientData = signal<any>(null);
  isLoading = signal(true);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.api.get(`/staff/clients/${id}`).subscribe({
        next: (res: any) => {
          this.clientData.set(res.data);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        }
      });
    }
  }
}
