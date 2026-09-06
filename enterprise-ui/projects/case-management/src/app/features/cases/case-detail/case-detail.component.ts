import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../../core/api/api.service';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'ih-case-detail',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page-header">
      <h1>Case Detail</h1>
      @if (caseData()) {
        <p class="page-subtitle">{{ caseData()?.caseNumber }} — {{ caseData()?.title }}</p>
      }
    </div>

    @if (isLoading()) {
      <p>Loading case...</p>
    } @else if (caseData()) {
      <div class="dashboard-sections" style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
        
        <div class="section-card">
          <h3>Case Information</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div>
              <p style="color: var(--ih-text-secondary); font-size: var(--ih-font-size-sm);">Case Type</p>
              <p>{{ caseData()?.caseType }}</p>
            </div>
            <div>
              <p style="color: var(--ih-text-secondary); font-size: var(--ih-font-size-sm);">Current Stage</p>
              <p><span class="badge">{{ caseData()?.currentStage }}</span></p>
            </div>
            <div>
              <p style="color: var(--ih-text-secondary); font-size: var(--ih-font-size-sm);">Priority</p>
              <p><span class="badge">{{ caseData()?.priority }}</span></p>
            </div>
            <div>
              <p style="color: var(--ih-text-secondary); font-size: var(--ih-font-size-sm);">Client</p>
              <p><a [routerLink]="['/clients', caseData()?.primaryClient?._id]">{{ caseData()?.primaryClient?.name }}</a></p>
            </div>
          </div>
        </div>

        <div class="section-card">
          <h3>Team</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            @for (m of caseData()?.team; track m._id) {
              <li style="margin-bottom: 1rem;">
                <strong>{{ m.adminUser?.name || m.clientUser?.name }}</strong><br/>
                <span style="font-size: var(--ih-font-size-sm); color: var(--ih-text-secondary);">
                  {{ m.memberType }} &bull; {{ m.role }}
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
export class CaseDetailComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  
  caseData = signal<any>(null);
  isLoading = signal(true);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.api.get(`/staff/cases/${id}`).subscribe({
        next: (res: any) => {
          this.caseData.set(res.data);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        }
      });
    }
  }
}
