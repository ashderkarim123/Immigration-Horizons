import { Routes } from '@angular/router';
import { AppShell } from './layout/app-shell/app-shell';
import { authGuard, unauthGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [unauthGuard],
    loadComponent: () =>
      import('./features/sign-in/sign-in').then((m) => m.SignIn),
  },
  {
    path: 'setup-password',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/setup-password/setup-password.component').then((m) => m.SetupPasswordComponent),
  },
  {
    path: '',
    component: AppShell,
    canActivate: [authGuard],
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
        path: 'cases/:id',
        loadComponent: () =>
          import('./features/cases/case-detail/case-detail.component').then((m) => m.CaseDetailComponent),
      },
      {
        path: 'clients',
        loadComponent: () =>
          import('./features/clients/clients.component').then((m) => m.ClientsComponent),
      },
      {
        path: 'clients/:id',
        loadComponent: () =>
          import('./features/clients/client-detail/client-detail.component').then((m) => m.ClientDetailComponent),
      },
      {
        path: 'tasks',
        loadComponent: () =>
          import('./features/tasks/tasks.component').then((m) => m.TasksComponent),
      },
      {
        path: 'deadlines',
        loadComponent: () =>
          import('./features/deadlines/deadlines.component').then((m) => m.DeadlinesComponent),
      },
      {
        path: '**',
        loadComponent: () =>
          import('./features/not-found/not-found').then((m) => m.NotFound),
      },
    ],
  },
];
