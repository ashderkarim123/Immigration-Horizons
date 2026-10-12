import { DatePipe } from '@angular/common';
import { Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../../core/api/admin-api.service';
import { IntegrationStatus, RoleReference, SettingGroup } from '../../core/api/admin.types';
import { apiErrorMessage, apiFieldErrors } from '../../core/errors/api-error';
import { HasUnsavedChanges } from '../../core/guards/unsaved-changes.guard';
import { ErrorStateComponent, SkeletonComponent, ToastService } from '../../shared/staff-ui';

/** Site settings: the groups and keys the server's allowlist offers — nothing else can be entered here. */
@Component({
  selector: 'iha-settings',
  imports: [FormsModule, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="page-header">
      <div><h1>Settings</h1><p class="page-subtitle">Site-wide details. Credentials are not stored here; see Integrations for what is configured.</p></div>
    </div>
    @if (error()) {
      <ih-error-state title="Settings could not be loaded" [message]="error()" (retry)="load()" />
    } @else if (!groups()) {
      <ih-skeleton [rows]="5" rowHeight="6rem" />
    } @else {
      <div class="stack">
        @for (group of groups()!; track group.group) {
          <form class="card" (ngSubmit)="save(group)" novalidate [attr.aria-labelledby]="'group-' + group.group">
            <div class="card-body stack">
              <div>
                <h2 class="card-title" [id]="'group-' + group.group">{{ group.title }}</h2>
                <p class="muted">{{ group.description }}</p>
              </div>
              @if (groupError()[group.group]) { <div class="alert alert-error" role="alert">{{ groupError()[group.group] }}</div> }
              <div class="form-grid">
                @for (field of group.fields; track field.key) {
                  <div class="field">
                    <label [for]="group.group + '-' + field.key">{{ field.label }}</label>
                    <input [id]="group.group + '-' + field.key" [name]="field.key" [type]="field.type === 'email' ? 'email' : 'text'" [maxlength]="field.maxLength"
                      [(ngModel)]="values[group.group][field.key]" [attr.aria-invalid]="!!errors()[group.group + '.' + field.key]" />
                    @if (errors()[group.group + '.' + field.key]) { <span class="error">{{ errors()[group.group + '.' + field.key] }}</span> }
                  </div>
                }
              </div>
              <div class="form-actions">
                <button type="submit" class="btn btn-primary" [disabled]="saving() === group.group">{{ saving() === group.group ? 'Saving…' : 'Save ' + group.title.toLowerCase() }}</button>
                <span class="save-state" role="status">{{ dirty(group) ? 'Unsaved changes' : '' }}</span>
              </div>
            </div>
          </form>
        }
      </div>
    }
  `,
})
export class SettingsComponent implements HasUnsavedChanges {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);

  protected readonly groups = signal<SettingGroup[] | null>(null);
  protected values: Record<string, Record<string, string>> = {};
  private saved: Record<string, string> = {};
  protected readonly error = signal('');
  protected readonly saving = signal('');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly groupError = signal<Record<string, string>>({});

  constructor() {
    this.load();
  }

  protected dirty(group: SettingGroup): boolean {
    return JSON.stringify(this.values[group.group]) !== this.saved[group.group];
  }
  hasUnsavedChanges(): boolean {
    return (this.groups() ?? []).some((group) => this.dirty(group));
  }
  @HostListener('window:beforeunload', ['$event'])
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }

  private adopt(group: SettingGroup): void {
    this.values[group.group] = Object.fromEntries(group.fields.map((field) => [field.key, field.value]));
    this.saved[group.group] = JSON.stringify(this.values[group.group]);
  }

  protected load(): void {
    this.error.set('');
    this.api.get<{ groups: SettingGroup[] }>('/settings').subscribe({
      next: (res) => {
        res.groups.forEach((group) => this.adopt(group));
        this.groups.set(res.groups);
      },
      error: (err) => this.error.set(apiErrorMessage(err, 'Please try again.')),
    });
  }

  protected save(group: SettingGroup): void {
    if (this.saving()) return;
    this.saving.set(group.group);
    this.groupError.update((all) => ({ ...all, [group.group]: '' }));
    this.api.put<SettingGroup>(`/settings/${group.group}`, { values: this.values[group.group] }).subscribe({
      next: (updated) => {
        this.adopt(updated);
        this.groups.update((all) => (all ?? []).map((g) => (g.group === updated.group ? updated : g)));
        this.errors.update((all) => Object.fromEntries(Object.entries(all).filter(([key]) => !key.startsWith(`${group.group}.`))));
        this.saving.set('');
        this.toast.success(`${group.title} settings saved.`);
      },
      error: (err) => {
        const fields = Object.fromEntries(Object.entries(apiFieldErrors(err)).map(([key, message]) => [`${group.group}.${key}`, message]));
        this.errors.update((all) => ({ ...all, ...fields }));
        this.groupError.update((all) => ({ ...all, [group.group]: apiErrorMessage(err, 'These settings could not be saved.') }));
        this.saving.set('');
      },
    });
  }
}

interface StatusRow { name: string; state: string; ok: boolean; detail: string }

/** Read-only: what is configured, as the server reports it. No value, key or address is ever shown — or sent. */
@Component({
  selector: 'iha-integrations',
  imports: [DatePipe, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="page-header">
      <div><h1>Integrations</h1><p class="page-subtitle">Whether each connection is configured. Credentials live in the server environment and are never displayed.</p></div>
      <div class="page-actions"><button type="button" class="btn" (click)="load()">Check again</button></div>
    </div>
    @if (error()) {
      <ih-error-state title="Integration status could not be loaded" [message]="error()" (retry)="load()" />
    } @else if (!rows()) {
      <ih-skeleton [rows]="6" rowHeight="2.75rem" />
    } @else {
      <div class="table-wrap">
        <table class="data-table stacked">
          <caption class="sr-only">Integration status</caption>
          <thead><tr><th scope="col">Integration</th><th scope="col">Status</th><th scope="col">Detail</th></tr></thead>
          <tbody>
            @for (row of rows()!; track row.name) {
              <tr>
                <td data-label="Integration"><span class="cell-title">{{ row.name }}</span></td>
                <td data-label="Status"><span [class]="row.ok ? 'badge badge-success' : 'badge badge-neutral'">{{ row.state }}</span></td>
                <td data-label="Detail">{{ row.detail }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="cell-sub" style="margin-top: 0.75rem">Checked {{ checkedAt() | date: 'medium' }}.</p>
    }
  `,
})
export class IntegrationsComponent {
  private readonly api = inject(AdminApi);
  protected readonly rows = signal<StatusRow[] | null>(null);
  protected readonly checkedAt = signal('');
  protected readonly error = signal('');

  constructor() {
    this.load();
  }

  protected load(): void {
    this.error.set('');
    this.rows.set(null);
    this.api.get<IntegrationStatus>('/integration-status').subscribe({
      next: (s) => {
        const configured = (ok: boolean) => (ok ? 'Configured' : 'Not configured');
        this.rows.set([
          { name: 'Database', ok: s.mongo.status === 'connected', state: s.mongo.status === 'connected' ? 'Connected' : 'Not connected', detail: 'MongoDB' },
          { name: 'Email', ok: s.email.configured, state: configured(s.email.configured), detail: s.email.configured ? `Sending through ${s.email.transport === 'smtp' ? 'SMTP' : 'Resend'}` : 'Notifications are logged but not delivered' },
          { name: 'Google Sheets', ok: s.googleSheets.configured, state: configured(s.googleSheets.configured), detail: 'Service-account credentials for spreadsheet sync' },
          {
            name: 'Outlook mailbox', ok: s.outlookMail.configured, state: configured(s.outlookMail.configured),
            detail: s.outlookMail.configured ? 'Shared inbox in the Staff portal' : 'The Mail section in the Staff portal shows "not connected"',
          },
          {
            name: 'USCIS case status', ok: s.uscisCaseStatus.configured && s.uscisCaseStatus.enabled,
            state: !s.uscisCaseStatus.configured ? 'Not configured' : s.uscisCaseStatus.enabled ? 'Enabled' : 'Configured, switched off',
            detail: 'Automatic status checks for tracked filings',
          },
          {
            name: 'Practice time zone', ok: s.calendar.practiceTimeZoneConfigured,
            state: s.calendar.practiceTimeZoneInvalid ? 'Invalid value' : configured(s.calendar.practiceTimeZoneConfigured),
            detail: s.calendar.practiceTimeZoneConfigured ? 'Used when an employee has not chosen a zone' : 'Calendar falls back to UTC',
          },
          { name: 'Calendar reminders', ok: s.reminders.enabled, state: s.reminders.enabled ? 'Enabled' : 'Switched off', detail: 'Deadline and appointment reminders' },
        ]);
        this.checkedAt.set(s.checkedAt);
      },
      error: (err) => this.error.set(apiErrorMessage(err, 'Please try again.')),
    });
  }
}

/** Read-only reference: what each role can do, straight from the server's permission map. Roles are not editable. */
@Component({
  selector: 'iha-roles',
  imports: [ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="page-header">
      <div><h1>Roles</h1><p class="page-subtitle">What each role is allowed to do. Roles are defined by the platform and cannot be edited here; assign a role on the Users page.</p></div>
    </div>
    @if (error()) {
      <ih-error-state title="Roles could not be loaded" [message]="error()" (retry)="load()" />
    } @else if (!roles()) {
      <ih-skeleton [rows]="6" rowHeight="3rem" />
    } @else {
      <div class="stack">
        @for (role of roles()!; track role.code) {
          <details class="card role">
            <summary>
              <span class="cell-title">{{ role.label }}</span>
              <span [class]="role.cmsAccess ? 'badge badge-gold' : 'badge badge-neutral'">{{ role.cmsAccess ? 'Admin Console access' : 'Staff application only' }}</span>
              <span class="cell-sub">{{ role.capabilityCount }} capabilities</span>
            </summary>
            <div class="groups">
              @for (group of role.groups; track group.domain) {
                <section>
                  <h3>{{ group.label }}</h3>
                  <ul role="list">@for (capability of group.capabilities; track capability) { <li><code>{{ capability }}</code></li> }</ul>
                </section>
              } @empty { <p class="muted">This role holds no capabilities.</p> }
            </div>
          </details>
        }
      </div>
    }
  `,
  styles: `
    summary { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; min-height: 3rem; padding: 0.5rem 1rem; cursor: pointer; }
    summary .cell-sub { margin-left: auto; }
    .groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: 1rem; padding: 0.5rem 1rem 1rem; border-top: 1px solid var(--ih-border-light); }
    h3 { font-size: var(--ih-font-size-xs); text-transform: uppercase; letter-spacing: 0.05em; color: var(--ih-text-secondary); margin-bottom: 0.25rem; }
    ul { list-style: none; }
    code { font-size: 0.75rem; color: var(--ih-brand-800); }
  `,
})
export class RolesComponent {
  private readonly api = inject(AdminApi);
  protected readonly roles = signal<RoleReference[] | null>(null);
  protected readonly error = signal('');

  constructor() {
    this.load();
  }
  protected load(): void {
    this.error.set('');
    this.api.get<{ roles: RoleReference[] }>('/roles').subscribe({
      next: (res) => this.roles.set(res.roles),
      error: (err) => this.error.set(apiErrorMessage(err, 'Please try again.')),
    });
  }
}
