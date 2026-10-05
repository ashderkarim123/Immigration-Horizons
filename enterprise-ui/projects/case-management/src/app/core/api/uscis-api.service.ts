import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiResponse, ApiService } from './api.service';
import { UscisCaseList, UscisFilingDetail, UscisFilingFields, UscisProviderStatus, UscisStatusFields } from './uscis.types';

/** Every mutation answers with the refreshed filing detail, so callers replace state instead of merging. */
@Injectable({ providedIn: 'root' })
export class UscisApi {
  private api = inject(ApiService);

  providerStatus(): Observable<ApiResponse<UscisProviderStatus>> {
    return this.api.get<UscisProviderStatus>('/staff/uscis/provider-status');
  }

  listForCase(caseId: string): Observable<ApiResponse<UscisCaseList>> {
    return this.api.get<UscisCaseList>(`/staff/cases/${caseId}/uscis`);
  }

  detail(filingId: string): Observable<ApiResponse<UscisFilingDetail>> {
    return this.api.get<UscisFilingDetail>(`/staff/uscis/${filingId}`);
  }

  create(caseId: string, fields: UscisFilingFields): Observable<ApiResponse<UscisFilingDetail>> {
    return this.api.post<UscisFilingDetail>(`/staff/cases/${caseId}/uscis`, fields);
  }

  update(filingId: string, fields: UscisFilingFields): Observable<ApiResponse<UscisFilingDetail>> {
    return this.api.patch<UscisFilingDetail>(`/staff/uscis/${filingId}`, fields);
  }

  addStatus(filingId: string, fields: UscisStatusFields): Observable<ApiResponse<UscisFilingDetail>> {
    return this.api.post<UscisFilingDetail>(`/staff/uscis/${filingId}/status-events`, fields);
  }

  sync(filingId: string): Observable<ApiResponse<UscisFilingDetail>> {
    return this.api.post<UscisFilingDetail>(`/staff/uscis/${filingId}/sync`, {});
  }

  archive(filingId: string): Observable<ApiResponse<UscisFilingDetail>> {
    return this.api.post<UscisFilingDetail>(`/staff/uscis/${filingId}/archive`, {});
  }
}
