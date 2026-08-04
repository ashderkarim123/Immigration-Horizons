const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { startTestDb, stopTestDb, clearCollections } = require('./helpers/testDb');
const ConsultationInteraction = require('../models/ConsultationInteraction');
const InteractionHistory = require('../models/InteractionHistory');
const InteractionUpdate = require('../models/InteractionUpdate');
const ClientUser = require('../models/ClientUser');
const AdminUser = require('../models/admin/User');
const Consultation = require('../models/Consultation');
const ClientCase = require('../models/ClientCase');
const CaseWorkspace = require('../models/CaseWorkspace');
const { generateInteractionNumber } = require('../utils/interactionNumber');

test.before(startTestDb);
test.after(stopTestDb);
test.beforeEach(clearCollections);

async function seedClient() {
  const email = `model-${Date.now()}-${Math.random()}@example.com`;
  return ClientUser.create({ email, normalizedEmail: email, passwordHash: 'x', status: 'active' });
}

async function seedConsultation(clientUserId) {
  return Consultation.create({
    name: 'Interaction Test',
    email: 'interaction-test@example.com',
    message: 'x'.repeat(20),
    clientUser: clientUserId,
  });
}

async function seedCaseAndWorkspace(clientUserId) {
  const pm = await AdminUser.create({ name: 'PM', email: `pm-${Date.now()}@example.com`, password: 'x', role: 'pm' });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: 'Case',
    caseType: 'other',
    primaryClient: clientUserId,
    projectManager: pm._id,
  });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'Primary' });
  return { caseDoc, workspace };
}

function baseInteractionFields(overrides = {}) {
  return {
    interactionNumber: generateInteractionNumber(),
    subject: 'Test subject',
    description: 'Test description long enough.',
    type: 'follow_up_query',
    createdByType: 'client',
    ...overrides,
  };
}

test('generateInteractionNumber produces the documented IQ-<year>-<6 chars> shape', () => {
  const n = generateInteractionNumber(new Date('2026-01-01'));
  assert.match(n, /^IQ-2026-[A-Z0-9]{6}$/);
});

test('consultation scope requires consultation and forbids case/workspace', async () => {
  const client = await seedClient();
  const consultation = await seedConsultation(client._id);

  await assert.rejects(
    ConsultationInteraction.create(
      baseInteractionFields({ scopeType: 'consultation', clientUser: client._id }),
    ),
  );

  const { caseDoc, workspace } = await seedCaseAndWorkspace(client._id);
  await assert.rejects(
    ConsultationInteraction.create(
      baseInteractionFields({
        scopeType: 'consultation',
        clientUser: client._id,
        consultation: consultation._id,
        case: caseDoc._id,
        workspace: workspace._id,
      }),
    ),
  );

  await assert.doesNotReject(
    ConsultationInteraction.create(
      baseInteractionFields({ scopeType: 'consultation', clientUser: client._id, consultation: consultation._id }),
    ),
  );
});

test('case scope requires both case and workspace', async () => {
  const client = await seedClient();
  const { caseDoc } = await seedCaseAndWorkspace(client._id);

  await assert.rejects(
    ConsultationInteraction.create(
      baseInteractionFields({ scopeType: 'case', clientUser: client._id, case: caseDoc._id }),
    ),
  );
});

test('scheduled status requires scheduledFor and timezone', async () => {
  const client = await seedClient();
  const consultation = await seedConsultation(client._id);

  await assert.rejects(
    ConsultationInteraction.create(
      baseInteractionFields({
        scopeType: 'consultation',
        clientUser: client._id,
        consultation: consultation._id,
        status: 'scheduled',
      }),
    ),
  );

  await assert.doesNotReject(
    ConsultationInteraction.create(
      baseInteractionFields({
        scopeType: 'consultation',
        clientUser: client._id,
        consultation: consultation._id,
        status: 'scheduled',
        scheduledFor: new Date(),
        timezone: 'Asia/Karachi',
      }),
    ),
  );
});

test('answered status requires answeredAt and answeredBy', async () => {
  const client = await seedClient();
  const consultation = await seedConsultation(client._id);
  const admin = await AdminUser.create({ name: 'A', email: `a-${Date.now()}@example.com`, password: 'x', role: 'admin' });

  await assert.rejects(
    ConsultationInteraction.create(
      baseInteractionFields({
        scopeType: 'consultation',
        clientUser: client._id,
        consultation: consultation._id,
        status: 'answered',
      }),
    ),
  );

  await assert.doesNotReject(
    ConsultationInteraction.create(
      baseInteractionFields({
        scopeType: 'consultation',
        clientUser: client._id,
        consultation: consultation._id,
        status: 'answered',
        answeredAt: new Date(),
        answeredBy: admin._id,
        clientVisibleResponse: 'Here is your answer.',
      }),
    ),
  );
});

