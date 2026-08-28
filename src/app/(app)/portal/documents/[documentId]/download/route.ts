import "server-only";

import { Readable } from "stream";

import { getDb } from "@/lib/db";
import { ClientUser } from "@/lib/models/ClientUser";
import { getSessionActor } from "@/lib/auth/session";
import { getAccessibleDocument } from "@/lib/auth/document-policy";
import { resolveDownload } from "@/lib/documents/document-download-service";

/**
 * Client document download — every request re-derives authorization from
 * scratch (ADR-004 §14): session -> active ClientUser -> active workspace
 * membership -> client-visible, non-quarantined document. Knowing the
 * document id alone never grants access.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
): Promise<Response> {
  const actor = await getSessionActor(request);
  if (!actor) return new Response("Unauthorized", { status: 401 });

  const db = getDb();
  if (!db) return new Response("Service temporarily unavailable", { status: 503 });
  await db;

  const client = await ClientUser.findById(actor.clientUserId);
  if (!client || client.status !== "active") return new Response("Unauthorized", { status: 401 });

  const { documentId } = await params;

  const accessible = await getAccessibleDocument(documentId, String(client._id));
  if (!accessible) return new Response("Not found", { status: 404 });

  const result = await resolveDownload({
    documentId,
    clientUserId: String(client._id),
    clientName: client.firstName || client.email,
  });

  if (result.outcome === "not_found") return new Response("Not found", { status: 404 });
  if (result.outcome === "denied") return new Response("This file is not available for download.", { status: 403 });

  const webStream = Readable.toWeb(result.stream) as ReadableStream;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Disposition": `attachment; filename="${result.filename.replace(/"/g, "")}"`,
      "Content-Type": result.contentType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "sandbox",
    },
  });
}
