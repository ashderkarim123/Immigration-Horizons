import { Routes } from '@angular/router';
import { authGuard, capabilityGuard, loginGuard } from './core/guards/auth.guard';
import { unsavedChangesGuard } from './core/guards/unsaved-changes.guard';
import { AdminAppShell } from './layout/app-shell/app-shell';

const title = (page: string) => `${page} · Admin Console`;

export const routes: Routes = [
  { path: 'login', canActivate: [loginGuard], title: title('Sign in'), loadComponent: () => import('./features/sign-in/sign-in').then((m) => m.AdminSignIn) },
  {
    path: '',
    component: AdminAppShell,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', title: title('Dashboard'), loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.AdminDashboard) },

      // Website content: every signed-in administrator may read; the server decides who may change what.
      { path: 'content', redirectTo: 'content/blog', pathMatch: 'full' },
      { path: 'content/blog', title: title('Blog'), loadComponent: () => import('./features/blog/blog-list').then((m) => m.BlogListComponent) },
      { path: 'content/blog/new', title: title('New post'), canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./features/blog/blog-editor').then((m) => m.BlogEditorComponent) },
      { path: 'content/blog/:id', title: title('Edit post'), canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./features/blog/blog-editor').then((m) => m.BlogEditorComponent) },
      { path: 'content/faqs', title: title('FAQs'), loadComponent: () => import('./features/faqs/faqs').then((m) => m.FaqsComponent) },
      { path: 'content/testimonials', title: title('Testimonials'), loadComponent: () => import('./features/testimonials/testimonials').then((m) => m.TestimonialsComponent) },
      { path: 'content/media', title: title('Media'), loadComponent: () => import('./features/media/media').then((m) => m.MediaComponent) },
      { path: 'content/services', title: title('Services'), loadComponent: () => import('./features/seo/seo').then((m) => m.ServicesComponent) },
      { path: 'content/seo', title: title('SEO'), loadComponent: () => import('./features/seo/seo').then((m) => m.SeoListComponent) },
      { path: 'content/seo/:pageRef', title: title('Edit SEO'), canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./features/seo/seo').then((m) => m.SeoEditorComponent) },

      // Platform and access: hidden from navigation and guarded here for convenience; the API refuses regardless.
      { path: 'settings', title: title('Settings'), canActivate: [capabilityGuard('settings.manage')], canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./features/platform/platform').then((m) => m.SettingsComponent) },
      { path: 'integrations', title: title('Integrations'), canActivate: [capabilityGuard('settings.manage')], loadComponent: () => import('./features/platform/platform').then((m) => m.IntegrationsComponent) },
      { path: 'users', title: title('Users'), canActivate: [capabilityGuard('users.manage')], loadComponent: () => import('./features/users/users').then((m) => m.UsersComponent) },
      { path: 'users/new', title: title('New user'), canActivate: [capabilityGuard('users.manage')], canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./features/users/users').then((m) => m.UserDetailComponent) },
      { path: 'users/:id', title: title('User'), canActivate: [capabilityGuard('users.manage')], canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./features/users/users').then((m) => m.UserDetailComponent) },
      { path: 'roles', title: title('Roles'), canActivate: [capabilityGuard('users.manage')], loadComponent: () => import('./features/platform/platform').then((m) => m.RolesComponent) },
      { path: 'security', title: title('Security Events'), canActivate: [capabilityGuard('security_events.view')], loadComponent: () => import('./features/security/security').then((m) => m.SecurityEventsComponent) },

      { path: '**', title: title('Not found'), loadComponent: () => import('./features/not-found/not-found').then((m) => m.AdminNotFound) },
    ],
  },
];
