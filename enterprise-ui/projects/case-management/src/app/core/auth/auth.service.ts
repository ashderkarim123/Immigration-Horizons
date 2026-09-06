/**
 * Core auth service foundation.
 * Phase 01: stub only — no real authentication yet.
 */
import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthService {
  /** Whether the user is authenticated. Stub for Phase 01. */
  readonly isAuthenticated = signal(false);

  /** Current user display name. Stub for Phase 01. */
  readonly userName = signal<string | null>(null);
}
