import { Component, HostListener, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AdminAuthService } from '../../core/auth/admin-auth.service';
import { UnsavedChangesService } from '../../core/guards/unsaved-changes.guard';
import { ConfirmDialogComponent, IhIconComponent, ToastService } from '../../shared/staff-ui';
import { AdminNavigation } from '../navigation/navigation';

@Component({
  selector: 'iha-app-shell',
  imports: [RouterOutlet, AdminNavigation, ConfirmDialogComponent, IhIconComponent],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <div class="shell" [class.menu-open]="menuOpen()">
      <aside class="sidebar" id="admin-sidebar">
        <div class="brand">
          <img src="assets/images/logo-header.png" alt="" width="36" height="36" />
          <div>
            <span class="brand-name">Immigration Horizons</span>
            <span class="brand-product">Admin Console</span>
          </div>
        </div>
        <iha-navigation (navigated)="menuOpen.set(false)" />
      </aside>
      @if (menuOpen()) { <button type="button" class="backdrop" aria-label="Close menu" (click)="menuOpen.set(false)"></button> }

      <div class="main">
        <header class="topbar">
          <button type="button" class="menu-btn" aria-controls="admin-sidebar" [attr.aria-expanded]="menuOpen()" aria-label="Menu" (click)="menuOpen.set(!menuOpen())">
            <ih-icon name="layout-dashboard" [size]="20" />
          </button>
          <div class="who">
            @if (auth.currentAdmin(); as admin) {
              <span class="who-name">{{ admin.name }}</span>
              <span class="who-role">{{ admin.role.label }}</span>
            }
          </div>
          <button type="button" class="btn btn-sm" [disabled]="signingOut()" (click)="signOut()">
            <ih-icon name="log-out" [size]="16" /> Sign out
          </button>
        </header>
        <main id="main" tabindex="-1"><router-outlet /></main>
      </div>
    </div>

    <div class="toasts" role="status" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="toast" [class]="'toast toast-' + toast.type">
          <span>{{ toast.message }}</span>
          <button type="button" aria-label="Dismiss" (click)="toasts.dismiss(toast.id)">×</button>
        </div>
      }
    </div>

    <ih-confirm-dialog
      [isOpen]="unsaved.asking()"
      title="Leave without saving?"
      message="You have changes that have not been saved. If you leave now they will be lost."
      confirmText="Leave page"
      variant="danger"
      (confirmed)="unsaved.answer(true)"
      (cancelled)="unsaved.answer(false)" />
  `,
  styleUrl: './app-shell.scss',
})
export class AdminAppShell {
  protected readonly auth = inject(AdminAuthService);
  protected readonly toasts = inject(ToastService);
  protected readonly unsaved = inject(UnsavedChangesService);
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);
  protected readonly signingOut = signal(false);

  @HostListener('document:keydown.escape')
  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    try {
      await this.auth.logout();
    } catch {
      // The local session is cleared either way; the server-side one expires on its own.
    }
    this.signingOut.set(false);
    await this.router.navigate(['/login']);
  }
}
