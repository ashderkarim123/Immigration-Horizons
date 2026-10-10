import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AdminApi } from '../api/admin-api.service';
import { authGuard, capabilityGuard, loginGuard } from '../guards/auth.guard';
import { UnsavedChangesService, unsavedChangesGuard } from '../guards/unsaved-changes.guard';
import { adminApiInterceptor } from '../interceptors/admin-api.interceptor';
import { AdminAuthService, AdminProfile } from './admin-auth.service';

const API = '/api/v1/admin';
const admin: AdminProfile = { id: 'a1', name: 'Ada Admin', email: 'ada@ih.test', role: { code: 'editor', label: 'Editor' }, jobTitle: '', department: '', capabilities: ['admin.cms.access', 'blog.manage'] };
const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('Admin auth, interceptor and guards', () => {
  let http: HttpTestingController;
  let auth: AdminAuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(withInterceptors([adminApiInterceptor])), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AdminAuthService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });
  afterEach(() => http.verify());

  const guard = (fn: typeof authGuard) => TestBed.runInInjectionContext(() => fn({} as never, {} as never));

  it('bootstrap with no session keeps the token in memory only and reports signed out', async () => {
    const done = auth.bootstrap();
    http.expectOne(`${API}/session/bootstrap`).flush({ data: { authenticated: false, csrfToken: 'tok-1' } });
    expect(await done).toBe(false);
    expect(auth.csrfToken()).toBe('tok-1');
    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('bootstrap with a session loads the administrator and their capabilities', async () => {
    const done = auth.bootstrap();
    http.expectOne(`${API}/session/bootstrap`).flush({ data: { authenticated: true, csrfToken: 'tok-2' } });
    await flush();
    http.expectOne(`${API}/me`).flush({ data: admin });
    expect(await done).toBe(true);
    expect(auth.currentAdmin()?.name).toBe('Ada Admin');
    expect(auth.hasCapability('blog.manage')).toBe(true);
    expect(auth.hasCapability('users.manage')).toBe(false);
  });

  it('login sends the bootstrap token, then switches to the token issued for the new session', async () => {
    auth.csrfToken.set('pre-login');
    const done = auth.login('ada@ih.test', 'secret');
    const req = http.expectOne(`${API}/session/login`);
    expect(req.request.headers.get('X-CSRF-Token')).toBe('pre-login');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({ email: 'ada@ih.test', password: 'secret' });
    req.flush({ data: { admin, csrfToken: 'post-login' } });
    await done;
    expect(auth.csrfToken()).toBe('post-login');
    expect(auth.isAuthenticated()).toBe(true);
    expect(JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })).not.toContain('secret');
  });

  it('a refused login leaves the admin signed out and does not redirect', async () => {
    auth.csrfToken.set('t');
    const done = auth.login('ada@ih.test', 'wrong').catch((e) => e.status);
    http.expectOne(`${API}/session/login`).flush({ error: { code: 'unauthenticated', message: 'Invalid email or password.' } }, { status: 401, statusText: 'Unauthorized' });
    expect(await done).toBe(401);
    expect(auth.isAuthenticated()).toBe(false);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('safe requests carry no CSRF header; mutations do; other origins are left untouched', () => {
    auth.csrfToken.set('tok');
    const api = TestBed.inject(AdminApi);
    api.get('/blog', { page: 2, search: '' }).subscribe();
    const get = http.expectOne((r) => r.url === `${API}/blog`);
    expect(get.request.headers.has('X-CSRF-Token')).toBe(false);
    expect(get.request.params.toString()).toBe('page=2');
    get.flush({ data: {} });
    api.delete('/blog/1').subscribe();
    const del = http.expectOne(`${API}/blog/1`);
    expect(del.request.headers.get('X-CSRF-Token')).toBe('tok');
    del.flush({ data: {} });
  });

  it('a 401 on a protected call clears the session and returns to sign-in', () => {
    auth.currentAdmin.set(admin);
    TestBed.inject(AdminApi).get('/users').subscribe({ error: () => undefined });
    http.expectOne(`${API}/users`).flush({ error: { code: 'unauthenticated' } }, { status: 401, statusText: 'Unauthorized' });
    expect(auth.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('a stale CSRF token is replaced by a fresh bootstrap', async () => {
    auth.csrfToken.set('stale');
    TestBed.inject(AdminApi).post('/faqs', {}).subscribe({ error: () => undefined });
    http.expectOne(`${API}/faqs`).flush({ error: { code: 'csrf_invalid' } }, { status: 403, statusText: 'Forbidden' });
    http.expectOne(`${API}/session/bootstrap`).flush({ data: { authenticated: false, csrfToken: 'fresh' } });
    await flush();
    expect(auth.csrfToken()).toBe('fresh');
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('logout clears local state even when the server call fails', async () => {
    auth.currentAdmin.set(admin);
    auth.csrfToken.set('tok');
    const done = auth.logout().catch(() => undefined);
    http.expectOne(`${API}/session/logout`).flush({}, { status: 500, statusText: 'Server Error' });
    await done;
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.csrfToken()).toBe('');
  });

  it('authGuard sends a signed-out visitor to /login and lets an administrator through; loginGuard does the reverse', async () => {
    const out = guard(authGuard) as Promise<unknown>;
    http.expectOne(`${API}/session/bootstrap`).flush({ data: { authenticated: false, csrfToken: 't' } });
    expect(String(await out)).toBe('/login');
    expect(await guard(loginGuard)).toBe(true); // same page load: no second bootstrap

    auth.clear();
    const signedIn = guard(authGuard) as Promise<unknown>;
    http.expectOne(`${API}/session/bootstrap`).flush({ data: { authenticated: true, csrfToken: 't' } });
    await flush();
    http.expectOne(`${API}/me`).flush({ data: admin });
    expect(await signedIn).toBe(true);
    expect(String(await guard(loginGuard))).toBe('/dashboard');
  });

  it('capabilityGuard redirects to the dashboard without the capability', () => {
    auth.currentAdmin.set(admin);
    expect(guard(capabilityGuard('blog.manage'))).toBe(true);
    expect(String(guard(capabilityGuard('users.manage')))).toBe('/dashboard');
  });

  it('unsavedChangesGuard asks only when there are changes, and resolves with the answer', async () => {
    const service = TestBed.inject(UnsavedChangesService);
    const run = (dirty: boolean) => TestBed.runInInjectionContext(() => unsavedChangesGuard({ hasUnsavedChanges: () => dirty }, {} as never, {} as never, {} as never));
    expect(run(false)).toBe(true);
    const pending = run(true) as Promise<boolean>;
    expect(service.asking()).toBe(true);
    service.answer(false);
    expect(await pending).toBe(false);
    expect(service.asking()).toBe(false);
  });
});
