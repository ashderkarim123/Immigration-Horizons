export interface NavItem { label: string; path: string; icon: string; capability?: string }
export interface NavGroup { label: string | null; items: NavItem[] }

/** `capability` is what the destination needs beyond admin.cms.access (which the whole console already requires). */
export const NAVIGATION: NavGroup[] = [
  { label: null, items: [{ label: 'Dashboard', path: '/dashboard', icon: 'layout-dashboard' }] },
  {
    label: 'Website',
    items: [
      { label: 'Blog', path: '/content/blog', icon: 'file-text' },
      { label: 'FAQs', path: '/content/faqs', icon: 'message-square' },
      { label: 'Testimonials', path: '/content/testimonials', icon: 'user-check' },
      { label: 'Media', path: '/content/media', icon: 'folder' },
      { label: 'Services', path: '/content/services', icon: 'briefcase' },
      { label: 'SEO', path: '/content/seo', icon: 'search' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { label: 'Settings', path: '/settings', icon: 'settings', capability: 'settings.manage' },
      { label: 'Integrations', path: '/integrations', icon: 'activity', capability: 'settings.manage' },
    ],
  },
  {
    label: 'Access & Security',
    items: [
      { label: 'Users', path: '/users', icon: 'users', capability: 'users.manage' },
      { label: 'Roles', path: '/roles', icon: 'lock', capability: 'users.manage' },
      { label: 'Security Events', path: '/security', icon: 'shield', capability: 'security_events.view' },
    ],
  },
];

/** Only what this administrator can open; a group with nothing left disappears with its heading. */
export function visibleNavigation(capabilities: readonly string[]): NavGroup[] {
  return NAVIGATION
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.capability || capabilities.includes(item.capability)) }))
    .filter((group) => group.items.length > 0);
}
