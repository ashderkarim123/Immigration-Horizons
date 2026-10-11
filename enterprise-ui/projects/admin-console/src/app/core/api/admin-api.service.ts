import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

interface Envelope<T> { data: T }
export interface Page<T> { items: T[]; page: number; limit: number; total: number; totalPages: number }
export type Query = Record<string, string | number | boolean | null | undefined>;

/** Same-origin only: the console never names a host, so the build works wherever it is served. */
export const ADMIN_API = '/api/v1/admin';

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);

  get<T>(path: string, query?: Query): Observable<T> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query ?? {})) if (value !== null && value !== undefined && value !== '') params = params.set(key, String(value));
    return this.http.get<Envelope<T>>(ADMIN_API + path, { params }).pipe(map((r) => r.data));
  }
  post<T>(path: string, body: unknown = {}): Observable<T> { return this.http.post<Envelope<T>>(ADMIN_API + path, body).pipe(map((r) => r.data)); }
  put<T>(path: string, body: unknown): Observable<T> { return this.http.put<Envelope<T>>(ADMIN_API + path, body).pipe(map((r) => r.data)); }
  patch<T>(path: string, body: unknown): Observable<T> { return this.http.patch<Envelope<T>>(ADMIN_API + path, body).pipe(map((r) => r.data)); }
  delete<T>(path: string): Observable<T> { return this.http.delete<Envelope<T>>(ADMIN_API + path).pipe(map((r) => r.data)); }
  /** Multipart upload with progress events. */
  upload<T>(path: string, form: FormData): Observable<HttpEvent<Envelope<T>>> {
    return this.http.post<Envelope<T>>(ADMIN_API + path, form, { reportProgress: true, observe: 'events' });
  }
}
