import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navigation } from '../navigation/navigation';

@Component({
  selector: 'ih-app-shell',
  standalone: true,
  imports: [RouterOutlet, Navigation],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  protected readonly sidebarCollapsed = signal(false);

  protected toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }
}
