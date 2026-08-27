const crypto = require('crypto');
const mongoose = require('mongoose');

const ClientUser = require('../models/ClientUser');
const ClientSession = require('../models/ClientSession');
const PortalInvitation = require('../models/PortalInvitation');
const Consultation = require('../models/Consultation');
const ClientCase = require('../models/ClientCase');

const { sendActivationEmail } = require('./clientPortalEmail');
const {
  INVITATION_TTL_MS,
  TOKEN_HASH_ALGORITHM,
  TOKEN_BYTES,
  ADMIN_INVITATION_PURPOSE,
  CLIENT_STATUS_ACTIVE,
  CLIENT_STATUS_DISABLED,
} = require('../utils/clientAccountConstants');

/** Matches src/lib/auth/crypto.ts's generateToken() exactly (ADR-007 §2). */
function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Matches src/lib/auth/crypto.ts's hashToken() exactly. */
function hashToken(token) {
  return crypto.createHash(TOKEN_HASH_ALGORITHM).update(token).digest('hex');
}

/** Matches src/lib/auth/crypto.ts's normalizeEmail(). */
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * The admin's read model for one client — account state, linked records,
 * live invitation, and a security summary. Bounded everywhere: a client
 * with hundreds of consultations must not render hundreds of rows.
 */
async function getClientOverview(clientId, { caseFilter = null, limit = 25 } = {}) {
  if (!mongoose.Types.ObjectId.isValid(clientId)) return null;
  const client = await ClientUser.findById(clientId).lean();
  if (!client) return null;

  // A PM without cases.view_all only ever sees cases they're a member of —
  // caseFilter carries that restriction in (ADR-007 §8).
  const caseQuery = { primaryClient: client._id };
  if (caseFilter) Object.assign(caseQuery, caseFilter);

  const now = new Date();
  const [consultations, cases, activeInvitation, recentInvitations, sessions, failedSessionsCount] =
    await Promise.all([
      Consultation.find({ clientUser: client._id })
        .select('name email service status createdAt convertedCase')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      ClientCase.find(caseQuery)
        .select('caseNumber title caseType currentStage status projectManager targetFilingDate archivedAt')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      PortalInvitation.findOne({
        normalizedEmail: client.normalizedEmail,
        usedAt: null,
        revokedAt: null,
        expiresAt: { $gt: now },
      })
        .select('purpose expiresAt attemptCount createdAt createdByType')
        .sort({ createdAt: -1 })
        .lean(),
      PortalInvitation.find({ normalizedEmail: client.normalizedEmail })
        .select('purpose expiresAt usedAt revokedAt createdAt createdByType')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      ClientSession.find({ clientUser: client._id, expiresAt: { $gt: now } })
        .select('createdIp userAgent lastSeenAt expiresAt idleExpiresAt createdAt')
        .sort({ lastSeenAt: -1 })
        .limit(10)
        .lean(),
      ClientSession.countDocuments({ clientUser: client._id }),
    ]);

  return {
    // NOT named `client`: Express passes render locals straight through to
    // EJS as compile options, and EJS reads `options.client` as
    // "compile to a standalone client-side function" — which drops the
    // `include()` helper and breaks the shared layout. See ADR-007 §9.
    clientUser: client,
    consultations,
    cases,
    activeInvitation: activeInvitation || null,
    recentInvitations,
    security: {
      activeSessions: sessions,
      totalSessionRecords: failedSessionsCount,
      failedLoginCount: client.failedLoginCount || 0,
      lockedUntil: client.lockedUntil || null,
      lastLoginAt: client.lastLoginAt || null,
      passwordChangedAt: client.passwordChangedAt || null,
      emailVerifiedAt: client.emailVerifiedAt || null,
      hasPassword: Boolean(client.passwordHash),
    },
  };
}

/**
 * Revokes any live invitation and issues a fresh one, mirroring the root
 * app's revoke-then-issue rule so at most one active invitation exists per
 * email+purpose. Returns `{ outcome, invitation, emailed }`.
 *
 * An email failure never rolls back the issued invitation — same
 * deliberate decoupling as every other email path in this codebase.
 */
async function resendInvitation({ clientId, actor }) {
  const client = await ClientUser.findById(clientId);
  if (!client) return { outcome: 'not_found' };
  if (client.status === CLIENT_STATUS_DISABLED) {
    return { outcome: 'validation_error', message: 'Reactivate this account before issuing a new invitation.' };
  }

  const now = new Date();
  await PortalInvitation.updateMany(
    {
      normalizedEmail: client.normalizedEmail,
      purpose: ADMIN_INVITATION_PURPOSE,
      usedAt: null,
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { revokedAt: now } }
  );

  const token = generateToken();
  const invitation = await PortalInvitation.create({
    normalizedEmail: client.normalizedEmail,
    firstName: client.firstName || '',
    lastName: client.lastName || '',
    clientUser: client._id,
    tokenHash: hashToken(token),
    purpose: ADMIN_INVITATION_PURPOSE,
    expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
    createdByType: 'admin',
    createdByAdmin: actor && actor.type === 'admin_user' ? actor.id : null,
  });

  const emailed = await sendActivationEmail({
    to: client.email,
    firstName: client.firstName,
    token,
  });

  return { outcome: 'issued', invitation, emailed };
}

/** Revokes every live invitation for a client without issuing a new one. */
async function revokeInvitations(clientId) {
  const client = await ClientUser.findById(clientId);
  if (!client) return { outcome: 'not_found' };

  const now = new Date();
  const result = await PortalInvitation.updateMany(
    { normalizedEmail: client.normalizedEmail, usedAt: null, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now } }
  );
  return { outcome: 'revoked', revokedCount: result.modifiedCount || 0 };
}

/**
 * Disables an account AND revokes every live session, so "disable" logs
 * the client out immediately rather than only blocking the next login
 * (ADR-007 §3).
 */
async function disableClient(clientId) {
  const client = await ClientUser.findById(clientId);
  if (!client) return { outcome: 'not_found' };
  if (client.status === CLIENT_STATUS_DISABLED) return { outcome: 'unchanged', client };

  client.status = CLIENT_STATUS_DISABLED;
  await client.save();
  const removed = await ClientSession.deleteMany({ clientUser: client._id });

  return { outcome: 'disabled', client, sessionsRevoked: removed.deletedCount || 0 };
}

/**
 * Re-activates a disabled account. Deliberately does NOT restore sessions —
 * the client logs in again (ADR-007 §3). An account with no password yet
 * returns to `pending`, not `active`, so it still has to be activated.
 */
async function reactivateClient(clientId) {
  const client = await ClientUser.findById(clientId);
  if (!client) return { outcome: 'not_found' };
  if (client.status !== CLIENT_STATUS_DISABLED) return { outcome: 'unchanged', client };

  client.status = client.passwordHash ? CLIENT_STATUS_ACTIVE : 'pending';
  client.failedLoginCount = 0;
  client.lockedUntil = null;
  await client.save();

  return { outcome: 'reactivated', client };
}

module.exports = {
  generateToken,
  hashToken,
  normalizeEmail,
  getClientOverview,
  resendInvitation,
  revokeInvitations,
  disableClient,
  reactivateClient,
};
