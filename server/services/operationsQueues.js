const ClientCase = require('../models/ClientCase');
const ConsultationInteraction = require('../models/ConsultationInteraction');
const CaseDocument = require('../models/CaseDocument');
const DocumentRequest = require('../models/DocumentRequest');
const WorkspaceMessage = require('../models/WorkspaceMessage');
const ChannelReadState = require('../models/ChannelReadState');
const WorkspaceMember = require('../models/WorkspaceMember');

const { ACTIVE_UNANSWERED_STATUSES } = require('../utils/interactionConstants');

/**
 * Operational dashboard counts (ADR-007 §4). One aggregation module, eight
 * scalars, each backed by an index that already exists from an earlier
 * cycle. No $lookup, no per-row queries — the dashboard renders from the
 * numbers this returns and nothing else.
 */

/**
 * A case with no case-document change in this many days counts as stalled.
 * The module doc doesn't define "stalled" — this is a deliberate first-pass
 * heuristic, named so it's one edit to tune once operators have a view.
 */
const STALLED_CASE_DAYS = 21;

/** How far ahead a target filing date counts as "upcoming". */
const UPCOMING_DEADLINE_DAYS = 30;

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Client-authored messages nobody on the team has read yet.
 *
 * Counted per-workspace rather than per-employee (ADR-007 §5): a
 * dashboard-wide "unread" number that depended on whose session was
 * rendering it would be misleading, and computing it per employee across
 * every channel would be expensive. This answers the operationally useful
 * question instead — how many client messages has *nobody* picked up.
 */
async function countUnreadClientMessages(caseFilter = null) {
  const caseScope = caseFilter ? { case: caseFilter._id } : {};

  // Newest employee read-state per channel. Bounded by channel count, not
  // message count.
  const employeeMemberIds = await WorkspaceMember.find({ memberType: 'employee', status: 'active' })
    .select('_id')
    .lean();
  if (employeeMemberIds.length === 0) {
    return WorkspaceMessage.countDocuments({ senderType: 'client', deletedAt: null, ...caseScope });
  }

  const readStates = await ChannelReadState.find({
    workspaceMember: { $in: employeeMemberIds.map((m) => m._id) },
  })
    .select('channel lastReadAt')
    .lean();

  const newestReadByChannel = new Map();
  for (const state of readStates) {
    if (!state.lastReadAt) continue;
    const key = String(state.channel);
    const current = newestReadByChannel.get(key);
    if (!current || state.lastReadAt > current) newestReadByChannel.set(key, state.lastReadAt);
  }

  // Channels nobody has read at all: every client message counts.
  // Channels with a read marker: only messages newer than it count.
  const clauses = [];
  for (const [channelId, lastReadAt] of newestReadByChannel.entries()) {
    clauses.push({ channel: channelId, createdAt: { $gt: lastReadAt } });
  }
  const readChannelIds = [...newestReadByChannel.keys()];

  return WorkspaceMessage.countDocuments({
    senderType: 'client',
    deletedAt: null,
    ...caseScope,
    $or: [
      { channel: { $nin: readChannelIds } },
      ...(clauses.length ? clauses : []),
    ],
  });
}

/**
 * Every operational count the dashboard shows. Returns zeros rather than
 * throwing if the database is unreachable — a dashboard is not worth a 500.
 */
async function getOperationalCounts() {
  try {
    const [
      casesWithoutManager,
      unansweredQueries,
      queriesAwaitingScheduling,
      documentsAwaitingReview,
      overdueDocumentRequests,
      unreadClientMessages,
      upcomingFilingDeadlines,
      stalledCases,
      quarantinedDocuments,
    ] = await Promise.all([
      ClientCase.countDocuments({ archivedAt: null, $or: [{ projectManager: null }, { projectManager: { $exists: false } }] }),
      ConsultationInteraction.countDocuments({ status: { $in: ACTIVE_UNANSWERED_STATUSES } }),
      ConsultationInteraction.countDocuments({
        type: 'scheduled_consultation',
        scheduledFor: null,
        status: { $in: ACTIVE_UNANSWERED_STATUSES },
      }),
      CaseDocument.countDocuments({ status: { $in: ['uploaded', 'pending_review'] }, archivedAt: null }),
      DocumentRequest.countDocuments({ status: 'open', dueDate: { $ne: null, $lt: new Date() } }),
      countUnreadClientMessages(),
      ClientCase.countDocuments({
        archivedAt: null,
        targetFilingDate: { $ne: null, $gte: new Date(), $lte: daysFromNow(UPCOMING_DEADLINE_DAYS) },
      }),
      ClientCase.countDocuments({ archivedAt: null, updatedAt: { $lt: daysAgo(STALLED_CASE_DAYS) } }),
      CaseDocument.countDocuments({ status: 'quarantined' }),
    ]);

    return {
      casesWithoutManager,
      unansweredQueries,
      queriesAwaitingScheduling,
      documentsAwaitingReview,
      overdueDocumentRequests,
      unreadClientMessages,
      upcomingFilingDeadlines,
      stalledCases,
      quarantinedDocuments,
    };
  } catch (err) {
    console.error('[operations] Failed to compute operational counts:', err.message);
    return {
      casesWithoutManager: 0,
      unansweredQueries: 0,
      queriesAwaitingScheduling: 0,
      documentsAwaitingReview: 0,
      overdueDocumentRequests: 0,
      unreadClientMessages: 0,
      upcomingFilingDeadlines: 0,
      stalledCases: 0,
      quarantinedDocuments: 0,
    };
  }
}

module.exports = {
  getOperationalCounts,
  countUnreadClientMessages,
  STALLED_CASE_DAYS,
  UPCOMING_DEADLINE_DAYS,
};
