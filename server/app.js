/**
 * Express application factory — builds and returns the admin app WITHOUT
 * connecting to MongoDB, starting an HTTP listener, or running any
 * production startup guard (those live in server.js, the bootstrap file).
 *
 * This split exists so tests can `require('./app').createApp()` and drive
 * the real app with supertest against an isolated test database, without
 * dragging in `connectDB()` (which would touch the real MONGODB_URI) or
 * risking `process.exit()` from a misconfigured-env guard meant for
 * production boot only.
 */
const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');

const adminRoutes = require('./routes/admin/index');
const { csrfProtection } = require('./middleware/csrf');

function createApp() {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';

  // ----- View engine -----
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(expressLayouts);
  app.set('layout', 'admin/layout'); // admin views are the only views here

  // ----- Security headers -----
  // CSP is left off: admin views use inline <script>/<style> throughout and
  // enabling a default CSP would break every dropdown/toggle on the page.
  // The rest of helmet's defaults (X-Content-Type-Options, X-Frame-Options,
  // HSTS, etc.) still apply.
  app.use(helmet({ contentSecurityPolicy: false }));

  if (isProduction) {
    // Required for req.secure / secure cookies to work correctly behind a
    // reverse proxy (nginx, load balancer) terminating TLS.
    app.set('trust proxy', 1);
  }

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
    cookie: {
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
    },
  };

  const mongoUri = process.env.MONGODB_URI;
  const hasRealMongoUri = mongoUri && !mongoUri.includes('<') && !mongoUri.includes('>');

  if (hasRealMongoUri) {
    try {
      const store = MongoStore.create({
        mongoUrl: mongoUri,
        // Without this, a slow/unreachable cluster hangs every session
        // read/write (e.g. a login POST) for mongoose's full default
        // server-selection timeout instead of failing fast — reproduced
        // during hardening as a 30s+ hang on /admin/login with Mongo down.
        mongoOptions: { serverSelectionTimeoutMS: 8000 },
      });
      store.on('error', (err) => console.error('[session store]', err.message));

      // express-session calls next(err) on any store.get/set/destroy/touch
      // failure by default, which turns a transient Mongo hiccup into a full
      // 500 on every single admin request (reproduced during hardening: with
      // Mongo unreachable, EVERY route 500'd, not just DB-backed ones). Wrap
      // each method so a store failure degrades to "treat as no session"
      // instead of taking the whole admin panel down.
      for (const method of ['get', 'set', 'destroy', 'touch']) {
        const original = store[method].bind(store);
        store[method] = function (...args) {
          const callback = args[args.length - 1];
          if (typeof callback !== 'function') return original(...args);
          args[args.length - 1] = (err, ...rest) => {
            if (err) {
              console.error(`[session store] ${method} failed, continuing without session:`, err.message);
              return callback(null, ...(method === 'get' ? [null] : rest));
            }
            callback(null, ...rest);
          };
          return original(...args);
        };
      }

      sessionConfig.store = store;
    } catch (err) {
      console.error('[session store] Falling back to in-memory sessions:', err.message);
    }
  } else if (mongoUri) {
    console.warn('[session store] MONGODB_URI still has placeholder values - using in-memory sessions.');
  }

  // Exposed so the bootstrap (server.js) can refuse to start in production
  // without a persistent store, without this factory itself calling
  // process.exit() — a test importing createApp() must never be able to
  // kill the test process.
  app.locals.hasPersistentSessionStore = !!sessionConfig.store;

  app.use(session(sessionConfig));

  // ----- CSRF -----
  // After the session (it stores the token there) and after the body
  // parsers (it reads the token from the parsed body). Multipart routes
  // are verified separately, after multer — see middleware/csrf.js.
  app.use(csrfProtection);

  // ----- Locals available to every admin view -----
  app.use((req, res, next) => {
    res.locals.siteUrl = process.env.SITE_URL || 'http://localhost:4000';
    // The admin host is a separate app, so public blog previews must never
    // use a relative URL (which would keep them on admin.*).
    res.locals.publicSiteUrl = process.env.PUBLIC_SITE_URL || 'https://immigrationhorizons.com';
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

  // ----- Global error handler -----
  // Catches anything a route handler passed to next(err) (most notably multer
  // fileFilter rejections on the upload routes) so it renders a plain message
  // instead of Express's bare, unstyled default error page.
  app.use((err, req, res, next) => {
    console.error('[unhandled route error]', err && err.message ? err.message : err);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).send(
      `Something went wrong: ${isProduction ? 'please try again.' : err.message}. ` +
        '<a href="/admin">Back to admin</a>.'
    );
  });

  return app;
}

module.exports = { createApp };
