import "server-only";

import mongoose from "mongoose";

import { getDb } from "../db";
import { ClientUser } from "../models/ClientUser";
import { ClientCase } from "../models/ClientCase";
import { CaseWorkspace } from "../models/CaseWorkspace";
import { WorkspaceMember } from "../models/WorkspaceMember";
import { Consultation } from "../models/Consultation";
import { ConsultationInteraction } from "../models/ConsultationInteraction";
import { CaseDocument } from "../models/CaseDocument";
import { WorkspaceMessage } from "../models/WorkspaceMessage";
import { Notification } from "../models/Notification";
import { PortalInvitation } from "../models/PortalInvitation";
import { roleHasCapability } from "./capabilities";
import { accessibleCaseIdFilter } from "./employee-case-policy";
import type { EmployeeActor } from "./actors";

/**
 * Client operations for the staff console (ADR-010 §4).
 *
 * **Deliberately org-wide, not membership-scoped**, following ADR-007 §8:
 * a client exists before any case does and may hold several across
 * different workspaces, so membership-scoping the client *directory*
 * would make it incoherent. `clients.view` is manager-tier
 * (super_admin / admin / pm), which is what keeps it safe.
 *
 * The record-level check applies where it actually belongs — every
 * case-scoped panel on a client's detail page (cases, documents,
 * case-scoped queries, communication) runs through the same
 * `accessibleCaseIdFilter` the case list uses. A PM viewing a client
 * therefore sees only the cases they could already see, never the whole
 * practice's.
 */

export const CLIENT_LIST_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const PANEL_LIMIT = 15;

export type ClientListFilters = {
  search?: string;
  status?: string;
  /** "with_cases" / "no_cases" — the two questions operators actually ask. */
  caseState?: "all" | "with_cases" | "no_cases";
  page?: number;
  limit?: number;
};

export type ClientListRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  caseCount: number;
  lastLoginAt: Date | null;
  createdAt: Date | null;
};

