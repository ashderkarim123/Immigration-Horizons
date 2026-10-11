import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminAuthService } from '../../core/auth/admin-auth.service';
import { apiErrorMessage } from '../../core/errors/api-error';

@Component({
  selector: 'iha-admin-sign-in',
  imports: [FormsModule],
  template: `
    <div class="layout">
      <main class="form-panel">
        <form class="form" (ngSubmit)="submit()" novalidate>
          <img src="assets/images/logo-header.png" alt="Immigration Horizons" width="56" height="56" />
          <h1>Admin Console</h1>
          <p class="lede">Sign in with your administrator account.</p>

          @if (error()) { <div class="alert alert-error" role="alert">{{ error() }}</div> }

          <div class="field">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" autocomplete="username" required autofocus [(ngModel)]="email" />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <div class="password">
              <input id="password" name="password" [type]="showPassword() ? 'text' : 'password'" autocomplete="current-password" required [(ngModel)]="password" />
              <button type="button" class="btn btn-sm" [attr.aria-pressed]="showPassword()" (click)="showPassword.set(!showPassword())">
                {{ showPassword() ? 'Hide' : 'Show' }}<span class="sr-only"> password</span>
              </button>
            </div>
          </div>
          <button type="submit" class="btn btn-primary submit" [disabled]="submitting()">{{ submitting() ? 'Signing in…' : 'Sign in' }}</button>
          <p class="note">Authorized administrators only.</p>
        </form>
      </main>
      <aside class="brand-panel" aria-hidden="true">
        <div>
          <p class="eyebrow">Immigration Horizons</p>
          <p class="headline">Website and platform administration</p>
          <p class="sub">Content, settings, employee accounts and the security record, in one place.</p>
        </div>
      </aside>
    </div>
  `,
  styles: `
    .layout { display: flex; min-height: 100dvh; background: #fff; }
    .form-panel { flex: 1 1 28rem; display: flex; align-items: center; justify-content: center; padding: var(--ih-space-8) var(--ih-space-5); }
    .form { width: 100%; max-width: 22rem; display: flex; flex-direction: column; gap: var(--ih-space-4); }
    h1 { font-family: var(--ih-font-display); font-size: 1.75rem; color: var(--ih-brand-900); }
    .lede { margin-top: calc(var(--ih-space-3) * -1); color: var(--ih-text-secondary); }
    .password { display: flex; gap: var(--ih-space-2); }
    .password .btn { min-height: 2.5rem; min-width: 4rem; }
    .submit { min-height: 2.75rem; }
    .note { font-size: var(--ih-font-size-xs); color: var(--ih-text-muted); text-align: center; }
    .brand-panel { display: none; flex: 1 1 50%; align-items: center; padding: var(--ih-space-8); background: var(--ih-brand-900); color: #fff; border-left: 4px solid var(--ih-accent-500); }
    .brand-panel > div { max-width: 26rem; margin: 0 auto; }
    .eyebrow { font-size: var(--ih-font-size-xs); font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ih-accent-300); }
    .headline { margin: var(--ih-space-3) 0; font-family: var(--ih-font-display); font-size: 2rem; line-height: 1.2; }
    .sub { color: var(--ih-brand-100); font-size: var(--ih-font-size-base); }
    @media (min-width: 900px) { .brand-panel { display: flex; } }
  `,
})
export class AdminSignIn {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);

  protected email = '';
  protected password = '';
  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal('');

  protected async submit(): Promise<void> {
    if (this.submitting()) return;
    if (!this.email.trim() || !this.password) {
      this.error.set('Enter your email and password.');
      return;
    }
    this.submitting.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.email.trim(), this.password);
      this.password = '';
      await this.router.navigate(['/dashboard']);
    } catch (err) {
      const status = (err as HttpErrorResponse)?.status;
      // The server's wording for 401 is already generic; anything else must not hint at whether the account exists.
      this.error.set(status === 401 || status === 429 ? apiErrorMessage(err, 'Invalid email or password.') : 'Sign-in is unavailable right now. Please try again.');
      // A refused sign-in can follow a replaced session: take a fresh token so the next attempt is not a CSRF failure.
      if (status === 403) void this.auth.bootstrap();
    } finally {
      this.submitting.set(false);
    }
  }
}
