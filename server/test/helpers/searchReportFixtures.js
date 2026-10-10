/**
 * Shared fixtures for the Staff search/reporting integration tests: employees who log in through the real API, cases with
 * workspaces, and a helper that puts one of every source on a case. Everything is synthetic, in the disposable test database.
 */
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');

const AdminUser = require('../../models/admin/User');
const ClientUser = require('../../models/ClientUser');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const WorkspaceMember = require('../../models/WorkspaceMember');

const ORIGIN = 'http://localhost:4000';
const PASSWORD = 'Password123!';
let seq = 0;
const unique = (label) => `${label}-${Date.now()}-${(seq += 1)}`;
const oid = () => new mongoose.Types.ObjectId();

async function staffAgent(app, role, workspaces = [], extra = {}) {
  const email = `${unique(role)}@ih.test`;
  const user = await AdminUser.create({ name: extra.name || `Staff ${role}`, email, password: PASSWORD, role, isActive: true, mustChangePassword: false, ...(extra.timeZone ? { timeZone: extra.timeZone } : {}) });
  const members = [];
  for (const ws of workspaces) members.push(await WorkspaceMember.create({ workspace: ws._id, memberType: 'employee', adminUser: user._id, workspaceRole: 'contributor', status: 'active' }));
  const agent = request.agent(app);
  assert.equal((await agent.post('/api/v1/staff/session/login').set('Origin', ORIGIN).send({ email, password: PASSWORD })).status, 200);
  return { agent, user, members };
}

async function seedCase(title, number, over = {}) {
  const email = `${unique('client')}@example.com`;
  const client = await ClientUser.create({ email, normalizedEmail: email, passwordHash: 'x', firstName: 'Casey', lastName: 'Client', status: 'active' });
  const owner = await AdminUser.create({ name: 'Case Owner', email: `${unique('owner')}@ih.test`, password: PASSWORD, role: 'pm' });
  const caseDoc = await ClientCase.create({
    caseNumber: number || `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title,
    caseType: 'eb2_niw',
    primaryClient: client._id,
    projectManager: owner._id,
    createdBy: owner._id,
    createdByName: owner.name,
    ...over,
  });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'WS', createdBy: owner._id, createdByName: owner.name });
  return { caseDoc, workspace, client, owner };
}

module.exports = { ORIGIN, PASSWORD, unique, oid, staffAgent, seedCase };
