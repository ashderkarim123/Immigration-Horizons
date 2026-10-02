import { Component, signal, inject, HostListener } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { Navigation } from '../navigation/navigation';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'ih-app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, Navigation],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  protected readonly sidebarCollapsed = signal(false);
  protected readonly mobileMenuOpen = signal(false);
  readonly toggleMobile = (value: boolean) => !value;
  readonly createActions = [
    { label: 'Task', kind: 'task', capability: 'tasks.manage' },
    { label: 'Document request', kind: 'request', capability: 'document_requests.manage' },
    { label: 'Smart form', kind: 'form', capability: 'forms.edit' },
    { label: 'Message', kind: 'message', capability: 'messages.send' },
    { label: 'Channel', kind: 'channel', capability: 'channels.create' },
  ];
  hasCreateActions() { return this.auth.capabilities().includes('cases.create') || this.createActions.some(a => this.auth.capabilities().includes(a.capability)); }
  @HostListener('document:keydown.escape') closeMenu() { this.mobileMenuOpen.set(false); }
  navigationClick(event: MouseEvent) { if ((event.target as HTMLElement).closest('a')) this.mobileMenuOpen.set(false); }
  readonly auth = inject(AuthService);

  protected toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  protected logout(): void {
    this.auth.logout();
  }
}
