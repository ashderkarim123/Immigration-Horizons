import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'ih-setup-password',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="auth-layout">
      <div class="auth-panel form-panel">
        <div class="auth-header">
          <img src="assets/images/logo-header.png" alt="Immigration Horizons" class="auth-logo" />
          <h1>Set Permanent Password</h1>
          <p>Please update your password to continue.</p>
        </div>

        <form [formGroup]="pwdForm" (ngSubmit)="onSubmit()" class="auth-form">
          @if (errorMessage()) {
            <div class="alert alert-error">
              {{ errorMessage() }}
            </div>
          }

          <div class="form-group">
            <label for="currentPassword">Current Password</label>
            <input 
              id="currentPassword" 
              type="password" 
              formControlName="currentPassword" 
              class="form-control" 
              autocomplete="current-password"
              autofocus />
          </div>

          <div class="form-group">
            <label for="newPassword">New Password</label>
            <input 
              id="newPassword" 
              type="password" 
              formControlName="newPassword" 
              class="form-control" 
              autocomplete="new-password" />
            <small style="color: var(--ih-text-muted); font-size: var(--ih-font-size-xs); display: block; margin-top: 4px;">Must be at least 8 characters.</small>
          </div>

          <button type="submit" class="btn btn-primary btn-block" [disabled]="pwdForm.invalid || isSubmitting()">
            {{ isSubmitting() ? 'Updating...' : 'Update Password' }}
          </button>
        </form>
      </div>

      <div class="auth-panel visual-panel">
      </div>
    </div>
  `,
  styleUrls: ['../sign-in/sign-in.scss']
})
export class SetupPasswordComponent {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  pwdForm = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8)]]
  });

  isSubmitting = signal(false);
  errorMessage = signal<string | null>(null);

  onSubmit() {
    if (this.pwdForm.invalid) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    this.api.post('/staff/account/initial-password', this.pwdForm.value).subscribe({
      next: () => {
        // Re-check session
        this.auth.checkSession().subscribe(() => {
          this.router.navigate(['/dashboard']);
        });
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.error?.message || 'An error occurred.');
      }
    });
  }
}
