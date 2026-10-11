import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AdminUser, IntegrationStatus, RoleReference, SecurityEvent, SettingGroup } from '../core/api/admin.types';
import { ADMIN_CAPS, mount, paged } from '../testing/harness';
import { IntegrationsComponent, RolesComponent, SettingsComponent } from './platform/platform';
import { SecurityEventsComponent } from './security/security';
import { UserDetailComponent, UsersComponent } from './users/users';

const admin = { capabilities: ADMIN_CAPS };
const SECRET = 'tmp-Pa55w0rd-Shown-Once-9Z';

const groups = (): SettingGroup[] => [
  { group: 'general', title: 'Company', description: 'Contact details.', fields: [{ key: 'companyName', label: 'Company name', type: 'text', maxLength: 120, value: 'Immigration Horizons' }, { key: 'email', label: 'Email', type: 'email', maxLength: 254, value: '' }] },
  { group: 'social', title: 'Social media', description: 'Public profile links.', fields: [{ key: 'facebook', label: 'Facebook', type: 'url', maxLength: 300, value: '' }] },
];

describe('Settings', () => {
  it('renders exactly the groups and fields the server offers, each saved on its own', async () => {
    const t = mount(SettingsComponent, admin);
    await t.respond('GET', '/settings', { groups: groups() });
    expect(Array.from(t.root.querySelectorAll('h2')).map((h) => h.textContent)).toEqual(['Company', 'Social media']);
    expect((t.root.querySelector('#general-companyName') as HTMLInputElement).value).toBe('Immigration Horizons');
    expect(t.root.querySelector('#general-email')?.getAttribute('type')).toBe('email');
    expect(t.root.querySelector('input[type="password"]')).toBeNull();
    expect(t.component.hasUnsavedChanges()).toBe(false);

    await t.type('#general-companyName', 'Immigration Horizons LLC');
    expect(t.component.hasUnsavedChanges()).toBe(true);
    expect(t.root.querySelectorAll('form')[0].querySelector('[role="status"]')?.textContent).toBe('Unsaved changes');
    expect(t.root.querySelectorAll('form')[1].querySelector('[role="status"]')?.textContent).toBe('');

    await t.click('Save company');
    const req = t.request('PUT', '/settings/general');
    expect(req.request.body).toEqual({ values: { companyName: 'Immigration Horizons LLC', email: '' } });
    const saved = groups()[0];
    saved.fields[0].value = 'Immigration Horizons LLC';
    req.flush({ data: saved });
    await t.settle();
    expect(t.component.hasUnsavedChanges()).toBe(false);
  });

  it('shows a refused value beside its own field and leaves the other group alone', async () => {
    const t = mount(SettingsComponent, admin);
    await t.respond('GET', '/settings', { groups: groups() });
    await t.type('#social-facebook', 'javascript:alert(1)');
    await t.click('Save social media');
    await t.fail('PUT', '/settings/social', 422, { code: 'validation_error', message: 'Please correct the highlighted fields.', fieldErrors: [{ field: 'facebook', message: 'Facebook must be a full http(s) URL.' }] });
    expect(t.root.querySelector('#social-facebook')?.getAttribute('aria-invalid')).toBe('true');
    expect(t.root.querySelector('#general-companyName')?.getAttribute('aria-invalid')).toBe('false');
    expect(t.root.querySelectorAll('form')[1].querySelector('[role="alert"]')?.textContent).toContain('must be a full http(s) URL');
    expect(t.root.querySelectorAll('form')[0].querySelector('[role="alert"]')).toBeNull();
  });

  it('offers a retry when settings cannot be loaded', async () => {
    const t = mount(SettingsComponent, admin);
    await t.fail('GET', '/settings', 403, { code: 'forbidden', message: 'You do not have permission to perform this action.' });
    expect(t.root.querySelector('[role="alert"]')?.textContent).toContain('You do not have permission');
    expect(t.root.querySelector('form')).toBeNull();
  });
});

