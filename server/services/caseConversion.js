const mongoose = require('mongoose');

const Consultation = require('../models/Consultation');
const ClientCase = require('../models/ClientCase');
const CaseWorkspace = require('../models/CaseWorkspace');
const CaseActivity = require('../models/CaseActivity');
const WorkspaceMember = require('../models/WorkspaceMember');
const ClientUser = require('../models/ClientUser');
const AdminUser = require('../models/admin/User');
const ActivityLog = require('../models/admin/ActivityLog');
const { notify, notifyMany } = require('../utils/notify');

const { CASE_TYPE_VALUES } = require('../utils/caseConstants');
const { generateCaseNumber } = require('../utils/caseNumber');
const { withOptionalTransaction } = require('../utils/transaction');
const { addOrReactivateMember } = require('./workspaceMembership');
const { provisionDefaultCategories } = require('./documentCategoryService');
const { provisionDefaultChannels } = require('./channelService');

const PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'];
const MAX_CASE_NUMBER_ATTEMPTS = 5;

/**
 * Validates conversion input. Returns `{ errors }` (non-empty on failure)
 * rather than throwing — the route renders these back to the form.
 */
function validateInput(input) {
  const errors = {};

  if (!input.caseType || !CASE_TYPE_VALUES.includes(input.caseType)) {
    errors.caseType = 'Choose a valid case type.';
  }
  if (!input.title || !String(input.title).trim()) {
    errors.title = 'Title is required.';
  }
  if (!input.projectManagerId || !mongoose.Types.ObjectId.isValid(input.projectManagerId)) {
    errors.projectManagerId = 'Choose a project manager.';
  }
  if (input.priority && !PRIORITY_VALUES.includes(input.priority)) {
    errors.priority = 'Invalid priority.';
  }
  if (input.targetFilingDate) {
    const d = new Date(input.targetFilingDate);
    if (Number.isNaN(d.getTime())) errors.targetFilingDate = 'Invalid date.';
  }
  const employeeIds = Array.isArray(input.employeeMemberIds) ? input.employeeMemberIds : [];
  for (const id of employeeIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      errors.employeeMemberIds = 'One or more selected team members are invalid.';
      break;
    }
  }

  return errors;
}

async function createCaseNumberWithRetry(session) {
  for (let attempt = 0; attempt < MAX_CASE_NUMBER_ATTEMPTS; attempt += 1) {
    const candidate = generateCaseNumber();
    const exists = await ClientCase.exists({ caseNumber: candidate }).session(session || null);
    if (!exists) return candidate;
  }
  throw new Error('Failed to generate a unique case number after several attempts.');
}

/**
 * Resolves the case's primary client from the consultation's linked
 * ClientUser (never an arbitrary reassignment — see module doc §"Client
 * linkage cases"). Returns `{ error }` for the documented failure modes
 * instead of throwing, so the route can show a clear, specific message.
 */
async function resolvePrimaryClient(consultation) {
  if (!consultation.clientUser) {
    return {
      error:
        'no_client_linked',
      message:
        'This consultation has no linked client account yet. Ask the client to activate their ' +
        'portal account (or link one manually) before converting to a case.',
    };
  }

  const clientUser = await ClientUser.findById(consultation.clientUser);
  if (!clientUser) {
    return { error: 'client_not_found', message: 'The linked client account no longer exists.' };
  }
  if (clientUser.status === 'disabled') {
    return { error: 'client_disabled', message: 'The linked client account is disabled.' };
  }

  return { clientUser };
}

/**
 * Converts a consultation into a ClientCase with a primary workspace and
 * memberships. Idempotent: a duplicate conversion (concurrent or repeated)
 * returns `{ outcome: 'already_converted', case }` rather than creating a
 * second case — enforced by ClientCase's unique-partial `consultation`
 * index as the final guard, not just the up-front existence check.
 */
