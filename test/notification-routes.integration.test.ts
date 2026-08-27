import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";
import { jsonRequest, extractCookie, cookieHeader } from "./helpers/http";

import { ClientUser } from "../src/lib/models/ClientUser";
import { Notification } from "../src/lib/models/Notification";
import { NotificationPreference } from "../src/lib/models/NotificationPreference";

import { hashPassword } from "../src/lib/auth/crypto";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/session";

import { POST as loginPOST } from "../src/app/api/portal/login/route";
import { POST as markReadPOST } from "../src/app/api/portal/notifications/[id]/read/route";
import { POST as markAllReadPOST } from "../src/app/api/portal/notifications/read-all/route";
import { POST as preferencesPOST } from "../src/app/api/portal/notifications/preferences/route";

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

const STRONG_PASSWORD = "correct-horse-battery-staple";

async function seedLoggedInClient() {
  const email = `route-notif-client-${Date.now()}-${Math.random()}@example.com`;
  const client = await ClientUser.create({
    email,
    normalizedEmail: email,
    passwordHash: await hashPassword(STRONG_PASSWORD),
    firstName: "Route",
    status: "active",
  });
  const loginRes = await loginPOST(jsonRequest("/api/portal/login", { email, password: STRONG_PASSWORD }));
  const cookie = cookieHeader(SESSION_COOKIE_NAME, extractCookie(loginRes, SESSION_COOKIE_NAME)!);
  return { client, cookie };
}

test("POST /api/portal/notifications/:id/read: marks the caller's own notification read", async () => {
  const { client, cookie } = await seedLoggedInClient();
  const notification = await Notification.create({
    recipientType: "client",
    recipientClient: client._id,
    title: "T",
    message: "M",
    type: "query_answered",
  });

  const res = await markReadPOST(jsonRequest(`/api/portal/notifications/${notification._id}/read`, {}, { cookie }), {
    params: Promise.resolve({ id: String(notification._id) }),
  });
  assert.equal(res.status, 200);

  const updated = await Notification.findById(notification._id).lean();
  assert.ok(updated!.read);
});

test("POST /api/portal/notifications/:id/read: another client's notification is denied (cross-client access)", async () => {
  const { cookie } = await seedLoggedInClient();
  const { client: otherClient } = await seedLoggedInClient();
  const notification = await Notification.create({
    recipientType: "client",
    recipientClient: otherClient._id,
    title: "T",
    message: "M",
    type: "query_answered",
  });

  const res = await markReadPOST(jsonRequest(`/api/portal/notifications/${notification._id}/read`, {}, { cookie }), {
    params: Promise.resolve({ id: String(notification._id) }),
  });
  assert.equal(res.status, 404);

  const unchanged = await Notification.findById(notification._id).lean();
  assert.equal(unchanged!.read, false);
});

test("POST /api/portal/notifications/:id/read: unauthenticated request is rejected", async () => {
  const notification = await Notification.create({
    recipientType: "client",
    recipientClient: "507f1f77bcf86cd799439011",
    title: "T",
    message: "M",
    type: "query_answered",
  });
  const res = await markReadPOST(jsonRequest(`/api/portal/notifications/${notification._id}/read`, {}), {
    params: Promise.resolve({ id: String(notification._id) }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/portal/notifications/read-all: marks every unread notification read, and only the caller's", async () => {
  const { client, cookie } = await seedLoggedInClient();
  const { client: otherClient } = await seedLoggedInClient();
  await Notification.create({ recipientType: "client", recipientClient: client._id, title: "A", message: "A", type: "query_answered" });
  await Notification.create({ recipientType: "client", recipientClient: client._id, title: "B", message: "B", type: "query_answered" });
  await Notification.create({ recipientType: "client", recipientClient: otherClient._id, title: "C", message: "C", type: "query_answered" });

  const res = await markAllReadPOST(jsonRequest("/api/portal/notifications/read-all", {}, { cookie }));
  assert.equal(res.status, 200);

  assert.equal(await Notification.countDocuments({ recipientClient: client._id, read: false }), 0);
  assert.equal(await Notification.countDocuments({ recipientClient: otherClient._id, read: false }), 1);
});

test("POST /api/portal/notifications/preferences: updates the caller's preferences", async () => {
  const { client, cookie } = await seedLoggedInClient();

  const res = await preferencesPOST(
    jsonRequest("/api/portal/notifications/preferences", { mentionEmails: false, digestEmails: true, digestFrequency: "weekly" }, { cookie }),
  );
  assert.equal(res.status, 200);

  const prefs = await NotificationPreference.findOne({ recipientClient: client._id }).lean();
  assert.equal(prefs!.mentionEmails, false);
  assert.equal(prefs!.digestFrequency, "weekly");
});

test("POST /api/portal/notifications/preferences: CSRF — mismatched Origin is rejected", async () => {
  const { cookie } = await seedLoggedInClient();
  const res = await preferencesPOST(
    jsonRequest("/api/portal/notifications/preferences", { mentionEmails: false }, { cookie, origin: "https://evil.example.com" }),
  );
  assert.equal(res.status, 403);
});
