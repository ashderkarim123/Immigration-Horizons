"use server";

import { deliverLead } from "@/lib/leads";
import { isRateLimited } from "@/lib/rate-limit";
import { caseCategories, supportServices } from "@/lib/content/services";

export type FormState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** Field-level errors keyed by field name. */
  errors?: Record<string, string>;
};

const validServiceValues = new Set(
  [...caseCategories, ...supportServices].map((s) => s.name),
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readTracking(formData: FormData): Record<string, string> {
  const keys = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "fbclid",
  ];
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  return out;
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
    };
  }

  const delivered = await deliverLead({
    kind: "consultation",
    name,
    email,
    phone,
    service,
    message,
    tracking: readTracking(formData),
  });

  if (!delivered) {
    return {
      status: "error",
      message:
        "Something went wrong sending your request. Please try again, or reach us directly on WhatsApp.",
    };
  }

  return {
    status: "success",
    message:
      "Thank you — your consultation request has been received. We'll follow up by email or WhatsApp.",
  };
}
