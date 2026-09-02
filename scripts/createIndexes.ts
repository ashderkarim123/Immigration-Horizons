/**
 * Creates the indexes declared in this app's Mongoose schemas. Mirrors
 * server/scripts/createIndexes.js exactly (dry-run flag, production-URI
 * guard, createIndexes()-only — never syncIndexes(), which can drop
 * indexes not present in the current schema).
 *
 *   npx tsx scripts/createIndexes.ts --dry-run   # lists what would be created, writes nothing
 *   npx tsx scripts/createIndexes.ts             # creates them
 *
 * Deliberately NOT run automatically on app startup — see src/lib/db.ts's
 * autoIndex guard for why. Before running in production: back up first, run
 * during low traffic, review the dry-run output, then verify afterward with
 * mongosh (db.<collection>.getIndexes()).
 */
import "dotenv/config";
import mongoose from "mongoose";

import { Consultation } from "../src/lib/models/Consultation";
import { ClientUser } from "../src/lib/models/ClientUser";
import { PortalInvitation } from "../src/lib/models/PortalInvitation";
import { PasswordResetToken } from "../src/lib/models/PasswordResetToken";
import { ClientSession } from "../src/lib/models/ClientSession";
import { ClientCase } from "../src/lib/models/ClientCase";
import { CaseWorkspace } from "../src/lib/models/CaseWorkspace";
import { WorkspaceMember } from "../src/lib/models/WorkspaceMember";
import { ConsultationInteraction } from "../src/lib/models/ConsultationInteraction";
import { InteractionHistory } from "../src/lib/models/InteractionHistory";
import { InteractionUpdate } from "../src/lib/models/InteractionUpdate";
import { DocumentCategory } from "../src/lib/models/DocumentCategory";
import { CaseDocument } from "../src/lib/models/CaseDocument";
import { DocumentVersion } from "../src/lib/models/DocumentVersion";
import { DocumentRequest } from "../src/lib/models/DocumentRequest";
import { DocumentAccessLog } from "../src/lib/models/DocumentAccessLog";
import { WorkspaceChannel } from "../src/lib/models/WorkspaceChannel";
import { ChannelMember } from "../src/lib/models/ChannelMember";
import { WorkspaceMessage } from "../src/lib/models/WorkspaceMessage";
import { MessageRevision } from "../src/lib/models/MessageRevision";
import { ChannelReadState } from "../src/lib/models/ChannelReadState";
import { Notification } from "../src/lib/models/Notification";
import { NotificationPreference } from "../src/lib/models/NotificationPreference";
import { EmployeeSession } from "../src/lib/models/EmployeeSession";
import { CaseActivity } from "../src/lib/models/CaseActivity";

// Cycle 2 case/workspace/membership models are also declared here even
// though server/ is their primary writer (see
// docs/architecture/ADR-002-case-workspace-domain.md) — createIndexes() is
// additive/idempotent, so running it from either app is a safe no-op once
// the indexes exist, and this keeps index provisioning documented and
// runnable from whichever app's deployment pipeline gets there first.
const MODELS = [
  Consultation,
  ClientUser,
  PortalInvitation,
  PasswordResetToken,
  ClientSession,
  ClientCase,
  CaseWorkspace,
  WorkspaceMember,
  // Cycle 3 — this app is a real writer for these (ADR-003 §1), not just a reader.
  ConsultationInteraction,
  InteractionHistory,
  InteractionUpdate,
  // Cycle 5 — this app is a real writer for these (ADR-004 §1), not just a reader.
  DocumentCategory,
  CaseDocument,
  DocumentVersion,
  DocumentRequest,
  DocumentAccessLog,
  // Cycle 6 — this app is a real writer for these (ADR-005 §1), not just a reader.
  WorkspaceChannel,
  ChannelMember,
  WorkspaceMessage,
  MessageRevision,
  ChannelReadState,
  // Cycle 7 — this app is a real writer for these (ADR-006 §1), not just a
  // reader. Notification's identity-keyed indexes are new this cycle;
  // NotificationPreference is a brand new model.
  Notification,
  NotificationPreference,
  // Cycle 8B — employee sessions for the SaaS app. Owned solely by this
  // app (the admin CMS keeps its own express-session store), so it is the
  // only place these indexes are declared.
  EmployeeSession,
  // Cycle 8C — this app became a writer to case_activities (ADR-010 §3),
  // so it declares that collection's indexes too. server/ declares the
  // same ones; createIndexes() is additive and idempotent, so whichever
  // pipeline runs first wins and the second is a no-op.
  CaseActivity,
];

const isDryRun = process.argv.includes("--dry-run");

function redact(uri: string): string {
  return uri.replace(/\/\/[^@/]+@/, "//<redacted>@");
}

async function run() {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.includes("<") || uri.includes(">")) {
    console.error(
      "[db:indexes] MONGODB_URI is not set (or still has placeholder values). Refusing to run — " +
        "this script must be pointed at a real database explicitly, never a guess.",
    );
    process.exit(1);
  }

  console.log(`[db:indexes] Target: ${redact(uri)}`);
  console.log(`[db:indexes] Mode: ${isDryRun ? "DRY RUN (no writes)" : "CREATE"}`);

  for (const model of MODELS) {
    const specs = model.schema.indexes();
    console.log(
      `\n[db:indexes] ${model.modelName} (collection: ${model.collection.collectionName}) — ${specs.length} declared index(es):`,
    );
    for (const [fields, options] of specs) {
      const flags = [
        options?.unique ? "unique" : null,
        options?.expireAfterSeconds !== undefined
          ? `TTL ${options.expireAfterSeconds}s`
          : null,
      ]
        .filter(Boolean)
        .join(", ");
      console.log(`  - ${JSON.stringify(fields)}${flags ? ` (${flags})` : ""}`);
    }
  }

  if (isDryRun) {
    console.log("\n[db:indexes] Dry run only — no connection made, nothing created.");
    return;
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  console.log(
    "\n[db:indexes] Connected. Creating indexes (createIndexes — additive only, never drops existing indexes)...",
  );

  for (const model of MODELS) {
    const before = await model.collection.indexes().catch(() => []);
    await model.createIndexes();
    const after = await model.collection.indexes();
    console.log(
      `[db:indexes] ${model.modelName}: ${before.length} index(es) before -> ${after.length} after.`,
    );
  }

  console.log(
    "[db:indexes] Done. Verify with `mongosh` (db.<collection>.getIndexes()) and monitor query/application logs.",
  );
  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("[db:indexes] Failed:", err.message);
  process.exit(1);
});
