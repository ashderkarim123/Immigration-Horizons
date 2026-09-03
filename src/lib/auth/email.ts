import "server-only";

import { sendMail } from "../email/transport";

/**
 * Portal transactional email (activation, password reset).
 *
 * Composes the copy; ../email/transport.ts owns the transport and the
 * "missing configuration / failed send logs a warning, never throws"
 * contract (ADR-013). An email failure here must never block or roll back
 * the caller (consultation submission, reset request).
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
  return sendMail({ ...params, tag: "portal-email" });
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
