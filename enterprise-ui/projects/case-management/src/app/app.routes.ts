import { Routes } from '@angular/router';
import { AppShell } from './layout/app-shell/app-shell';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/sign-in/sign-in').then((m) => m.SignIn),
  },
  {
    path: '',
    component: AppShell,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'cases',
        loadComponent: () =>
          import('./features/cases/cases').then((m) => m.Cases),
      },
      {
        path: '**',
        loadComponent: () =>
          import('./features/not-found/not-found').then((m) => m.NotFound),
      },
    ],
  },
];
