import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { Navigation } from './navigation';

describe('Navigation', () => {
  function labels(caps: string[]): string[] {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: { capabilities: signal(caps) } }] });
    const fixture = TestBed.createComponent(Navigation);
    fixture.detectChanges();
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).map((a) => a.textContent?.trim() ?? '');
  }

  it('offers Calendar only to someone with calendar.view, and links it to /calendar', () => {
    expect(labels(['cases.view'])).not.toContain('Calendar');
    TestBed.resetTestingModule();
    expect(labels(['cases.view', 'calendar.view'])).toContain('Calendar');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: { capabilities: signal(['calendar.view']) } }] });
    const fixture = TestBed.createComponent(Navigation);
    fixture.detectChanges();
    const link = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).find((a) => a.textContent?.includes('Calendar'));
    expect(link?.getAttribute('href')).toBe('/calendar');
  });

  it('keeps the existing entries: Tracking still follows uscis_tracking.view, Deadlines follows cases.view', () => {
    const all = labels(['cases.view', 'uscis_tracking.view', 'calendar.view']);
    expect(all).toEqual(expect.arrayContaining(['Dashboard', 'Cases', 'Tasks', 'Deadlines', 'Calendar', 'Tracking']));
    TestBed.resetTestingModule();
    expect(labels([])).toEqual(['Dashboard', 'Tasks']);
  });
});
