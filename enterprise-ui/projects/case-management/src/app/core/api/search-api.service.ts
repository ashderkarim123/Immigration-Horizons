import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';
import { SearchOutcome, SearchResponse, SearchType } from './search.types';

interface SearchEnvelope {
  data: SearchResponse;
  meta: { requestId: string; unavailableTypes?: SearchType[] };
}

/** Quick search (grouped, a few per source) and full results (one source, paginated). The query text is only ever sent as a parameter. */
@Injectable({ providedIn: 'root' })
export class SearchApi {
  private api = inject(ApiService);

  quick(q: string, limit = 5): Observable<SearchOutcome> {
    return this.run({ q, limit });
  }

  /** Grouped results with a larger per-source limit, for the full results page's "all sources" view. */
  grouped(q: string, limit = 10): Observable<SearchOutcome> {
    return this.run({ q, limit });
  }

  page(q: string, type: SearchType, page: number, limit = 25): Observable<SearchOutcome> {
    return this.run({ q, type, page, limit });
  }

  private run(params: Record<string, string | number>): Observable<SearchOutcome> {
    return this.api.get<SearchResponse>('/staff/search', params).pipe(
      map((res) => {
        const meta = (res as unknown as SearchEnvelope).meta;
        return { data: res.data, unavailableTypes: meta?.unavailableTypes ?? [] };
      }),
    );
  }
}
