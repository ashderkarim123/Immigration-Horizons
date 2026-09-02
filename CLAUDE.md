@AGENTS.md

# Immigration Horizons — New Stack (Project Memory)

This repo holds the redesigned Next.js public site (repo root) and its standalone Express/EJS admin CMS (`server/`). It was split out of the original `Immigrationhorizons` monorepo, where it lived under `web/` and `web/server/` — full commit history preserved via `git subtree split`.

The legacy Express+EJS site is a separate repo (`Immigrationhorizons`) and stays live in production until an explicit cutover decision.

---

## Objective

Act as the senior architect, UI/UX designer, product designer, DevOps engineer, SEO engineer, and technical lead for this project. Build a world-class immigration consulting platform — premium look, strong performance, modern engineering practices, optimized for conversion, SEO, and maintainability. Never generate generic code; think like a senior engineer working on a production SaaS platform.

Before implementing anything: analyze existing code, reuse components, maintain the established architecture, avoid duplication, and weigh performance/accessibility/SEO/maintainability. Explain major architectural decisions before making breaking changes. Never install unnecessary dependencies.

---

## Business positioning — non-negotiable

Immigration Horizons is an **immigration consulting and paralegal services practice. NOT a law firm.**

- Allowed: immigration consultants, immigration specialists, petition preparation specialists, paralegal support
- Never: attorney, lawyer, legal advice, legal representation, "we represent you before USCIS"
- The disclaimer in `site.disclaimer` must never be softened. It is also embedded in the Organization JSON-LD via `disambiguatingDescription`.

Primary services: EB-2 NIW, EB-1A, EB-1B, EB-1C, O-1 Visa, RFE Responses, Recommendation Letters, Expert Opinion Letters, Business Plans, Evidence Packaging, USCIS Forms Preparation.

## Content accuracy rules (enforced throughout)

These exist because the site's core differentiator is verifiability.

1. **No USCIS processing times or cost figures.** They change constantly and are case- and service-centre-specific. Point to the official USCIS processing-times tool instead.
2. **No approval rates, success rates, or guarantees.** There is a homepage FAQ that explicitly says we cannot guarantee approval — keep it, it is a deliberate EEAT signal.
3. **No invented case studies or client profiles.** Outcome content is built only from the real testimonials in `src/lib/content/testimonials.ts`, each with a working `verifyUrl`.
4. **No stock photography of people.** Undercuts the "verifiable, not just claimed" argument. Illustrations are inline SVG; real photography goes through `PhotoSlot` when supplied.
5. **No placeholder content.**

### Open items awaiting the owner
- **"Countries served" number** — owner said they would supply a figure. Until then the copy says "Global" / "clients across multiple countries". Do not invent a number.
- **Real photography** of Rahat / the practice would strengthen the trust sections.

---

## Brand & design system

Theme: premium, professional, corporate, government-grade trust — never a cheap template. Design inspiration: Stripe, Vercel, Linear, Apple, OpenAI, Raycast, Notion — a premium SaaS product, not a traditional immigration site.

- **Colors**: Navy = primary, Gold = accent (CTAs/fills/ornament only — see contrast rule below), white/light-gray/black neutrals. Tokens live in `src/app/globals.css` via Tailwind v4 `@theme`.
- **Gold contrast rule:** `gold-500` is ~2.6:1 on white and fails AA as text. Use it for fills/rules/ornament only. Gold *text* on light must be `gold-700`+; on navy use `gold-300/400`. The gold CTA button is `gold-500` fill + `navy-900` text (passes AA).
- **Typography**: Source Serif 4 (display/headings) + Inter (UI/body), both variable, self-hosted via `next/font`. Zero external font requests.
- **Light-only.** Dark mode was deliberately removed — it wrecked the navy/gold trust brand.
- Icons: pick one family (Lucide/Heroicons/Tabler) and stay consistent.
- UI: clean layouts, generous white space, premium cards, large hero sections, consistent border radius, soft shadows, smooth transitions. Never cluttered.

