import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { vi, type Mock } from 'vitest';
import { apiInterceptor } from './api.interceptor';

describe('apiInterceptor 401 handling', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let navigate: Mock;

  beforeEach(() => {
    navigate = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  const fail401 = (url: string) => {
    http.get(url).subscribe({ error: () => undefined });
    backend.expectOne(url).flush({}, { status: 401, statusText: 'Unauthorized' });
  };

  it('leaves a 401 from the /staff/me session probe to the guards (no redirect loop)', () => {
    fail401('/api/v1/staff/me');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('still sends any other 401 to /login, including /staff/messages', () => {
    fail401('/api/v1/staff/messages/abc/replies');
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});
