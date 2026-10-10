import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ADMIN_API } from '../api/admin-api.service';
import { AdminAuthService } from '../auth/admin-auth.service';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Sends the session cookie and, on mutations, the in-memory CSRF token; a dead session returns the admin to sign-in. */
export const adminApiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(ADMIN_API)) return next(req);
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  const headers = SAFE.has(req.method) || !auth.csrfToken() ? req.headers : req.headers.set('X-CSRF-Token', auth.csrfToken());

  return next(req.clone({ withCredentials: true, headers })).pipe(
    catchError((error: HttpErrorResponse) => {
      // A 401 from sign-in is "wrong password", and from the bootstrap probe is just "signed out": neither redirects.
      const probe = req.url.includes('/session/');
      if (error.status === 401 && !probe) {
        auth.clear();
        void router.navigate(['/login']);
      }
      // The token went stale (the session was replaced in another tab): fetch the current one so a retry works.
      if (error.status === 403 && error.error?.error?.code === 'csrf_invalid' && !probe) {
        void auth.bootstrap().then((ok) => { if (!ok) void router.navigate(['/login']); });
      }
      return throwError(() => error);
    }),
  );
};