### Motion — a real constraint, not a preference
**Do not add animation libraries** (Framer Motion / `motion`). It was installed and then removed this project — it forced every section into a client component and cost ~39 KB gzipped for effects CSS can do alone. Scroll reveals are CSS-only via `animation-timeline: view()`.
- **Critical:** the reveal `opacity: 0` must stay *inside* `@supports (animation-timeline: view())` and `@media (prefers-reduced-motion: no-preference)` in `globals.css`. Firefox lacks support — moving it out would blank the page for every Firefox visitor.
- Keep sections as server components. `layout/header.tsx` is the only `"use client"` file.
- Illustrations are inline SVG + CSS keyframes. No canvas/WebGL/JS animation, no lightweight hero video unless it can stay muted/looping/optimized without compromising this budget.

### Images
Next/Image, WebP/AVIF, lazy loading, responsive sizes, real ALT text. No stock photography of people; no oversized assets.

### Components
Reusable, typed, accessible, responsive. Never duplicate UI — see `src/components/ui/` for primitives, `src/components/sections/` for composable page sections, `src/components/service/` for the service-page renderer components.

---

## Architecture

Three applications, two runtimes (see `AGENTS.md` for the host table and
the conventions that will bite you):

| Host | Application | Where |
|---|---|---|
| `immigrationhorizons.com` | Public marketing site — **the only indexed one** | `src/app/(site)/**` |
| `app.immigrationhorizons.com` | SaaS: client portal + staff app | `src/app/(app)/**` |
| `admin.immigrationhorizons.com` | Express/EJS admin CMS | `server/` |

```
src/
  proxy.ts                host-based application boundary (Next 16: NOT middleware.ts)
  app/
    (site)/               public marketing site — its own layout, header, footer
      page.tsx            homepage
    (app)/                SaaS — its own shell; noindex subtree
      portal/**           client surfaces
      staff/**            employee surfaces
    api/portal/**         client APIs
    api/staff/**          employee auth APIs
    robots.ts             host-aware: app.*/admin.* get Disallow: /
    sitemap.ts            marketing URLs only
  components/
    layout/               marketing header/footer/whatsapp-fab
    app/                  SaaS shell, account menu, page header, and the
                          panel/badge primitives BOTH halves share
    portal/               client-side interactive components
    staff/                employee-only components (RestrictedState lives
                          here because its copy names internal roles)
    sections/             composable homepage/page sections
    seo/json-ld.tsx       Organization, WebSite, FAQPage, Breadcrumb schema
    ui/                   design-system primitives
  lib/
    auth/                 sessions, policies, capabilities (client AND employee)
    content/              ALL copy lives here as typed data, never inline in JSX
    dashboard/            capability-gated staff dashboard queries
server/                   standalone Express + EJS admin CMS (see server/README.md)
```

**Route groups are URL-transparent** — `(site)`/`(app)` change the layout a
page inherits, never its URL.

### Information architecture
The legacy site conflated two different things into one flat service list. They are now separate:
- **Case categories** (visa classification): `eb2-niw`, `eb1a`, `eb1b`, `eb1c`, `o1-visa`
- **Support services** (single deliverables): `rfe-response`, `recommendation-letters`, `expert-opinion-letters`, `business-plans`, `evidence-packaging`

Nav derives from the service catalogue in `src/lib/content/services.ts`, so adding a service updates header, mega menu, and footer automatically. `enumValue` on each case category must stay in sync with the legacy `Consultation` model enum.

### Service-page architecture
- **EB-2 NIW is bespoke:** `src/app/(site)/services/eb2-niw/page.tsx` + `src/lib/content/eb2-niw.ts`. Static route wins over dynamic by Next resolution order.
- **All other service pages are data-driven:** one renderer at `src/app/(site)/services/[slug]/page.tsx` consumes typed content from `src/lib/content/service-pages/*.ts` (registry in `index.ts`). Adding a page = write a content file + register it. Do NOT build new page components.
- Every service page cites primary sources (INA/CFR/USCIS) via `OfficialSources` — EEAT + honesty. The O-1 page states plainly it is a NONIMMIGRANT classification (temporary), not a green card.
- Next 16: `params` is a Promise — `const { slug } = await params`.