describe('Integrations', () => {
  const status = (over: Partial<IntegrationStatus> = {}): IntegrationStatus => ({
    mongo: { status: 'connected' }, email: { configured: true, transport: 'smtp' }, googleSheets: { configured: false }, uscisCaseStatus: { configured: true, enabled: false },
    calendar: { practiceTimeZoneConfigured: false, practiceTimeZoneInvalid: true }, reminders: { enabled: false }, checkedAt: '2026-10-11T09:00:00.000Z', ...over,
  });

  it('states each integration in words (never colour alone) and is strictly read-only', async () => {
    const t = mount(IntegrationsComponent, admin);
    await t.respond('GET', '/integration-status', status());
    const rows = Object.fromEntries(Array.from(t.root.querySelectorAll('tbody tr')).map((r) => [r.children[0].textContent?.trim(), r.children[1].textContent?.trim()]));
    expect(rows).toEqual({ Database: 'Connected', Email: 'Configured', 'Google Sheets': 'Not configured', 'USCIS case status': 'Configured, switched off', 'Practice time zone': 'Invalid value', 'Calendar reminders': 'Switched off' });
    expect(t.root.textContent).toContain('Sending through SMTP');
    expect(t.root.querySelector('input, select, textarea, form')).toBeNull();
  });

  it('re-checks on demand and reports a failed check', async () => {
    const t = mount(IntegrationsComponent, admin);
    await t.respond('GET', '/integration-status', status());
    await t.click('Check again');
    await t.fail('GET', '/integration-status', 500, { message: 'Internal Server Error' });
    expect(t.root.querySelector('[role="alert"]')?.textContent).toContain('Integration status could not be loaded');
  });
});

describe('Roles', () => {
  it('is a read-only reference grouped by domain, marking which roles can enter this console', async () => {
    const roles: RoleReference[] = [
      { code: 'admin', label: 'Admin', cmsAccess: true, capabilityCount: 3, groups: [{ domain: 'users', label: 'Users', capabilities: ['users.manage'] }, { domain: 'security_events', label: 'Security events', capabilities: ['security_events.view'] }] },
      { code: 'pm', label: 'PM / Project Manager', cmsAccess: false, capabilityCount: 1, groups: [{ domain: 'cases', label: 'Cases', capabilities: ['cases.view'] }] },
    ];
    const t = mount(RolesComponent, admin);
    await t.respond('GET', '/roles', { roles });
    const cards = Array.from(t.root.querySelectorAll('details'));
    expect(cards.map((c) => c.querySelector('summary .cell-title')?.textContent)).toEqual(['Admin', 'PM / Project Manager']);
    expect(cards[0].querySelector('summary')?.textContent).toContain('Admin Console access');
    expect(cards[1].querySelector('summary')?.textContent).toContain('Staff application only');
    expect(Array.from(cards[0].querySelectorAll('code')).map((c) => c.textContent)).toEqual(['users.manage', 'security_events.view']);
    expect(t.root.querySelector('button, input, select, form')).toBeNull();
    expect(t.root.textContent).toContain('cannot be edited here');
  });
});

const user = (over: Partial<AdminUser> = {}): AdminUser => ({
  id: 'u1', name: 'Paula Manager', email: 'paula@ih.test', role: { code: 'pm', label: 'PM / Project Manager' }, jobTitle: 'Case Manager', department: 'Operations', isActive: true,
  mustChangePassword: false, locked: false, lastLoginAt: '2026-10-10T08:00:00.000Z', credentialIssuedAt: null, passwordChangedAt: '2026-09-01T08:00:00.000Z', createdAt: '2026-08-01T08:00:00.000Z',
  isSelf: false, actions: { edit: true, resetCredentials: true, revokeSessions: true, delete: true }, ...over,
});
const ROLES = [{ code: 'super_admin', label: 'Super Admin', assignable: false }, { code: 'admin', label: 'Admin', assignable: true }, { code: 'pm', label: 'PM / Project Manager', assignable: true }];
const userList = (items: AdminUser[]) => paged(items, { roles: ROLES });

