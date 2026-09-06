import { Routes } from '@angular/router';
import { AdminAppShell } from './layout/app-shell/app-shell';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/sign-in/sign-in').then((m) => m.AdminSignIn),
  },
  {
    path: '',
    component: AdminAppShell,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard').then((m) => m.AdminDashboard),
      },
      {
        path: 'content',
        loadComponent: () =>
          import('./features/content/content').then((m) => m.ContentPlaceholder),
      },
      {
        path: '**',
        loadComponent: () =>
          import('./features/not-found/not-found').then((m) => m.AdminNotFound),
      },
    ],
  },
];
