/**
 * The per-user sync limiter (ADR-026 §15). Its own file because the limit is read when the app loads.
 */
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';
process.env.USCIS_SYNC_RATE_LIMIT = '2';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { createApp } = require('../../app');
const AdminUser = require('../../models/admin/User');
const ClientUser = require('../../models/ClientUser');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const USCISFiling = require('../../models/USCISFiling');

const ORIGIN = 'http://localhost:4000';

test('sync is limited per employee: the third refresh inside a minute is a 429 and never reaches the provider', async () => {
  await startTestDb();
  await clearCollections();
  const app = createApp();
  let calls = 0;
  app.locals.uscisProvider = {
    status: () => ({ configured: true, enabled: true, environment: 'sandbox' }),
    getStatus: async (receipt) => {
      calls += 1;
      return { receiptNumber: receipt, formType: 'I-140', submittedAt: null, providerModifiedAt: null, current: { title: 'Case Was Received', description: '', occurredAt: null }, history: [], providerFingerprint: 'fp' };
    },
  };

  try {
    const admin = await AdminUser.create({ name: 'Admin', email: 'limit-admin@ih.test', password: 'Password123!', role: 'super_admin', isActive: true, mustChangePassword: false });
    const client = await ClientUser.create({ email: 'limit-client@example.com', normalizedEmail: 'limit-client@example.com', passwordHash: 'x', firstName: 'C', status: 'active' });
    const caseDoc = await ClientCase.create({ caseNumber: 'IH-2026-LIMIT1', title: 'Limit', caseType: 'other', primaryClient: client._id, projectManager: admin._id, createdBy: admin._id, createdByName: 'Admin' });
    const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'WS', createdBy: admin._id, createdByName: 'Admin' });
    const filing = await USCISFiling.create({ case: caseDoc._id, workspace: workspace._id, title: 'I-140', formType: 'I-140', receiptNumber: 'IOE1234567890' });

    const agent = request.agent(app);
    assert.equal((await agent.post('/api/v1/staff/session/login').set('Origin', ORIGIN).send({ email: 'limit-admin@ih.test', password: 'Password123!' })).status, 200);
    const sync = () => agent.post(`/api/v1/staff/uscis/${filing._id}/sync`).set('Origin', ORIGIN).send({});

    assert.equal((await sync()).status, 200);
    assert.equal((await sync()).status, 200);
    const limited = await sync();
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error.code, 'rate_limited');
    assert.equal(calls, 2, 'the limited request never reached the provider');
  } finally {
    await stopTestDb();
  }
});
