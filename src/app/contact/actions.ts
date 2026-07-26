"use server";

import { deliverLead } from "@/lib/leads";
import { isRateLimited } from "@/lib/rate-limit";
import type { FormState } from "@/app/consultation/actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitContact(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (formData.get("company")) {
    return { status: "success" };
  }

  if (await isRateLimited("contact")) {
    return {
      status: "error",
      message: "Too many requests. Please wait a minute and try again.",
    };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Please enter your name.";
  if (!email || !EMAIL_RE.test(email))
    errors.email = "Please enter a valid email address.";
  if (!message || message.length < 10)
    errors.message = "Please add a short message.";

  if (Object.keys(errors).length) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      errors,
    };
  }

  const delivered = await deliverLead({ kind: "contact", name, email, message });

  if (!delivered) {
    return {
      status: "error",
      message:
        "Something went wrong sending your message. Please try again, or reach us directly on WhatsApp.",
    };
  }

  return {
    status: "success",
    message: "Thanks for reaching out — we'll get back to you by email shortly.",
  };
}
