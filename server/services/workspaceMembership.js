const WorkspaceMember = require('../models/WorkspaceMember');

/**
 * Creates, reactivates, or updates a workspace membership — the single
 * write path every other service/route uses, so "adding the same person
 * back finds and reactivates the existing row" is guaranteed everywhere,
 * not just in the routes that happen to remember to check first.
 *
 * Upsert on the (workspace, identity) unique index (see
 * models/WorkspaceMember.js) makes this idempotent: calling it twice with
 * the same workspace+identity is safe, which is also what makes the
 * non-transactional conversion fallback path safely retryable.
 */
async function addOrReactivateMember(
  {
    workspace,
    memberType,
    clientUser,
    adminUser,
    workspaceRole,
    invitedBy,
    invitedByName,
    invitedByType,
    status,
    clientVisible,
    displayRole,
  },
  { session } = {},
) {
  const identityFilter =
    memberType === 'client' ? { workspace, clientUser } : { workspace, adminUser };

  const now = new Date();
  const resolvedStatus = status || 'active';

  const update = {
    $set: {
      memberType,
      workspaceRole,
      status: resolvedStatus,
      invitedBy: invitedBy || null,
      invitedByName: invitedByName || '',
      invitedByType: invitedByType || 'system',
      removedAt: null,
      ...(resolvedStatus === 'active' ? { joinedAt: now } : {}),
      ...(clientVisible !== undefined ? { clientVisible } : {}),
      ...(displayRole !== undefined ? { displayRole } : {}),
    },
    $setOnInsert: {
      workspace,
      ...(memberType === 'client' ? { clientUser } : { adminUser }),
    },
  };

  const member = await WorkspaceMember.findOneAndUpdate(identityFilter, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    session: session || undefined,
  });

  return member;
}

/**
 * Soft-removes a member — status/removedAt only, never a hard delete (see
 * module doc: "Do not hard-delete membership records as the normal removal
 * path"). Access ends immediately because every authorization check reads
 * `status === 'active'` directly, with no caching layer to expire.
 */
async function removeMember(memberId, { session } = {}) {
  return WorkspaceMember.findByIdAndUpdate(
    memberId,
    { $set: { status: 'removed', removedAt: new Date() } },
    { new: true, session: session || undefined },
  );
}

module.exports = { addOrReactivateMember, removeMember };
