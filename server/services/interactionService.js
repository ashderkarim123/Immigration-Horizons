const mongoose = require('mongoose');

const ConsultationInteraction = require('../models/ConsultationInteraction');
const InteractionHistory = require('../models/InteractionHistory');
const InteractionUpdate = require('../models/InteractionUpdate');
const AdminUser = require('../models/admin/User');
const ClientUser = require('../models/ClientUser');
const WorkspaceMember = require('../models/WorkspaceMember');
const { notify } = require('../utils/notify');
const { isValidTimezone } = require('../utils/timezone');
const { generateInteractionNumber } = require('../utils/interactionNumber');
const { ACTIVE_UNANSWERED_STATUSES } = require('../utils/interactionConstants');
const {
  sendScheduledEmail,
  sendClarificationEmail,
  sendAnsweredEmail,
  sendCancelledEmail,
} = require('./interactionEmail');

const MAX_INTERACTION_NUMBER_ATTEMPTS = 5;

/** VersionError -> a controlled conflict outcome instead of a 500 (ADR-003 §2). */
function isVersionConflict(err) {
  return err instanceof mongoose.Error.VersionError;
}

async function generateUniqueInteractionNumber() {
  for (let attempt = 0; attempt < MAX_INTERACTION_NUMBER_ATTEMPTS; attempt += 1) {
    const candidate = generateInteractionNumber();
    const exists = await ConsultationInteraction.exists({ interactionNumber: candidate });
    if (!exists) return candidate;
  }
  throw new Error('Failed to generate a unique interaction number after several attempts.');
}

/**
 * Best-effort client email — resolves the ClientUser, calls `sendFn`, and
 * swallows any failure (logged) so an email problem never surfaces as a
 * failure of the interaction mutation that triggered it.
 */
async function notifyClientEmail(interaction, sendFn) {
  try {
    const client = await ClientUser.findById(interaction.clientUser).select('email firstName').lean();
    if (!client) return;
    await sendFn({
      to: client.email,
      firstName: client.firstName,
      interactionNumber: interaction.interactionNumber,
      subject: interaction.subject,
      scheduledFor: interaction.scheduledFor,
      timezone: interaction.timezone,
    });
  } catch (err) {
    console.error('[interactions] client email failed:', err.message);
  }
}

function actorHistoryFields(actor) {
  return {
    actorType: actor.type,
    actorClient: actor.type === 'client' ? actor.id : null,
    actorAdmin: actor.type === 'admin_user' ? actor.id : null,
    actorName: actor.name,
  };
}

