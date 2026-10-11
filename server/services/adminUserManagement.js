/**
 * Employee account administration (ADR-016 provisioning, ADR-029): the one implementation behind the EJS Users pages
 * and /api/v1/admin/users, so the privilege rules cannot differ between the two consoles.
 *
 *   - only a Super Admin may create, change, reset or delete a Super Admin, or grant that role;
 *   - the last active Super Admin can never be demoted, disabled or deleted;
 *   - nobody deletes the account they are signed in as;
 *   - deactivating an account, changing its sign-in email or resetting its credentials revokes its Staff sessions.
 *
 * A temporary password is generated here, handed back to the caller exactly once, and stored only as a bcrypt hash.
 * It is never logged and never written to a SecurityEvent.
 */
const crypto = require('crypto');
const AdminUser = require('../models/admin/User');
const EmployeeSession = require('../models/EmployeeSession');
const { createApiError } = require('../middleware/api/apiError');
const { ROLE_LABELS, ALL_ROLES, CAPABILITIES, can } = require('../utils/permissions');
const { recordSecurityEvent } = require('../utils/securityEvents');
const { invalid, notFound, conflict, isId, searchRegex, pageParams, paged } = require('./cms/common');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LAST_SUPER_ADMIN = 'This is the only active Super Admin. Create or promote another one first.';

/** 24 URL-safe characters from 20 random bytes (~140 bits). */
const generateTempPassword = () => crypto.randomBytes(20).toString('base64url').slice(0, 24);
const forbidden = (message) => createApiError(403, 'forbidden', message);
const isSuperAdmin = (ctx) => ctx.role === 'super_admin';
/** A Super Admin account is only ever touched by a Super Admin. */
const canTouch = (ctx, target) => target.role !== 'super_admin' || isSuperAdmin(ctx);
const hasOtherActiveSuperAdmin = async (excludeId) => (await AdminUser.countDocuments({ role: 'super_admin', isActive: true, _id: { $ne: excludeId } })) > 0;

const audit = (ctx, type, target, meta) =>
  recordSecurityEvent({ type, result: 'success', surface: 'admin_cms', req: ctx.req, ...ctx.actor, subjectEmail: target.email, meta });

function toDto(user, ctx) {
  const isSelf = !!ctx.actorId && String(user._id) === String(ctx.actorId);
  const touch = canTouch(ctx, user);
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: { code: user.role, label: ROLE_LABELS[user.role] || user.role },
    jobTitle: user.jobTitle || '',
    department: user.department || '',
    isActive: user.isActive !== false,
    mustChangePassword: !!user.mustChangePassword,
    // The account state an administrator acts on — not the raw counters behind it.
    locked: !!(user.lockedUntil && new Date(user.lockedUntil) > new Date()),
    lastLoginAt: user.lastLoginAt || null,
    credentialIssuedAt: user.credentialIssuedAt || null,
    passwordChangedAt: user.passwordChangedAt || null,
    createdAt: user.createdAt,
    isSelf,
    actions: { edit: touch, resetCredentials: touch, revokeSessions: touch, delete: touch && !isSelf && can({ staff: { role: ctx.role } }, 'users.delete') },
  };
}

const text = (value, max) => String(value === undefined || value === null ? '' : value).trim().slice(0, max);

async function find(id) {
  const user = isId(String(id)) ? await AdminUser.findById(id) : null;
  if (!user) throw notFound('User');
  return user;
}

async function list(query = {}, ctx) {
  const filter = {};
  if (ALL_ROLES.includes(query.role)) filter.role = query.role;
  if (query.status === 'active') filter.isActive = true;
  else if (query.status === 'inactive') filter.isActive = false;
  const term = searchRegex(query.search);
  if (term) filter.$or = [{ name: term }, { email: term }];
  const paging = pageParams(query, { defaultLimit: 25 });
  const [total, users] = await Promise.all([
    AdminUser.countDocuments(filter),
    AdminUser.find(filter).select('-password').sort({ createdAt: -1, _id: -1 }).skip(paging.skip).limit(paging.limit).lean(),
  ]);
  return {
    ...paged(users.map((user) => toDto(user, ctx)), total, paging),
    roles: ALL_ROLES.map((code) => ({ code, label: ROLE_LABELS[code], assignable: code !== 'super_admin' || isSuperAdmin(ctx) })),
  };
}

