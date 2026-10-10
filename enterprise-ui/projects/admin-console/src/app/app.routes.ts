import { Routes } from '@angular/router';
import { authGuard, loginGuard } from './core/guards/auth.guard';
import { AdminAppShell } from './layout/app-shell/app-shell';

export const routes: Routes = [
  { path: 'login', canActivate: [loginGuard], title: 'Sign in · Admin Console', loadComponent: () => import('./features/sign-in/sign-in').then((m) => m.AdminSignIn) },
  {
    path: '',
    component: AdminAppShell,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', title: 'Dashboard · Admin Console', loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.AdminDashboard) },
      { path: '**', title: 'Not found · Admin Console', loadComponent: () => import('./features/not-found/not-found').then((m) => m.AdminNotFound) },
    ],
  },
];
