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
      { path: 'consultations', loadComponent: () => import('./features/consultations/consultations').then(m => m.Consultations) },
      { path: 'consultations/:id', loadComponent: () => import('./features/consultations/consultations').then(m => m.Consultations) },
      { path: 'intake', loadComponent: () => import('./features/consultations/lead-intake').then(m => m.LeadIntake) },
      { path: 'intake/:id', loadComponent: () => import('./features/consultations/lead-intake').then(m => m.LeadIntake) },
      { path: 'planning', loadComponent: () => import('./features/tasks/planning').then(m => m.Planning) },
      { path: 'notifications', loadComponent: () => import('./features/dashboard/notifications').then(m => m.StaffNotifications) },
      {
        path: 'cases',
        loadComponent: () =>
          import('./features/cases/cases').then((m) => m.Cases),
      },
      {
        path: 'cases/new',
        loadComponent: () => import('./features/cases/create-case').then(m => m.CreateCase),
      },
      {
        path: 'create',
        loadComponent: () => import('./features/cases/create-work').then(m => m.CreateWork),
      },
      {
        path: 'work-queues',
        loadComponent: () => import('./features/dashboard/work-queue').then(m => m.WorkQueuePage),
      },
      {
        path: 'cases/:id',
        loadComponent: () =>
          import('./features/cases/case-detail/case-detail.component').then((m) => m.CaseDetailComponent),
      },
      {
        path: 'documents/:id',
        loadComponent: () =>
          import('./features/documents/document-detail.component').then((m) => m.DocumentDetailComponent),
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
        path: 'tracking',
        loadComponent: () =>
          import('./features/tracking/tracking.component').then((m) => m.TrackingComponent),
      },
      {
        path: 'messages',
        loadComponent: () =>
          import('./features/messages/messages.component').then((m) => m.MessagesComponent),
      },
      {
        path: 'search',
        loadComponent: () =>
          import('./features/search/search-page.component').then((m) => m.SearchPageComponent),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports.component').then((m) => m.ReportsComponent),
      },
      {
        path: 'calendar',
        loadComponent: () =>
          import('./features/calendar/calendar.component').then((m) => m.CalendarComponent),
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
