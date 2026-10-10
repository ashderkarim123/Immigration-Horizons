import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { AppShell } from './app-shell';

describe('AppShell search', () => {
  function mount() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: { capabilities: signal(['cases.view']), user: signal({ name: 'Pat' }), role: signal({ label: 'PM' }), logout: () => {} } },
      ],
    });
    const fixture = TestBed.createComponent(AppShell);
    fixture.detectChanges();
    return fixture;
  }

  it('the header has a real search control, and Ctrl+K opens the search dialog from anywhere in the shell', () => {
    const fixture = mount();
    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector('header .search-trigger') as HTMLButtonElement;
    expect(trigger?.textContent).toContain('Search');
    expect(el.querySelector('[role=dialog]')).toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('[role=dialog][aria-label=Search]')).toBeTruthy();
  });
});
