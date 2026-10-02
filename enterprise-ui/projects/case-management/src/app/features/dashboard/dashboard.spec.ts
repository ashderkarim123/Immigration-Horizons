import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { DashboardMetrics } from '../../core/api/dashboard.types';
import { Dashboard } from './dashboard';

describe('Dashboard', () => {
  it('links recent cases with routerLink by id, so they stay under the /staff base href', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    /** Shaped like GET /api/v1/staff/dashboard. */
    const data: DashboardMetrics = {
      role: 'pm',
      myCases: 4,
      unassignedCases: 0,
      upcomingDeadlines: 1,
      documentsAwaitingReview: 0,
      overdueDocumentRequests: 0,
      unansweredQueries: 0,
      queriesAwaitingScheduling: 0,
      unreadClientMessages: 2,
      myOpenTasks: 3,
      myOverdueTasks: 0,
      recentCases: [
        {
          id: '64b0f0f0f0f0f0f0f0f0f0a1',
          caseNumber: 'IH-2026-AAA111',
          title: 'Alpha petition',
          caseType: 'eb2_niw',
          currentStage: 'drafting',
          priority: 'high',
          targetFilingDate: null,
          updatedAt: '2026-01-01T10:00:00.000Z',
        },
      ],
      myTasks: [{ id: 't1', title: 'Collect transcripts', type: 'general', status: 'pending', priority: 'medium', dueDate: null }],
    };
    http.expectOne('/api/v1/staff/dashboard').flush({ data, meta: { requestId: 'r' } });
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('table a') as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('IH-2026-AAA111');
    // routerLink resolves through the router (and therefore the <base href="/staff/">), a raw href would not
    expect(link.getAttribute('href')).toBe('/cases/64b0f0f0f0f0f0f0f0f0f0a1');
    expect(fixture.nativeElement.textContent).toContain('Collect transcripts');
    http.verify();
  });
});
