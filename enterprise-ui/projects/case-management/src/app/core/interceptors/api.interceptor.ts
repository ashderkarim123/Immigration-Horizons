import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';

export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const authService = inject(AuthService);

  // If request is going to our API, we need credentials to send the cookie
  if (req.url.startsWith('/api/v1')) {
    req = req.clone({
      withCredentials: true
    });
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Handle 401 Unauthorized globally
      if (error.status === 401 && !req.url.includes('/staff/session/login')) {
        // Clear state and force re-login
        authService.isAuthenticated.set(false);
        router.navigate(['/login']);
      }
      // Handle 403 Forbidden globally if it's due to mustChangePassword
      if (error.status === 403 && error.error?.error?.code === 'password_change_required') {
        router.navigate(['/setup-password']);
      }
      return throwError(() => error);
    })
  );
};
