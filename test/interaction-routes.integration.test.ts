import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

process.env.SITE_URL = "http://localhost:3000";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";
import { jsonRequest, extractCookie, cookieHeader } from "./helpers/http";

import { ClientUser } from "../src/lib/models/ClientUser";
import { Consultation } from "../src/lib/models/Consultation";
import { ConsultationInteraction } from "../src/lib/models/ConsultationInteraction";

import { hashPassword } from "../src/lib/auth/crypto";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/session";

import { POST as loginPOST } from "../src/app/api/portal/login/route";
import { POST as createInteractionPOST } from "../src/app/api/portal/interactions/route";
import { POST as followUpPOST } from "../src/app/api/portal/interactions/[id]/follow-up/route";
import { POST as resolutionPOST } from "../src/app/api/portal/interactions/[id]/resolution/route";

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

const STRONG_PASSWORD = "correct-horse-battery-staple";

async function loggedInClient() {
  const email = "route-client@example.com";
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

test("POST /api/portal/interactions: authenticated client creates a consultation-scoped interaction", async () => {
  const { client, cookie } = await loggedInClient();
  const consultation = await Consultation.create({
    name: "T",
    email: client.email,
    message: "x".repeat(20),
    clientUser: client._id,
  });

  const res = await createInteractionPOST(
    jsonRequest(
      "/api/portal/interactions",
      {
        scopeType: "consultation",
        consultationId: String(consultation._id),
        subject: "My question",
        description: "Details about my question.",
        type: "follow_up_query",
      },
      { cookie },
    ),
  );

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.interactionId);
  assert.equal(await ConsultationInteraction.countDocuments({}), 1);
});

test("POST /api/portal/interactions: unauthenticated request is rejected", async () => {
  const res = await createInteractionPOST(
    jsonRequest("/api/portal/interactions", {
      scopeType: "consultation",
      consultationId: "507f1f77bcf86cd799439011",
      subject: "x",
      description: "x",
      type: "follow_up_query",
    }),
  );
  assert.equal(res.status, 401);
});

test("POST /api/portal/interactions: CSRF — mismatched Origin is rejected", async () => {
  const { cookie } = await loggedInClient();
  const res = await createInteractionPOST(
    jsonRequest(
      "/api/portal/interactions",
      { scopeType: "consultation", consultationId: "507f1f77bcf86cd799439011", subject: "x", description: "x", type: "follow_up_query" },
      { cookie, origin: "https://evil.example.com" },
    ),
  );
  assert.equal(res.status, 403);
});

test("POST /api/portal/interactions: invalid scope/type is rejected", async () => {
  const { cookie } = await loggedInClient();
  const res = await createInteractionPOST(
    jsonRequest(
      "/api/portal/interactions",
      { scopeType: "not-a-real-scope", consultationId: "507f1f77bcf86cd799439011", subject: "x", description: "x", type: "follow_up_query" },
      { cookie },
    ),
  );
  assert.equal(res.status, 400);
});

test("POST /api/portal/interactions/:id/follow-up: authenticated owner can add a follow-up", async () => {
  const { client, cookie } = await loggedInClient();
  const consultation = await Consultation.create({ name: "T", email: client.email, message: "x".repeat(20), clientUser: client._id });
  const interaction = await ConsultationInteraction.create({
    interactionNumber: "IQ-2026-AAAAAA",
    scopeType: "consultation",
    clientUser: client._id,
    consultation: consultation._id,
    subject: "Subject",
    description: "Description.",
    type: "follow_up_query",
    createdByType: "client",
    createdByClient: client._id,
  });

  const res = await followUpPOST(
    jsonRequest(`/api/portal/interactions/${interaction._id}/follow-up`, { body: "Here is more info." }, { cookie }),
    { params: Promise.resolve({ id: String(interaction._id) }) },
  );
  assert.equal(res.status, 200);
});

test("POST /api/portal/interactions/:id/follow-up: another client's interaction returns not_found", async () => {
  const owner = await ClientUser.create({
    email: "owner2@example.com",
    normalizedEmail: "owner2@example.com",
    passwordHash: "x",
    status: "active",
  });
  const consultation = await Consultation.create({ name: "T", email: owner.email, message: "x".repeat(20), clientUser: owner._id });
  const interaction = await ConsultationInteraction.create({
    interactionNumber: "IQ-2026-BBBBBB",
    scopeType: "consultation",
    clientUser: owner._id,
    consultation: consultation._id,
    subject: "Subject",
    description: "Description.",
    type: "follow_up_query",
    createdByType: "client",
    createdByClient: owner._id,
  });

  const { cookie } = await loggedInClient(); // a different client
  const res = await followUpPOST(
    jsonRequest(`/api/portal/interactions/${interaction._id}/follow-up`, { body: "hi" }, { cookie }),
    { params: Promise.resolve({ id: String(interaction._id) }) },
  );
  assert.equal(res.status, 404);
});

test("POST /api/portal/interactions/:id/resolution: resolved=true closes the interaction", async () => {
  const { client, cookie } = await loggedInClient();
  const consultation = await Consultation.create({ name: "T", email: client.email, message: "x".repeat(20), clientUser: client._id });
  const interaction = await ConsultationInteraction.create({
    interactionNumber: "IQ-2026-CCCCCC",
    scopeType: "consultation",
    clientUser: client._id,
    consultation: consultation._id,
    subject: "Subject",
    description: "Description.",
    type: "follow_up_query",
    status: "answered",
    answeredAt: new Date(),
    answeredBy: new mongoose.Types.ObjectId(),
    clientVisibleResponse: "Answer.",
    createdByType: "client",
    createdByClient: client._id,
  });

  const res = await resolutionPOST(
    jsonRequest(`/api/portal/interactions/${interaction._id}/resolution`, { resolved: true }, { cookie }),
    { params: Promise.resolve({ id: String(interaction._id) }) },
  );
  assert.equal(res.status, 200);

  const updated = await ConsultationInteraction.findById(interaction._id);
  assert.equal(updated!.status, "closed");
});

test("POST /api/portal/interactions/:id/resolution: missing resolved field is rejected", async () => {
  const { client, cookie } = await loggedInClient();
  const consultation = await Consultation.create({ name: "T", email: client.email, message: "x".repeat(20), clientUser: client._id });
  const interaction = await ConsultationInteraction.create({
    interactionNumber: "IQ-2026-DDDDDD",
    scopeType: "consultation",
    clientUser: client._id,
    consultation: consultation._id,
    subject: "Subject",
    description: "Description.",
    type: "follow_up_query",
    createdByType: "client",
    createdByClient: client._id,
  });

  const res = await resolutionPOST(jsonRequest(`/api/portal/interactions/${interaction._id}/resolution`, {}, { cookie }), {
    params: Promise.resolve({ id: String(interaction._id) }),
  });
  assert.equal(res.status, 400);
});
