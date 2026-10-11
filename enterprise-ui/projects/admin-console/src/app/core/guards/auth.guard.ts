import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../auth/admin-auth.service';

/** Everything inside the shell needs a real administrator session. */
export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  return (await inject(AdminAuthService).ensureSession()) ? true : router.createUrlTree(['/login']);
};

/** A signed-in administrator has no business on the sign-in page. */
export const loginGuard: CanActivateFn = async () => {
  const router = inject(Router);
  return (await inject(AdminAuthService).ensureSession()) ? router.createUrlTree(['/dashboard']) : true;
};

/** Navigation convenience only — the server checks the capability on every request. */
export const capabilityGuard = (capability: string): CanActivateFn => () => {
  const router = inject(Router);
  return inject(AdminAuthService).hasCapability(capability) ? true : router.createUrlTree(['/dashboard']);
};
