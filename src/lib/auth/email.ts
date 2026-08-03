import "server-only";

import { Resend } from "resend";

/**
 * Portal transactional email (activation, password reset). Deliberately
 * mirrors src/lib/leads.ts's Resend usage and its "missing key/failed send
 * logs a warning, never throws" behavior — an email failure here must never
 * block or roll back the caller (consultation submission, reset request).
 */

function escapeHtml(value = ""): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function siteUrl(): string {
  return process.env.SITE_URL || "http://localhost:3000";
}

async function sendPortalEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      `[portal-email] RESEND_API_KEY not set — "${params.subject}" not sent to ${params.to}.`,
    );
    return false;
  }

  const resend = new Resend(apiKey);
  const from =
    process.env.EMAIL_FROM ||
    "Immigration Horizons Portal <onboarding@resend.dev>";

  try {
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    if (error) {
      console.error("[portal-email] Resend send failed:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[portal-email] Resend send threw:", err);
    return false;
  }
}

export async function sendActivationEmail(params: {
  email: string;
  firstName: string;
  token: string;
}): Promise<boolean> {
  const activateUrl = `${siteUrl()}/portal/activate?token=${encodeURIComponent(params.token)}`;
  const html = `
    <h2>Welcome to your Immigration Horizons client portal</h2>
    <p>Hi ${escapeHtml(params.firstName)},</p>
    <p>Thanks for reaching out to Immigration Horizons. You can create a secure
    portal account to track your consultation using the link below.</p>
    <p><a href="${activateUrl}">Activate your portal account</a></p>
    <p>This link expires in 7 days and can only be used once.</p>
    <p>If you weren't expecting this email, you can safely ignore it.</p>
  `;
  return sendPortalEmail({
    to: params.email,
    subject: "Activate your Immigration Horizons client portal account",
    html,
  });
}

export async function sendPasswordResetEmail(params: {
  email: string;
  firstName: string;
  token: string;
}): Promise<boolean> {
  const resetUrl = `${siteUrl()}/portal/reset-password?token=${encodeURIComponent(params.token)}`;
  const html = `
    <h2>Reset your Immigration Horizons portal password</h2>
    <p>Hi ${escapeHtml(params.firstName)},</p>
    <p>We received a request to reset your portal password. This link expires
    in 1 hour and can only be used once.</p>
    <p><a href="${resetUrl}">Reset your password</a></p>
    <p>If you didn't request this, you can safely ignore this email — your
    password will not be changed.</p>
  `;
  return sendPortalEmail({
    to: params.email,
    subject: "Reset your Immigration Horizons portal password",
    html,
  });
}
