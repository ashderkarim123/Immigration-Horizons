/** DTOs of /api/v1/admin, as the server sends them (server/openapi/v1.yaml). */
import { Page } from './admin-api.service';

export interface BlogPost {
  id: string; title: string; slug: string; category: string; excerpt: string; content?: string; coverImage: string; author: string;
  tags: string[]; readingTime: number; published: boolean; publishDate: string | null; createdAt: string; updatedAt: string;
  previewUrl: string | null; actions: { edit: boolean; publish: boolean; delete: boolean };
}
export interface BlogList extends Page<BlogPost> { categories: string[] }

export interface Faq {
  id: string; question: string; answer: string; category: string; displayOrder: number; showOnHomepage: boolean; showOnServicePage: string;
  schemaEnabled: boolean; status: string; updatedAt: string; actions: { edit: boolean; delete: boolean };
}
export interface FaqList extends Page<Faq> { categories: string[]; statuses: string[]; serviceSlugs: string[] }

export interface Testimonial {
  id: string; name: string; country: string; profession: string; service: string; review: string; rating: number; photo: string;
  verificationUrl: string; featured: boolean; displayOrder: number; status: string; updatedAt: string; actions: { edit: boolean; delete: boolean };
}
export interface TestimonialList extends Page<Testimonial> { statuses: string[] }

export interface MediaItem {
  id: string; url: string; originalName: string; mimeType: string; size: number; altText: string; folder: string; uploadedBy: string;
  createdAt: string; actions: { edit: boolean; delete: boolean };
}
export interface MediaList extends Page<MediaItem> { folders: string[]; mimeTypes: string[] }

export interface ServiceItem {
  slug: string; title: string; tagline: string; publicUrl: string; seoPageRef: string;
  seo: { configured: boolean; seoTitle: string; hasDescription: boolean; noindex: boolean };
}

export interface SeoPage {
  pageRef: string; label: string; pageType: string; publicUrl: string | null; configured: boolean; updatedAt: string | null; actions: { edit: boolean };
  seoTitle: string; metaDescription: string; keywords: string; canonicalUrl: string; ogTitle: string; ogDescription: string; ogImage: string;
  twitterImage: string; slug: string; robots: string; noindex: boolean; schemaType: string;
}
export interface SeoList { items: SeoPage[]; robotsDirectives: string[]; schemaTypes: string[] }

export interface SecurityEvent {
  id: string; type: string; result: string; surface: string; actorType: string; actorAdmin: { id: string } | null; actorName: string;
  subjectEmail: string; ipMasked: string; createdAt: string; meta: Record<string, string | number | boolean | (string | number | boolean)[]>;
}
export interface SecurityEventList { items: SecurityEvent[]; page: number; limit: number; hasMore: boolean; filters: Record<'type' | 'result' | 'surface' | 'actorType', string[]> }

export interface Dashboard {
  blog: { total: number; published: number; drafts: number };
  faqs: { total: number; published: number };
  testimonials: { total: number; published: number };
  media: { total: number };
  seo: { configuredPages: number };
  /** null = this administrator may not see it (never shown as zero). */
  users: { active: number } | null;
  recentPosts: BlogPost[];
  recentSecurityEvents: SecurityEvent[] | null;
  asOf: string;
}

export interface SettingField { key: string; label: string; type: 'text' | 'email' | 'url'; maxLength: number; value: string }
export interface SettingGroup { group: string; title: string; description: string; fields: SettingField[] }

export interface IntegrationStatus {
  mongo: { status: string };
  email: { configured: boolean; transport: string };
  googleSheets: { configured: boolean };
  uscisCaseStatus: { configured: boolean; enabled: boolean };
  calendar: { practiceTimeZoneConfigured: boolean; practiceTimeZoneInvalid: boolean };
  reminders: { enabled: boolean };
  checkedAt: string;
}

export interface AdminUser {
  id: string; name: string; email: string; role: { code: string; label: string }; jobTitle: string; department: string; isActive: boolean;
  mustChangePassword: boolean; locked: boolean; lastLoginAt: string | null; credentialIssuedAt: string | null; passwordChangedAt: string | null;
  createdAt: string; isSelf: boolean; actions: { edit: boolean; resetCredentials: boolean; revokeSessions: boolean; delete: boolean };
}
export interface AdminUserList extends Page<AdminUser> { roles: { code: string; label: string; assignable: boolean }[] }
export interface TemporaryCredential { password: string; purpose: 'created' | 'reset' }
export interface CredentialResult { user: AdminUser; temporaryCredential: TemporaryCredential }

export interface RoleReference {
  code: string; label: string; cmsAccess: boolean; capabilityCount: number;
  groups: { domain: string; label: string; capabilities: string[] }[];
}
