import { Component, computed, inject, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AdminAuthService } from '../../core/auth/admin-auth.service';
import { visibleNavigation } from '../../core/permissions/navigation';
import { IhIconComponent } from '../../shared/staff-ui';

@Component({
  selector: 'iha-navigation',
  imports: [RouterLink, RouterLinkActive, IhIconComponent],
  template: `
    <nav aria-label="Admin Console">
      @for (group of groups(); track group.label) {
        @if (group.label) { <h2 class="group-label">{{ group.label }}</h2> }
        <ul role="list">
          @for (item of group.items; track item.path) {
            <li>
              <a class="nav-link" [routerLink]="item.path" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="navigated.emit()">
                <ih-icon [name]="item.icon" [size]="18" />
                <span>{{ item.label }}</span>
              </a>
            </li>
          }
        </ul>
      }
    </nav>
  `,
  styles: `
    nav { padding: var(--ih-space-3) var(--ih-space-3) var(--ih-space-6); }
    ul { list-style: none; display: flex; flex-direction: column; gap: 2px; }
    .group-label { margin: var(--ih-space-5) var(--ih-space-3) var(--ih-space-2); font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ih-brand-300); }
    .nav-link {
      display: flex; align-items: center; gap: var(--ih-space-3); min-height: 2.5rem; padding: 0 var(--ih-space-3);
      border-left: 3px solid transparent; border-radius: var(--ih-radius-md); color: var(--ih-brand-100);
      font-size: var(--ih-font-size-sm); font-weight: 500; text-decoration: none;
    }
    .nav-link:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
    .nav-link.active { background: rgba(255, 255, 255, 0.12); border-left-color: var(--ih-accent-400); color: #fff; font-weight: 600; }
    .nav-link:focus-visible { outline-color: var(--ih-accent-300); }
  `,
})
export class AdminNavigation {
  private readonly auth = inject(AdminAuthService);
  /** Lets the shell close the mobile drawer after a choice. */
  readonly navigated = output<void>();
  protected readonly groups = computed(() => visibleNavigation(this.auth.capabilities()));
}
