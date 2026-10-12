import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { MailTabComponent } from './mail-tab.component';

const URL = '/api/v1/staff/cases/c1/mail';

describe('MailTabComponent', () => {
  function mount() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MailTabComponent);
    fixture.componentRef.setInput('caseId', 'c1');
    fixture.detectChanges();
    return { http, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('lists linked emails as links into Mail by message id, with the saved sender and who linked them', async () => {
    const { http, fixture, el } = mount();
    http.expectOne(URL).flush({ data: { items: [{ id: 'l1', messageId: 'AAMk-1=', caseId: 'c1', subject: 'Question', from: { name: 'Alex', address: 'alex@example.com' }, messageDate: '2026-10-01T12:00:00.000Z', linkedByName: 'Pat PM', linkedAt: '' }] }, meta: {} });
    fixture.detectChanges();
    const link = el.querySelector('.list a')!;
    expect(link.textContent).toBe('Question');
    expect(link.getAttribute('href')).toBe('/mail?message=AAMk-1%3D');
    expect(el.textContent).toContain('Alex');
    expect(el.textContent).toContain('linked by Pat PM');
    http.verify();
  });

  it('explains an empty case, and offers a retry when loading fails', () => {
    const { http, fixture, el } = mount();
    http.expectOne(URL).flush({ error: { code: 'forbidden', message: 'You do not have permission to perform this action.' } }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('You do not have permission');
    (el.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    http.expectOne(URL).flush({ data: { items: [] }, meta: {} });
    fixture.detectChanges();
    expect(el.textContent).toContain('No emails linked yet');
    http.verify();
  });
});
