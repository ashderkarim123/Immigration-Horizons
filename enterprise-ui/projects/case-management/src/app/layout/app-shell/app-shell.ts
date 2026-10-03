import { Component, signal, inject, HostListener, Injector, afterNextRender } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { Navigation } from '../navigation/navigation';
import { AuthService } from '../../core/auth/auth.service';
import { DOCUMENT } from '@angular/common';

@Component({
  selector: 'ih-app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, Navigation],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  private document = inject(DOCUMENT);
  private injector = inject(Injector);
  protected readonly sidebarCollapsed = signal(false);
  protected readonly mobileMenuOpen = signal(false);
  readonly createActions = [
    { label: 'Task', kind: 'task', capability: 'tasks.manage' },
    { label: 'Document request', kind: 'request', capability: 'document_requests.manage' },
    { label: 'Smart form', kind: 'form', capability: 'forms.edit' },
    { label: 'Message', kind: 'message', capability: 'messages.send' },
    { label: 'Channel', kind: 'channel', capability: 'channels.create' },
  ];
  hasCreateActions() { return this.auth.capabilities().includes('cases.create') || this.createActions.some(a => this.auth.capabilities().includes(a.capability)); }
  openMenu() {
    this.mobileMenuOpen.set(true);
    afterNextRender(() => this.document.querySelector<HTMLElement>('#staff-navigation a')?.focus(), { injector: this.injector });
  }
  @HostListener('document:keydown.escape') closeMenu() {
    if (!this.mobileMenuOpen()) return;
    this.mobileMenuOpen.set(false);
    afterNextRender(() => this.document.querySelector<HTMLElement>('[aria-controls="staff-navigation"]')?.focus(), { injector: this.injector });
  }
  @HostListener('window:resize') resizeMenu() {
    if ((this.document.defaultView?.innerWidth || 0) > 768) this.mobileMenuOpen.set(false);
  }
  @HostListener('document:keydown', ['$event']) trapFocus(event: KeyboardEvent) {
    if (!this.mobileMenuOpen() || event.key !== 'Tab') return;
    const controls = Array.from(this.document.querySelectorAll<HTMLElement>('#staff-navigation a, #staff-navigation button')).filter(el => el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && this.document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && this.document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  navigationClick(event: MouseEvent) {
    if (!(event.target as HTMLElement).closest('a')) return;
    this.mobileMenuOpen.set(false);
    queueMicrotask(() => this.document.getElementById('staff-content')?.focus());
  }
  createClick(event: MouseEvent) { if ((event.target as HTMLElement).closest('a')) (event.currentTarget as HTMLDetailsElement).open = false; }
  readonly auth = inject(AuthService);

  protected toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  protected logout(): void {
    this.auth.logout();
  }
}
