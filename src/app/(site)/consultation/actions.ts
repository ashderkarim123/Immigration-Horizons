"use server";

import { deliverLead } from "@/lib/leads";
import { isRateLimited } from "@/lib/rate-limit";
import { caseCategories, supportServices } from "@/lib/content/services";
import { linkOrInviteAfterConsultation } from "@/lib/auth/invitations";
import { HANDOFF_COOKIE, HANDOFF_COOKIE_PATH, HANDOFF_MAX_AGE_SECONDS, createUnverifiedPortalAccount } from "@/lib/auth/unverified-signup";
import { trackingFromForm } from "@/lib/tracking";

export type FormState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** Field-level errors keyed by field name. */
  errors?: Record<string, string>;
  /**
   * True only when the server genuinely took the enquiry. The honeypot answer
   * is a "success" for the bot's benefit but is never accepted, so analytics
   * can count real leads exactly once (Phase 16).
   */
  accepted?: boolean;
  /** Why a submission was rejected, for the `form_error` analytics event. */
  errorCategory?: "validation" | "rate_limit" | "delivery";
  /** Where the browser goes next. Always a thank-you page path chosen by the server. */
  redirectTo?: string;
  /** True when this submission created a portal account (drives the `sign_up` analytics event). */
  newPortalAccount?: boolean;
};

const validServiceValues = new Set(
  [...caseCategories, ...supportServices].map((s) => s.name),
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Hands a brand-new account's session to the thank-you page (ADR-033 §3). The cookie
 * is httpOnly, scoped to the thank-you path and short-lived; the portal host sets its
 * own cookie from it. With no new account any earlier hand-off is cleared, so a stale
 * token is never offered again.
 */
async function setHandoffCookie(token: string | null) {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  if (!token) {
    store.delete({ name: HANDOFF_COOKIE, path: HANDOFF_COOKIE_PATH });
    return;
  }
  store.set(HANDOFF_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: HANDOFF_COOKIE_PATH,
    maxAge: HANDOFF_MAX_AGE_SECONDS,
  });
}

export async function submitConsultation(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Honeypot: a real user never fills this hidden field.
  if (formData.get("company")) {
    return { status: "success" };
  }

  if (await isRateLimited("consultation")) {
    return {
      status: "error",
      message: "Too many requests. Please wait a minute and try again.",
      errorCategory: "rate_limit",
    };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const service = String(formData.get("service") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Please enter your name.";
  if (!email || !EMAIL_RE.test(email))
    errors.email = "Please enter a valid email address.";
  if (!service || !validServiceValues.has(service))
    errors.service = "Please choose the service you're interested in.";
  if (!message || message.length < 10)
    errors.message = "Please add a short description of your situation.";

  if (Object.keys(errors).length) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      errors,
      errorCategory: "validation",
    };
  }

  const { delivered, consultationId } = await deliverLead({
    kind: "consultation",
    name,
    email,
    phone,
    service,
    message,
    tracking: trackingFromForm(formData),
  });

  if (!delivered) {
    return {
      status: "error",
      message:
        "Something went wrong sending your request. Please try again, or reach us directly on WhatsApp.",
      errorCategory: "delivery",
    };
  }

  // Portal onboarding is additive to a successful submission — a failure
  // here (e.g. Mongo/Resend hiccup inside linkOrInviteAfterConsultation,
  // which already catches its own errors) must never turn an already-saved
  // lead into a visible failure. Only decides where the redirect below goes.
  const outcome = consultationId
    ? await linkOrInviteAfterConsultation({ email, name, consultationId })
    : "skipped_no_db";

  // A visitor whose email has no account yet is signed in straight away to a powerless,
  // unverified account, and told to verify (ADR-033). An existing account NEVER gets a
  // session from this form: anyone can type anyone's email into it.
  let signup = null;
  if (outcome === "invitation_issued") {
    const { headers } = await import("next/headers");
    const h = await headers();
    signup = await createUnverifiedPortalAccount({
      email,
      name,
      meta: { ip: h.get("x-forwarded-for") || h.get("x-real-ip") || "", userAgent: h.get("user-agent") || "" },
    });
  }
  await setHandoffCookie(signup?.sessionToken ?? null);

  // The browser navigates, not the server: a server redirect would leave the page before its
  // analytics hook could report this accepted lead. The form reports, then follows `redirectTo`;
  // without JavaScript the success panel offers it as a link.
  return {
    status: "success",
    accepted: true,
    message: "Thanks, your request has been received.",
    redirectTo: "/consultation/thank-you",
    newPortalAccount: signup !== null,
  };
}