const get = async (id, ctx) => toDto(await find(id), ctx);

/** @returns {{ user, temporaryPassword }} the plaintext exists only in this return value. */
async function create(ctx, input = {}) {
  const name = text(input.name, 120);
  const email = text(input.email, 254).toLowerCase();
  const { role } = input;
  if (!name || !email || !role) {
    throw invalid({ ...(!name && { name: 'Name is required.' }), ...(!email && { email: 'Email is required.' }), ...(!role && { role: 'Role is required.' }) });
  }
  if (!EMAIL_PATTERN.test(email)) throw invalid({ email: 'Enter a valid email address.' });
  if (role === 'super_admin' && !isSuperAdmin(ctx)) throw forbidden('Only a Super Admin can create another Super Admin account.');
  if (!ALL_ROLES.includes(role)) throw invalid({ role: 'Invalid role.' });
  if (await AdminUser.exists({ email })) throw conflict('email', 'An account with that email already exists.');

  const temporaryPassword = generateTempPassword();
  const user = await AdminUser.create({
    name,
    email,
    password: temporaryPassword, // hashed by the model's pre-save hook
    role,
    jobTitle: text(input.jobTitle, 120),
    department: text(input.department, 120),
    mustChangePassword: true,
    credentialIssuedAt: new Date(),
    passwordChangedAt: null,
    isActive: true,
  });
  await audit(ctx, 'admin_user_created', user, { action: 'created', role });
  return { user, temporaryPassword };
}

async function update(ctx, id, input = {}) {
  const target = await find(id);
  const { role } = input;
  const email = input.email === undefined ? undefined : text(input.email, 254).toLowerCase();

  if (!canTouch(ctx, target)) throw forbidden('Only a Super Admin can modify another Super Admin account.');
  if (role === 'super_admin' && !isSuperAdmin(ctx)) throw forbidden('Only a Super Admin can assign the Super Admin role.');
  if (role && !ALL_ROLES.includes(role)) throw invalid({ role: 'Invalid role.' });
  if (email !== undefined && !EMAIL_PATTERN.test(email)) throw invalid({ email: 'Enter a valid email address.' });
  if (input.name !== undefined && !text(input.name, 120)) throw invalid({ name: 'Name is required.' });
  if (input.isActive !== undefined && typeof input.isActive !== 'boolean') throw invalid({ isActive: 'Active must be true or false.' });

  const emailChanging = email !== undefined && email !== target.email;
  if (emailChanging && (await AdminUser.exists({ email, _id: { $ne: target._id } }))) throw conflict('email', 'Another account already uses that email.');

  const becomingInactive = target.isActive && input.isActive === false;
  const becomingActive = !target.isActive && input.isActive === true;
  const losingSuperAdmin = target.role === 'super_admin' && ((role && role !== 'super_admin') || becomingInactive);
  if (losingSuperAdmin && !(await hasOtherActiveSuperAdmin(target._id))) throw invalid({ [becomingInactive ? 'isActive' : 'role']: LAST_SUPER_ADMIN });

  const changed = [];
  const set = (field, value) => { if (value !== undefined && target[field] !== value) { target[field] = value; changed.push(field); } };
  if (input.name !== undefined) set('name', text(input.name, 120));
  if (emailChanging) set('email', email);
  if (role) set('role', role);
  if (input.jobTitle !== undefined) set('jobTitle', text(input.jobTitle, 120));
  if (input.department !== undefined) set('department', text(input.department, 120));
  set('isActive', input.isActive);
  await target.save();

  // The Staff application re-reads the account on every request, so a role change needs no revocation; a disabled
  // account or a changed sign-in identity does (ADR-016).
  if (becomingInactive || emailChanging) await EmployeeSession.deleteMany({ adminUser: target._id });
  if (becomingInactive) await audit(ctx, 'session_revoked', target, { action: 'account_deactivated' });
  if (changed.length) {
    await audit(ctx, 'admin_user_updated', target, { action: becomingInactive ? 'deactivated' : becomingActive ? 'activated' : 'updated', changed, role: target.role });
  }
  return { user: target, emailChanged: emailChanging };
}

