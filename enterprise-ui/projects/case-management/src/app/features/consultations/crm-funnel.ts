import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { apiErrorMessage } from '../../core/api/api-error';

interface StageCount { value: string; label: string; count: number; }
interface SourceCount { source: string; count: number; }
interface Funnel {
  from: string; to: string; timezone: string; cohort: string;
  total: number; converted: number; conversionRatePct: number;
  stages: StageCount[]; sources: SourceCount[]; note: string;
}

/**
 * Staff CRM created-cohort snapshot. Never shows a historical "conversion at date":
 * case links and pipeline stages are the current known values of those leads.
 */
@Component({
  selector: 'ih-crm-funnel',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="card crm-funnel" aria-label="CRM acquisition and funnel report">
      <h2>Lead acquisition &amp; conversion</h2>
      <p>Leads received during the selected UTC date range. Stage and conversion are their <strong>current</strong> states,
        not stage transitions that happened during the period. Results only include leads you can access.</p>
      <form class="filters" (ngSubmit)="load()">
        <div><label for="crm-funnel-from">Received from (UTC)</label>
          <input id="crm-funnel-from" type="date" required name="from" [(ngModel)]="from" /></div>
        <div><label for="crm-funnel-to">Received through (UTC)</label>
          <input id="crm-funnel-to" type="date" required name="to" [(ngModel)]="to" /></div>
        <button class="btn btn-primary" type="submit" [disabled]="loading()">Update report</button>
      </form>
      @if (error()) { <p role="alert" class="alert alert-error">{{ error() }}</p> }
      @if (loading()) { <p role="status">Loading lead funnel…</p> }
      @if (report(); as data) {
        <div class="metrics" aria-label="Lead cohort summary">
          <p><strong>{{ data.total }}</strong><span>Leads received</span></p>
          <p><strong>{{ data.converted }}</strong><span>Linked to a case now</span></p>
          <p><strong>{{ data.conversionRatePct }}%</strong><span>Linked-case share</span></p>
        </div>
        <p class="note">{{ data.note }}</p>
        <div class="breakdowns">
          <div>
            <h3>Current pipeline stage</h3>
            <table><thead><tr><th scope="col">Stage</th><th scope="col">Leads</th></tr></thead>
              <tbody>@for (stage of data.stages; track stage.value) {
                <tr><th scope="row">{{ stage.label }}</th><td>{{ stage.count }}</td></tr>
              }</tbody></table>
          </div>
          <div>
            <h3>Acquisition source</h3>
            <table><thead><tr><th scope="col">Source</th><th scope="col">Leads</th></tr></thead>
              <tbody>@for (source of data.sources; track source.source) {
                <tr><th scope="row">{{ source.source }}</th><td>{{ source.count }}</td></tr>
              } @empty { <tr><td colspan="2">No leads in this period.</td></tr> }</tbody></table>
          </div>
        </div>
      }
    </section>
  `,
  styles: [`
    .crm-funnel { margin-top: 1.5rem; padding: 1.25rem; }
    .filters { display: flex; flex-wrap: wrap; gap: 1rem; align-items: end; }
    .filters > div { display: grid; gap: .25rem; }
    .filters input { padding: .5rem; font: inherit; border: 1px solid var(--ih-border-medium); border-radius: .25rem; }
    .metrics { display: flex; flex-wrap: wrap; gap: 1.5rem; margin: 1rem 0; }
    .metrics p { display: grid; gap: .15rem; margin: 0; }
    .metrics strong { font-size: 1.4rem; }
    .metrics span, .note { color: var(--ih-text-secondary); }
    .breakdowns { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1.25rem; }
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: .4rem .6rem; text-align: left; border-bottom: 1px solid var(--ih-border-light); }
    td { text-align: right; }
  `]
})
export class CrmFunnel {
  private readonly api = inject(ApiService);
  private readonly today = new Date().toISOString().slice(0, 10);
  from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  to = this.today;
  readonly report = signal<Funnel | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  constructor() { this.load(); }

  load(): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.from) || !/^\d{4}-\d{2}-\d{2}$/.test(this.to)) {
      this.error.set('Choose both UTC dates.'); return;
    }
    this.loading.set(true);
    this.error.set('');
    this.report.set(null);
    this.api.get<Funnel>('/staff/crm/funnel', { from: this.from, to: this.to }).subscribe({
      next: ({ data }) => {
        this.report.set(data);
        this.loading.set(false);
      },
      error: (cause: unknown) => {
        this.error.set(apiErrorMessage(cause, 'Could not load CRM funnel.'));
        this.loading.set(false);
      }
    });
  }
}
