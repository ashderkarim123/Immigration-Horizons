import { test } from "node:test";
import assert from "node:assert/strict";

import { submitConsultation } from "../src/app/(site)/consultation/actions";
import { submitContact } from "../src/app/(site)/contact/actions";

const idle = { status: "idle" as const };

function botForm() {
  const form = new FormData();
  form.set("company", "Acme Spam Ltd"); // the hidden honeypot field a real visitor never fills
  form.set("name", "Bot");
  form.set("email", "bot@example.com");
  form.set("message", "buy cheap things now please");
  return form;
}

// Analytics counts a lead only when `accepted` is true. These run before any database, rate-limit or email
// work, so they also prove a bot costs nothing and reaches none of it.
test("a honeypot hit on the contact form looks like success to the bot but is never an accepted lead", async () => {
  const result = await submitContact(idle, botForm());
  assert.equal(result.status, "success");
  assert.notEqual(result.accepted, true);
  assert.equal(result.redirectTo, undefined);
});

test("a honeypot hit on the consultation form is not an accepted lead and sends the bot nowhere", async () => {
  const result = await submitConsultation(idle, botForm());
  assert.equal(result.status, "success");
  assert.notEqual(result.accepted, true);
  assert.equal(result.redirectTo, undefined);
});
