# ADR-008 — Three-Application Separation

**Status:** Accepted
**Date:** 2026-08-05
**Cycle:** 8A — SaaS application separation

## Context

The product architecture is now fixed as three applications:

| Host | Application | Indexed |
|---|---|---|
| `immigrationhorizons.com` | Public marketing website | **Yes** — the only one |
| `app.immigrationhorizons.com` | SaaS case-management app (clients + case-working employees) | No |
| `admin.immigrationhorizons.com` | Express/EJS admin CMS (website/content administration) | No |

Before this cycle, one Next.js application served both the marketing site
and the entire client portal from a single origin, and the Express admin
CMS ran as a separate process on port 4000.

### What the audit found

- **39 SaaS surfaces** live in this Next.js app: 21 pages + 1 route handler
  under `src/app/portal/**`, and 18 API routes under `src/app/api/portal/**`.
- **Marketing imports nothing from the portal.** Zero references, in either
  `src/app` or `src/components`. The coupling is entirely one-directional.
- **The portal imports no marketing-specific code.** Its only non-`ui`
  component dependencies are `service/breadcrumbs` and `forms/fields`, both
  purely presentational — `Breadcrumbs` emits no structured data (the
  `BreadcrumbList` schema lives separately in `components/seo/json-ld`), so
  there was no SEO leakage into the portal.
- **The real coupling is the shared domain layer.** Marketing uses 16
  `src/lib` modules; the portal uses 42. Marketing's set is mostly static
  `content/*`, but it transitively reaches the onboarding domain: the
  consultation form calls `leads.ts` (→ `db`, `models/Consultation`) and
  `auth/invitations.ts` (→ `ClientUser`, `PortalInvitation`, `crypto`,
  `email`). Lead capture and portal onboarding are the same write path.
- **The portal rendered inside the marketing layout.** There was no
  `portal/layout.tsx`, so every case page shipped the public `Header`,
  `Footer`, and `WhatsAppFab`, plus the marketing title template.

## Options considered

### Option 1 — Separate Next.js runtime (full extraction)

Extract `portal/**` and `api/portal/**` into a second Next.js application.

**Blocker:** this repo is not a monorepo — no workspaces, no Turborepo, a
single `package.json` and a single `tsconfig` path alias. Because marketing
and the portal share the onboarding domain (above), extraction requires
either a shared package (a monorepo conversion) or duplicating `db`,
`Consultation`, `ClientUser`, `PortalInvitation`, `crypto`, `email`, and
`invitations` into both apps.

Duplication is the worse option outright: the consultation form and the
activation flow must agree on invitation TTL, token hashing, and email
normalisation, and Cycle 8 already had to build a contract-test fixture to
police exactly that boundary between the two *existing* apps.

**Assessment: high-risk rewrite.** Deferred, per this cycle's own
instruction to stop before a migration of that size.

### Option 2 — Host-based separation in one runtime (**chosen**)

Keep one Next.js runtime; make the host the application boundary.

- `src/proxy.ts` routes by `Host`/`x-forwarded-host`.
- Route groups `(site)` and `(app)` give each application its own layout,
  chrome, and metadata.
- `robots.ts` answers per host.
- The admin CMS is already a separate runtime; it only needs a vhost.

**Assessment: low risk, real boundary.** Delivers host separation,
independent chrome, and correct indexing without touching the shared
domain layer.

### Option 3 — Transitional: path-prefix only

Keep everything on one host and rely on `/portal` plus per-page `noindex`.

**Assessment: rejected.** This is the status quo. It provides no host
boundary, no deployment boundary, and no ability to firewall, scale, or
rate-limit the applications separately.

## Decisions

### 1. One runtime, three hosts

Option 2. The Next.js runtime serves the public site and the SaaS app,
separated by host; the Express admin CMS remains its own process on its own
host. Revisit full extraction only alongside a deliberate monorepo
conversion.

### 2. `proxy.ts`, not `middleware.ts`

Next 16 renamed Middleware to Proxy. The convention is `proxy.ts` beside
`app/`, exporting `proxy` plus `config.matcher`.

Behaviour:

| Host | Request | Result |
|---|---|---|
| `app.*` | `/` | rewrite → `/portal` |
| `app.*` | `/portal/**`, `/api/portal/**` | serve, `X-Robots-Tag: noindex, nofollow` |
| `app.*` | anything else | 308 → public host |
| public | `/portal/**`, `/api/portal/**` | 308 → app host (path + query preserved) |
| public | anything else | serve |
| unknown | anything | serve; app paths still noindex |

`x-forwarded-host` takes precedence over `host` so classification is
correct behind nginx.

### 3. Route groups give each application its own shell

`src/app/(site)/` and `src/app/(app)/`. The root layout keeps only
`<html>`/`<body>`, fonts, and global CSS; `(site)/layout.tsx` owns the
marketing header/footer/WhatsApp button; `(app)/layout.tsx` owns the SaaS
chrome and declares `robots: { index: false, follow: false }` for the whole
subtree.

Route groups are URL-transparent — **no public URL changed**, verified
against the build's route table before and after.

The `(app)` layout is deliberately auth-free: it also wraps the
unauthenticated pages (login, activate, forgot/reset password), so it must
not call `requireClient()` or render session-dependent controls. Real
role-aware navigation and the notification bell are Module 09's job; this
layout is the shell that ADR-006 §10 deferred them for.

### 4. Host checks are routing, never authorization

The Next docs state plainly that proxy "should not be used as a full
session management or authorization solution", and this cycle's brief says
the same. Every portal page and API route keeps its own session check and
row-level policy exactly as before; none were modified.

**If `proxy.ts` were deleted, the applications would leak URLs across
hosts — not data.** That property is what makes this safe, and it is why
the host boundary is additive rather than a replacement for anything.

### 5. Only the public host participates in search

Four independent layers, deliberately overlapping:

1. `robots.ts` is host-aware — `app.*` and `admin.*` get a blanket
   `Disallow: /`. (This makes `/robots.txt` a dynamic route, which is
   correct: the response genuinely differs per host and must not be cached
   across them.)
2. The public host's robots additionally disallows `/portal` and
   `/api/portal`, covering the single-host fallback.
3. `proxy.ts` stamps `X-Robots-Tag: noindex, nofollow` on everything the
   app host serves, including API responses.
4. `(app)/layout.tsx` declares subtree-wide `noindex`, and every portal
   page continues to declare its own.

`sitemap.ts` never referenced the portal and is unchanged. Canonical URLs,
Open Graph, structured data, blog URLs, and service URLs are untouched —
no file under `src/components/seo` or `src/lib/content` was modified.

## Consequences

- The SaaS application has a real host and a real shell of its own, and no
  longer renders marketing chrome on case pages.
- Nginx gains two more server blocks; DNS gains two records. The Next
  process count does not change.
- The shared onboarding domain stays in one place, with no new duplication.
- Full runtime extraction remains available later, and is now strictly
  easier: the two applications are already separated by directory, layout,
  host, and robots policy. What remains for a future extraction is the
  monorepo conversion and the shared-domain package — not untangling.
