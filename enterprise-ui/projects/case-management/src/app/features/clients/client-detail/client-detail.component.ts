import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../../core/api/api.service';
import { apiErrorMessage } from '../../../core/api/api-error';
import { ClientDetail } from '../../../core/api/client.types';
import { MailApi } from '../../../core/api/mail-api.service';
import { MailListItem } from '../../../core/api/mail.types';
import { AuthService } from '../../../core/auth/auth.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '../../../shared/status-badge.component';
import { ErrorStateComponent } from '../../../shared/error-state.component';
import { MailComposeComponent } from '../../mail/mail-compose.component';

@Component({
  selector: 'ih-client-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, StatusBadgeComponent, ErrorStateComponent, MailComposeComponent],
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
      @if (canEmail() || canCreateCase()) {
        <div class="client-actions" role="group" aria-label="Actions for this client">
          @if (canEmail()) { <button type="button" class="btn btn-primary" (click)="composing.set(true)">Email client</button> }
          @if (canCreateCase()) { <a class="btn" routerLink="/cases/new" [queryParams]="{ clientId: client.id, search: client.email }">Create case</a> }
        </div>
      }
      @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }

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
                @if (canSeeForms()) {
                  <span class="case-links">
                    <a [routerLink]="['/cases', c.id]" [queryParams]="{ tab: 'forms' }" title="Open this case's Forms tab to choose and send forms to the client">Send forms<span class="sr-only"> for {{ c.caseNumber }}</span></a>
                  </span>
                }
              </li>
            }
          </ul>
        </div>
      </div>

      @if (canReadMail()) {
        <div class="section-card emails" aria-labelledby="client-emails">
          <h3 id="client-emails">Emails</h3>
          @if (mailError()) {
            <p class="muted" role="status">{{ mailError() }}</p>
          } @else if (mailLoading()) {
            <p class="muted">Loading emails…</p>
          } @else if (!emails().length) {
            <p class="muted">No emails to or from {{ client.email }} in the shared mailbox.</p>
          } @else {
            <ul class="mail-list" role="list">
              @for (m of emails(); track m.id) {
                <li>
                  <span class="dir">{{ fromClient(m, client.email) ? 'From client' : 'To client' }}</span>
                  <a [routerLink]="['/mail']" [queryParams]="{ message: m.id }">{{ m.subject || '(no subject)' }}</a>
                  <time class="muted">{{ (m.receivedAt || m.sentAt) | date: 'mediumDate' }}</time>
                </li>
              }
            </ul>
          }
        </div>
      }

      <ih-mail-compose [open]="composing()" [prefillTo]="client.email" (sent)="onSent()" (closed)="composing.set(false)" />
    }
  `,
  styleUrls: ['../../dashboard/dashboard.scss'],
  styles: [`
    .client-actions { display: flex; flex-wrap: wrap; gap: .6rem; margin-bottom: 1.25rem; }
    .notice { padding: .6rem .9rem; margin: 0 0 1rem; border: 1px solid #bbf7d0; background: #f0fdf4; color: #14532d; border-radius: var(--ih-radius-md); }
    .case-links { display: inline-block; margin-left: .75rem; font-size: var(--ih-font-size-sm); }
    .emails { margin-top: 2rem; }
    .mail-list { list-style: none; padding: 0; margin: 0; }
    .mail-list li { display: flex; flex-wrap: wrap; gap: .6rem; align-items: baseline; padding: .55rem 0; border-bottom: 1px solid var(--ih-border-light); }
    .mail-list a { font-weight: 600; flex: 1 1 14rem; overflow-wrap: anywhere; }
    .dir { font-size: .6875rem; padding: .05rem .5rem; border-radius: 999px; background: var(--ih-gray-100); color: var(--ih-gray-700); }
    .muted { color: var(--ih-text-secondary); font-size: var(--ih-font-size-sm); }
  `]
})
export class ClientDetailComponent implements OnInit {
  private api = inject(ApiService);
  private mail = inject(MailApi);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  clientData = signal<ClientDetail | null>(null);
  isLoading = signal(true);
  isError = signal(false);

  // Each action appears only for someone who may do it; the server checks every one again.
  private has = (capability: string) => this.auth.capabilities().includes(capability);
  canEmail = () => this.has('mail.send');
  canReadMail = () => this.has('mail.view');
  canCreateCase = () => this.has('cases.create');
  canSeeForms = () => this.has('forms.view');

  emails = signal<MailListItem[]>([]);
  mailLoading = signal(false);
  mailError = signal('');
  composing = signal(false);
  notice = signal('');

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
        if (this.canReadMail()) this.loadEmails(data.id);
      },
      error: () => {
        this.isError.set(true);
        this.isLoading.set(false);
      }
    });
  }

  private loadEmails(clientId: string): void {
    this.mailLoading.set(true);
    this.mailError.set('');
    this.mail.clientMail(clientId).subscribe({
      next: ({ items }) => { this.emails.set(items); this.mailLoading.set(false); },
      error: (err) => { this.mailError.set(apiErrorMessage(err, 'Emails could not be loaded.')); this.mailLoading.set(false); },
    });
  }

  protected fromClient(message: MailListItem, clientEmail: string): boolean {
    return message.from.address.toLowerCase() === clientEmail.toLowerCase();
  }

  protected onSent(): void {
    this.composing.set(false);
    this.notice.set('Message sent.');
    const client = this.clientData();
    if (client && this.canReadMail()) this.loadEmails(client.id);
  }
}
