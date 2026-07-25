import "server-only";

import { Resend } from "resend";

import { contact } from "./content/site";
import { getDb } from "./db";
import { Consultation } from "./models/Consultation";

/**
 * Lead delivery.
 *
 * Two independent paths run on every submission:
 *   1. Persist to MongoDB (the `consultations` collection shared with the
 *      admin CMS at web/server) — this is what fills the Leads dashboard.
 *   2. Email via Resend — the immediate notification to the inbox.
 *
 * The two are intentionally decoupled: a MongoDB hiccup should not stop a
 * lead's email notification from going out, and a missing Resend key should
 * not stop the lead from being saved. The user-facing success/failure
 * message is driven by email delivery, since that is the promise made on
 * the form ("we'll follow up by email or WhatsApp") — but every lead is
 * saved to the database whenever the database is reachable, independent of
 * whether the email step succeeds.
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

async function persistLead(lead: LeadInput): Promise<void> {
  const db = getDb();
  if (!db) return; // MONGODB_URI not set — already warned in getDb()

  try {
    await db;
    await Consultation.create({
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
  } catch (err) {
    // Persistence is additive to email delivery — log and move on rather
    // than failing the whole submission over a database problem.
    console.error("[leads] Failed to save lead to MongoDB:", err);
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Returns true when the lead was delivered (or safely accepted for delivery),
 * false only when a configured send actually failed.
 */
export async function deliverLead(lead: LeadInput): Promise<boolean> {
  // Save first so the lead is captured even if the email step throws.
  await persistLead(lead);

  const apiKey = process.env.RESEND_API_KEY;
  const receiver = process.env.CONTACT_RECEIVER_EMAIL || contact.email;

  if (!apiKey) {
    // Not configured — accept the lead but make the gap visible in logs.
    console.warn(
      `[leads] RESEND_API_KEY not set — ${lead.kind} lead from ${lead.email} was not emailed.`,
    );
    return true;
  }

  const resend = new Resend(apiKey);
  const from =
    process.env.EMAIL_FROM ||
    "Immigration Horizons Website <onboarding@resend.dev>";

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

  try {
    const { error } = await resend.emails.send({
      from,
      to: receiver,
      replyTo: lead.email,
      subject: isContact
        ? `New Contact Message - ${lead.name}`
        : `New Consultation Request - ${lead.service ?? ""} - ${lead.name}`,
      html,
    });

    if (error) {
      console.error("[leads] Resend send failed:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[leads] Resend send threw:", err);
    return false;
  }
}
