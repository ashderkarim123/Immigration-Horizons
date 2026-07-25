/**
 * Immigration Horizons — Admin CMS (standalone).
 *
 * A self-contained Express + EJS admin server that manages the MongoDB the
 * new website is (or will be) backed by: leads, blog, testimonials, FAQs,
 * SEO, media, settings, and users. It runs independently of the Next.js
 * frontend (default port 4000) and shares only the database.
 */
require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');

const connectDB = require('./config/db');
const adminRoutes = require('./routes/admin/index');

const app = express();

// Keep the admin process alive through transient DB hiccups.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err && err.message ? err.message : err);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.message ? err.message : err);
});

connectDB();

// ----- View engine -----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'admin/layout'); // admin views are the only views here

// ----- Core middleware -----
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// ----- Sessions -----
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'insecure-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 hours
};

const mongoUri = process.env.MONGODB_URI;
const hasRealMongoUri = mongoUri && !mongoUri.includes('<') && !mongoUri.includes('>');

if (hasRealMongoUri) {
  try {
    const store = MongoStore.create({ mongoUrl: mongoUri });
    store.on('error', (err) => console.error('[session store]', err.message));
    sessionConfig.store = store;
  } catch (err) {
    console.error('[session store] Falling back to in-memory sessions:', err.message);
  }
} else if (mongoUri) {
  console.warn('[session store] MONGODB_URI still has placeholder values - using in-memory sessions.');
}

app.use(session(sessionConfig));

// ----- Locals available to every admin view -----
app.use((req, res, next) => {
  res.locals.siteUrl = process.env.SITE_URL || 'http://localhost:4000';
  res.locals.error = null;
  res.locals.success = null;
  res.locals.leadCount = 0;
  next();
});

// ----- Routes -----
app.get('/', (req, res) => res.redirect('/admin'));
app.use('/', adminRoutes);

// ----- 404 -----
app.use((req, res) => {
  res.status(404).send('Not found. Go to <a href="/admin">/admin</a>.');
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Immigration Horizons Admin running at http://localhost:${PORT}/admin`);
});
