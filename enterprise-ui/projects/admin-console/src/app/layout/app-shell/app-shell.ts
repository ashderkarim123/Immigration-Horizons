import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AdminNavigation } from '../navigation/navigation';

@Component({
  selector: 'iha-app-shell',
  standalone: true,
  imports: [RouterOutlet, AdminNavigation],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AdminAppShell {
  protected readonly sidebarCollapsed = signal(false);

  protected toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }
}
