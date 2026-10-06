import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiResponse, ApiService } from './api.service';
import {
  CalendarConfig,
  CalendarKind,
  CalendarResponse,
  CalendarScope,
  CaseCalendarEventDto,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from './calendar.types';

export interface CalendarQuery {
  from: string;
  to: string;
  timeZone?: string;
  scope: CalendarScope;
  /** Omitted (null) means every kind the server allows. */
  kinds: CalendarKind[] | null;
  caseId?: string | null;
  includeCompleted?: boolean;
}

/** The calendar is a read-time projection; only manual events are written here, and every write answers with the refreshed event. */
@Injectable({ providedIn: 'root' })
export class CalendarApi {
  private api = inject(ApiService);

  config(): Observable<ApiResponse<CalendarConfig>> {
    return this.api.get<CalendarConfig>('/staff/calendar/config');
  }

  query(q: CalendarQuery): Observable<ApiResponse<CalendarResponse>> {
    return this.api.get<CalendarResponse>('/staff/calendar', {
      from: q.from,
      to: q.to,
      timeZone: q.timeZone || null,
      scope: q.scope,
      kinds: q.kinds && q.kinds.length ? q.kinds.join(',') : null,
      caseId: q.caseId || null,
      includeCompleted: q.includeCompleted ? 'true' : null,
    });
  }

  savePreferences(fields: { timeZone?: string | null; deadlineReminders?: boolean; appointmentReminders?: boolean }): Observable<ApiResponse<CalendarConfig>> {
    return this.api.patch<CalendarConfig>('/staff/calendar/preferences', fields);
  }

  getEvent(eventId: string): Observable<ApiResponse<CaseCalendarEventDto>> {
    return this.api.get<CaseCalendarEventDto>(`/staff/calendar-events/${eventId}`);
  }

  createEvent(caseId: string, input: CreateCalendarEventInput): Observable<ApiResponse<CaseCalendarEventDto>> {
    return this.api.post<CaseCalendarEventDto>(`/staff/cases/${caseId}/calendar-events`, input);
  }

  updateEvent(eventId: string, input: UpdateCalendarEventInput): Observable<ApiResponse<CaseCalendarEventDto>> {
    return this.api.patch<CaseCalendarEventDto>(`/staff/calendar-events/${eventId}`, input);
  }

  cancelEvent(eventId: string): Observable<ApiResponse<CaseCalendarEventDto>> {
    return this.api.post<CaseCalendarEventDto>(`/staff/calendar-events/${eventId}/cancel`, {});
  }
}
