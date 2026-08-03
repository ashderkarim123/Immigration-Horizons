const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Length over composition rules, per NIST 800-63B — no forced "special character" theater. */
export const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 200;

export function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email);
}

export function isValidPassword(password: unknown): password is string {
  return (
    typeof password === "string" &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH
  );
}

/**
 * Restricts a client-supplied post-login redirect target to a same-app
 * portal path, so `next=` can never be used as an open redirect.
 */
export function safePortalRedirect(next: unknown, fallback = "/portal"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/portal")) return fallback;
  if (next.startsWith("//") || next.includes("://")) return fallback;
  return next;
}
