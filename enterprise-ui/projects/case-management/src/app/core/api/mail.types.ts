/** DTOs of /api/v1/staff/mail (ADR-030). Message bodies are fetched from Microsoft on demand and sanitized by the server. */
export interface MailPerson { name: string; address: string }
export type MailFolder = 'inbox' | 'sent';

/** Who the other party is in our records. Each match is present only if this employee may already see that record. */
export interface MailContact {
  name: string;
  address: string;
  client: { id: string; name: string } | null;
  lead: { id: string; name: string; status: string; service: string; canConvert: boolean } | null;
}

export interface MailListItem {
  id: string;
  /** 'consultation' and 'contact' are the website's own enquiry emails; the contact is then the visitor. */
  kind: 'mail' | 'consultation' | 'contact';
  contact: MailContact | null;
  subject: string;
  from: MailPerson;
  to: MailPerson[];
  receivedAt: string | null;
  sentAt: string | null;
  isRead: boolean;
  hasAttachments: boolean;
  important: boolean;
  preview: string;
  linkCount: number;
}

export interface MailPage { items: MailListItem[]; page: number; limit: number; hasMore: boolean; folder: MailFolder }

export interface MailAttachment { id: string; name: string; contentType: string; size: number }

export interface MailCaseLink {
  id: string;
  messageId: string;
  caseId: string;
  subject: string;
  from: MailPerson;
  messageDate: string | null;
  linkedByName: string;
  linkedAt: string;
}

export interface MailMessage extends MailListItem {
  cc: MailPerson[];
  bodyType: 'html' | 'text';
  /** Already sanitized by the server for 'html'; plain text otherwise. */
  body: string;
  attachments: MailAttachment[];
  links: MailCaseLink[];
  hiddenLinkCount: number;
}

export interface MailStatus { configured: boolean; mailbox: string | null; canSend: boolean }

/** What the compose dialog sends: a new message needs to/subject, a reply only the body (and `all`). */
export interface MailRequest { body: string; to?: string[]; cc?: string[]; subject?: string; all?: boolean; caseId?: string }
export interface MailSendResult { id: string; link: MailCaseLink | null }
