process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser } = require('../helpers/auth');
const { createApp } = require('../../app');

const AdminUser = require('../../models/admin/AdminUser');
const ClientUser = require('../../models/ClientUser');
const ClientCase = require('../../models/ClientCase');
const Workspace = require('../../models/Workspace');

let app;

test.before(async () => {
  await startTestDb();
  app = createApp();
});

test.after(async () => {
  await stopTestDb();
});

test.beforeEach(async () => {
  await clearCollections();
});

test('staff login: returns generic error message on invalid credentials or inactive user', async () => {
  const agent = request.agent(app);
  await seedAdminUser({ email: 'active@ih.test', password: 'Password123!', isActive: true });
  await seedAdminUser({ email: 'inactive@ih.test', password: 'Password123!', isActive: false });

  // Wrong password
  const res1 = await agent
    .post('/api/v1/staff/session/login')
    .set('Origin', 'http://localhost:4000')
    .send({ email: 'active@ih.test', password: 'WrongPassword!' });
  assert.equal(res1.status, 401);
  assert.equal(res1.body.message, 'Invalid email or password.');

  // Inactive user
  const res2 = await agent
    .post('/api/v1/staff/session/login')
    .set('Origin', 'http://localhost:4000')
    .send({ email: 'inactive@ih.test', password: 'Password123!' });
  assert.equal(res2.status, 401);
  assert.equal(res2.body.message, 'Invalid email or password.');
});

test('staff first-login: user with mustChangePassword=true is blocked from protected staff routes', async () => {
  const agent = request.agent(app);
  const user = await AdminUser.create({
    name: 'Temp User',
    email: 'temp@ih.test',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuuu',
    roles: ['admin'],
    mustChangePassword: true,
    isActive: true,
  });

  // Login succeeds and sets cookie
  const loginRes = await agent
    .post('/api/v1/staff/session/login')
    .set('Origin', 'http://localhost:4000')
    .send({ email: 'temp@ih.test', password: 'Password123!' });
  
  // Login response flags setup requirement
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.data.mustChangePassword, true);

  // Accessing cases is blocked with 403
  const casesRes = await agent.get('/api/v1/staff/cases');
  assert.equal(casesRes.status, 403);
  assert.equal(casesRes.body.code, 'PASSWORD_SETUP_REQUIRED');

  // Accessing /me is allowed
  const meRes = await agent.get('/api/v1/staff/me');
  assert.equal(meRes.status, 200);
  assert.equal(meRes.body.data.email, 'temp@ih.test');
});

test('staff client DTO: client serialization never leaks passwordHash or credentials', async () => {
  const agent = request.agent(app);
  await seedAdminUser({ email: 'staff@ih.test', password: 'Password123!', roles: ['super_admin'], mustChangePassword: false });

  await agent
    .post('/api/v1/staff/session/login')
    .set('Origin', 'http://localhost:4000')
    .send({ email: 'staff@ih.test', password: 'Password123!' });

  const client = await ClientUser.create({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@client.test',
    passwordHash: '$2b$10$secretpasswordhash',
    status: 'active',
    failedLoginCount: 3,
  });

  const res = await agent.get('/api/v1/staff/clients');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.items.length > 0);

  const clientDto = res.body.data.items.find((c) => c.id === client._id.toString());
  assert.ok(clientDto);
  assert.equal(clientDto.displayName, 'John Doe');
  assert.equal(clientDto.passwordHash, undefined, 'passwordHash must never be exposed');
  assert.equal(clientDto.failedLoginCount, undefined, 'failedLoginCount must never be exposed in list DTO');
});

test('trusted origin middleware: rejects unauthorized origin with csrf_rejected event', async () => {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/v1/staff/session/login')
    .set('Origin', 'https://evilimmigrationhorizons.com')
    .send({ email: 'admin@ih.test', password: 'Password123!' });

  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'CSRF_REJECTED');
});
