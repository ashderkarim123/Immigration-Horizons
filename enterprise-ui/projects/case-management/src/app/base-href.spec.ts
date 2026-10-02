import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF, Location, LocationStrategy, PathLocationStrategy, PlatformLocation } from '@angular/common';
import { MOCK_PLATFORM_LOCATION_CONFIG, MockPlatformLocation } from '@angular/common/testing';

/**
 * Release Gate 01 (ADR-024 §5): in production the app is served under
 * https://app.immigrationhorizons.com/staff/ (`<base href="/staff/">`) while the
 * router stays rooted at /login, /dashboard, … These tests pin the mapping
 * between the two, including the exact /staff URL nginx serves without a
 * redirect, so a routing change cannot silently break deep links.
 */
function locationAt(url: string): Location {
  TestBed.configureTestingModule({
    providers: [
      { provide: APP_BASE_HREF, useValue: '/staff/' },
      { provide: MOCK_PLATFORM_LOCATION_CONFIG, useValue: { startUrl: url } },
      { provide: PlatformLocation, useClass: MockPlatformLocation },
      { provide: LocationStrategy, useClass: PathLocationStrategy },
      Location,
    ],
  });
  return TestBed.inject(Location);
}

describe('production base href /staff/', () => {
  it('maps browser URLs under /staff/ to router paths rooted at /', () => {
    expect(locationAt('https://app.immigrationhorizons.com/staff/login').path()).toBe('/login');
  });

  it('maps a deep link with an id and the dashboard', () => {
    // Location instances are per TestBed; reset between URLs.
    TestBed.resetTestingModule();
    expect(locationAt('https://app.immigrationhorizons.com/staff/cases/64b0f0f0f0f0f0f0f0f0f0f0').path()).toBe('/cases/64b0f0f0f0f0f0f0f0f0f0f0');
    TestBed.resetTestingModule();
    expect(locationAt('https://app.immigrationhorizons.com/staff/dashboard').path()).toBe('/dashboard');
  });

  it('treats /staff and /staff/ as the router root, so the exact URL nginx serves without a redirect still boots', () => {
    expect(locationAt('https://app.immigrationhorizons.com/staff').path()).toBe('');
    TestBed.resetTestingModule();
    expect(locationAt('https://app.immigrationhorizons.com/staff/').path()).toBe('');
  });

  it('builds external URLs under /staff/, so navigate([\'/login\']) lands on /staff/login', () => {
    expect(locationAt('https://app.immigrationhorizons.com/staff/').prepareExternalUrl('/login')).toBe('/staff/login');
    TestBed.resetTestingModule();
    expect(locationAt('https://app.immigrationhorizons.com/staff/').prepareExternalUrl('/cases')).toBe('/staff/cases');
  });
});
