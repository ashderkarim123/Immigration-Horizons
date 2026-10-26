/**
 * An account that exists but has never proven control of its email: created by a
 * form submission (or by staff converting a lead), with no password and no
 * verification (ADR-033). It can hold only the powerless "welcome" session and
 * can be adopted by whoever redeems the emailed activation link.
 *
 * Deliberately narrow: a `pending` account that somehow has a password, or any
 * account that was ever verified, is NOT unverified in this sense, so it can
 * never be adopted or handed a session by this flow.
 */
export function isUnverifiedAccount(client: {
  status?: string | null;
  passwordHash?: string | null;
  emailVerifiedAt?: Date | null;
}): boolean {
  return client.status === "pending" && !client.passwordHash && !client.emailVerifiedAt;
}
