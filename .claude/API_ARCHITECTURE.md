# API_ARCHITECTURE.md

# Immigration Horizons API Architecture

Version: 1.0

---

# Purpose

Defines the backend API architecture: what actually exists today, and the REST API this platform is being built toward. There is a real gap between the two right now — this document is deliberately split so that gap is visible rather than assumed away.

---

# Part 1 — Current Implementation

**There is no JSON REST API in this codebase today.** Two entirely different mechanisms currently handle "backend calls," neither of which is `/api/v1`:

## Public site (repo root) — React Server Actions

`src/app/consultation/actions.ts` and `src/app/contact/actions.ts` are React 19 Server Actions, invoked directly from form components via `useActionState` — not fetched over HTTP as JSON. They call `src/lib/leads.ts` directly, which does two independent things per submission: persist to MongoDB (`Consultation` model) and send via Resend. No `/api/*` route exists in `src/app/` at all.

## Admin CMS (`server/`) — server-rendered Express routes

Traditional Express routes in `server/routes/admin/index.js` and `server/routes/admin/leadOps.js`. These render EJS views or redirect — they are not JSON endpoints, and there's no `success`/`error` response envelope, no versioning, no `/api/v1` prefix. Representative current routes:

```
GET/POST /admin/login, /admin/logout
GET      /admin, /admin/leads, /admin/leads/:id
POST     /admin/leads/:id/status, /admin/leads/:id/notes
GET      /admin/leads/export/csv
GET/POST /admin/blog, /admin/blog/:id/edit, /admin/blog/:id/toggle-publish
GET/POST /admin/seo, /admin/seo/:pageRef
GET/POST /admin/testimonials, /admin/faqs
GET      /admin/services, /admin/media
POST     /admin/media/upload, /admin/media/:id/alt
GET/POST /admin/settings
GET      /admin/contact-form
GET/POST /admin/users
GET      /admin/search

# lead-ops module (server/routes/admin/leadOps.js):
GET/POST/PUT/DELETE /admin/tasks, /admin/tasks/:id, /admin/tasks/:id/status, /admin/tasks/:id/sprint
GET/POST/DELETE     /admin/sprints, /admin/sprints/:id, /admin/sprints/:id/status
GET/POST            /admin/notifications, /admin/notifications/:id/read, /admin/notifications/read-all
POST                /admin/leads/:id/assign
GET/POST            /admin/delivery, /admin/leads/:id/delivery, /admin/leads/:id/delivery/files, /admin/leads/:id/delivery/export
```

## Current Authentication & Authorization

Session-based (`express-session` + `connect-mongo`). `requireAdmin` middleware gates most routes; `blockReadOnly`/`requireManager` (`server/utils/permissions.js`) gate the lead-ops routes specifically. See `SECURITY.md` and `DATABASE.md` Part 1 for the full current model — it is coarser than full RBAC.

## Current Validation

Mongoose schema validation on write. No Zod, no shared validation layer between routes.

## Current Error Handling

Standard Express error handling; no standardized JSON error envelope, since there's no JSON API surface to apply one to yet.

## Current File Upload

`multer` handles uploads (blog cover images, testimonial photos, media library) with type/size checks; files land on local disk under `server/public/uploads/`.

---

# Part 2 — Target Architecture

The following describes the REST API this platform is being built toward. None of it exists yet. Building it is a real, scoped project (versioned routes, a Controller→Service→Repository layer, a consistent response envelope) — not a documentation fix.

## Planned API Style

- REST API, JSON request/response
- Versioned (`/api/v1`)
- Session-based authentication (carried over from today)
- Role-Based Access Control (RBAC) — full per-module permissions, not today's two-tier manager/read-only split
- Server-side validation (Zod)
- Consistent error responses

## Planned Backend Structure

```
src/
├── app/
├── api/
├── controllers/
├── services/
├── repositories/
├── models/
├── validators/
├── middleware/
├── lib/
├── utils/
└── types/
```

## Planned Request Flow

```
Request → Middleware → Authentication → Authorization → Validation → Controller → Service → Repository → Database → Response
```

Controllers stay thin; business logic lives in services; repositories own persistence — replacing today's routes-call-Mongoose-directly pattern.

## Planned Response Format

```json
// Success
{ "success": true, "message": "Operation completed.", "data": {} }

// Error
{ "success": false, "message": "Validation failed.", "errors": [] }
```

## Planned HTTP Status Codes

| Code | Meaning |
|------|----------|
|200|Success|201|Created|400|Bad Request|401|Unauthorized|403|Forbidden|404|Not Found|409|Conflict|422|Validation Error|500|Server Error|

Never expose internal errors or stack traces in responses.

## Planned API Modules

Mapping today's admin routes onto a future JSON API surface (each of these is currently an EJS-rendered Express route, not a JSON endpoint — see Part 1):

`/auth`, `/users`, `/roles` (new), `/leads`, `/clients` (new), `/cases` (new), `/petitions` (new), `/tasks`, `/documents` (new — supersedes `DeliveryRecord.files`), `/notifications`, `/blog`, `/seo`, `/media`, `/settings`, `/dashboard`.

Each should support: list/create/update/delete plus module-specific actions (e.g. `/leads/:id/assign`, `/leads/:id/convert-to-client`), pagination (`page`, `limit`, `sort`, `order`, `search`, `filters`), and — for `/documents` — version history.

## Planned File Upload

Same validation discipline as today (type/size/MIME), but with metadata storage and version history, likely backed by cloud storage rather than local disk (see `ARCHITECTURE.md` Part 2 and `DEPLOYMENT.md`'s known gap on this).

## Planned API Versioning

`/api/v1` as the starting version; future versions must not break existing clients (there are no external API clients today, so this constraint applies once the API has real consumers — e.g., a future client portal or mobile app).

## Success Criteria (target state)

The API should be modular, secure, scalable, maintainable, well-validated, consistent, and ready for future integrations and automation. None of this is a near-term requirement for the current Server-Actions/EJS-routes approach, which is adequate for the site's current scope — building this out is triggered by an actual need (e.g., a client portal, mobile app, or third-party integration requiring a real API surface), not built speculatively ahead of one.