### Admin CMS (`server/`)
Manages leads, blogs, SEO, services, FAQs, testimonials, media, settings, notifications, users, task management, sprint tracking. Think Linear / Notion / Stripe Dashboard / Vercel Dashboard, not a bare CRUD admin.
- Session-based auth: env credentials (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) as a break-glass fallback, DB-backed users under **Users** as the real long-term path (11 roles, bcrypt-hashed). The break-glass login has no persistent AdminUser id, so it can browse but cannot perform anything requiring a real identity (answering a query, sending a channel message, holding notification preferences).
- **The admin CMS is no longer the only staff surface.** Case-working roles also sign in at `app.*` (`/staff`), which shares the same `AdminUser` records and the same capability map. Employees sign in to each separately — different applications, different session stores; SSO across them is future work.
- **Both apps now write the case domain** (ADR-010 §1, reversing ADR-002 §1): `client_cases`, `workspace_members`, and `case_activities` are written by the SaaS staff console as well as here. The two must agree on what each action *means*, not only on field shapes — `src/lib/staff/case-operations.ts` mirrors `server/services/caseManagement.js` decision for decision. Document review, query answering, message sending, case archiving, `clients.manage`, and `client_updates.publish` are still CMS-only.
- This admin only reads/manages stored data. Lead email and DB writes happen in the site's own form handlers, not here — see `/admin/contact-form` for integration status.
- Uploaded files are stored locally in `server/public/uploads/` — local-disk only; a future move to a multi-instance/ephemeral host needs S3/Cloudinary first (see `DEPLOYMENT.md`).

Lead workflow: New Lead → Contacted → Qualified → Assigned → Tasks → Review → Submission → Delivered → Closed. Supports multiple team members, task tracking, internal notes, notifications, delivery history.

---

## Lead delivery — actual current state (not aspirational)

- **Email is Resend**, not Gmail SMTP — `RESEND_API_KEY` in `.env`, sent from `src/lib/leads.ts`. Missing key fails silently to the visitor (console warning only) — this is a documented, deliberate tradeoff, not a bug to "fix" by adding fallback SMTP.
- **MongoDB persistence** via `MONGODB_URI`, shared `consultations` collection with the legacy site and this repo's own `server/`. Missing URI means leads still email but are never saved — silent data loss, so treat this env var as load-bearing.
- **Google Sheets sync is NOT implemented in this stack.** Only the legacy site has it. Do not assume it exists; do not silently add it as a "small" feature without discussing scope first.
- The two paths (email, DB) are intentionally decoupled — a Mongo hiccup shouldn't block the email notification and vice versa.

---

## SEO & performance standards

Every page: SEO title, meta description, Open Graph, Twitter Card, canonical, JSON-LD, breadcrumb schema, internal linking, semantic HTML. Optimize for EB-2 NIW / EB-1A / EB-1B / EB-1C / O-1 / US immigration / USCIS terms.

Target Lighthouse 95+, strong Core Web Vitals (LCP/CLS/INP). No unnecessary JavaScript — this is why the motion-library ban above is a hard constraint, not a style preference.

## Accessibility

WCAG AA, keyboard navigation, ARIA labels, semantic HTML, proper contrast (see the gold contrast rule above), screen-reader support.

## Security

Validate input, escape output, hash passwords (bcrypt), protect sessions, prevent XSS/CSRF/injection, never expose secrets. Note: admin forms currently have **no CSRF token protection** (mitigated by `sameSite: 'lax'` cookies, not eliminated) — a known, deliberately deferred gap, not an oversight to silently "fix" as a drive-by change.

## Coding standards

