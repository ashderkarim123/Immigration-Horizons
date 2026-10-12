import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { MailUnreadService } from './mail-unread.service';

const URL = '/api/v1/staff/mail/unread';

describe('MailUnreadService', () => {
  let http: HttpTestingController;
  let service: MailUnreadService;
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(MailUnreadService);
  });
  afterEach(() => { service.stop(); vi.useRealTimers(); });

  it('counts on start, then once a minute, and not while the tab is hidden', () => {
    service.start();
    http.expectOne(URL).flush({ data: { unread: 4 }, meta: {} });
    expect(service.count()).toBe(4);

    vi.advanceTimersByTime(60_000);
    http.expectOne(URL).flush({ data: { unread: 6 }, meta: {} });
    expect(service.count()).toBe(6);

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    vi.advanceTimersByTime(120_000);
    http.expectNone(URL);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    http.verify();
  });

  it('starting twice does not double the polling, and stopping clears the count and the timer', () => {
    service.start();
    service.start();
    http.expectOne(URL).flush({ data: { unread: 2 }, meta: {} });
    service.stop();
    expect(service.count()).toBe(0);
    vi.advanceTimersByTime(180_000);
    http.expectNone(URL);
  });

  it('a failed count is silent and keeps the last number', () => {
    service.start();
    http.expectOne(URL).flush({ data: { unread: 3 }, meta: {} });
    vi.advanceTimersByTime(60_000);
    http.expectOne(URL).flush({ error: { code: 'mail_unavailable', message: 'x' } }, { status: 502, statusText: 'Bad Gateway' });
    expect(service.count()).toBe(3);
  });
});