async function recordHistory(interaction, eventType, actor, extra = {}) {
  await InteractionHistory.create({
    interaction: interaction._id,
    eventType,
    ...actorHistoryFields(actor),
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/**
 * Core creation path — used by both the client-facing "submit a query"
 * action and the initial-consultation tracker below. Validates scope
 * consistency again explicitly (in addition to the model's own
 * pre-validate hook) so callers get a structured error, not a thrown
 * Mongoose ValidationError.
 */
async function createInteraction(params) {
  const {
    clientUserId,
    scopeType,
    consultationId,
    caseId,
    workspaceId,
    subject,
    description,
    type,
    actor,
  } = params;

  if (scopeType === 'consultation' && !consultationId) {
    return { outcome: 'validation_error', errors: { scope: 'Consultation reference is required.' } };
  }
  if (scopeType === 'case' && (!caseId || !workspaceId)) {
    return { outcome: 'validation_error', errors: { scope: 'Case and workspace references are required.' } };
  }
  if (!subject || !subject.trim() || !description || !description.trim()) {
    return { outcome: 'validation_error', errors: { subject: 'Subject and description are required.' } };
  }

  const interactionNumber = await generateUniqueInteractionNumber();

  const interaction = await ConsultationInteraction.create({
    interactionNumber,
    scopeType,
    clientUser: clientUserId,
    consultation: scopeType === 'consultation' ? consultationId : consultationId || null,
    case: scopeType === 'case' ? caseId : null,
    workspace: scopeType === 'case' ? workspaceId : null,
    subject: subject.trim(),
    description: description.trim(),
    type,
    status: 'submitted',
    priority: 'normal',
    createdByType: actor.type === 'client' ? 'client' : actor.type === 'system' ? 'system' : 'admin',
    createdByClient: actor.type === 'client' ? actor.id : null,
    createdByAdmin: actor.type === 'admin_user' ? actor.id : null,
  });

  await recordHistory(interaction, 'created', actor, {
    newStatus: 'submitted',
    clientVisibleSummary: 'Your request was submitted.',
  });

  return { outcome: 'created', interaction };
}

/**
 * Called after a public consultation is persisted (module doc §14).
 * Idempotent: the unique partial index on (consultation, type:
 * 'initial_consultation') is the real guard — a duplicate-key race is
 * treated as success (the interaction already exists), never an error
 * that would make the caller think consultation submission itself failed.
 */
async function createInitialConsultationInteraction({ consultationId, clientUserId, subject, description }) {
  const existing = await ConsultationInteraction.findOne({
    consultation: consultationId,
    type: 'initial_consultation',
  });
  if (existing) return { outcome: 'already_exists', interaction: existing };

  if (!clientUserId) {
    // No client account linked yet — nothing to attach the interaction's
    // required clientUser to. The consultation itself is already saved by
    // this point (see src/lib/leads.ts); this is a deferred-tracking gap,
    // not a lost lead. Logged so it's operationally visible.
    return { outcome: 'deferred_no_client' };
  }

  try {
    const interactionNumber = await generateUniqueInteractionNumber();
    const interaction = await ConsultationInteraction.create({
      interactionNumber,
      scopeType: 'consultation',
      clientUser: clientUserId,
      consultation: consultationId,
      subject: subject || 'Initial consultation request',
      description: description || 'Submitted via the public consultation form.',
      type: 'initial_consultation',
      status: 'submitted',
      priority: 'normal',
      createdByType: 'system',
    });
    await recordHistory(interaction, 'created', { type: 'system', id: null, name: 'System' }, {
      newStatus: 'submitted',
      clientVisibleSummary: 'Your consultation request was received.',
    });
    return { outcome: 'created', interaction };
  } catch (err) {
    if (err && err.code === 11000) {
      const raceWinner = await ConsultationInteraction.findOne({
        consultation: consultationId,
        type: 'initial_consultation',
      });
      if (raceWinner) return { outcome: 'already_exists', interaction: raceWinner };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Employee lifecycle mutations
// ---------------------------------------------------------------------------

async function acknowledgeInteraction(interaction, actor) {
  if (interaction.status !== 'submitted') {
    return { outcome: 'unchanged', interaction };
  }
  interaction.status = 'acknowledged';
  await saveGuarded(interaction);
  await recordHistory(interaction, 'acknowledged', actor, {
    previousStatus: 'submitted',
    newStatus: 'acknowledged',
    clientVisibleSummary: 'Your request has been acknowledged by our team.',
  });
  return { outcome: 'updated', interaction };
}

async function assignInteraction(interaction, adminUserId, actor) {
  if (!mongoose.Types.ObjectId.isValid(adminUserId)) {
    return { outcome: 'validation_error', errors: { assignedTo: 'Invalid team member.' } };
  }
  const adminUser = await AdminUser.findOne({ _id: adminUserId, isActive: true });
  if (!adminUser) {
    return { outcome: 'validation_error', errors: { assignedTo: 'Not a valid, active team member.' } };
  }
  if (interaction.scopeType === 'case') {
    const membership = await WorkspaceMember.findOne({
      workspace: interaction.workspace,
      adminUser: adminUser._id,
      memberType: 'employee',
      status: 'active',
    });
    if (!membership) {
      return {
        outcome: 'validation_error',
        errors: { assignedTo: 'The selected team member is not an active member of this case workspace.' },
      };
    }
  }

  const previousAssignee = interaction.assignedTo;
  if (previousAssignee && String(previousAssignee) === String(adminUser._id)) {
    return { outcome: 'unchanged', interaction };
  }

  interaction.assignedTo = adminUser._id;
  await saveGuarded(interaction);
  await recordHistory(interaction, 'assigned', actor, {
    previousAssignee: previousAssignee || null,
    newAssignee: adminUser._id,
    clientVisibleSummary: 'A team member has been assigned to your request.',
  });

  await notify({
    recipientName: adminUser.name,
    title: `Assigned: ${interaction.interactionNumber}`,
    message: `You were assigned to "${interaction.subject}".`,
    type: 'query_assigned',
    relatedInteraction: interaction._id,
  }).catch((err) => console.error('[interactions] assign notification failed:', err.message));

  return { outcome: 'updated', interaction };
}

async function scheduleInteraction(interaction, { scheduledFor, timezone }, actor) {
  const date = new Date(scheduledFor);
  if (Number.isNaN(date.getTime())) {
    return { outcome: 'validation_error', errors: { scheduledFor: 'Invalid date/time.' } };
  }
  if (!isValidTimezone(timezone)) {
    return { outcome: 'validation_error', errors: { timezone: 'Invalid timezone. Use a real IANA identifier (e.g. Asia/Karachi).' } };
  }

  const wasScheduled = interaction.status === 'scheduled' || interaction.status === 'rescheduled';
  const previousScheduledFor = interaction.scheduledFor;
  const previousTimezone = interaction.timezone;

  if (
    wasScheduled &&
    previousScheduledFor &&
    previousScheduledFor.getTime() === date.getTime() &&
    previousTimezone === timezone
  ) {
    return { outcome: 'unchanged', interaction };
  }

  interaction.scheduledFor = date;
  interaction.timezone = timezone;
  interaction.status = wasScheduled ? 'rescheduled' : 'scheduled';
  await saveGuarded(interaction);

  await recordHistory(interaction, wasScheduled ? 'rescheduled' : 'scheduled', actor, {
    previousStatus: wasScheduled ? 'scheduled' : undefined,
    newStatus: interaction.status,
    previousScheduledFor: previousScheduledFor || null,
    newScheduledFor: date,
    previousTimezone: previousTimezone || '',
    newTimezone: timezone,
    clientVisibleSummary: wasScheduled
      ? 'Your consultation has been rescheduled.'
      : 'Your consultation has been scheduled.',
  });

  await notifyClientEmail(interaction, (p) => sendScheduledEmail({ ...p, rescheduled: wasScheduled }));

  return { outcome: 'updated', interaction, wasScheduled };
}

async function startWork(interaction, actor) {
  if (interaction.status === 'in_progress') return { outcome: 'unchanged', interaction };
  const previousStatus = interaction.status;
  interaction.status = 'in_progress';
  await saveGuarded(interaction);
  await recordHistory(interaction, 'status_changed', actor, {
    previousStatus,
    newStatus: 'in_progress',
    clientVisibleSummary: 'Our team is working on your request.',
  });
  return { outcome: 'updated', interaction };
}

async function answerInteraction(interaction, { clientVisibleResponse, internalResponse, resolutionSummary }, actor) {
  if (!clientVisibleResponse || !clientVisibleResponse.trim()) {
    return { outcome: 'validation_error', errors: { clientVisibleResponse: 'A client-visible answer is required.' } };
  }
  if (actor.type !== 'admin_user' && actor.type !== 'env_fallback') {
    return { outcome: 'validation_error', errors: { answeredBy: 'Only an employee can answer.' } };
  }

  const previousStatus = interaction.status;
  interaction.status = 'answered';
  interaction.answeredAt = new Date();
  interaction.answeredBy = actor.id || null;
  interaction.clientVisibleResponse = clientVisibleResponse.trim();
  interaction.internalResponse = (internalResponse || '').trim();
  interaction.resolutionSummary = (resolutionSummary || '').trim();
  await saveGuarded(interaction);

  await recordHistory(interaction, 'answered', actor, {
    previousStatus,
    newStatus: 'answered',
    clientVisibleSummary: 'Your request has been answered.',
  });

  await notifyClientEmail(interaction, sendAnsweredEmail);

  return { outcome: 'updated', interaction };
}

async function requestClarification(interaction, { clientVisibleQuestion }, actor) {
  if (!clientVisibleQuestion || !clientVisibleQuestion.trim()) {
    return { outcome: 'validation_error', errors: { clientVisibleQuestion: 'Clarification text is required.' } };
  }

  const previousStatus = interaction.status;
  if (previousStatus === 'awaiting_client') {
    return { outcome: 'unchanged', interaction };
  }

  interaction.status = 'awaiting_client';
  await saveGuarded(interaction);

  await InteractionUpdate.create({
    interaction: interaction._id,
    authorType: 'admin',
    authorAdmin: actor.id || null,
    authorName: actor.name,
    updateType: 'employee_clarification',
    body: clientVisibleQuestion.trim(),
    visibility: 'client_visible',
  });

  await recordHistory(interaction, 'clarification_requested', actor, {
    previousStatus,
    newStatus: 'awaiting_client',
    clientVisibleSummary: 'We need more information from you.',
  });

  await notifyClientEmail(interaction, sendClarificationEmail);

  return { outcome: 'updated', interaction };
}

async function markNoShow(interaction, actor) {
  if (!interaction.scheduledFor) {
    return { outcome: 'validation_error', errors: { status: 'Only a scheduled interaction can be marked no-show.' } };
  }
  if (interaction.status === 'no_show') return { outcome: 'unchanged', interaction };

  const previousStatus = interaction.status;
  interaction.status = 'no_show';
  await saveGuarded(interaction);
  await recordHistory(interaction, 'no_show', actor, {
    previousStatus,
    newStatus: 'no_show',
    clientVisibleSummary: 'You were marked as not attending the scheduled consultation.',
  });
  return { outcome: 'updated', interaction };
}

async function cancelInteraction(interaction, { reason }, actor) {
  if (interaction.status === 'cancelled') return { outcome: 'unchanged', interaction };
  const previousStatus = interaction.status;
  interaction.status = 'cancelled';
  interaction.cancelledAt = new Date();
  await saveGuarded(interaction);
  await recordHistory(interaction, 'cancelled', actor, {
    previousStatus,
    newStatus: 'cancelled',
    reason: reason || '',
    clientVisibleSummary: 'This request has been cancelled.',
  });
  await notifyClientEmail(interaction, sendCancelledEmail);
  return { outcome: 'updated', interaction };
}

async function closeInteraction(interaction, actor) {
  if (interaction.status === 'closed') return { outcome: 'unchanged', interaction };
  const previousStatus = interaction.status;
  interaction.status = 'closed';
  interaction.closedAt = new Date();
  await saveGuarded(interaction);
  await recordHistory(interaction, 'closed', actor, {
    previousStatus,
    newStatus: 'closed',
    clientVisibleSummary: 'This request is now closed.',
  });
  return { outcome: 'updated', interaction };
}

// ---------------------------------------------------------------------------
// Client-side actions
// ---------------------------------------------------------------------------

async function addClientFollowUp(interaction, body, actor) {
  if (!body || !body.trim()) {
    return { outcome: 'validation_error', errors: { body: 'Follow-up text is required.' } };
  }

  await InteractionUpdate.create({
    interaction: interaction._id,
    authorType: 'client',
    authorClient: actor.id,
    authorName: actor.name,
    updateType: 'client_follow_up',
    body: body.trim(),
    visibility: 'client_visible',
  });

  const reopened = interaction.status === 'awaiting_client';
  const previousStatus = interaction.status;
  if (reopened) {
    interaction.status = 'submitted';
    await saveGuarded(interaction);
  }

  await recordHistory(interaction, 'client_follow_up', actor, {
    previousStatus: reopened ? previousStatus : undefined,
    newStatus: reopened ? 'submitted' : undefined,
    clientVisibleSummary: 'You added a follow-up.',
  });

  if (interaction.assignedTo) {
    const assignee = await AdminUser.findById(interaction.assignedTo).select('name').lean();
    if (assignee) {
      await notify({
        recipientName: assignee.name,
        title: `Client follow-up: ${interaction.interactionNumber}`,
        message: `${actor.name} added a follow-up to "${interaction.subject}".`,
        type: 'query_client_follow_up',
        relatedInteraction: interaction._id,
      }).catch((err) => console.error('[interactions] follow-up notification failed:', err.message));
    }
  }

  return { outcome: 'updated', interaction };
}

async function confirmResolution(interaction, { resolved, note }, actor) {
  if (resolved) {
    interaction.clientResolutionStatus = 'resolved';
    interaction.clientResolvedAt = new Date();
    interaction.clientResolutionNote = note || '';
    const previousStatus = interaction.status;
    interaction.status = 'closed';
    interaction.closedAt = new Date();
    await saveGuarded(interaction);
    await recordHistory(interaction, 'resolution_confirmed', actor, {
      previousStatus,
      newStatus: 'closed',
      clientVisibleSummary: 'You confirmed this was resolved.',
    });
  } else {
    interaction.clientResolutionStatus = 'needs_more_help';
    interaction.clientResolutionNote = note || '';
    const previousStatus = interaction.status;
    interaction.status = 'in_progress';
    await saveGuarded(interaction);
    await InteractionUpdate.create({
      interaction: interaction._id,
      authorType: 'client',
      authorClient: actor.id,
      authorName: actor.name,
      updateType: 'resolution_confirmation',
      body: note || 'I need more help with this.',
      visibility: 'client_visible',
    });
    await recordHistory(interaction, 'resolution_reopened', actor, {
      previousStatus,
      newStatus: 'in_progress',
      clientVisibleSummary: 'You indicated you need more help.',
    });

    if (interaction.assignedTo) {
      const assignee = await AdminUser.findById(interaction.assignedTo).select('name').lean();
      if (assignee) {
        await notify({
          recipientName: assignee.name,
          title: `Client needs more help: ${interaction.interactionNumber}`,
          message: `${actor.name} indicated they still need help with "${interaction.subject}".`,
          type: 'query_needs_more_help',
          relatedInteraction: interaction._id,
        }).catch((err) => console.error('[interactions] resolution notification failed:', err.message));
      }
    }
  }

  return { outcome: 'updated', interaction };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Wraps .save() so a concurrent conflicting write surfaces as a controlled outcome, not a raw throw. */
async function saveGuarded(interaction) {
  try {
    await interaction.save();
  } catch (err) {
    if (isVersionConflict(err)) {
      const conflictError = new Error('This interaction was updated by someone else. Please reload and try again.');
      conflictError.isVersionConflict = true;
      throw conflictError;
    }
    throw err;
  }
}

module.exports = {
  createInteraction,
  createInitialConsultationInteraction,
  acknowledgeInteraction,
  assignInteraction,
  scheduleInteraction,
  startWork,
  answerInteraction,
  requestClarification,
  markNoShow,
  cancelInteraction,
  closeInteraction,
  addClientFollowUp,
  confirmResolution,
  isVersionConflict,
  ACTIVE_UNANSWERED_STATUSES,
};
