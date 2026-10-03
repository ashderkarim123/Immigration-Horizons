import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/api/api-error';
interface Notice {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  caseId: string | null;
  leadId: string | null;
  interactionId: string | null;
}
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  template: ` <div class="page-header">
      <h1>Notifications</h1>
      <p class="page-subtitle">Updates addressed to your staff account.</p>
    </div>
    @if (error()) {
      <p role="alert" class="alert alert-error">
        {{ error() }} <button type="button" (click)="load()">Retry</button>
      </p>
    }
    @if (success()) {
      <p role="status">{{ success() }}</p>
    }
    <label
      ><input type="checkbox" [(ngModel)]="unreadOnly" (ngModelChange)="load()" /> Unread
      only</label
    >
    <button type="button" (click)="markRead()" [disabled]="busy()">Mark all read</button>
    @if (loading()) {
      <p role="status">Loading notifications…</p>
    } @else {
      @for (notice of notices(); track notice.id) {
        <article>
          <h2>{{ notice.title }}</h2>
          <p>{{ notice.message }}</p>
          <p>{{ notice.createdAt | date: 'medium' }} · {{ notice.read ? 'Read' : 'Unread' }}</p>
          @if (notice.caseId && auth.capabilities().includes('cases.view')) {
            <a [routerLink]="['/cases', notice.caseId]">Open case</a>
          } @else if (notice.interactionId && auth.capabilities().includes('queries.view')) {
            <a [routerLink]="['/consultations', notice.interactionId]">Open consultation</a>
          } @else if (notice.leadId && auth.capabilities().includes('leads.view')) {
            <a [routerLink]="['/intake', notice.leadId]">Open lead</a>
          }
          @if (!notice.read) {
            <button type="button" (click)="markRead(notice.id)" [disabled]="busy()">
              Mark read
            </button>
          }
        </article>
      } @empty {
        <p>No {{ unreadOnly ? 'unread ' : '' }}notifications.</p>
      }
      <form (ngSubmit)="savePreferences()">
        <h2>Email preferences</h2>
        <label
          ><input type="checkbox" name="mentions" [(ngModel)]="mentionEmails" /> Email me when
          mentioned</label
        ><label
          ><input type="checkbox" name="digest" [(ngModel)]="digestEmails" /> Email me a
          digest</label
        ><label for="digest-frequency">Digest frequency</label
        ><select id="digest-frequency" name="frequency" [(ngModel)]="digestFrequency">
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="off">Off</option></select
        ><button class="btn btn-primary" [disabled]="busy()">Save email preferences</button>
      </form>
    }`,
  styles: [
    `
      article {
        padding: 1rem 0;
        border-bottom: 1px solid var(--ih-border-light);
      }
      article a,
      article button {
        margin-right: 1rem;
      }
      form {
        display: grid;
        gap: 0.7rem;
        max-width: 32rem;
        margin-top: 2rem;
      }
    `,
  ],
})
export class StaffNotifications {
  private api = inject(ApiService);
  auth = inject(AuthService);
  notices = signal<Notice[]>([]);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  success = signal('');
  unreadOnly = false;
  mentionEmails = true;
  digestEmails = true;
  digestFrequency = 'daily';
  constructor() {
    this.load();
  }
  load() {
    this.loading.set(true);
    this.error.set('');
    this.api
      .get<{
        items: Notice[];
        preferences: { mentionEmails: boolean; digestEmails: boolean; digestFrequency: string };
      }>('/staff/notifications', { unread: this.unreadOnly ? '1' : null })
      .subscribe({
        next: ({ data }) => {
          this.notices.set(data.items);
          Object.assign(this, data.preferences);
          this.loading.set(false);
        },
        error: (e) => this.fail(e),
      });
  }
  private fail(e: unknown) {
    this.loading.set(false);
    this.busy.set(false);
    this.error.set(apiErrorMessage(e, 'Could not load or update notifications.'));
  }
  markRead(id?: string) {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.post('/staff/notifications/read', { id }).subscribe({
      next: () => {
        this.busy.set(false);
        this.load();
      },
      error: (e) => this.fail(e),
    });
  }
  savePreferences() {
    if (this.busy()) return;
    this.busy.set(true);
    this.api
      .patch('/staff/notifications/preferences', {
        mentionEmails: this.mentionEmails,
        digestEmails: this.digestEmails,
        digestFrequency: this.digestFrequency,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.success.set('Email preferences saved.');
        },
        error: (e) => this.fail(e),
      });
  }
}
