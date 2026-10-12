import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../../../core/api/api-error';
import { MailApi } from '../../../../core/api/mail-api.service';
import { MailCaseLink } from '../../../../core/api/mail.types';
import { EmptyStateComponent } from '../../../../shared/empty-state.component';
import { ErrorStateComponent } from '../../../../shared/error-state.component';
import { SkeletonComponent } from '../../../../shared/skeleton.component';

/**
 * Emails linked to this one case (ADR-030). It shows the saved subject, sender and date; the message itself is opened from the
 * Mail page, which fetches it from Microsoft. Someone who cannot read the mailbox never sees this tab.
 */
@Component({
  selector: 'ih-mail-tab',
  standalone: true,
  imports: [DatePipe, RouterLink, SkeletonComponent, EmptyStateComponent, ErrorStateComponent],
  template: `
    <section class="section-card card" aria-labelledby="case-mail-heading">
      <h3 id="case-mail-heading" class="card-title">Emails</h3>
      <p class="muted">Messages from the shared mailbox that were linked to this case. Open Mail and choose "Link to a case" on a message to add one.</p>
      @if (loading()) {
        <ih-skeleton [rows]="3" rowHeight="2.5rem"></ih-skeleton>
      } @else if (error()) {
        <ih-error-state title="Emails could not be loaded" [message]="error()" (retry)="load()"></ih-error-state>
      } @else if (!items().length) {
        <ih-empty-state title="No emails linked yet" description="Linked messages appear here for everyone on the case team who can read the mailbox."></ih-empty-state>
      } @else {
        <ul class="list" role="list">
          @for (link of items(); track link.id) {
            <li>
              <a [routerLink]="['/mail']" [queryParams]="{ message: link.messageId }">{{ link.subject || '(no subject)' }}</a>
              <span class="muted">{{ link.from.name || link.from.address }} · {{ link.messageDate | date: 'medium' }} · linked by {{ link.linkedByName || 'a colleague' }}</span>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .muted { color: var(--ih-text-secondary); font-size: var(--ih-font-size-sm); }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .list li { display: flex; flex-direction: column; gap: .15rem; padding: .7rem 0; border-bottom: 1px solid var(--ih-border-light); }
    .list li:last-child { border-bottom: 0; }
    .list a { font-weight: 600; overflow-wrap: anywhere; }
  `,
})
export class MailTabComponent implements OnInit {
  private readonly api = inject(MailApi);
  readonly caseId = input.required<string>();

  protected readonly items = signal<MailCaseLink[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.caseLinks(this.caseId()).subscribe({
      next: (items) => { this.items.set(items); this.loading.set(false); },
      error: (err) => { this.error.set(apiErrorMessage(err, 'Please try again.')); this.loading.set(false); },
    });
  }
}
