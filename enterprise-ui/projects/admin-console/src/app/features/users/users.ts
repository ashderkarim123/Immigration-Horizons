import { DatePipe } from '@angular/common';
import { Component, HostListener, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminApi } from '../../core/api/admin-api.service';
import { AdminUser, AdminUserList, CredentialResult, TemporaryCredential } from '../../core/api/admin.types';
import { apiErrorMessage, apiFieldErrors } from '../../core/errors/api-error';
import { HasUnsavedChanges } from '../../core/guards/unsaved-changes.guard';
import { ModalComponent } from '../../shared/modal.component';
import { ConfirmDialogComponent, EmptyStateComponent, ErrorStateComponent, PaginationComponent, SkeletonComponent, ToastService } from '../../shared/staff-ui';
import { CopyButtonComponent } from '../../shared/widgets';

type Role = AdminUserList['roles'][number];

@Component({
  selector: 'iha-users',
  imports: [FormsModule, RouterLink, DatePipe, EmptyStateComponent, ErrorStateComponent, PaginationComponent, SkeletonComponent],
  template: `
    <div class="page-header">
      <div><h1>Users</h1><p class="page-subtitle">Employee accounts for the Staff application and this console.</p></div>
      <div class="page-actions"><a class="btn btn-primary" routerLink="/users/new">New user</a></div>
    </div>

    <form class="filter-bar" role="search" (ngSubmit)="load(1)">
      <div class="field"><label for="user-search">Search</label><input id="user-search" name="search" type="search" placeholder="Name or email" [(ngModel)]="search" /></div>
      <div class="field">
        <label for="user-role">Role</label>
        <select id="user-role" name="role" [(ngModel)]="role" (ngModelChange)="load(1)">
          <option value="">All roles</option>
          @for (r of roles(); track r.code) { <option [value]="r.code">{{ r.label }}</option> }
        </select>
      </div>
      <div class="field">
        <label for="user-status">Status</label>
        <select id="user-status" name="status" [(ngModel)]="status" (ngModelChange)="load(1)">
          <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
      </div>
      <button type="submit" class="btn">Search</button>
    </form>

    @if (error()) {
      <ih-error-state title="Users could not be loaded" [message]="error()" (retry)="load(page())" />
    } @else if (loading() && !users().length) {
      <ih-skeleton [rows]="6" rowHeight="2.75rem" />
    } @else if (!users().length) {
      <ih-empty-state title="No users found" description="No account matches these filters." />
    } @else {
      <div class="table-wrap">
        <table class="data-table stacked">
          <caption class="sr-only">Employee accounts</caption>
          <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Department</th><th scope="col">Status</th><th scope="col">Password</th><th scope="col">Last sign-in</th><th scope="col">Created</th></tr></thead>
          <tbody>
            @for (user of users(); track user.id) {
              <tr>
                <td data-label="Name"><div><a class="cell-title" [routerLink]="['/users', user.id]">{{ user.name }}</a>@if (user.isSelf) { <span class="badge badge-neutral">You</span> }<div class="cell-sub">{{ user.email }}</div></div></td>
                <td data-label="Role">{{ user.role.label }}</td>
                <td data-label="Department">{{ user.department || '—' }}</td>
                <td data-label="Status">
                  <span [class]="user.isActive ? 'badge badge-success' : 'badge badge-danger'">{{ user.isActive ? 'Active' : 'Inactive' }}</span>
                  @if (user.locked) { <span class="badge badge-warning">Locked</span> }
                </td>
                <td data-label="Password">@if (user.mustChangePassword) { <span class="badge badge-warning">Must change</span> } @else { Set }</td>
                <td data-label="Last sign-in">{{ user.lastLoginAt ? (user.lastLoginAt | date: 'medium') : 'Never' }}</td>
                <td data-label="Created">{{ user.createdAt | date: 'mediumDate' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <ih-pagination [page]="page()" [totalPages]="totalPages()" [totalItems]="total()" (pageChange)="load($event)" />
    }
  `,
})
export class UsersComponent {
  private readonly api = inject(AdminApi);

  protected search = '';
  protected role = '';
  protected status = '';
  protected readonly users = signal<AdminUser[]>([]);
  protected readonly roles = signal<Role[]>([]);
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() {
    this.load(1);
  }

