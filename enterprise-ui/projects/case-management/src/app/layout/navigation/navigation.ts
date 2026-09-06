import { Component, input, inject, computed } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule, LayoutDashboard, Briefcase, Users, CheckSquare } from 'lucide-angular';
import { AuthService } from '../../core/auth/auth.service';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

@Component({
  selector: 'ih-navigation',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './navigation.html',
  styleUrl: './navigation.scss',
})
export class Navigation {
  readonly collapsed = input(false);
  private auth = inject(AuthService);

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
    
    // Everyone sees tasks (if they have them), but we can just show it to everyone
    items.push({ label: 'Tasks', path: '/tasks', icon: 'check-square' });

    return items;
  });
}
