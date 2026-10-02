import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { Paginated } from '../../core/api/case.types';
import { ClientDetail, ClientListItem } from '../../core/api/client.types';
import { ClientsComponent } from './clients.component';
import { ClientDetailComponent } from './client-detail/client-detail.component';

const meta = { requestId: 'r' };

/** Shaped like GET /api/v1/staff/clients (server/routes/api/v1/staff/clients.js). */
const listItem: ClientListItem = {
  id: '64b0f0f0f0f0f0f0f0f0f0c1',
  displayName: 'Casey Client',
  firstName: 'Casey',
  lastName: 'Client',
  email: 'casey@example.com',
  status: 'active',
  caseCount: 1,
  lastLoginAt: null,
  createdAt: '2026-01-01T10:00:00.000Z',
};

describe('Clients directory', () => {
  let http: HttpTestingController;

  function setup(params: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParams: new BehaviorSubject(params) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ClientsComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('queries with search (not q) and a canonical status', () => {
    setup({ q: 'casey', status: 'locked' });
    const req = http.expectOne((r) => r.url === '/api/v1/staff/clients');
    expect(req.request.params.get('search')).toBe('casey');
    expect(req.request.params.has('q')).toBe(false);
    expect(req.request.params.get('status')).toBe('locked');
    req.flush({ data: { items: [], total: 0, page: 1, totalPages: 1, pageSize: 10 }, meta });
  });

  it('only offers statuses the ClientUser enum defines', () => {
    const fixture = setup();
    http.expectOne((r) => r.url === '/api/v1/staff/clients').flush({ data: { items: [], total: 0, page: 1, totalPages: 1, pageSize: 10 }, meta });
    expect(fixture.componentInstance.statuses.map((s) => s.value)).toEqual(['', 'active', 'pending', 'locked', 'disabled']);
  });

  it('renders displayName and flat pagination from the real response', () => {
    const fixture = setup();
    const data: Paginated<ClientListItem> = { items: [listItem], total: 41, page: 1, totalPages: 5, pageSize: 10 };
    http.expectOne((r) => r.url === '/api/v1/staff/clients').flush({ data, meta });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a.client-link').textContent.trim()).toBe('Casey Client');
    expect(fixture.nativeElement.querySelector('a.client-link').getAttribute('href')).toBe('/clients/64b0f0f0f0f0f0f0f0f0f0c1');
    expect(fixture.componentInstance.totalItems()).toBe(41);
    expect(fixture.componentInstance.totalPages()).toBe(5);
  });
});

describe('Client detail', () => {
  it('uses displayName and cases[].id, and shows no fabricated portal status', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'c1' }) } } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ClientDetailComponent);
    fixture.detectChanges();

    const detail: ClientDetail = {
      id: 'c1',
      displayName: 'Casey Client',
      firstName: 'Casey',
      lastName: 'Client',
      email: 'casey@example.com',
      phone: '',
      status: 'active',
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
      cases: [
        {
          id: '64b0f0f0f0f0f0f0f0f0f0a1',
          caseNumber: 'IH-2026-AAA111',
          title: 'Alpha petition',
          caseType: 'eb2_niw',
          currentStage: 'drafting',
          priority: 'high',
          targetFilingDate: null,
          archivedAt: null,
          updatedAt: '2026-01-01T10:00:00.000Z',
        },
      ],
    };
    http.expectOne('/api/v1/staff/clients/c1').flush({ data: detail, meta });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Casey Client');
    expect(text).not.toContain('Portal Status');
    const caseLink = fixture.nativeElement.querySelector('a[href="/cases/64b0f0f0f0f0f0f0f0f0f0a1"]');
    expect(caseLink?.textContent.trim()).toBe('IH-2026-AAA111');
    http.verify();
  });
});
