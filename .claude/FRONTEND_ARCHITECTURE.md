# FRONTEND_ARCHITECTURE.md

# Immigration Horizons Frontend Architecture

Version: 1.0

---

# Purpose

Defines the frontend architecture — the actual current stack (verified against `package.json`) and the target stack this project may grow into. Do not assume anything in Part 2 is installed; check `package.json` before writing code that depends on it.

---

# Part 1 — Current Implementation

# Actual Tech Stack (verified against `package.json`)

```
next              16.2.11
react / react-dom  19.2.4
typescript
tailwindcss        v4 (@tailwindcss/postcss)
lucide-react       1.26.0
class-variance-authority, clsx, tailwind-merge   — shadcn-style variant/class utilities, but shadcn/ui itself is NOT installed (no components/ui generated via its CLI)
bcryptjs, mongoose, resend
```

**Not installed**: shadcn/ui (as a component library — only its supporting utility libs are present), Zustand, TanStack Query, TanStack Table, React Hook Form, Zod, Recharts, Framer Motion / `motion`, MDX. Don't write code assuming any of these exist without adding them deliberately first (see Part 2 for which are actually planned).

# Actual Folder Structure

```
src/
  app/                    routes; page.tsx = homepage, not-found.tsx = custom 404
  components/
    layout/               header (only "use client" file), footer, whatsapp-fab
    sections/             composable homepage/page sections
    seo/json-ld.tsx        Organization, WebSite, FAQPage, Breadcrumb schema
    service/               ServiceHero, TableOfContents, Prose, OfficialSources, etc.
    ui/                    design-system primitives
  lib/
    content/               ALL copy lives here as typed data, never inline in JSX
    models/                Consultation.ts (mirrors server/models/Consultation.js)
    db.ts, leads.ts
```

There is no `features/`, `hooks/`, `services/`, `store/`, or `types/` top-level folder yet — those are Part 2 structure, adopted if/when the app grows enough state and data-fetching complexity to need them.

# Actual Application Structure

```
app/
├── page.tsx, about, services/, blog, resources, contact, consultation, faqs, reviews, privacy, terms, styleguide
```

No `app/dashboard/`, no `app/auth/` — **the admin dashboard is not part of this Next.js app.** It's the entirely separate `server/` Express+EJS application. Any doc describing `/dashboard/leads` etc. as Next.js App Router routes (see `ARCHITECTURE.md` Part 2, `DESIGN_SYSTEM.md`) is describing a possible future consolidation, not the current routing table.

# Actual Component Organization

`layout/`, `sections/`, `seo/`, `service/`, `ui/` — not the larger target set (`navigation/`, `dashboard/`, `crm/`, `petitions/`, `blog/`, `forms/`, `shared/`) since those modules don't exist on this side of the codebase yet.

# Actual Routing

Static/dynamic App Router routes only, all public marketing/content pages. `src/app/services/[slug]/page.tsx` is the one dynamic route (data-driven service pages); `/consultation` is the only route reading `searchParams` (for `?service=` prefill + UTM).

# Actual State Management

No global state library. Forms use `useActionState` (React 19) local to the form component. No Context providers for global app state currently exist.

# Actual API Layer

There is no API layer to call — components invoke Server Actions (`app/*/actions.ts`) directly. See `API_ARCHITECTURE.md` Part 1.

# Actual Forms

`src/components/forms/consultation-form.tsx` and `contact-form.tsx` — React 19 Server Actions + `useActionState`, honeypot field, UTM passthrough. No React Hook Form, no Zod; validation happens server-side in the action.

# Actual Animation (hard constraint, not a style choice)

**No JS animation library.** `motion` (Framer Motion) was installed and then deliberately removed — it forced every section into a Client Component and cost ~39KB gzipped for effects CSS handles alone. Scroll reveals are CSS-only via `animation-timeline: view()` in `src/app/globals.css`. The reveal `opacity: 0` must stay inside `@supports (animation-timeline: view())` and `@media (prefers-reduced-motion: no-preference)` — Firefox lacks support for the former, and moving the rule out would blank the page for every Firefox visitor. If `FRONTEND_ARCHITECTURE.md` Part 2 or any other doc lists Framer Motion as a stack choice, that's aspirational for a future interactive surface (e.g. an eventual in-app dashboard) — it does not apply to the current public site, and re-adding it there would be a real regression, not a doc update.

# Actual Performance

Server Components by default; the only Client Component is the header. `next/image`, self-hosted variable fonts (Source Serif 4 + Inter via `next/font`), zero external font/animation-library requests.

# Actual Coding Standards

Functional components, TypeScript, consistent naming — already followed throughout `src/`.

---

# Part 2 — Target Architecture

The following is where the frontend may grow, driven by actual future needs (a real dashboard inside this app, more complex client-side state, data fetching from a real API). Do not add any of these dependencies speculatively — each one is justified by a specific planned feature, not adopted just because it's listed here.

## Planned Tech Additions

- **shadcn/ui** — as an actual generated component library, if/when a richer dashboard UI is built here.
- **Zustand** — global state, once there's global state worth centralizing (auth/user/theme/sidebar/notifications for an in-app dashboard).
- **TanStack Query** — once there's a real API layer to fetch from (see `API_ARCHITECTURE.md` Part 2).
- **TanStack Table** — for admin-style data tables, if/when those move into this app.
- **React Hook Form + Zod** — if form complexity grows beyond what Server Actions + manual validation handles well.
- **Recharts** — for any future analytics/dashboard charts.
- **Framer Motion / `motion`** — only for a genuinely interactive future surface (e.g. an in-app dashboard) where the cost/benefit is different from the public marketing site. **Never reintroduce it to the current public site pages** — that's the specific regression the removal fixed.

## Planned Folder Structure

```
src/
├── app/
├── components/
├── features/
├── hooks/
├── lib/
├── services/
├── store/
├── types/
└── styles/
```

## Planned Application Structure

```
app/
├── (website)/      today's public pages
├── dashboard/       if the admin CMS is ever folded into this app — an open architectural question, not a decided migration (see ARCHITECTURE.md Part 2)
└── auth/
```

## Planned Routing (if dashboard consolidation happens)

```
/dashboard, /dashboard/leads, /dashboard/clients, /dashboard/cases, /dashboard/tasks, /dashboard/blog, /dashboard/settings
```

## Planned State Management

Global state (auth, user, theme, sidebar, notifications) via a lightweight store; feature state kept inside feature modules; avoid unnecessary global state even then.

## Planned API Layer

```
Component → Hook → Service → API
```

Never call APIs directly from components once a real API exists.

## Planned Forms

React Hook Form + Zod, with validation/loading/success/error states as a standard pattern, once form complexity justifies moving off Server Actions + manual validation.

## Planned Layouts

Website Layout (current), Dashboard Layout (Sidebar/Topbar/Content), Authentication Layout (minimal) — the latter two only apply if/when a dashboard exists in this app.

## Planned Error Handling

Loading/Empty/Error/Success states per page, with Error Boundaries — worth adopting incrementally as pages gain more client-side interactivity, independent of the dashboard question.

---

# Success Criteria

The frontend should stay modular, reusable, scalable, accessible, and optimized for performance — true today with the current, smaller stack, and should remain true if/when any Part 2 additions are adopted.
