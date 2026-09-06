/**
 * Core API service foundation.
 * Phase 01: stub only — no real API calls yet.
 */
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ApiService {
  /** Base API path — will be configured per environment in later phases. */
  readonly basePath = '/api/v1';
}
