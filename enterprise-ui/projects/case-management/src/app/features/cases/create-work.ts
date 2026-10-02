import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ApiService } from '../../core/api/api.service';
import { CaseListItem, Paginated } from '../../core/api/case.types';
import { apiErrorMessage } from '../../core/api/api-error';
const ACTIONS: Record<string, { label: string; capability: string; tab: string }> = {
  task: { label: 'Task', capability: 'tasks.manage', tab: 'tasks' },
  request: { label: 'Document request', capability: 'document_requests.manage', tab: 'documents' },
  form: { label: 'Smart form', capability: 'forms.edit', tab: 'forms' },
  message: { label: 'Message', capability: 'messages.send', tab: 'chat' },
  channel: { label: 'Channel', capability: 'channels.create', tab: 'chat' },
};
@Component({ selector: 'ih-create-work', standalone: true, imports: [RouterLink, FormsModule],
  template: `<h1>{{ action?.label || 'Create work' }}</h1><p>Choose the case where this work belongs.</p>
    @if (error()) { <p role="alert">{{ error() }}</p> } @else {
      <form (ngSubmit)="load()"><label>Find a case <input name="search" [(ngModel)]="search" placeholder="Case title or number" /></label> <button type="submit">Search</button></form>
      <ul>@for (c of cases(); track c.id) { <li><a [routerLink]="['/cases', c.id]" [queryParams]="{ tab: action?.tab, action: kind }">{{ c.title }} · {{ c.caseNumber }} → {{ action?.label }}</a></li> } @empty { <li>{{ loading() ? 'Loading cases…' : 'No accessible cases match. Try another search.' }}</li> }</ul>
    }`,
  styles: [`li { margin: 1rem 0; } input { padding: .6rem; border: 1px solid var(--ih-border-medium); border-radius: .3rem; }`],
})
export class CreateWork implements OnInit {
  private api = inject(ApiService); private auth = inject(AuthService); private route = inject(ActivatedRoute);
  kind = this.route.snapshot.queryParamMap.get('kind') || ''; action = ACTIONS[this.kind];
  cases = signal<CaseListItem[]>([]); error = signal(''); loading = signal(false); search = '';
  ngOnInit() { this.load(); }
  load() {
    if (!this.action || !this.auth.capabilities().includes(this.action.capability)) { this.error.set('This action is not available for your account.'); return; }
    this.loading.set(true); this.error.set('');
    this.api.get<Paginated<CaseListItem>>('/staff/cases', { search: this.search, limit: 100 }).subscribe({ next: ({ data }) => { this.cases.set(data.items); this.loading.set(false); }, error: error => { this.error.set(apiErrorMessage(error, 'Could not load cases.')); this.loading.set(false); } });
  }
}
