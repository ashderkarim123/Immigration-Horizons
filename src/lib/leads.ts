import "server-only";

import { contact } from "./content/site";
import { getDb } from "./db";
import { Consultation } from "./models/Consultation";
import { sendMail } from "./email/transport";

/**
 * Lead delivery.
 *
 * Two independent paths run on every submission:
 *   1. Persist to MongoDB (the `consultations` collection shared with the
 *      admin CMS at server/) — this is what fills the Leads dashboard.
 *   2. Email via Resend — the immediate notification to the inbox.
 *
 * The two are intentionally decoupled: a MongoDB hiccup should not stop a
 * lead's email notification from going out, and a missing/failing Resend
 * key should not stop the lead from being saved. The user-facing
 * success/failure message reflects whether EITHER channel captured the
 * lead: if it's sitting in the Leads dashboard, staff will see it and
 * follow up, so the visitor should see success even if the email
 * notification happened to fail (e.g. an unverified Resend sending
 * domain) — showing an error in that case is actively misleading, since
 * the request was in fact received. Only surface the "something went
 * wrong" message when neither channel worked, i.e. nobody at Immigration
 * Horizons will ever see this submission.
 *
 * NOTE (cutover): Google Sheets sync (utils/sheets.js in the legacy app) is
 * not ported here yet.
 */

export type LeadKind = "consultation" | "contact";

export type LeadInput = {
  kind: LeadKind;
  name: string;
  email: string;
  phone?: string;
  service?: string;
  message: string;
  tracking?: Record<string, string>;
};

/** Returns the created document's id, or null if persistence didn't happen/failed. */
async function persistLead(lead: LeadInput): Promise<string | null> {
  const db = getDb();
  if (!db) return null; // MONGODB_URI not set — already warned in getDb()

  try {
    await db;
    const doc = await Consultation.create({
      name: lead.name,
      email: lead.email,
      phone: lead.phone || "",
      service: lead.service || "Not Sure / Need Guidance",
      message: lead.message,
      source: lead.kind,
      utmSource: lead.tracking?.utm_source || "",
      utmMedium: lead.tracking?.utm_medium || "",
      utmCampaign: lead.tracking?.utm_campaign || "",
      utmTerm: lead.tracking?.utm_term || "",
      utmContent: lead.tracking?.utm_content || "",
      gclid: lead.tracking?.gclid || "",
      fbclid: lead.tracking?.fbclid || "",
    });
    return String(doc._id);
  } catch (err) {
    // Persistence is additive to email delivery — log and move on rather
    // than failing the whole submission over a database problem.
    console.error("[leads] Failed to save lead to MongoDB:", err);
    return null;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type DeliverLeadResult = {
  /**
   * True when the lead was captured by at least one channel (saved to
   * MongoDB and/or emailed) — false only when both failed, meaning nobody
   * at Immigration Horizons will see this submission.
   */
  delivered: boolean;
  /** The created Consultation document's id, or null if it wasn't persisted. */
  consultationId: string | null;
};

export async function deliverLead(lead: LeadInput): Promise<DeliverLeadResult> {
  // Save first so the lead is captured even if the email step throws.
  const consultationId = await persistLead(lead);
  const saved = consultationId !== null;

  const receiver = process.env.CONTACT_RECEIVER_EMAIL || contact.email;
  const isContact = lead.kind === "contact";
  const heading = isContact
    ? "New Contact Form Message"
    : "New Free Consultation Request";

  const html = `
    <h2>${heading}</h2>
    <p><strong>Name:</strong> ${escapeHtml(lead.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(lead.email)}</p>
    ${!isContact ? `<p><strong>Phone:</strong> ${escapeHtml(lead.phone || "-")}</p>` : ""}
    ${!isContact ? `<p><strong>Service:</strong> ${escapeHtml(lead.service || "-")}</p>` : ""}
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(lead.message).replace(/\n/g, "<br>")}</p>
    ${
      lead.tracking && Object.keys(lead.tracking).length
        ? `<hr><p style="color:#888;font-size:12px;">${Object.entries(lead.tracking)
            .map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(v)}`)
            .join("<br>")}</p>`
        : ""
    }
    <hr>
    <p style="color:#888;font-size:12px;">Submitted via immigrationhorizons.com on ${new Date().toLocaleString()}</p>
  `;

  // A send failure is not a delivery failure if the lead reached the
  // database — the two paths are independent on purpose, so `saved` alone
  // still counts as delivered.
  const sent = await sendMail({
    to: receiver,
    replyTo: lead.email,
    subject: isContact
      ? `New Contact Message - ${lead.name}`
      : `New Consultation Request - ${lead.service ?? ""} - ${lead.name}`,
    html,
    tag: "leads",
  });

  return { delivered: sent || saved, consultationId };
}
