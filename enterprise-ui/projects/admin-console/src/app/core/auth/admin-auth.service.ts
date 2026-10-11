import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../api/admin-api.service';

export interface AdminProfile {
  id: string;
  name: string;
  email: string;
  role: { code: string; label: string };
  jobTitle: string;
  department: string;
  capabilities: string[];
}
interface Bootstrap { authenticated: boolean; csrfToken: string }

/**
 * Admin Console identity (ADR-029): the HttpOnly CMS session cookie, which this code cannot read. The only thing held
 * here is the session CSRF token, in memory — a reload asks the server for it again. Nothing is written to storage.
 * Deliberately separate from the Staff AuthService: that one is an EmployeeSession and is not an Admin identity.
 */
@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly api = inject(AdminApi);
  private session: Promise<boolean> | null = null;

  readonly currentAdmin = signal<AdminProfile | null>(null);
  readonly csrfToken = signal('');
  readonly isAuthenticated = computed(() => this.currentAdmin() !== null);
  readonly capabilities = computed(() => this.currentAdmin()?.capabilities ?? []);

  hasCapability(capability: string): boolean {
    return this.capabilities().includes(capability);
  }

  /** Fetches a fresh CSRF token and, when a session exists, the signed-in administrator. */
  async bootstrap(): Promise<boolean> {
    try {
      const boot = await firstValueFrom(this.api.get<Bootstrap>('/session/bootstrap'));
      this.csrfToken.set(boot.csrfToken);
      if (boot.authenticated) await this.loadMe();
      else this.currentAdmin.set(null);
    } catch {
      this.currentAdmin.set(null);
    }
    return this.isAuthenticated();
  }

  /** One bootstrap per page load, shared by every guard that runs during the first navigation. */
  ensureSession(): Promise<boolean> {
    return (this.session ??= this.bootstrap());
  }

  async loadMe(): Promise<void> {
    this.currentAdmin.set(await firstValueFrom(this.api.get<AdminProfile>('/me')));
  }

  async login(email: string, password: string): Promise<void> {
    if (!this.csrfToken()) await this.bootstrap();
    const res = await firstValueFrom(this.api.post<{ admin: AdminProfile; csrfToken: string }>('/session/login', { email, password }));
    // Sign-in regenerates the session, so the pre-login token is dead: use the one the response carries.
    this.csrfToken.set(res.csrfToken);
    this.currentAdmin.set(res.admin);
    this.session = Promise.resolve(true);
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.api.post('/session/logout'));
    } finally {
      this.clear();
    }
  }

  /** Forget the session locally (after sign-out, or when the server says it is gone). */
  clear(): void {
    this.currentAdmin.set(null);
    this.csrfToken.set('');
    this.session = null;
  }
}
