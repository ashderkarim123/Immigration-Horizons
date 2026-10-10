/**
 * DTOs for GET /api/v1/staff/search, shaped exactly like server/services/search/index.js. The server decides which sources the
 * actor may search and owns every `href`; this app only renders what it is given.
 */
export type SearchType = 'cases' | 'clients' | 'consultations' | 'tasks' | 'documents' | 'queries' | 'evidence' | 'forms' | 'petitions' | 'filing_packets' | 'uscis' | 'conversations';

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 80;

export interface SearchResult {
  type: SearchType;
  id: string;
  title: string;
  subtitle: string | null;
  statusLabel: string | null;
  case: { id: string; caseNumber: string; title: string } | null;
  context: string[];
  updatedAt: string | null;
  /** A server-owned in-app path such as /cases/:id?tab=tasks. */
  href: string;
  match: { field: string; quality: 'exact' | 'prefix' | 'text' };
}

export interface SearchGroup {
  type: SearchType;
  label: string;
  items: SearchResult[];
  hasMore: boolean;
}

export interface SearchResponse {
  groups: SearchGroup[];
  availableTypes: { type: SearchType; label: string }[];
  /** Full-results mode only. */
  page?: number;
  pageSize?: number;
}

export interface SearchOutcome {
  data: SearchResponse;
  /** Sources that failed in a quick search: reported, never shown as zero matches. */
  unavailableTypes: SearchType[];
}

/** Singular label for a result's source, so the type is conveyed by text and never by colour alone. */
export const SEARCH_TYPE_NOUN: Record<SearchType, string> = {
  cases: 'Case',
  clients: 'Client',
  consultations: 'Consultation',
  tasks: 'Task',
  documents: 'Document',
  queries: 'Query',
  evidence: 'Evidence',
  forms: 'Form',
  petitions: 'Petition',
  filing_packets: 'Filing packet',
  uscis: 'USCIS filing',
  conversations: 'Conversation',
};

/** An in-app path the router may follow: absolute, single-slash, plain characters. Anything else is ignored. */
export const isSafeAppPath = (href: unknown): href is string => typeof href === 'string' && /^\/(?!\/)[A-Za-z0-9/_\-?=&.%]*$/.test(href);