describe('Users', () => {
  it('lists accounts with role, status, password state and last sign-in, and filters on the server', async () => {
    const t = mount(UsersComponent, admin);
    await t.respond('GET', '/users', userList([user({ isSelf: true }), user({ id: 'u2', name: 'New Hire', email: 'new@ih.test', isActive: false, mustChangePassword: true, locked: true, lastLoginAt: null })]));
    const rows = Array.from(t.root.querySelectorAll('tbody tr')).map((r) => (r.textContent ?? '').replace(/\s+/g, ' '));
    expect(rows[0]).toContain('Paula Manager');
    expect(rows[0]).toContain('You');
    expect(rows[0]).toContain('Active');
    expect(rows[1]).toContain('Inactive');
    expect(rows[1]).toContain('Locked');
    expect(rows[1]).toContain('Must change');
    expect(rows[1]).toContain('Never');
    expect(t.root.querySelector('a[href="/users/u2"]')?.textContent).toBe('New Hire');
    expect(t.root.textContent).not.toMatch(/failed|attempts/i);

    await t.type('#user-role', 'pm');
    expect(t.request('GET', '/users').request.params.get('role')).toBe('pm');
  });
});

describe('User detail', () => {
  const open = async (existing?: AdminUser) => {
    const t = mount(UserDetailComponent, { ...admin, inputs: existing ? { id: existing.id } : {} });
    await t.respond('GET', '/users', userList([]));
    if (existing) await t.respond('GET', `/users/${existing.id}`, existing);
    return t;
  };

  it('creates an account and shows the temporary password once, in a dialog a stray click cannot dismiss', async () => {
    const t = await open();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const superAdmin = Array.from(t.root.querySelectorAll<HTMLOptionElement>('#role option')).find((o) => o.value === 'super_admin')!;
    expect(superAdmin.disabled).toBe(true); // this administrator cannot grant it
    await t.type('#name', 'Hissam Baig');
    await t.type('#email', 'hissam@ih.test');
    await t.type('#role', 'pm');
    await t.submit();
    const req = t.request('POST', '/users');
    expect(req.request.body).toEqual({ name: 'Hissam Baig', email: 'hissam@ih.test', role: 'pm', jobTitle: '', department: '' });
    req.flush({ data: { user: user({ id: 'new1', name: 'Hissam Baig', email: 'hissam@ih.test', mustChangePassword: true }), temporaryCredential: { password: SECRET, purpose: 'created' } } });
    await t.settle();

    const dialog = t.dialog()!;
    expect(dialog.querySelector('h2')?.textContent).toBe('Temporary credential');
    expect(dialog.textContent).toContain('Copy this password now. It will not be shown again.');
    expect((dialog.querySelector('#temp-password') as HTMLInputElement).value).toBe(SECRET);
    expect(t.button('Copy password', dialog)).toBeTruthy();
    (t.root.querySelector('.modal-backdrop') as HTMLElement).click();
    await t.settle();
    expect(t.dialog()).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();

    await t.click('I have copied it', dialog);
    expect(t.dialog()).toBeNull();
    expect(t.root.innerHTML).not.toContain(SECRET);
    expect((t.component as unknown as { credential(): unknown }).credential()).toBeNull(); // gone from memory, not just from view
    expect(JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })).not.toContain(SECRET);
    expect(navigate).toHaveBeenCalledWith(['/users', 'new1'], { replaceUrl: true });
  });

  it('shows creation errors by field, including a refused privilege escalation', async () => {
    const t = await open();
    await t.type('#name', 'X');
    await t.submit();
    await t.fail('POST', '/users', 409, { code: 'conflict', message: 'An account with that email already exists.', fieldErrors: [{ field: 'email', message: 'An account with that email already exists.' }] });
    expect(t.root.querySelector('#email')?.getAttribute('aria-invalid')).toBe('true');
    expect(t.dialog()).toBeNull();
    await t.submit();
    await t.fail('POST', '/users', 403, { code: 'forbidden', message: 'Only a Super Admin can create another Super Admin account.' });
    expect(t.root.querySelector('[role="alert"]')?.textContent).toContain('Only a Super Admin');
  });

  it('edits an account and shows the credential lifecycle without any counter internals', async () => {
    const t = await open(user({ locked: true, mustChangePassword: true, credentialIssuedAt: '2026-10-10T08:00:00.000Z' }));
    expect(t.text('h1')).toBe('Paula Manager');
    expect(t.root.textContent).toContain('Temporary — must be changed at next sign-in');
    expect(t.root.textContent).toContain('Locked after failed attempts');
    expect(t.component.hasUnsavedChanges()).toBe(false);
    await t.type('#jobTitle', 'Senior Case Manager');
    expect(t.component.hasUnsavedChanges()).toBe(true);
    await t.submit();
    const req = t.request('PATCH', '/users/u1');
    expect(req.request.body).toEqual({ name: 'Paula Manager', email: 'paula@ih.test', role: 'pm', jobTitle: 'Senior Case Manager', department: 'Operations' });
    req.flush({ data: user({ jobTitle: 'Senior Case Manager' }) });
    await t.settle();
    expect(t.component.hasUnsavedChanges()).toBe(false);
  });

  it('resets a password only after confirmation and shows the new credential once', async () => {
    const t = await open(user());
    await t.click('Reset password');
    expect(t.dialog()?.textContent).toContain('the current one stops working');
    t.http.expectNone((r) => r.method === 'POST');
    await t.click('Reset password', t.dialog()!);
    await t.respond('POST', '/users/u1/reset-credentials', { user: user({ mustChangePassword: true }), temporaryCredential: { password: SECRET, purpose: 'reset' } });
    expect(t.dialog()?.textContent).toContain('The password was reset.');
    expect((t.root.querySelector('#temp-password') as HTMLInputElement).value).toBe(SECRET);
    await t.click('I have copied it', t.dialog()!);
    expect(t.root.innerHTML).not.toContain(SECRET);
    expect(t.root.textContent).toContain('Temporary — must be changed at next sign-in');
  });

  it('revokes Staff sessions, deactivates and reactivates — each dangerous step confirmed first', async () => {
    const t = await open(user());
    await t.click('Revoke Staff sessions');
    await t.click('Revoke sessions', t.dialog()!);
    await t.respond('POST', '/users/u1/revoke-sessions', { user: user(), revokedStaffSessions: 2 });
    expect(t.root.textContent).toContain('Admin Console session ends on its next request only when');

    await t.click('Deactivate account');
    expect(t.dialog()?.textContent).toContain('can be reactivated');
    await t.click('Deactivate account', t.dialog()!);
    const off = t.request('PATCH', '/users/u1');
    expect(off.request.body).toEqual({ isActive: false });
    off.flush({ data: user({ isActive: false }) });
    await t.settle();
    expect(t.text('.page-subtitle')).toContain('Inactive');
    expect(t.button('Deactivate account')).toBeUndefined();

    await t.click('Reactivate account');
    expect(t.request('PATCH', '/users/u1').request.body).toEqual({ isActive: true });
  });

  it('deletes only after the admin types the account email', async () => {
    const t = await open(user());
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await t.click('Delete account');
    const confirm = t.button('Delete account', t.dialog()!) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await t.type('#matchInput', 'paula@ih.test');
    expect((t.button('Delete account', t.dialog()!) as HTMLButtonElement).disabled).toBe(false);
    await t.click('Delete account', t.dialog()!);
    await t.respond('DELETE', '/users/u1', { deleted: true });
    expect(navigate).toHaveBeenCalledWith(['/users']);
  });

  it('is read-only for an account this administrator may not touch', async () => {
    const t = await open(user({ role: { code: 'super_admin', label: 'Super Admin' }, actions: { edit: false, resetCredentials: false, revokeSessions: false, delete: false } }));
    expect((t.root.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    expect(t.root.textContent).toContain('Only a Super Admin can change a Super Admin account.');
    for (const label of ['Reset password', 'Revoke Staff sessions', 'Deactivate account', 'Delete account']) expect(t.button(label)).toBeUndefined();
  });
});

