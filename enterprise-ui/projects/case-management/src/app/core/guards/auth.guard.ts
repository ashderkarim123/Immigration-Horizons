/**
 * Auth guard foundation.
 * Phase 01: always allows navigation — no real auth checks yet.
 */
import { CanActivateFn } from '@angular/router';

export const authGuard: CanActivateFn = () => {
  // Phase 01: always allow. Real guard will check AuthService in Phase 03.
  return true;
};
