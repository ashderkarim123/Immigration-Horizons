import { Component, inject, OnInit, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { apiErrorMessage } from '../../core/api/api-error';
import { WorkQueue } from '../../core/api/dashboard.types';
@Component({ selector: 'ih-work-queue', standalone: true, imports: [RouterLink],
  template: `<a routerLink="/dashboard">← Dashboard</a>
    @if (queue(); as q) { <h1>{{ q.label }}</h1><p>{{ q.count }} items across {{ q.items.length }} cases you can access.</p>
      <ul class="queue-list">@for (item of q.items; track item.caseId) { <li><a [routerLink]="['/cases', item.caseId]" [queryParams]="{ tab: q.tab }">{{ item.title }} · {{ item.caseNumber }} <strong>{{ item.count }} items</strong></a></li> } @empty { <li>No work currently needs attention in this queue.</li> }</ul>
    } @else if (error()) { <p role="alert">{{ error() }}</p><button type="button" (click)="load()">Retry</button> } @else { <p role="status">Loading work queue…</p> }`,
  styles: [`.queue-list { list-style: none; padding: 0; } li { margin: .75rem 0; } li a { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem; padding: 1rem; border: 1px solid var(--ih-border-light); border-radius: .5rem; background: var(--ih-bg-primary); }`],
})
export class WorkQueuePage implements OnInit {
  private api = inject(ApiService); private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef); private sequence = 0;
  queue = signal<WorkQueue | null>(null); error = signal('');
  ngOnInit() { this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load()); }
  load() { const sequence = ++this.sequence; this.queue.set(null); this.error.set(''); this.api.get<WorkQueue>('/staff/work-queues', { queue: this.route.snapshot.queryParamMap.get('queue') }).subscribe({ next: ({ data }) => { if (sequence === this.sequence) this.queue.set(data); }, error: error => { if (sequence === this.sequence) this.error.set(apiErrorMessage(error, 'Could not load this queue.')); } }); }
}