/** New temporary password, lockout cleared, Staff sessions revoked, password setup forced again. */
async function resetCredentials(ctx, id) {
  const target = await find(id);
  if (!canTouch(ctx, target)) throw forbidden("Only a Super Admin can reset another Super Admin's credentials.");

  const temporaryPassword = generateTempPassword();
  target.password = temporaryPassword; // hashed by the model's pre-save hook
  target.mustChangePassword = true;
  target.credentialIssuedAt = new Date();
  target.passwordChangedAt = null;
  await target.save();
  // Lockout counters are written with updateOne, never save() (ADR-012 §3).
  await AdminUser.updateOne({ _id: target._id }, { $set: { failedLoginCount: 0, lockedUntil: null } });
  await EmployeeSession.deleteMany({ adminUser: target._id });
  await audit(ctx, 'admin_credentials_reset', target, { action: 'reset', role: target.role });
  return { user: await find(id), temporaryPassword };
}

/**
 * Ends the account's Staff application sessions. It does NOT enumerate CMS sessions: those are denied on their next
 * request only when the account is deactivated or loses admin.cms.access (the live re-check).
 */
async function revokeSessions(ctx, id) {
  const target = await find(id);
  if (!canTouch(ctx, target)) throw forbidden("Only a Super Admin can revoke another Super Admin's sessions.");
  const { deletedCount } = await EmployeeSession.deleteMany({ adminUser: target._id });
  await audit(ctx, 'admin_staff_sessions_revoked', target, { action: 'revoked', count: deletedCount });
  return { user: target, revoked: deletedCount };
}

async function remove(ctx, id) {
  if (ctx.actorId && String(ctx.actorId) === String(id)) throw createApiError(400, 'invalid_request', 'You cannot delete your own account while logged in as it.');
  const target = await find(id);
  if (!canTouch(ctx, target)) throw forbidden('Only a Super Admin can delete another Super Admin account.');
  if (target.role === 'super_admin' && !(await hasOtherActiveSuperAdmin(target._id))) {
    throw createApiError(400, 'invalid_request', 'Cannot delete the last remaining Super Admin account.');
  }
  await EmployeeSession.deleteMany({ adminUser: target._id });
  await AdminUser.deleteOne({ _id: target._id });
  await audit(ctx, 'admin_user_deleted', target, { action: 'deleted', role: target.role });
}

/** Read-only role/capability reference, derived from the code-owned permission map (never editable here). */
function rolesReference() {
  const domainLabel = (domain) => { const words = domain.replace(/_/g, ' '); return words[0].toUpperCase() + words.slice(1); };
  return ALL_ROLES.map((code) => {
    const capabilities = Object.keys(CAPABILITIES).filter((capability) => can({ staff: { role: code } }, capability));
    const groups = new Map();
    for (const capability of capabilities) {
      const domain = capability.split('.')[0];
      if (!groups.has(domain)) groups.set(domain, []);
      groups.get(domain).push(capability);
    }
    return {
      code,
      label: ROLE_LABELS[code],
      cmsAccess: capabilities.includes('admin.cms.access'),
      capabilityCount: capabilities.length,
      groups: [...groups].map(([domain, list]) => ({ domain, label: domainLabel(domain), capabilities: list })),
    };
  });
}

module.exports = { list, get, create, update, resetCredentials, revokeSessions, remove, rolesReference, toDto, generateTempPassword };
