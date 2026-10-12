import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';
import { MailCaseLink, MailFolder, MailListItem, MailMessage, MailPage, MailRequest, MailSendResult, MailStatus } from './mail.types';

const BASE = '/staff/mail';
// An id is opaque and may contain "=", "+" or "/": it always travels URL-encoded.
const path = (id: string) => `${BASE}/messages/${encodeURIComponent(id)}`;

@Injectable({ providedIn: 'root' })
export class MailApi {
  private readonly api = inject(ApiService);

  status(): Observable<MailStatus> { return this.api.get<MailStatus>(`${BASE}/status`).pipe(map((r) => r.data)); }
  unread(): Observable<{ unread: number }> { return this.api.get<{ unread: number }>(`${BASE}/unread`).pipe(map((r) => r.data)); }
  clientMail(clientId: string): Observable<{ items: MailListItem[]; address: string }> { return this.api.get<{ items: MailListItem[]; address: string }>(`/staff/clients/${encodeURIComponent(clientId)}/mail`).pipe(map((r) => r.data)); }
  list(folder: MailFolder, page: number): Observable<MailPage> { return this.api.get<MailPage>(`${BASE}/messages`, { folder, page, limit: 20 }).pipe(map((r) => r.data)); }
  get(id: string): Observable<MailMessage> { return this.api.get<MailMessage>(path(id)).pipe(map((r) => r.data)); }
  setRead(id: string, isRead: boolean): Observable<{ isRead: boolean }> { return this.api.post<{ isRead: boolean }>(`${path(id)}/read`, { isRead }).pipe(map((r) => r.data)); }
  send(input: MailRequest): Observable<MailSendResult> { return this.api.post<MailSendResult>(`${BASE}/messages`, input).pipe(map((r) => r.data)); }
  reply(id: string, input: MailRequest): Observable<MailSendResult> { return this.api.post<MailSendResult>(`${path(id)}/reply`, input).pipe(map((r) => r.data)); }
  link(id: string, caseId: string): Observable<MailCaseLink> { return this.api.post<MailCaseLink>(`${path(id)}/links`, { caseId }).pipe(map((r) => r.data)); }
  unlink(linkId: string): Observable<{ deleted: boolean }> { return this.api.delete<{ deleted: boolean }>(`${BASE}/links/${encodeURIComponent(linkId)}`).pipe(map((r) => r.data)); }
  caseLinks(caseId: string): Observable<MailCaseLink[]> { return this.api.get<{ items: MailCaseLink[] }>(`/staff/cases/${encodeURIComponent(caseId)}/mail`).pipe(map((r) => r.data.items)); }
  attachment(messageId: string, attachmentId: string): Observable<Blob> { return this.api.download(`${path(messageId)}/attachments/${encodeURIComponent(attachmentId)}`); }
}