  protected load(page: number): void {
    this.loading.set(true);
    this.error.set('');
    this.api.get<AdminUserList>('/users', { page, search: this.search.trim(), role: this.role, status: this.status }).subscribe({
      next: (list) => {
        this.users.set(list.items);
        this.roles.set(list.roles);
        this.page.set(list.page);
        this.totalPages.set(list.totalPages);
        this.total.set(list.total);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorMessage(err, 'Please try again.'));
        this.loading.set(false);
      },
    });
  }
}

interface Draft { name: string; email: string; role: string; jobTitle: string; department: string }
const EMPTY: Draft = { name: '', email: '', role: '', jobTitle: '', department: '' };
type Confirming = '' | 'reset' | 'revoke' | 'deactivate' | 'delete';

@Component({
  selector: 'iha-user-detail',
  imports: [FormsModule, RouterLink, DatePipe, ModalComponent, CopyButtonComponent, ConfirmDialogComponent, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="page-header">
      <div>
        <p><a routerLink="/users">← All users</a></p>
        <h1>{{ id() ? (user()?.name ?? 'User') : 'New user' }}</h1>
        @if (user(); as u) {
          <p class="page-subtitle">
            <span [class]="u.isActive ? 'badge badge-success' : 'badge badge-danger'">{{ u.isActive ? 'Active' : 'Inactive' }}</span>
            @if (u.locked) { <span class="badge badge-warning">Locked</span> }
            @if (u.isSelf) { <span class="badge badge-neutral">This is your account</span> }
          </p>
        }
      </div>
    </div>

    @if (loadError()) {
      <ih-error-state title="This account could not be loaded" [message]="loadError()" (retry)="fetch()" />
    } @else if (loading()) {
      <ih-skeleton [rows]="6" rowHeight="2.75rem" />
    } @else {
      @if (user() && !user()!.actions.edit) { <div class="alert alert-info">Only a Super Admin can change a Super Admin account.</div> }
      @if (error()) { <div class="alert alert-error" role="alert">{{ error() }}</div> }
      <form class="card" (ngSubmit)="save()" novalidate>
        <fieldset class="card-body stack" [disabled]="saving() || (!!user() && !user()!.actions.edit)">
          <legend class="card-title">Account</legend>
          <div class="form-grid">
            <div class="field">
              <label for="name">Name</label><input id="name" name="name" maxlength="120" required [(ngModel)]="draft.name" [attr.aria-invalid]="!!errors()['name']" />
              @if (errors()['name']) { <span class="error">{{ errors()['name'] }}</span> }
            </div>
            <div class="field">
              <label for="email">Sign-in email</label>
              <input id="email" name="email" type="email" maxlength="254" required autocomplete="off" [(ngModel)]="draft.email" [attr.aria-invalid]="!!errors()['email']" aria-describedby="email-hint" />
              <span class="hint" id="email-hint">@if (id()) { Changing it signs the employee out of the Staff application. } @else { The employee signs in with this address. }</span>
              @if (errors()['email']) { <span class="error">{{ errors()['email'] }}</span> }
            </div>
            <div class="field">
              <label for="role">Role</label>
              <select id="role" name="role" required [(ngModel)]="draft.role" [attr.aria-invalid]="!!errors()['role']">
                <option value="" disabled>Choose a role</option>
                @for (r of roles(); track r.code) { <option [value]="r.code" [disabled]="!r.assignable && r.code !== user()?.role?.code">{{ r.label }}</option> }
              </select>
              @if (errors()['role']) { <span class="error">{{ errors()['role'] }}</span> }
            </div>
            <div class="field"><label for="jobTitle">Job title</label><input id="jobTitle" name="jobTitle" maxlength="120" [(ngModel)]="draft.jobTitle" /></div>
            <div class="field"><label for="department">Department</label><input id="department" name="department" maxlength="120" [(ngModel)]="draft.department" /></div>
          </div>
          @if (!id()) { <p class="alert alert-info">A temporary password is generated when you create the account. You will see it once, and the employee must replace it the first time they sign in.</p> }
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : id() ? 'Save changes' : 'Create user' }}</button>
            <span class="save-state" role="status">{{ hasUnsavedChanges() ? 'Unsaved changes' : '' }}</span>
          </div>
        </fieldset>
      </form>

      @if (user(); as u) {
        <section class="card" aria-labelledby="credential-title" style="margin-top: 1rem">
          <div class="card-body stack">
            <h2 class="card-title" id="credential-title">Credentials and sessions</h2>
            <dl class="facts">
              <div><dt>Password</dt><dd>{{ u.mustChangePassword ? 'Temporary — must be changed at next sign-in' : 'Set by the employee' }}</dd></div>
              <div><dt>Temporary password issued</dt><dd>{{ u.credentialIssuedAt ? (u.credentialIssuedAt | date: 'medium') : '—' }}</dd></div>
              <div><dt>Password last changed</dt><dd>{{ u.passwordChangedAt ? (u.passwordChangedAt | date: 'medium') : '—' }}</dd></div>
              <div><dt>Last sign-in</dt><dd>{{ u.lastLoginAt ? (u.lastLoginAt | date: 'medium') : 'Never' }}</dd></div>
              <div><dt>Sign-in lock</dt><dd>{{ u.locked ? 'Locked after failed attempts — a reset clears it' : 'Not locked' }}</dd></div>
            </dl>
            <div class="row">
              @if (u.actions.resetCredentials) { <button type="button" class="btn" (click)="confirming.set('reset')">Reset password</button> }
              @if (u.actions.revokeSessions) { <button type="button" class="btn" (click)="confirming.set('revoke')">Revoke Staff sessions</button> }
              @if (u.actions.edit && u.isActive) { <button type="button" class="btn btn-danger" (click)="confirming.set('deactivate')">Deactivate account</button> }
              @if (u.actions.edit && !u.isActive) { <button type="button" class="btn" (click)="setActive(true)">Reactivate account</button> }
              @if (u.actions.delete) { <button type="button" class="btn btn-danger" (click)="confirming.set('delete')">Delete account</button> }
            </div>
            <p class="cell-sub">Revoking ends this employee's Staff application sessions. An Admin Console session ends on its next request only when the account is deactivated or loses console access.</p>
          </div>
        </section>
      }
    }

    <iha-modal [open]="!!credential()" title="Temporary credential" [dismissOnBackdrop]="false" (closed)="dismissCredential()">
      @if (credential(); as c) {
        <div class="stack">
          <p class="alert alert-warning"><strong>Copy this password now. It will not be shown again.</strong></p>
          <p>{{ c.purpose === 'created' ? 'The account was created.' : 'The password was reset.' }} Give this password to {{ user()?.name }} privately. They will be asked to choose their own the first time they sign in.</p>
          <div class="field">
            <label for="temp-password">Temporary password</label>
            <div class="row"><input id="temp-password" readonly [value]="c.password" style="flex: 1; font-family: ui-monospace, Consolas, monospace" /><iha-copy-button [text]="c.password" label="Copy password" /></div>
          </div>
        </div>
      }
      <button modal-footer type="button" class="btn btn-primary" (click)="dismissCredential()">I have copied it</button>
    </iha-modal>

    <ih-confirm-dialog [isOpen]="confirming() === 'reset'" title="Reset this password?" message="A new temporary password is generated, the current one stops working, any sign-in lock is cleared and the employee is signed out of the Staff application."
      confirmText="Reset password" variant="danger" (confirmed)="reset()" (cancelled)="confirming.set('')" />
    <ih-confirm-dialog [isOpen]="confirming() === 'revoke'" title="Revoke Staff sessions?" message="The employee is signed out of the Staff application everywhere and must sign in again. Their password does not change."
      confirmText="Revoke sessions" variant="danger" (confirmed)="revoke()" (cancelled)="confirming.set('')" />
    <ih-confirm-dialog [isOpen]="confirming() === 'deactivate'" title="Deactivate this account?" message="The employee can no longer sign in anywhere and is signed out of the Staff application. The account and its history are kept, and it can be reactivated."
      confirmText="Deactivate account" variant="danger" (confirmed)="setActive(false)" (cancelled)="confirming.set('')" />
    <ih-confirm-dialog [isOpen]="confirming() === 'delete'" title="Delete this account permanently?" message="This cannot be undone. To keep the record, deactivate the account instead."
      confirmText="Delete account" variant="danger" [requireMatch]="user()?.email ?? null" (confirmed)="remove()" (cancelled)="confirming.set('')" />
  `,
  styles: `
    fieldset { border: 0; min-width: 0; } legend { float: left; width: 100%; } legend + * { clear: both; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 0.75rem 1.5rem; }
    dt { font-size: var(--ih-font-size-xs); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ih-text-secondary); }
    .page-subtitle { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  `,
})
export class UserDetailComponent implements HasUnsavedChanges {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** Route parameter; absent on /users/new. */
  readonly id = input<string>();

  protected draft: Draft = { ...EMPTY };
  private saved = JSON.stringify(EMPTY);
  protected readonly user = signal<AdminUser | null>(null);
  protected readonly roles = signal<Role[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly confirming = signal<Confirming>('');
  /** Held in memory for exactly as long as the dialog is open; never stored, never logged. */
  protected readonly credential = signal<TemporaryCredential | null>(null);
  private createdId = '';

  constructor() {
    effect(() => { this.id(); this.fetch(); });
  }

  hasUnsavedChanges(): boolean {
    return JSON.stringify(this.draft) !== this.saved;
  }
  @HostListener('window:beforeunload', ['$event'])
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges() || this.credential()) event.preventDefault();
  }

  protected fetch(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api.get<AdminUserList>('/users', { limit: 1 }).subscribe({ next: (list) => this.roles.set(list.roles), error: () => undefined });
    const id = this.id();
    if (!id) {
      this.apply(null);
      return;
    }
    this.api.get<AdminUser>(`/users/${id}`).subscribe({
      next: (user) => this.apply(user),
      error: (err) => {
        this.loadError.set(apiErrorMessage(err, 'Please try again.'));
        this.loading.set(false);
      },
    });
  }

  private apply(user: AdminUser | null): void {
    this.user.set(user);
    this.draft = user ? { name: user.name, email: user.email, role: user.role.code, jobTitle: user.jobTitle, department: user.department } : { ...EMPTY };
    this.saved = JSON.stringify(this.draft);
    this.errors.set({});
    this.error.set('');
    this.loading.set(false);
  }

  private failed(err: unknown, fallback: string): void {
    this.errors.set(apiFieldErrors(err));
    this.error.set(apiErrorMessage(err, fallback));
    this.saving.set(false);
  }

  protected save(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    const id = this.id();
    if (id) {
      this.api.patch<AdminUser>(`/users/${id}`, this.draft).subscribe({
        next: (user) => {
          this.apply(user);
          this.saving.set(false);
          this.toast.success('Account saved.');
        },
        error: (err) => this.failed(err, 'The account could not be saved.'),
      });
      return;
    }
    this.api.post<CredentialResult>('/users', this.draft).subscribe({
      next: (res) => {
        this.apply(res.user);
        this.saving.set(false);
        this.createdId = res.user.id;
        this.credential.set(res.temporaryCredential);
      },
      error: (err) => this.failed(err, 'The account could not be created.'),
    });
  }

  /** Forget the credential, then (after a create) move to the new account's page. */
  protected dismissCredential(): void {
    this.credential.set(null);
    if (this.createdId) {
      const id = this.createdId;
      this.createdId = '';
      void this.router.navigate(['/users', id], { replaceUrl: true });
    }
  }

  protected reset(): void {
    this.confirming.set('');
    this.api.post<CredentialResult>(`/users/${this.id()}/reset-credentials`).subscribe({
      next: (res) => {
        this.apply(res.user);
        this.credential.set(res.temporaryCredential);
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'The password could not be reset.')),
    });
  }

  protected revoke(): void {
    this.confirming.set('');
    this.api.post<{ user: AdminUser; revokedStaffSessions: number }>(`/users/${this.id()}/revoke-sessions`).subscribe({
      next: (res) => this.toast.success(res.revokedStaffSessions ? `Revoked ${res.revokedStaffSessions} Staff session${res.revokedStaffSessions === 1 ? '' : 's'}.` : 'There were no active Staff sessions.'),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Sessions could not be revoked.')),
    });
  }

  protected setActive(isActive: boolean): void {
    this.confirming.set('');
    this.api.patch<AdminUser>(`/users/${this.id()}`, { isActive }).subscribe({
      next: (user) => {
        this.apply(user);
        this.toast.success(isActive ? 'Account reactivated.' : 'Account deactivated.');
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'The account could not be updated.')),
    });
  }

  protected remove(): void {
    this.confirming.set('');
    this.api.delete(`/users/${this.id()}`).subscribe({
      next: () => {
        this.saved = JSON.stringify(this.draft);
        this.toast.success('Account deleted.');
        void this.router.navigate(['/users']);
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'The account could not be deleted.')),
    });
  }
}