export type ClientListResult = {
  items: ClientListRow[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
};

const EMPTY_LIST: ClientListResult = {
  items: [],
  total: 0,
  page: 1,
  totalPages: 1,
  pageSize: CLIENT_LIST_PAGE_SIZE,
};

function literalRegex(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function displayName(client: Record<string, unknown>): string {
  const name = [client.firstName, client.lastName].filter(Boolean).join(" ").trim();
  return name || String(client.email || "Unknown client");
}

/** The client directory. Fails closed on a role without `clients.view`. */
export async function listClientsForEmployee(
  actor: EmployeeActor,
  filters: ClientListFilters = {},
): Promise<ClientListResult> {
  if (!roleHasCapability(actor.role, "clients.view")) return EMPTY_LIST;

  const db = getDb();
  if (!db) return EMPTY_LIST;
  await db;

  const pageSize = Math.min(Math.max(filters.limit ?? CLIENT_LIST_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const page = Math.max(1, filters.page ?? 1);

  const query: Record<string, unknown> = {};
  if (filters.status) query.status = filters.status;
  if (filters.search) {
    const pattern = literalRegex(filters.search.trim());
    query.$or = [{ email: pattern }, { firstName: pattern }, { lastName: pattern }];
  }

  // "Has a case" is answered against the cases this employee can see, so
  // the filter never becomes a side channel revealing cases they cannot
  // open. For a view_all role the restriction is null and this is the
  // whole practice, which is correct for them.
  if (filters.caseState === "with_cases" || filters.caseState === "no_cases") {
    const restriction = await accessibleCaseIdFilter(actor);
    const clientIds = await ClientCase.distinct("primaryClient", {
      archivedAt: null,
      ...(restriction ?? {}),
    });
    query._id = filters.caseState === "with_cases" ? { $in: clientIds } : { $nin: clientIds };
  }

  const [clients, total] = await Promise.all([
    ClientUser.find(query)
      .select("firstName lastName email status lastLoginAt createdAt")
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    ClientUser.countDocuments(query),
  ]);

  // One grouped count for the page, not one query per row.
  const restriction = await accessibleCaseIdFilter(actor);
  const counts = await ClientCase.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    {
      $match: {
        primaryClient: { $in: (clients as Record<string, unknown>[]).map((c) => c._id) },
        archivedAt: null,
        ...(restriction ?? {}),
      },
    },
    { $group: { _id: "$primaryClient", count: { $sum: 1 } } },
  ]);
  const countById = new Map(counts.map((c) => [String(c._id), c.count]));

  return {
    items: (clients as Record<string, unknown>[]).map((client) => ({
      id: String(client._id),
      name: displayName(client),
      email: String(client.email || ""),
      status: String(client.status || "pending"),
      caseCount: countById.get(String(client._id)) ?? 0,
      lastLoginAt: (client.lastLoginAt as Date | null) ?? null,
      createdAt: (client.createdAt as Date | null) ?? null,
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
  };
}

export type ClientOverview = {
  client: {
    id: string;
    name: string;
    email: string;
    phone: string;
    status: string;
    lastLoginAt: Date | null;
    emailVerifiedAt: Date | null;
    lockedUntil: Date | null;
    hasPassword: boolean;
    createdAt: Date | null;
  };
  consultations: Record<string, unknown>[];
  cases: Record<string, unknown>[];
  memberships: {
    id: string;
    caseId: string | null;
    caseNumber: string;
    caseTitle: string;
    workspaceRole: string;
    status: string;
    joinedAt: Date | null;
  }[];
  /** null = this role holds no `documents.view`; [] = nothing to show. */
  documents: Record<string, unknown>[] | null;
  /** null = this role holds no `queries.view`. */
  queries: Record<string, unknown>[] | null;
  /** null = this role holds no `channels.view`. */
  communication: Record<string, unknown>[] | null;
  notifications: Record<string, unknown>[];
  invitation: Record<string, unknown> | null;
};

/**
 * One client's operational record. Returns null for both "no such client"
 * and "your role cannot see clients" — the same undistinguished result
 * every other policy in this codebase returns.
 */
export async function getClientOverviewForEmployee(
  clientId: string,
  actor: EmployeeActor,
): Promise<ClientOverview | null> {
  if (!roleHasCapability(actor.role, "clients.view")) return null;
  if (!mongoose.Types.ObjectId.isValid(clientId)) return null;

  const db = getDb();
  if (!db) return null;
  await db;

  const client = await ClientUser.findById(clientId).lean();
  if (!client) return null;

  const record = client as Record<string, unknown>;

  const canSeeCases = roleHasCapability(actor.role, "cases.view");
  const canSeeDocuments = roleHasCapability(actor.role, "documents.view");
  const canSeeQueries = roleHasCapability(actor.role, "queries.view");
  const canSeeChannels = roleHasCapability(actor.role, "channels.view");

  // Every case-scoped panel below is filtered through this, so a PM
  // without cases.view_all sees this client's cases only where they hold
  // an active membership (ADR-007 §8).
  const restriction = canSeeCases ? await accessibleCaseIdFilter(actor) : { _id: { $in: [] } };
  const caseQuery = { primaryClient: record._id, ...(restriction ?? {}) };

  const cases = canSeeCases
    ? await ClientCase.find(caseQuery)
        .select("caseNumber title caseType currentStage priority targetFilingDate archivedAt updatedAt")
        .sort({ updatedAt: -1 })
        .limit(PANEL_LIMIT)
        .lean()
    : [];

  const accessibleCaseIds = (cases as Record<string, unknown>[]).map((c) => c._id);
  const caseScope = { case: { $in: accessibleCaseIds } };

  const [consultations, memberRows, documents, queries, communication, notifications, invitation] =
    await Promise.all([
      Consultation.find({ clientUser: record._id })
        .select("name email service status createdAt convertedCase")
        .sort({ createdAt: -1 })
        .limit(PANEL_LIMIT)
        .lean(),

      WorkspaceMember.find({ clientUser: record._id, memberType: "client" })
        .sort({ createdAt: -1 })
        .limit(PANEL_LIMIT)
        .lean(),

      canSeeDocuments
        ? CaseDocument.find({ ...caseScope, archivedAt: null })
            .select("displayName status category case uploadedAt uploadedByType")
            .sort({ uploadedAt: -1 })
            .limit(PANEL_LIMIT)
            .lean()
        : Promise.resolve(null),

      canSeeQueries
        ? ConsultationInteraction.find({
            clientUser: record._id,
            // A case-scoped query on a case this employee cannot open must
            // not appear; consultation-scoped ones are not case-scoped at
            // all and stay visible to a clients.view holder.
            $or: [{ scopeType: "consultation" }, caseScope],
          })
            .select("interactionNumber subject type status priority scheduledFor createdAt case")
            .sort({ createdAt: -1 })
            .limit(PANEL_LIMIT)
            .lean()
        : Promise.resolve(null),

      canSeeChannels
        ? WorkspaceMessage.find({
            ...caseScope,
            senderType: "client",
            senderClient: record._id,
            deletedAt: null,
          })
            .select("body case channel createdAt senderDisplayName")
            .sort({ createdAt: -1 })
            .limit(PANEL_LIMIT)
            .lean()
        : Promise.resolve(null),

      Notification.find({ recipientType: "client", recipientClient: record._id })
        .select("title message type isRead emailState createdAt")
        .sort({ createdAt: -1 })
        .limit(PANEL_LIMIT)
        .lean(),

      PortalInvitation.findOne({
        normalizedEmail: record.normalizedEmail,
        usedAt: null,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
        .select("purpose expiresAt createdAt attemptCount")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

  const workspaceIds = (memberRows as Record<string, unknown>[]).map((m) => m.workspace);
  const workspaces = workspaceIds.length
    ? await CaseWorkspace.find({ _id: { $in: workspaceIds } }).select("case").lean()
    : [];
  const caseIdByWorkspace = new Map(
    (workspaces as Record<string, unknown>[]).map((w) => [String(w._id), String(w.case)]),
  );

  // Membership rows name their case only where this employee can see that
  // case; otherwise the row still shows (the client IS a member) but the
  // case identity stays withheld rather than leaking a case number.
  const memberCaseIds = [...new Set([...caseIdByWorkspace.values()])];
  const namedCases = memberCaseIds.length
    ? await ClientCase.find({
        _id: { $in: memberCaseIds },
        ...(restriction ?? {}),
      })
        .select("caseNumber title")
        .lean()
    : [];
  const caseById = new Map(
    (namedCases as Record<string, unknown>[]).map((c) => [String(c._id), c]),
  );

  const memberships = (memberRows as Record<string, unknown>[]).map((member) => {
    const caseId = caseIdByWorkspace.get(String(member.workspace)) ?? null;
    const namedCase = caseId ? caseById.get(caseId) : undefined;
    return {
      id: String(member._id),
      caseId: namedCase ? caseId : null,
      caseNumber: namedCase ? String(namedCase.caseNumber) : "Restricted",
      caseTitle: namedCase ? String(namedCase.title) : "Not visible to your role",
      workspaceRole: String(member.workspaceRole),
      status: String(member.status),
      joinedAt: (member.joinedAt as Date | null) ?? null,
    };
  });

  return {
    client: {
      id: String(record._id),
      name: displayName(record),
      email: String(record.email || ""),
      phone: String(record.phone || ""),
      status: String(record.status || "pending"),
      lastLoginAt: (record.lastLoginAt as Date | null) ?? null,
      emailVerifiedAt: (record.emailVerifiedAt as Date | null) ?? null,
      lockedUntil: (record.lockedUntil as Date | null) ?? null,
      hasPassword: Boolean(record.passwordHash),
      createdAt: (record.createdAt as Date | null) ?? null,
    },
    consultations: consultations as Record<string, unknown>[],
    cases: cases as Record<string, unknown>[],
    memberships,
    documents: documents as Record<string, unknown>[] | null,
    queries: queries as Record<string, unknown>[] | null,
    communication: communication as Record<string, unknown>[] | null,
    notifications: notifications as Record<string, unknown>[],
    invitation: (invitation as Record<string, unknown> | null) ?? null,
  };
}