const event = (over: Partial<SecurityEvent> = {}): SecurityEvent => ({
  id: 'e1', type: 'login_failed', result: 'failure', surface: 'admin_cms', actorType: 'anonymous', actorAdmin: null, actorName: '', subjectEmail: 'paula@ih.test', ipMasked: '203.0.113.x',
  createdAt: '2026-10-11T08:00:00.000Z', meta: { reason: 'bad_password', via: 'admin_api' }, ...over,
});
const FILTERS = { type: ['login_failed', 'admin_user_created'], result: ['success', 'failure', 'denied'], surface: ['portal', 'staff', 'admin_cms'], actorType: ['client', 'admin_user', 'anonymous'] };
const eventList = (items: SecurityEvent[], hasMore = false, page = 1) => ({ items, page, limit: 25, hasMore, filters: FILTERS });

describe('Security events', () => {
  it('lists events with readable labels and opens the safe detail in a dialog', async () => {
    const t = mount(SecurityEventsComponent, admin);
    await t.respond('GET', '/security-events', eventList([event(), event({ id: 'e2', type: 'admin_user_created', result: 'success', actorType: 'admin_user', actorName: 'Ada Admin', meta: { action: 'created', role: 'pm' } })]));
    const rows = Array.from(t.root.querySelectorAll('tbody tr')).map((r) => (r.textContent ?? '').replace(/\s+/g, ' '));
    expect(rows[0]).toContain('Login failed');
    expect(rows[0]).toContain('Failure');
    expect(rows[0]).toContain('Admin console');
    expect(rows[0]).toContain('Not signed in');
    expect(rows[1]).toContain('Admin user created');
    expect(rows[1]).toContain('Ada Admin');

    await t.click('Details');
    const detail = Object.fromEntries(Array.from(t.dialog()!.querySelectorAll('dl > div')).map((d) => [d.querySelector('dt')?.textContent, d.querySelector('dd')?.textContent]));
    expect(detail).toMatchObject({ Event: 'Login failed', Result: 'Failure', Application: 'Admin console', Actor: 'Not signed in', Account: 'paula@ih.test', 'Network (masked)': '203.0.113.x', Reason: 'bad_password', Via: 'admin_api' });
    await t.click('Close', t.dialog()!);
    expect(t.dialog()).toBeNull();
  });

  it('is a viewer only: no edit, delete, clear or export control exists', async () => {
    const t = mount(SecurityEventsComponent, admin);
    await t.respond('GET', '/security-events', eventList([event()]));
    const labels = Array.from(t.root.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());
    expect(labels.filter((l) => /delete|remove|purge|edit|export/i.test(l))).toEqual([]);
    expect(labels).toContain('Clear'); // clears the FILTERS, sitting in the filter form
    expect(t.button('Clear')?.closest('form')?.getAttribute('role')).toBe('search');
    expect(t.root.textContent).toContain('Entries cannot be changed or removed.');
  });

  it('sends the chosen filters, with dates as whole local days, and pages newer/older without a total', async () => {
    const t = mount(SecurityEventsComponent, admin);
    await t.respond('GET', '/security-events', eventList([event()], true));
    expect(Array.from(t.root.querySelectorAll('#se-type option')).map((o) => o.textContent)).toEqual(['All events', 'Login failed', 'Admin user created']);
    await t.type('#se-type', 'login_failed');
    await t.type('#se-email', ' Paula@ih.test ');
    await t.type('#se-from', '2026-10-01');
    await t.type('#se-to', '2026-10-02');
    await t.submit('form[role="search"]');
    const req = t.request('GET', '/security-events');
    const p = req.request.params;
    expect([p.get('type'), p.get('subjectEmail'), p.get('page')]).toEqual(['login_failed', 'Paula@ih.test', '1']);
    expect(p.get('from')).toBe(new Date('2026-10-01T00:00:00').toISOString());
    expect(p.get('to')).toBe(new Date('2026-10-02T23:59:59.999').toISOString());
    expect(p.has('result')).toBe(false);
    req.flush({ data: eventList([event()], true) });
    await t.settle();

    expect((t.button('Newer') as HTMLButtonElement).disabled).toBe(true);
    await t.click('Older');
    expect(t.request('GET', '/security-events').request.params.get('page')).toBe('2');
  });

  it('explains a refused filter without discarding the results on screen, and an empty result', async () => {
    const t = mount(SecurityEventsComponent, admin);
    await t.respond('GET', '/security-events', eventList([event()]));
    await t.submit('form[role="search"]');
    await t.fail('GET', '/security-events', 422, { code: 'validation_error', message: 'Please correct the highlighted fields.', fieldErrors: [{ field: 'to', message: 'The range may cover at most 400 days.' }] });
    expect(t.root.querySelector('[role="alert"]')?.textContent).toContain('at most 400 days');
    expect(t.root.querySelector('#se-to')?.getAttribute('aria-invalid')).toBe('true');
    expect(t.root.querySelectorAll('tbody tr')).toHaveLength(1);

    await t.click('Clear');
    await t.respond('GET', '/security-events', eventList([]));
    expect(t.text('ih-empty-state')).toContain('Nothing in the record matches these filters.');
  });
});
