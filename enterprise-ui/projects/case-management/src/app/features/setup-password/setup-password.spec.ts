import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { MIN_PASSWORD_LENGTH, SetupPasswordComponent } from './setup-password.component';

const meta = { requestId: 'r' };
const LONG_ENOUGH = 'a-twelve-char-pw';

describe('SetupPasswordComponent', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SetupPasswordComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, http };
  }

  it('matches the server minimum (12) and tells the user so', () => {
    const { fixture } = setup();
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(fixture.nativeElement.textContent).toContain('at least 12 characters');
  });

  it('rejects an 11-character password and a mismatched confirmation client-side', () => {
    const { component } = setup();
    component.pwdForm.setValue({ currentPassword: 'temp-password', newPassword: 'only-11-chr', confirmPassword: 'only-11-chr' });
    expect(component.pwdForm.invalid).toBe(true);

    component.pwdForm.setValue({ currentPassword: 'temp-password', newPassword: LONG_ENOUGH, confirmPassword: 'something-else-entirely' });
    expect(component.pwdForm.hasError('mismatch')).toBe(true);
    expect(component.pwdForm.invalid).toBe(true);

    component.pwdForm.setValue({ currentPassword: 'temp-password', newPassword: LONG_ENOUGH, confirmPassword: LONG_ENOUGH });
    expect(component.pwdForm.valid).toBe(true);
  });

  it('posts currentPassword, newPassword and confirmPassword, then re-reads the session and continues to the dashboard', () => {
    const { component, http } = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.pwdForm.setValue({ currentPassword: 'temp-password', newPassword: LONG_ENOUGH, confirmPassword: LONG_ENOUGH });

    component.onSubmit();
    const setup$ = http.expectOne('/api/v1/staff/account/initial-password');
    expect(setup$.request.body).toEqual({ currentPassword: 'temp-password', newPassword: LONG_ENOUGH, confirmPassword: LONG_ENOUGH });
    setup$.flush({ data: { success: true }, meta });

    http.expectOne('/api/v1/staff/me').flush({
      data: {
        user: { id: 'u1', name: 'Temp', email: 't@ih.test', avatar: null, jobTitle: '', department: '' },
        role: { code: 'admin', label: 'Admin' },
        capabilities: ['cases.view'],
        mustChangePassword: false,
      },
      meta,
    });
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
    http.verify();
  });

  it('surfaces the server field error from the Express envelope', () => {
    const { component, http } = setup();
    component.pwdForm.setValue({ currentPassword: 'wrong', newPassword: LONG_ENOUGH, confirmPassword: LONG_ENOUGH });
    component.onSubmit();
    http
      .expectOne('/api/v1/staff/account/initial-password')
      .flush({ error: { code: 'unauthenticated', message: 'Invalid current password.', fieldErrors: null } }, { status: 401, statusText: 'Unauthorized' });
    expect(component.errorMessage()).toBe('Invalid current password.');
    expect(component.isSubmitting()).toBe(false);
  });
});
