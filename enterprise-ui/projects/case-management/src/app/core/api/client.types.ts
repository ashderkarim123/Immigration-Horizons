/** DTOs for /api/v1/staff/clients*, shaped like server/routes/api/v1/staff/clients.js. */

/** Mirrors CLIENT_USER_STATUS_VALUES in server/models/ClientUser.js. */
export type ClientStatus = 'pending' | 'active' | 'locked' | 'disabled';

export interface ClientListItem {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  status: ClientStatus;
  caseCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface ClientCaseSummary {
  id: string;
  caseNumber: string;
  title: string;
  caseType: string;
  currentStage: string;
  priority: string;
  targetFilingDate: string | null;
  archivedAt: string | null;
  updatedAt: string;
}

export interface ClientDetail {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: ClientStatus;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  cases: ClientCaseSummary[];
}
