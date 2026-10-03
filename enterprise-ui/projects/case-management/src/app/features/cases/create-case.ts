import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { apiErrorMessage } from '../../core/api/api-error';
type Option = { id: string; label: string };
interface IntakeOptions { clients: Option[]; consultations: Option[]; managers: Option[]; caseTypes: { value: string; label: string }[] }

@Component({
  selector: 'ih-create-case', standalone: true, imports: [FormsModule, RouterLink],
  template: `
    <h1>Create a case</h1><p>Choose a client or convert a linked consultation. Your case workspace and team access are created together.</p>
    @if (error()) { <div class="alert alert-error" role="alert">{{ error() }} <button type="button" (click)="load()">Reload choices</button></div> }
    @if (options(); as choices) {
      <form class="section-card intake-form" (ngSubmit)="save()">
        <label>Start from<select aria-label="Start from" name="source" [(ngModel)]="source" (ngModelChange)="sourceId = ''" required><option value="client">Client account</option><option value="consultation">Linked consultation</option></select></label>
        @if (source === 'client') { <label>Find client<input name="search" [(ngModel)]="search" placeholder="Name or email" /><button type="button" (click)="load()">Search</button></label> }
        <label>{{ source === 'client' ? 'Client' : 'Consultation' }}<select [attr.aria-label]="source === 'client' ? 'Client' : 'Consultation'" name="sourceId" [(ngModel)]="sourceId" required><option value="">Choose one</option>@for (item of source === 'client' ? choices.clients : choices.consultations; track item.id) { <option [value]="item.id">{{ item.label }}</option> }</select></label>
        <label>Case title<input name="title" [(ngModel)]="title" maxlength="200" required /></label>
        <label>Case type<select aria-label="Case type" name="caseType" [(ngModel)]="caseType" required><option value="">Choose a service</option>@for (type of choices.caseTypes; track type.value) { <option [value]="type.value">{{ type.label }}</option> }</select></label>
        <label>Project manager<select aria-label="Project manager" name="managerId" [(ngModel)]="managerId" required><option value="">Choose a project manager</option>@for (manager of choices.managers; track manager.id) { <option [value]="manager.id">{{ manager.label }}</option> }</select></label>
        <label>Priority<select name="priority" [(ngModel)]="priority"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
        <label>Target filing date (optional)<input name="targetDate" type="date" [(ngModel)]="targetDate" /></label>
        <label>Notes (optional)<textarea name="description" [(ngModel)]="description" maxlength="2000"></textarea></label>
        <div><button class="btn btn-primary" type="submit" [disabled]="saving() || !sourceId || !title.trim() || !caseType || !managerId">{{ saving() ? 'Creating case…' : 'Create case' }}</button> <a routerLink="/cases">Cancel</a></div>
      </form>
    } @else if (!error()) { <p role="status">Loading case choices…</p> }
  `,
  styles: [`.intake-form { max-width: 48rem; display: grid; gap: 1rem; margin-top: 1.5rem; } label { display: grid; gap: .4rem; font-weight: 600; } input, select, textarea { width: 100%; padding: .7rem; border: 1px solid var(--ih-border-medium); border-radius: .4rem; font: inherit; }`],
})
export class CreateCase implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  options = signal<IntakeOptions | null>(null);
  error = signal(''); saving = signal(false);
  source = 'client'; sourceId = ''; title = ''; caseType = ''; managerId = ''; priority = 'medium'; targetDate = ''; description = ''; search = '';
  ngOnInit() { const consultationId = this.route.snapshot.queryParamMap.get('consultationId'); if (consultationId) { this.source = 'consultation'; this.sourceId = consultationId; } this.load(); }
  load() {
    this.error.set('');
    this.api.get<IntakeOptions>('/staff/case-intake', { search: this.search }).subscribe({
      next: ({ data }) => { this.options.set(data); if (data.managers.length === 1) this.managerId = data.managers[0].id; },
      error: error => this.error.set(apiErrorMessage(error, 'Could not load case choices.')),
    });
  }
  save() {
    if (this.saving() || !this.sourceId || !this.title.trim() || !this.caseType || !this.managerId) return;
    this.saving.set(true); this.error.set('');
    this.api.post<{ id: string }>('/staff/case-intake', {
      ...(this.source === 'client' ? { clientId: this.sourceId } : { consultationId: this.sourceId }),
      title: this.title, caseType: this.caseType, projectManagerId: this.managerId, priority: this.priority,
      targetFilingDate: this.targetDate || null, description: this.description,
    }).subscribe({ next: ({ data }) => this.router.navigate(['/cases', data.id]), error: error => { this.error.set(apiErrorMessage(error, 'Could not create the case.')); this.saving.set(false); } });
  }
}
