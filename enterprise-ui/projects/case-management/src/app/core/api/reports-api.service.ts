import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';
import { ReportFilters, ReportName, ReportMeta } from './reports.types';

/** The query string shared by a report and its CSV export: one function, so the export can never carry different filters. */
export function reportParams(report: ReportName, f: ReportFilters): Record<string, string> {
  const p: Record<string, string> = { scope: f.scope };
  const put = (k: string, v: string | null) => { if (v) p[k] = v; };
  if (report === 'overview' || report === 'pipeline') { put('from', f.from); put('to', f.to); }
  put('caseType', f.caseType);
  put('stage', f.stage);
  put('priority', f.priority);
  if (report === 'deadlines' || report === 'review-queues') put('source', f.source);
  if (report === 'pipeline') put('granularity', f.granularity);
  return p;
}

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private api = inject(ApiService);

  load<T>(report: ReportName, filters: ReportFilters): Observable<{ data: T; meta: ReportMeta }> {
    return this.api.get<T>(`/staff/reports/${report}`, reportParams(report, filters)).pipe(
      map((res) => ({ data: res.data, meta: (res as unknown as { meta: ReportMeta }).meta })),
    );
  }

  /** The CSV download URL. A plain same-origin link: the browser sends the session cookie and the server streams the file. */
  exportUrl(report: ReportName, filters: ReportFilters): string {
    const params = new URLSearchParams({ report, ...reportParams(report, filters) });
    return `${this.api.basePath}/staff/reports/export.csv?${params.toString()}`;
  }
}
