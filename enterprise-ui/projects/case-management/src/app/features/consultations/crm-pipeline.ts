import { Component, inject, signal, DestroyRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/api/api.service';
import { CrmFunnel } from './crm-funnel';
import { apiErrorMessage } from '../../core/api/api-error';

interface CrmLead {
  id: string; name: string; email: string; service: string; stage: string;
  operationalStatus: string; ownerName: string; caseId: string | null;
  lostReason: string | null; followUpAt: string | null;
  quote: { amountMinor: number; currency: string; note: string } | null;
}
interface Lane { value: string; label: string; total: number; truncated: boolean; items: CrmLead[]; }
interface Detail { lead: CrmLead; stages: {value: string; label: string}[]; lostReasons: string[]; canEdit: boolean; }

@Component({
  selector: 'ih-crm-pipeline', standalone: true, imports: [FormsModule, RouterLink, DatePipe, CrmFunnel],
  template: `
    <div class="page-header"><h1>CRM pipeline</h1>
      <p class="page-subtitle">Sales progress is separate from case/petition work. Proposals are recorded here, never sent automatically.</p>
    </div>
    @if (error()) { <p role="alert" class="alert alert-error">{{ error() }}</p> }
    @if (success()) { <p role="status" class="alert alert-success">{{ success() }}</p> }
    @if (loading()) { <p role="status">Loading CRM…</p> }
    @if (detail(); as data) {
      <p><a routerLink="/crm">← Back to CRM board</a></p>
      <h2>{{ data.lead.name }}</h2>
      <p>{{ data.lead.email }} · {{ data.lead.service }} · Operational status: {{ data.lead.operationalStatus }}</p>
      <p><a [routerLink]="['/intake', data.lead.id]">Open intake and tasks</a>
        @if (data.lead.caseId) { · <a [routerLink]="['/cases', data.lead.caseId]">Open converted case</a> }
      </p>
      @if (data.canEdit) {
      <form (ngSubmit)="save()" class="crm-form">
        <h3>CRM details</h3>
        <label for="crm-stage">Sales stage</label>
        <select id="crm-stage" name="stage" [(ngModel)]="stage">
          @for (option of data.stages; track option.value) {
            <option [value]="option.value" [disabled]="option.value === 'client_created' && !data.lead.caseId">{{ option.label }}</option>
          }
        </select>
        @if (stage === 'lost') {
          <label for="crm-reason">Loss reason</label>
          <select id="crm-reason" name="lostReason" [(ngModel)]="lostReason" required>
            <option value="">Choose a reason</option>
            @for (reason of data.lostReasons; track reason) { <option [value]="reason">{{ friendly(reason) }}</option> }
          </select>
        }
        <label for="crm-followup">Next staff follow-up (your local time)</label>
        <input id="crm-followup" type="datetime-local" name="followUp" [(ngModel)]="followUp" />
        <p class="hint">This records a due date for staff review; it does not send an automatic reminder.</p>
        <h3>Indicative quotation</h3>
        <label for="crm-amount">Amount (optional, major currency units)</label>
        <input id="crm-amount" type="text" inputmode="decimal" placeholder="1500.00" name="amount" [(ngModel)]="quoteAmount" maxlength="14" />
        <label for="crm-currency">Currency</label>
        <select id="crm-currency" name="currency" [(ngModel)]="currency">
          @for (item of currencies; track item) { <option [value]="item">{{ item }}</option> }
        </select>
        <label for="crm-quote-note">Quotation note (internal)</label>
        <textarea id="crm-quote-note" name="quoteNote" [(ngModel)]="quoteNote" maxlength="500"></textarea>
        <p class="hint">This is an internal indicative amount, not an invoice or an emailed offer.</p>
        <button class="btn btn-primary" type="submit" [disabled]="busy() || (stage === 'lost' && !lostReason)">Save CRM details</button>
      </form>
      } @else { <p role="note">You can view CRM details but cannot change them.</p> }
      <h3>Possible duplicates (same email)</h3>
      <button type="button" (click)="loadDuplicates()" [disabled]="busy()">Check possible duplicates</button>
      @if (duplicates(); as matches) {
        @for (match of matches; track match.id) {
          <p><a [routerLink]="['/crm', match.id]">{{ match.name }}</a> · {{ match.stage }}</p>
        } @empty { <p>No accessible records with this email.</p> }
      }
    } @else if (!loading()) {
      <p>Snapshot counts include all accessible leads. Each column displays at most 15 recent cards.</p>
      <div class="crm-board" role="region" aria-label="Ten-stage CRM pipeline" tabindex="0">
        @for (lane of lanes(); track lane.value) {
          <section class="crm-column" [attr.aria-label]="lane.label + ': ' + lane.total + ' leads'">
            <h2>{{ lane.label }} <span class="count">{{ lane.total }}</span></h2>
            @for (lead of lane.items; track lead.id) {
              <article class="crm-card">
                <h3><a [routerLink]="['/crm', lead.id]">{{ lead.name }}</a></h3>
                <p>{{ lead.service }}</p><p>{{ lead.ownerName || 'Unassigned' }}</p>
                @if (lead.followUpAt) { <p>Follow-up: {{ lead.followUpAt | date:'medium' }}</p> }
                @if (lead.lostReason) { <p>Reason: {{ friendly(lead.lostReason) }}</p> }
              </article>
            } @empty { <p>No leads in this stage.</p> }
            @if (lane.truncated) { <p class="hint">Showing 15 of {{ lane.total }}. Use Leads to find older records.</p> }
          </section>
        }
      </div>
      <p><a routerLink="/intake">Search all lead intake records</a></p>
      <ih-crm-funnel />
    }
` ,
  styles: [`
    .crm-board { display: flex; gap: 1rem; overflow-x: auto; padding: 1rem 0; }
    .crm-column { flex: 0 0 16rem; min-width: 16rem; background: var(--ih-bg-secondary);
      border: 1px solid var(--ih-border-light); border-radius: .5rem; padding: .75rem; }
    .crm-column h2 { font-size: 1rem; display: flex; justify-content: space-between; }
    .count { background: var(--ih-bg-primary); padding: .1rem .5rem; border-radius: 2rem; }
    .crm-card { background: var(--ih-bg-primary); border: 1px solid var(--ih-border-light);
      padding: .75rem; border-radius: .4rem; margin: .75rem 0; }
    .crm-card h3 { font-size: 1rem; } .crm-card p { overflow-wrap: anywhere; }
    .crm-form { display: grid; gap: .65rem; max-width: 36rem; padding: 1rem;
      background: var(--ih-bg-primary); border: 1px solid var(--ih-border-light); }
    .crm-form input, .crm-form select, .crm-form textarea { padding: .6rem;
      font: inherit; border: 1px solid var(--ih-border-medium); border-radius: .25rem; }
    .hint { color: var(--ih-text-secondary); font-size: .9rem; }
  `],
})
export class CrmPipeline {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private sequence = 0;
  private leadId = '';
  readonly currencies = ['USD', 'GBP', 'CAD', 'EUR', 'AUD', 'PKR'];
  lanes = signal<Lane[]>([]);
  detail = signal<Detail | null>(null);
  duplicates = signal<CrmLead[] | null>(null);
  loading = signal(false); busy = signal(false);
  error = signal(''); success = signal('');
  stage = 'new'; lostReason = ''; followUp = '';
  quoteAmount = ''; currency = 'USD'; quoteNote = '';

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.leadId = params.get('id') || '';
      this.duplicates.set(null);
      this.success.set('');
      this.load();
    });
  }
  friendly(value: string) { return value.replaceAll('_', ' '); }
  load() {
    const sequence = ++this.sequence;
    this.loading.set(true); this.error.set(''); this.detail.set(null);
    if (this.leadId) {
      this.api.get<Detail>('/staff/crm/leads/' + this.leadId).subscribe({
        next: ({ data }) => {
          if (sequence !== this.sequence) return;
          this.detail.set(data);
          this.stage = data.lead.stage;
          this.lostReason = data.lead.lostReason || '';
          this.followUp = data.lead.followUpAt ? this.localInputValue(data.lead.followUpAt) : '';
          this.quoteAmount = data.lead.quote ? (data.lead.quote.amountMinor / 100).toFixed(2) : '';
          this.currency = data.lead.quote?.currency || 'USD';
          this.quoteNote = data.lead.quote?.note || '';
          this.loading.set(false);
        },
        error: e => this.fail(e, sequence),
      });
    } else {
      this.api.get<{ stages: Lane[]; total: number }>('/staff/crm/board').subscribe({
        next: ({ data }) => {
          if (sequence !== this.sequence) return;
          this.lanes.set(data.stages);
          this.loading.set(false);
        },
        error: e => this.fail(e, sequence),
      });
    }
  }
  private localInputValue(value: string): string {
    const d = new Date(value);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }
  private fail(e: unknown, sequence = this.sequence) {
    if (sequence !== this.sequence) return;
    this.loading.set(false); this.busy.set(false);
    this.error.set(apiErrorMessage(e, 'Could not load or update CRM.'));
  }
  loadDuplicates() {
    if (this.busy() || !this.leadId) return;
    const sequence = this.sequence;
    this.api.get<{ items: CrmLead[] }>('/staff/crm/leads/' + this.leadId + '/duplicates').subscribe({
      next: ({ data }) => { if (sequence === this.sequence) this.duplicates.set(data.items); },
      error: e => this.fail(e, sequence),
    });
  }
  save() {
    if (this.busy() || !this.detail()) return;
    let amountMinor: number | null = null;
    if (this.quoteAmount.trim()) {
      const amount = this.quoteAmount.trim();
      if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount)) {
        this.error.set('Enter a non-negative quotation amount with at most two decimal places.');
        return;
      }
      const [whole, cents = ''] = amount.split('.');
      amountMinor = Number(whole) * 100 + Number(cents.padEnd(2, '0'));
    }
    let followUpAt: string | null = null;
    if (this.followUp) {
      const date = new Date(this.followUp);
      if (Number.isNaN(date.getTime())) { this.error.set('Choose a valid follow-up date and time.'); return; }
      followUpAt = date.toISOString();
    }
    this.busy.set(true); this.error.set(''); this.success.set('');
    const sequence = this.sequence;
    this.api.patch('/staff/crm/leads/' + this.leadId, {
      stage: this.stage, lostReason: this.stage === 'lost' ? this.lostReason : null,
      followUpAt,
      quote: amountMinor === null ? null : { amountMinor, currency: this.currency, note: this.quoteNote },
    }).subscribe({
      next: () => { if (sequence !== this.sequence) return; this.busy.set(false); this.success.set('CRM details saved.'); this.load(); },
      error: e => this.fail(e, sequence),
    });
  }
}
