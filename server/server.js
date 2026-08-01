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

const isProduction = process.env.NODE_ENV === 'production';

// Keep the admin process alive through transient DB hiccups.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err && err.message ? err.message : err);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.message ? err.message : err);
});

// Refuse to boot in production with a secret/password that was never rotated
// from its documented placeholder — these are guessable and shipped in this
// repo's own .env.example / this file's fallback.
if (isProduction) {
  const insecureDefaults = [
    ['SESSION_SECRET', ['insecure-dev-secret-change-me', 'change-this-to-a-long-random-string', '']],
    ['ADMIN_PASSWORD', ['admin', 'admin123', 'admin123456', '']],
  ];
  const problems = insecureDefaults.filter(([key, bad]) => bad.includes(process.env[key] || ''));
  if (problems.length) {
    console.error(
      `[startup] Refusing to start in production with insecure default value(s) for: ${problems
        .map(([key]) => key)
        .join(', ')}. Set a real, unique value in the environment.`
    );
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
