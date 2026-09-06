import { Injectable, signal, inject } from '@angular/core';
import { ApiService } from '../api/api.service';
import { tap, catchError } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { Router } from '@angular/router';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  jobTitle: string;
  department: string;
}

export interface EmployeeData {
  user: UserProfile;
  role: { code: string; label: string };
  capabilities: string[];
  mustChangePassword: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly isAuthenticated = signal<boolean>(false);
  readonly isLoading = signal<boolean>(true);
  readonly user = signal<UserProfile | null>(null);
  readonly role = signal<{ code: string; label: string } | null>(null);
  readonly capabilities = signal<string[]>([]);
  readonly mustChangePassword = signal<boolean>(false);

  checkSession(): Observable<boolean> {
    return this.api.get<EmployeeData>('/staff/me').pipe(
      tap(res => {
        const data = res.data;
        this.isAuthenticated.set(true);
        this.user.set(data.user);
        this.role.set(data.role);
        this.capabilities.set(data.capabilities);
        this.mustChangePassword.set(data.mustChangePassword);
        this.isLoading.set(false);
      }),
      catchError(() => {
        this.isAuthenticated.set(false);
        this.user.set(null);
        this.role.set(null);
        this.capabilities.set([]);
        this.mustChangePassword.set(false);
        this.isLoading.set(false);
        return of(false);
      }),
      tap(success => {
        if (success === false) {
          // It's checked, but not successful. We don't route here, guards will handle it.
        }
      }),
      // Convert to boolean observable
      tap(() => true)
    ) as any;
  }

  logout() {
    this.api.post('/staff/session/logout', {}).subscribe({
      next: () => {
        this.isAuthenticated.set(false);
        this.user.set(null);
        this.role.set(null);
        this.capabilities.set([]);
        this.router.navigate(['/login']);
      },
      error: () => {
        // Fallback clear
        this.isAuthenticated.set(false);
        this.router.navigate(['/login']);
      }
    });
  }
}
