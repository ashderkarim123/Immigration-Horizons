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

interface NavGroup {
  label: string;
  items: NavItem[];
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

  /**
   * The menu, grouped by what a person comes here to do. Every entry is a page that exists and that the server will let this
   * employee open; a group with nothing in it is not shown. Every employee has their own tasks and notifications.
   */
  readonly navGroups = computed<NavGroup[]>(() => {
    const caps = this.auth.capabilities();
    const has = (capability: string) => caps.includes(capability);
    const groups: NavGroup[] = [
      { label: 'Workspace', items: [
        { label: 'Dashboard', path: '/dashboard', icon: 'layout-dashboard' },
        { label: 'Tasks', path: '/tasks', icon: 'check-square' },
        ...(has('calendar.view') ? [{ label: 'Calendar', path: '/calendar', icon: 'calendar' }] : []),
        { label: 'Notifications', path: '/notifications', icon: 'bell' },
      ] },
      { label: 'Clients and leads', items: [
        ...(has('clients.view') ? [{ label: 'Clients', path: '/clients', icon: 'users' }] : []),
        ...(has('leads.view') ? [{ label: 'Leads', path: '/intake', icon: 'user-plus' }, { label: 'CRM pipeline', path: '/crm', icon: 'activity' }] : []),
        ...(has('queries.view') ? [{ label: 'Consultations', path: '/consultations', icon: 'user-check' }] : []),
      ] },
      { label: 'Case work', items: [
        ...(has('cases.view') ? [{ label: 'Cases', path: '/cases', icon: 'briefcase' }, { label: 'Deadlines', path: '/deadlines', icon: 'clock' }] : []),
        ...(has('uscis_tracking.view') ? [{ label: 'Tracking', path: '/tracking', icon: 'file-text' }] : []),
      ] },
      { label: 'Communication', items: [
        ...(has('channels.view') ? [{ label: 'Messages', path: '/messages', icon: 'message-square' }] : []),
        ...(has('mail.view') ? [{ label: 'Mail', path: '/mail', icon: 'mail', badge: this.mailUnread.count() }] : []),
      ] },
      { label: 'Operations', items: [
        ...(has('sprints.manage') ? [{ label: 'Team planning', path: '/planning', icon: 'folder' }] : []),
        ...(has('reports.view') ? [{ label: 'Reports', path: '/reports', icon: 'activity' }] : []),
      ] },
    ];
    return groups.filter((group) => group.items.length);
  });

  /** Every entry in menu order, without the grouping. */
  readonly navItems = computed<NavItem[]>(() => this.navGroups().flatMap((group) => group.items));
}
