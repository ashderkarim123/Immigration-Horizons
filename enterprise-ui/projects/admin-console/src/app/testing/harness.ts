import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminAuthService } from '../core/auth/admin-auth.service';

/** Test-only: mounts a feature component against a fake HTTP backend and a capability-bearing administrator. */
export const EDITOR_CAPS = ['admin.cms.access', 'blog.manage', 'faqs.manage', 'testimonials.manage', 'media.manage', 'seo.manage'];
export const ADMIN_CAPS = [...EDITOR_CAPS, 'settings.manage', 'users.manage', 'security_events.view'];
const API = '/api/v1/admin';

export function mount<T>(component: Type<T>, options: { capabilities?: string[]; inputs?: Record<string, unknown> } = {}) {
  const capabilities = options.capabilities ?? EDITOR_CAPS;
  const auth = {
    capabilities: signal(capabilities),
    currentAdmin: signal({ id: 'me', name: 'Ada Admin', email: 'ada@ih.test', role: { code: 'admin', label: 'Admin' }, jobTitle: '', department: '', capabilities }),
    hasCapability: (capability: string) => capabilities.includes(capability),
  };
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: AdminAuthService, useValue: auth }] });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(options.inputs ?? {})) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;

  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  /** The request to `method path` (query string ignored); fails the test if it was not made exactly once. */
  const request = (method: string, path: string): TestRequest => http.expectOne((r) => r.method === method && r.url === API + path);
  const respond = async (method: string, path: string, data: unknown) => {
    const req = request(method, path);
    req.flush({ data });
    await settle();
    return req;
  };
  const fail = async (method: string, path: string, status: number, error: { code?: string; message?: string; fieldErrors?: { field: string; message: string }[] }) => {
    request(method, path).flush({ error }, { status, statusText: 'Error' });
    await settle();
  };
  const type = async (selector: string, value: string) => {
    const el = root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
    if (!el) throw new Error(`No element for ${selector}`);
    el.value = value;
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input'));
    await settle();
  };
  /** A button or link-button whose visible text starts with `text`. */
  const button = (text: string, scope: ParentNode = root) =>
    Array.from(scope.querySelectorAll<HTMLElement>('button, a.btn')).find((el) => (el.textContent ?? '').trim().startsWith(text));
  const click = async (text: string, scope: ParentNode = root) => {
    const el = button(text, scope);
    if (!el) throw new Error(`No button starting with "${text}"`);
    el.click();
    await settle();
  };
  const submit = async (selector = 'form') => {
    root.querySelector(selector)!.dispatchEvent(new Event('submit'));
    await settle();
  };
  const text = (selector: string) => (root.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const dialog = () => root.querySelector<HTMLElement>('[role="dialog"]');

  return { fixture, component: fixture.componentInstance, root, http, settle, request, respond, fail, type, button, click, submit, text, dialog };
}

export const paged = <T>(items: T[], extra: Record<string, unknown> = {}) => ({ items, page: 1, limit: 20, total: items.length, totalPages: 1, ...extra });
