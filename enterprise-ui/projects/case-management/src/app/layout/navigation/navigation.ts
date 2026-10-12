import { Component, input, inject, computed, effect } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IhIconComponent } from '../../shared/icon/ih-icon.component';
import { AuthService } from '../../core/auth/auth.service';
import { MailUnreadService } from '../../core/api/mail-unread.service';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  /** A count shown beside the label (unread mail). Spoken as part of the link's name, not hidden. */
  badge?: number;
}

@Component({
  selector: 'ih-navigation',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IhIconComponent],
  templateUrl: './navigation.html',
  styleUrl: './navigation.scss',
})
export class Navigation {
  readonly collapsed = input(false);
  private auth = inject(AuthService);
  private mailUnread = inject(MailUnreadService);

  constructor() {
    // Only someone who may read the mailbox ever asks Microsoft (through our API) how many are unread.
    effect(() => { if (this.auth.capabilities().includes('mail.view')) this.mailUnread.start(); else this.mailUnread.stop(); });
  }

  readonly navItems = computed<NavItem[]>(() => {
    const caps = this.auth.capabilities();
    const items: NavItem[] = [
      { label: 'Dashboard', path: '/dashboard', icon: 'layout-dashboard' }
    ];

    if (caps.includes('cases.view')) {
      items.push({ label: 'Cases', path: '/cases', icon: 'briefcase' });
    }
    if (caps.includes('clients.view')) {
      items.push({ label: 'Clients', path: '/clients', icon: 'users' });
    }
    
    // Every employee can see their own tasks; case deadlines need case visibility.
    items.push({ label: 'Tasks', path: '/tasks', icon: 'check-square' });
    if (caps.includes('channels.view')) {
      items.push({ label: 'Messages', path: '/messages', icon: 'message-square' });
    }
    if (caps.includes('mail.view')) items.push({ label: 'Mail', path: '/mail', icon: 'mail', badge: this.mailUnread.count() });
    if (caps.includes('cases.view')) items.push({ label: 'Deadlines', path: '/deadlines', icon: 'clock' });
    if (caps.includes('calendar.view')) items.push({ label: 'Calendar', path: '/calendar', icon: 'calendar' });
    if (caps.includes('uscis_tracking.view')) items.push({ label: 'Tracking', path: '/tracking', icon: 'file-text' });
    if (caps.includes('reports.view')) items.push({ label: 'Reports', path: '/reports', icon: 'activity' });

    return items;
  });
}
