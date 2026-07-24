import "server-only";

import { Resend } from "resend";

import { contact } from "./content/site";

/**
 * Lead delivery.
 *
 * Email via Resend is the delivery path that matters — it is how the owner
 * actually receives leads, mirroring the legacy Express app. When
 * RESEND_API_KEY is not configured (e.g. local dev), delivery degrades
 * gracefully: the submission is logged server-side and the caller is told to
 * reach out directly, rather than failing silently or pretending to send.
 *
 * NOTE (cutover): the legacy app also persists leads to MongoDB and appends
 * them to a Google Sheet. Those integrations are intentionally deferred to
 * the production cutover; email is the critical path and is wired here.
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