Production-ready code: SOLID, DRY, KISS, reusable architecture, strong typing, meaningful naming, no dead code, no half-finished implementations. Comment only the non-obvious (a workaround, a hidden constraint) — not what the code already says.

## Preferred libraries (use when appropriate, don't add speculatively)

UI: shadcn/ui, 21st.dev, Magic UI, Aceternity UI · Icons: Lucide, Heroicons, Tabler · Forms: React Hook Form + Zod · Tables: TanStack Table · Charts: Recharts · Markdown: MDX.

**Animation libraries (Framer Motion / `motion`) are excluded from this list — see the Motion section above.**

---

## Verification expected before declaring a phase done

```bash
npm run lint          # must be clean
npm run build         # must compile + typecheck
```

Then serve the production build and check the rendered HTML — not just that it compiled:
- single `<h1>`, no heading-level skips
- FAQ schema answers byte-match the visible answers (Google penalises mismatches)
- exactly one `<meta name="robots">` (Next auto-injects one on not-found — do not add a second)
- no horizontal scroll at any breakpoint
- programmatic scan of rendered HTML confirms zero: dollar amounts, month/week timeframes, guarantee/approval-rate language, attorney self-description

Before completing any task, also check: desktop/tablet/mobile rendering, forms, routing, broken links — not just automated checks.

---

## Build status

The marketing site is done. The platform is being built in numbered
**cycles** from `.claude/immigration_horizons_implementation_plan/immigration_horizons_implementation_plan/NN_*.md`,
one cycle per session. `docs/implementation/IMPLEMENTATION_STATUS.md` is the
authoritative per-cycle record — **read it before starting anything.**

| Cycle | Module | State |
|---|---|---|
| 1–2 | Architecture · client auth & onboarding | ✅ ADR-001 |
| 3 | Cases, workspaces, membership | ✅ ADR-002 |
| 4 | Consultation & query tracking | ✅ ADR-003 |
| 5 | Secure document management | ✅ ADR-004 |
| 6 | Team collaboration & chat | ✅ ADR-005 |
| 7 | Notifications & preferences (real-time deferred) | ✅ ADR-006 |
| 8 | Admin case operations | ✅ ADR-007 |
| 8A | Three-application host separation | ✅ ADR-008 |
| 8B | Employee SaaS shell & role-aware dashboards | ✅ ADR-009 |
| 8C | Staff case & client operations console | ✅ ADR-010 |
| 9 | Client portal experience layer | ✅ ADR-011 |
| **10** | **Security, privacy & audit — next** | ⬜ |
| 11–14 | Migrations · testing · deployment · analytics | 🔨 partial |

Marketing-site work that was never finished (low priority, unrelated to the
platform cycles): blog data layer for real posts, and canonicalising the
duplicate `/eb2-niw` vs `/services/eb2-niw` pages inherited from the legacy
site.

### Deployment blockers (verified open — do not mark done without checking)

1. **Database indexes have never been run in production.** Both apps have
   dry-run-verified scripts covering every collection; nobody has executed
   them against the live database.
2. **Documents write to local disk.** Breaks on any multi-instance or
   ephemeral host — needs S3/Cloudinary before scaling.
3. **The admin CMS has no CSRF tokens** (`sameSite: lax` only). The portal
   and SaaS app do have Origin verification.
4. **No email has been verified against real Resend** — every adapter
   across seven cycles is tested with doubles only.
5. `SITE_URL` must be set in production, to `https://app.immigrationhorizons.com` — the CSRF Origin check for every mutating portal **and staff** route reads it, and so do the activation/reset email links. A wrong value 403s every write. Documented in `DEPLOYMENT.md`; still unset in the checked-in `.env`.
6. No malware scanning on uploads; no scheduler wired for the digest job.

## Git

This repo was split from `Immigrationhorizons` (`web/` → repo root, `web/server/` → `server/`) via `git subtree split`, preserving full history. See `DEPLOYMENT.md` for the deployment topology shared with (but running independently from) the legacy site.
