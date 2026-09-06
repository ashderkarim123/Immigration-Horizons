import { Component, signal, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navigation } from '../navigation/navigation';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'ih-app-shell',
  standalone: true,
  imports: [RouterOutlet, Navigation],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  protected readonly sidebarCollapsed = signal(false);
  readonly auth = inject(AuthService);

  protected toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  protected logout(): void {
    this.auth.logout();
  }
}
