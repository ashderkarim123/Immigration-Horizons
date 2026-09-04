/**
 * Immigration Horizons — Admin CMS (standalone) bootstrap.
 *
 * A self-contained Express + EJS admin server that manages the MongoDB the
 * new website is (or will be) backed by: leads, blog, testimonials, FAQs,
 * SEO, media, settings, and users. It runs independently of the Next.js
 * frontend (default port 4000) and shares only the database.
 *
 * App construction lives in ./app.js (createApp()) so it can be imported by
 * tests without connecting to MongoDB, starting a listener, or running the
 * production guards below. This file is the real-process entry point only.
 */
require('dotenv').config();

const connectDB = require('./config/db');
const { createApp } = require('./app');
const { productionStartupProblems } = require('./utils/startupChecks');

const isProduction = process.env.NODE_ENV === 'production';

// Keep the admin process alive through transient DB hiccups.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err && err.message ? err.message : err);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.message ? err.message : err);
});

// Refuse to boot in production with a credential that was never rotated from
// a documented placeholder — see utils/startupChecks.js.
if (isProduction) {
  const problems = productionStartupProblems(process.env);
  if (problems.length) {
    console.error('[startup] Refusing to start in production. Fix the following:');
    problems.forEach((problem) => console.error(`\n  - ${problem}`));
    console.error(`\n[startup] These are read from ${process.cwd()}/.env`);
    process.exit(1);
  }
}

connectDB();

const app = createApp();

if (isProduction && !app.locals.hasPersistentSessionStore) {
  console.error(
    '[startup] Refusing to start in production without a persistent session store. ' +
      'Set a real MONGODB_URI so sessions survive restarts and work across multiple instances.'
  );
  process.exit(1);
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Immigration Horizons Admin running at http://localhost:${PORT}/admin`);
});