async function convertConsultationToCase({ consultationId, input, actor }) {
  if (!mongoose.Types.ObjectId.isValid(consultationId)) {
    return { outcome: 'not_found' };
  }

  const errors = validateInput(input);
  if (Object.keys(errors).length) {
    return { outcome: 'validation_error', errors };
  }

  const consultation = await Consultation.findById(consultationId);
  if (!consultation) return { outcome: 'not_found' };

  if (consultation.convertedCase) {
    const existing = await ClientCase.findById(consultation.convertedCase);
    if (existing) return { outcome: 'already_converted', case: existing };
    // Dangling reference (should not happen) — fall through and let the
    // unique-consultation index be the authority below.
  }

  const clientResolution = await resolvePrimaryClient(consultation);
  if (clientResolution.error) {
    return { outcome: 'validation_error', errors: { primaryClient: clientResolution.message } };
  }
  const { clientUser } = clientResolution;

  const projectManager = await AdminUser.findOne({ _id: input.projectManagerId, isActive: true });
  if (!projectManager) {
    return {
      outcome: 'validation_error',
      errors: { projectManagerId: 'Selected project manager is not a valid, active team member.' },
    };
  }

  const employeeIds = [...new Set((input.employeeMemberIds || []).map(String))].filter(
    (id) => id !== String(projectManager._id),
  );
  const employees = employeeIds.length
    ? await AdminUser.find({ _id: { $in: employeeIds }, isActive: true })
    : [];
  if (employees.length !== employeeIds.length) {
    return {
      outcome: 'validation_error',
      errors: { employeeMemberIds: 'One or more selected team members are not valid, active team members.' },
    };
  }

  const clientMembershipStatus = clientUser.status === 'active' ? 'active' : 'invited';

  let caseDoc;
  let workspace;
  let transactional;
  let categoriesCreatedCount;
  let channelsCreatedCount;

  try {
    const { result, transactional: usedTransaction } = await withOptionalTransaction(async (session) => {
      const caseNumber = await createCaseNumberWithRetry(session);

      const createdCase = await ClientCase.create(
        [
          {
            caseNumber,
            title: input.title.trim(),
            caseType: input.caseType,
            currentStage: 'intake',
            consultation: consultation._id,
            primaryClient: clientUser._id,
            projectManager: projectManager._id,
            createdBy: actor.id,
            createdByName: actor.name,
            targetFilingDate: input.targetFilingDate ? new Date(input.targetFilingDate) : null,
            priority: input.priority || 'medium',
            description: input.description || '',
          },
        ],
        { session: session || undefined },
      ).then((docs) => docs[0]);

      const createdWorkspace = await CaseWorkspace.findOneAndUpdate(
        { case: createdCase._id, workspaceType: 'primary' },
        {
          $setOnInsert: {
            case: createdCase._id,
            workspaceType: 'primary',
            name: `${createdCase.title} — Primary Workspace`,
            createdBy: actor.id,
            createdByName: actor.name,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session: session || undefined },
      );

      // Cycle 5: default document categories, provisioned in the same
      // transaction as the case/workspace itself (ADR-004 §18). Idempotent
      // — see documentCategoryService.js — so this is safe even if this
      // whole closure is ever retried.
      const categoryProvisioning = await provisionDefaultCategories({
        caseId: createdCase._id,
        workspaceId: createdWorkspace._id,
        session,
      });

      // Cycle 6: default collaboration channels, same transaction, same
      // idempotent-insert pattern (ADR-005 §20). Does not re-provision
      // document categories — a separate, already-idempotent step above.
      const channelProvisioning = await provisionDefaultChannels({
        caseId: createdCase._id,
        workspaceId: createdWorkspace._id,
        session,
      });

      await addOrReactivateMember(
        {
          workspace: createdWorkspace._id,
          memberType: 'client',
          clientUser: clientUser._id,
          workspaceRole: 'client',
          status: clientMembershipStatus,
          invitedBy: actor.id,
          invitedByName: actor.name,
          invitedByType: actor.type,
        },
        { session },
      );

      await addOrReactivateMember(
        {
          workspace: createdWorkspace._id,
          memberType: 'employee',
          adminUser: projectManager._id,
          workspaceRole: 'project_manager',
          status: 'active',
          invitedBy: actor.id,
          invitedByName: actor.name,
          invitedByType: actor.type,
        },
        { session },
      );

      for (const employee of employees) {
        await addOrReactivateMember(
          {
            workspace: createdWorkspace._id,
            memberType: 'employee',
            adminUser: employee._id,
            workspaceRole: 'contributor',
            status: 'active',
            invitedBy: actor.id,
            invitedByName: actor.name,
            invitedByType: actor.type,
          },
          { session },
        );
      }

      // Consultation is linked LAST — never marked converted before the
      // case and workspace genuinely exist.
      await Consultation.updateOne(
        { _id: consultation._id, convertedCase: null },
        { $set: { convertedCase: createdCase._id, convertedAt: new Date() } },
        { session: session || undefined },
      );

      return { createdCase, createdWorkspace, categoryProvisioning, channelProvisioning };
    });

    caseDoc = result.createdCase;
    workspace = result.createdWorkspace;
    transactional = usedTransaction;
    categoriesCreatedCount = result.categoryProvisioning.created.length;
    channelsCreatedCount = result.channelProvisioning.created.length;
    if (!transactional) {
      // Expected on a non-replica-set deployment (e.g. some local dev
      // setups) — the unique indexes above are what kept this safe, not
      // atomicity. Worth a log line since it's a meaningfully different
      // guarantee than the production (Atlas replica-set) path.
      console.warn(
        `[case-conversion] Ran without a transaction (deployment does not support one) for consultation ${consultation._id}.`,
      );
    }
  } catch (err) {
    if (err && err.code === 11000 && err.keyPattern && err.keyPattern.consultation) {
      // Lost a race to a concurrent conversion of the same consultation —
      // the other request's case is authoritative; return it rather than
      // erroring.
      const existing = await ClientCase.findOne({ consultation: consultation._id });
      if (existing) return { outcome: 'already_converted', case: existing };
    }
    throw err;
  }

  // ---- Audit + notify (best-effort — never rolls back the conversion above) ----
  try {
    await CaseActivity.record({
      caseId: caseDoc._id,
      workspaceId: workspace._id,
      type: 'case_created',
      message: `Case ${caseDoc.caseNumber} created from consultation "${consultation.name}" by ${actor.name}.`,
      actor,
    });
    await CaseActivity.record({
      caseId: caseDoc._id,
      workspaceId: workspace._id,
      type: 'workspace_created',
      message: `Primary workspace created for case ${caseDoc.caseNumber}.`,
      actor,
    });
    if (categoriesCreatedCount > 0) {
      await CaseActivity.record({
        caseId: caseDoc._id,
        workspaceId: workspace._id,
        type: 'category_provisioned',
        message: `${categoriesCreatedCount} default document ${categoriesCreatedCount === 1 ? 'category' : 'categories'} provisioned.`,
        actor,
      });
    }
    if (channelsCreatedCount > 0) {
      await CaseActivity.record({
        caseId: caseDoc._id,
        workspaceId: workspace._id,
        type: 'channel_provisioned',
        message: `${channelsCreatedCount} default ${channelsCreatedCount === 1 ? 'channel' : 'channels'} provisioned.`,
        actor,
      });
    }
    await CaseActivity.record({
      caseId: caseDoc._id,
      workspaceId: workspace._id,
      type: 'client_membership_created',
      message: `Client membership created (${clientMembershipStatus}) for ${clientUser.email}.`,
      actor,
    });
    await CaseActivity.record({
      caseId: caseDoc._id,
      workspaceId: workspace._id,
      type: 'employee_membership_created',
      message: `${projectManager.name} added as project manager.`,
      actor,
    });
    for (const employee of employees) {
      await CaseActivity.record({
        caseId: caseDoc._id,
        workspaceId: workspace._id,
        type: 'employee_membership_created',
        message: `${employee.name} added to the case workspace.`,
        actor,
      });
    }

    await ActivityLog.record(
      consultation._id,
      'case_converted',
      `Converted to case ${caseDoc.caseNumber} by ${actor.name}.`,
      actor.name,
      { caseId: String(caseDoc._id), caseNumber: caseDoc.caseNumber },
    );
  } catch (err) {
    console.error('[case-conversion] Failed to write activity records:', err.message);
  }

  try {
    await notify({
      recipientName: projectManager.name,
      title: `Assigned as project manager: ${caseDoc.caseNumber}`,
      message: `You were assigned as project manager for "${caseDoc.title}".`,
      type: 'case_assigned_manager',
      relatedCase: caseDoc._id,
    });
    if (employees.length) {
      await notifyMany(
        employees.map((e) => e.name),
        {
          title: `Added to case ${caseDoc.caseNumber}`,
          message: `You were added to the workspace for "${caseDoc.title}".`,
          type: 'case_member_added',
          relatedCase: caseDoc._id,
        },
      );
    }
  } catch (err) {
    console.error('[case-conversion] Failed to send notifications:', err.message);
  }

  return { outcome: 'converted', case: caseDoc, workspace };
}

module.exports = { convertConsultationToCase, validateInput, resolvePrimaryClient };
