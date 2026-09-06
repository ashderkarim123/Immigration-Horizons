import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { map } from 'rxjs/operators';
import { of } from 'rxjs';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // If already loaded and authenticated
  if (!authService.isLoading() && authService.isAuthenticated()) {
    if (authService.mustChangePassword() && state.url !== '/setup-password') {
      return router.createUrlTree(['/setup-password']);
    }
    if (!authService.mustChangePassword() && state.url === '/setup-password') {
      return router.createUrlTree(['/dashboard']);
    }
    return true;
  }

  // If not loaded, we need to check session
  return authService.checkSession().pipe(
    map((res: any) => {
      // Because checkSession returns the response or false
      if (res !== false && authService.isAuthenticated()) {
        if (authService.mustChangePassword() && state.url !== '/setup-password') {
          return router.createUrlTree(['/setup-password']);
        }
        if (!authService.mustChangePassword() && state.url === '/setup-password') {
          return router.createUrlTree(['/dashboard']);
        }
        return true;
      }
      return router.createUrlTree(['/login']);
    })
  );
};

export const unauthGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isLoading() && authService.isAuthenticated()) {
    return router.createUrlTree(['/dashboard']);
  }

  return authService.checkSession().pipe(
    map((res: any) => {
      if (res !== false && authService.isAuthenticated()) {
        return router.createUrlTree(['/dashboard']);
      }
      return true;
    })
  );
};
