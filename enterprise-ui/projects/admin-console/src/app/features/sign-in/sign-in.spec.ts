import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AdminAuthService } from '../../core/auth/admin-auth.service';
import { AdminSignIn } from './sign-in';

describe('Admin sign-in', () => {
  const auth = { login: vi.fn(), bootstrap: vi.fn().mockResolvedValue(false) };

  async function render() {
    auth.login.mockReset();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AdminAuthService, useValue: auth }] });
    const fixture = TestBed.createComponent(AdminSignIn);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const type = async (id: string, value: string) => {
      const input = root.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const submit = async () => {
      root.querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, root, type, submit };
  }

  it('is a labelled email/password form with no self-service or third-party sign-in', async () => {
    const { root } = await render();
    expect(root.querySelector('label[for="email"]')?.textContent).toBe('Email');
    expect(root.querySelector('#password')?.getAttribute('autocomplete')).toBe('current-password');
    expect(root.textContent).toContain('Authorized administrators only.');
    expect(root.textContent).not.toMatch(/Google|Forgot|Sign up|Create account/i);
    expect(root.querySelector('img')?.getAttribute('alt')).toBe('Immigration Horizons');
  });

  it('show/hide toggles the password field and says so to assistive technology', async () => {
    const { root, fixture } = await render();
    const toggle = root.querySelector('.password button') as HTMLButtonElement;
    expect(root.querySelector('#password')?.getAttribute('type')).toBe('password');
    toggle.click();
    fixture.detectChanges();
    expect(root.querySelector('#password')?.getAttribute('type')).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('signs in with the trimmed email and goes to the dashboard', async () => {
    const { type, submit } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    auth.login.mockResolvedValue(undefined);
    await type('email', '  ada@ih.test ');
    await type('password', 'secret');
    await submit();
    expect(auth.login).toHaveBeenCalledWith('ada@ih.test', 'secret');
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('shows the generic refusal for a 401 and never says whether the account exists', async () => {
    const { root, type, submit } = await render();
    auth.login.mockRejectedValue(new HttpErrorResponse({ status: 401, error: { error: { message: 'Invalid email or password.' } } }));
    await type('email', 'nobody@ih.test');
    await type('password', 'x');
    await submit();
    expect(root.querySelector('[role="alert"]')?.textContent).toBe('Invalid email or password.');
    expect((root.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not call the server with an empty field, and reports an outage without detail', async () => {
    const { root, type, submit } = await render();
    await submit();
    expect(auth.login).not.toHaveBeenCalled();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Enter your email and password');

    auth.login.mockRejectedValue(new HttpErrorResponse({ status: 500, error: { error: { message: 'stack trace' } } }));
    await type('email', 'ada@ih.test');
    await type('password', 'x');
    await submit();
    expect(root.querySelector('[role="alert"]')?.textContent).toBe('Sign-in is unavailable right now. Please try again.');
  });
});