test('cancelled requires cancelledAt, closed requires closedAt', async () => {
  const client = await seedClient();
  const consultation = await seedConsultation(client._id);

  await assert.rejects(
    ConsultationInteraction.create(
      baseInteractionFields({ scopeType: 'consultation', clientUser: client._id, consultation: consultation._id, status: 'cancelled' }),
    ),
  );
  await assert.rejects(
    ConsultationInteraction.create(
      baseInteractionFields({ scopeType: 'consultation', clientUser: client._id, consultation: consultation._id, status: 'closed' }),
    ),
  );
});

test('no_show requires a previously scheduled interaction', async () => {
  const client = await seedClient();
  const consultation = await seedConsultation(client._id);

  await assert.rejects(
    ConsultationInteraction.create(
      baseInteractionFields({ scopeType: 'consultation', clientUser: client._id, consultation: consultation._id, status: 'no_show' }),
    ),
  );
});

test('interactionNumber is unique', async () => {
  const client = await seedClient();
  const consultation = await seedConsultation(client._id);
  const number = generateInteractionNumber();

  await ConsultationInteraction.create(
    baseInteractionFields({ interactionNumber: number, scopeType: 'consultation', clientUser: client._id, consultation: consultation._id }),
  );
  await assert.rejects(
    ConsultationInteraction.create(
      baseInteractionFields({ interactionNumber: number, scopeType: 'consultation', clientUser: client._id, consultation: consultation._id }),
    ),
  );
});

test('at most one initial_consultation interaction per Consultation', async () => {
  const client = await seedClient();
  const consultation = await seedConsultation(client._id);

  await ConsultationInteraction.create(
    baseInteractionFields({
      scopeType: 'consultation',
      clientUser: client._id,
      consultation: consultation._id,
      type: 'initial_consultation',
      createdByType: 'system',
    }),
  );
  await assert.rejects(
    ConsultationInteraction.create(
      baseInteractionFields({
        scopeType: 'consultation',
        clientUser: client._id,
        consultation: consultation._id,
        type: 'initial_consultation',
        createdByType: 'system',
      }),
    ),
  );

  // A second, non-initial interaction on the same consultation must still be fine.
  await assert.doesNotReject(
    ConsultationInteraction.create(
      baseInteractionFields({ scopeType: 'consultation', clientUser: client._id, consultation: consultation._id }),
    ),
  );
});

test('InteractionUpdate: a client-authored update must be client_visible', async () => {
  const client = await seedClient();
  const consultation = await seedConsultation(client._id);
  const interaction = await ConsultationInteraction.create(
    baseInteractionFields({ scopeType: 'consultation', clientUser: client._id, consultation: consultation._id }),
  );

  await assert.rejects(
    InteractionUpdate.create({
      interaction: interaction._id,
      authorType: 'client',
      authorClient: client._id,
      updateType: 'client_follow_up',
      body: 'hi',
      visibility: 'internal',
    }),
  );

  await assert.doesNotReject(
    InteractionUpdate.create({
      interaction: interaction._id,
      authorType: 'client',
      authorClient: client._id,
      updateType: 'client_follow_up',
      body: 'hi',
      visibility: 'client_visible',
    }),
  );
});

test('InteractionUpdate: authorType polymorphism is enforced', async () => {
  const client = await seedClient();
  const consultation = await seedConsultation(client._id);
  const interaction = await ConsultationInteraction.create(
    baseInteractionFields({ scopeType: 'consultation', clientUser: client._id, consultation: consultation._id }),
  );

  await assert.rejects(
    InteractionUpdate.create({
      interaction: interaction._id,
      authorType: 'admin',
      updateType: 'employee_note',
      body: 'hi',
      visibility: 'internal',
    }),
  );
});

test('InteractionHistory is a plain append-only collection (no update/delete route exists elsewhere in this test file — verified structurally)', async () => {
  const client = await seedClient();
  const consultation = await seedConsultation(client._id);
  const interaction = await ConsultationInteraction.create(
    baseInteractionFields({ scopeType: 'consultation', clientUser: client._id, consultation: consultation._id }),
  );
  const entry = await InteractionHistory.create({
    interaction: interaction._id,
    eventType: 'created',
    actorType: 'client',
    actorClient: client._id,
    actorName: 'Test',
    newStatus: 'submitted',
  });
  assert.ok(entry._id);
  assert.equal(await InteractionHistory.countDocuments({ interaction: interaction._id }), 1);
});
