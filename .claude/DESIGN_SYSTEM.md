# DESIGN_SYSTEM.md
# Immigration Horizons Design System
Version: 1.0
Status: Production (public site) / Target (admin dashboard, CRM, client portal)

---

# How to read this document

This design system governs both what's built today and what the platform is being built toward. Two things to keep straight:

1. **Brand, color, typography, spacing, and grid** (early sections below) are already implemented on the public site and are marked **(Current)**. Treat these as binding constraints, not suggestions.
2. **The full component library, dashboard design, CRM screens, Kanban boards, petition/case UI** (Parts 2–3 below) describe the platform this is being built toward. **The current admin CMS (`server/`) is a separate server-rendered EJS application with its own plain CSS (`server/public/css/admin.css`, `style.css`) — it is not built against this design system, and is not a React app at all.** Whether the admin is ever rebuilt inside the Next.js app using this design system is an open architectural question (see `ARCHITECTURE.md` Part 2), not a decided migration. Sections describing dashboard/CRM/Kanban UI are marked **(Target)** throughout.

Every engineer, designer, and AI agent must follow these standards before designing or implementing any interface within their actual scope (public site today; the fuller system once/if the admin moves onto it).

---

# Design Philosophy

Immigration Horizons is not a generic immigration consultancy.

It is a premium technology company specializing in immigration consulting and petition preparation.

The interface should communicate:

• Trust • Professionalism • Authority • Precision • Simplicity • Modern Engineering • Transparency • Premium Quality

Every page should feel calm, organized, and intentionally designed. Never make the interface feel crowded. Never sacrifice readability for decoration. The interface should help users make decisions with confidence.

---

# Brand Personality

Professional, Reliable, Premium, Elegant, Modern, Minimal, Calm, Educational, Structured, Technology Driven, Trustworthy, Transparent.

Never: Cheap, Flashy, Noisy, Salesy, Over Animated, Childish, Corporate Template, Generic WordPress.

---

# Design Inspiration

Stripe, Linear, Vercel, Notion, Clerk, Mercury, Ramp, Apple, GitHub, Intercom. The objective is not to copy these products — it's to match their quality level.

---

# Overall Design Language

Large white space. Clear hierarchy. Simple navigation. Readable typography. Strong imagery. Meaningful graphics. Thoughtful animations. Excellent accessibility. Fast performance. Every section should have a clear purpose — if a section doesn't contribute to user understanding or conversion, remove it.

---

# Brand Colors (Current)

Verified against `src/app/globals.css` Tailwind v4 `@theme` tokens.

**Primary — Navy Blue**: authority, trust, navigation, buttons, headings, links, tables, charts, primary actions.

**Secondary — Gold**: highlights, statistics, icons, hover states, accents, timeline, progress, success moments. **Never use gold for large paragraphs of text** — `gold-500` is ~2.6:1 contrast on white and fails AA as text; gold text on light backgrounds must be `gold-700`+, on navy use `gold-300`/`400`. The gold CTA button pattern is `gold-500` fill + `navy-900` text (passes AA).

**Background — White**: content, cards, forms, sections.

**Neutral — Light Gray**: borders, section separation, table rows, input backgrounds.

**Dark — Slate**: footer, dark overlays. **(Target for admin)**: admin navigation/analytics dark accents — n/a today since the admin isn't built against this token set.

**Status colors**: Success (Green), Warnings (Amber), Errors (Red), Information (Blue) — maintain these meanings consistently once used; not yet applied anywhere outside a few form states on the public site.

---

# Color Usage Rules

Blue establishes authority. Gold attracts attention. White improves readability. Gray separates content. Do not use gradients excessively. Avoid bright saturated colors, rainbow dashboards, random accent colors. The entire platform should feel visually consistent — this is a forward-looking goal for whenever the admin adopts the same tokens; today only the public site is bound by it.

---

# Typography (Current)

Headings: **Source Serif 4**. Body: **Inter**. Both self-hosted variable fonts via `next/font` — zero external font requests. Never introduce additional font families.

---

# Typography Scale

Display (homepage hero) → H1 (page titles) → H2 (major sections) → H3 (cards) → H4 (subsections) → Body Large (lead paragraphs) → Body (normal reading) → Small (labels) → Caption (metadata, footer). Every page must follow the same hierarchy; never skip heading levels. **(Current — already enforced on the public site: single `<h1>` per page is part of the verification checklist in the site's own `CLAUDE.md`.)**

---

# Spacing System (Current)

Base unit 4px. Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 120, 160. Section spacing should be generous; cards should breathe. Never compress layouts simply to fit more content. Whitespace is a design element.

---

# Grid System (Current, public site)

Desktop 12 columns, container width 1280px, content width 760–860px, reading width 680–760px. Tablet 8 columns. Mobile 4 columns. Maintain consistent gutters; never place content against screen edges.

---

# Border Radius, Shadows, Icons (Current)

Radius: Small 8px, Medium 12px, Large 16px, XL 24px — cards 12–16px, buttons/inputs 12px, dialogs 16px. Keep consistent throughout.

Shadows: subtle elevation only, no harsh shadows, no exaggerated floating effects.

Icons: **Lucide** throughout (matches `lucide-react` dependency) — never mix icon libraries. Sizing: Small 16px, Normal 20px, Large 24px, Hero 32–48px.

---

# Buttons, Inputs, Cards, Tables, Forms, Empty States, Loading States (Current on public site, Target for admin-scale tooling)

The philosophy (button types communicate importance; cards create visual grouping with subtle shadows/soft borders/consistent padding; forms should reduce friction and validate instantly; never leave blank empty/loading screens) applies today on the public site's forms (`consultation-form.tsx`, `contact-form.tsx`) and `ui/` primitives. The fuller catalog below — data tables with sorting/filtering/bulk actions, skeleton loaders, dashboard-scale empty states — is **(Target)**, sized for admin/dashboard use once that's built against this system.

---

# Design Consistency Rules

Before creating any new UI: search the existing component library, reuse existing components, improve existing components. Never duplicate components. Never redesign a component for one page only. The design system is the single source of truth.

---

# ============================================================
# PART 2 — COMPONENT LIBRARY (mostly Target — see notes per section)
# ============================================================

**Scope note**: the component philosophy and naming conventions below are timeless and apply to whatever gets built. The specific component catalog (data tables, Kanban cards, CRM-specific cards, dashboard widgets) is **(Target)** — it describes a much larger library than what exists today. Current `ui/` primitives: `button.tsx`, `card.tsx`, `container.tsx`, `feature-icon.tsx`, `photo-slot.tsx`, `reveal.tsx`, `section.tsx`, `snippet-answer.tsx` (see `FRONTEND_ARCHITECTURE.md` Part 1). Everything in this Part 2 beyond that current list is aspirational scope for future work — build incrementally, driven by real need, not ahead of it.

---

# Component Philosophy

Every component in Immigration Horizons must be: Reusable, Accessible, Responsive, Well Documented, Highly Performant, Composable, Theme Consistent. Never create one-off components — if two pages require similar functionality, create one reusable component.

---

# Component Categories (Target catalog)

Layout, Navigation, Typography, Data Display, Forms, Feedback, Dashboard, Marketing, CMS, CRM, Workflow, Analytics, Media components. **(Current)**: Layout/Marketing-adjacent components exist (Page Container equivalent via `Container`/`Section`); CRM/Dashboard/Workflow/Analytics component categories don't exist yet.

---

# Layout Components (Current, roughly — verify against actual `ui/` primitives)

**Page Container**: max-width 1280px, centered, responsive, horizontal padding 32/24/16px desktop/tablet/mobile — matches `Container`.

**Section**: heading/body/CTA/optional graphics, ~96px top/bottom spacing (64px mobile) — matches `Section`.

**Content Wrapper** (760–860px reading width, for blogs/service pages/policies): **(Current)** — used across service pages.

**Two Column Layout, Dashboard Layout**: **(Target)** — no dashboard layout exists in this app yet.

---

# Navigation Components

**Header** (logo, primary nav, mega menu, consultation CTA, sticky on scroll): **(Current)** — `layout/header.tsx`, the app's one Client Component.

**Mega Menu** (services grouped by category, icons, keyboard nav): **(Current)** — nav derives from `lib/content/services.ts`.

**Sidebar** (admin, nested nav, collapsed state), **Dashboard breadcrumb pattern**: **(Target)** — the current admin has its own simpler EJS sidebar (`server/views/admin/partials/sidebar.ejs`), not this component.

**Breadcrumb**: **(Current)** on service pages (`components/service/breadcrumbs.tsx`), schema-matched.

---

# Hero Components (Current)

Every public page begins with a Hero: badge, H1, supporting paragraph, primary/secondary CTA, trust indicators, professional image, background graphic. Variants: Homepage, Service, Blog, About, Contact — **all Current**. Dashboard/Landing Page/Resource hero variants beyond what exists: **(Target)** as those page types get built out.

---

# Buttons, Cards (Current subset + Target full catalog)

**(Current)**: `ui/button.tsx`, `ui/card.tsx` cover the public site's needs.

**(Target)**: the fuller catalog — Split Button, Dropdown Button, Floating Button, and CRM-specific cards (Lead Card, Client Card, Petition Card, Task Card, Notification Card, Dashboard Widget) — none of these exist as React components since the admin isn't built in React. The equivalent functionality exists today as EJS partials/views in `server/views/admin/`.

---

# Statistics Cards, Feature Cards, Service Cards (mixed)

**Feature Cards, Service Cards**: **(Current)** — used on the homepage/services pages.

**Statistics Cards** (dashboard/analytics widgets with metric/trend/chart): **(Target)**.

---

# Blog Cards (Current)

Featured image, category, reading time, author, title, summary, publish date, CTA — matches the blog listing pattern once the blog data layer ships (flagged as in-progress in the site's own `CLAUDE.md` phase status).

---

# Testimonial Card (Current)

Photo, name, role, country, review, rating, verification badge. **Never fabricate testimonials** — real testimonials only, each with a working `verifyUrl` (see the site's own content-accuracy rules).

---

# Timeline Component (Current, for process illustration)

Used for the immigration process illustration on service pages (vertical, animated) — **(Current)**. Petition Workflow / Roadmap / Project Progress timeline variants for an admin/CRM context: **(Target)**.

---

# Accordion (Current)

FAQs use native `<details>`/`<summary>` — accessible, SEO-visible, zero JS, not a custom Accordion component. Keep it this way; it's a deliberate simplicity choice, not a gap to fill with a JS accordion library.

---

# Tabs, Badge, Alerts, Toast, Modal, Drawer (Target)

None of these exist as components in the current public site (which has no need for them yet) or the current admin (which uses full-page EJS views and server-side flash-style messaging, not toasts/modals/drawers). Build these when a real feature needs them.

---

# Forms (Current pattern + Target input catalog)

**(Current)**: `consultation-form.tsx`/`contact-form.tsx` use plain controlled inputs + Server Actions + `useActionState`, with field label/validation/error/success states already present.

**(Target)**: the fuller supported-input catalog (rich text editor, tag selector, country selector, date range, multi-select) — build as forms actually need them; don't add a form library speculatively (see `FRONTEND_ARCHITECTURE.md` Part 2 on React Hook Form + Zod).

---

# Search Component (Current, admin only; Target for public site)

**(Current)**: `/admin/search` — plain server-rendered search, no instant/debounced client-side search yet. **(Target)**: instant search with debounce/filters/suggestions, wherever it's next needed.

---

# Data Table, Pagination, Charts, Progress, File Upload, Rich Text Editor, Notifications Panel, Activity Feed, Calendar (Target)

Full-featured versions of all of these (sortable/filterable/paginated tables with bulk actions and CSV export; charts with a 5-color-max rule; drag-drop file upload with version history; rich text editor with auto-save and revision history; a dedicated notifications panel; a calendar component) are **(Target)**.

**(Current, simpler versions that already work)**:
- CSV export exists today for leads (`/admin/leads/export/csv`) — just not as part of a generic reusable Data Table component.
- File upload exists today via `multer` (blog covers, testimonial photos, media library) — without drag-drop, version history, or a reusable component wrapper.
- A working Notifications list exists today (`/admin/notifications`) as an EJS view, not a dedicated "Notifications Panel" component.

---

# Empty States, Skeleton Components, Error States, Success Screens (Target for a component library; philosophy applies now)

The *principle* (never leave blank/blank-loading/unclear-error screens) applies today wherever it's relevant — e.g., the custom `not-found.tsx` 404 page is already a deliberate, non-generic error state. The specific *component* catalog (skeleton loaders for cards/tables/charts, dedicated empty-state illustrations) is Target — build them as new dashboard-style surfaces are built, not preemptively.

---

# Component Naming Convention

`Button/`, `Card/`, `Hero/`, `ServiceCard/`, `LeadCard/`, `TaskCard/`, `Chart/`, `Sidebar/`, `Navbar/`, `Modal/`, `Accordion/`, `Timeline/`, `Calendar/` — PascalCase directories, consistent naming, whenever each is actually built. Never create inconsistent naming.

---

# Component Rules

Every reusable component must include TypeScript types, accessibility, responsive design, loading/empty/error states, and documentation. Storybook and unit testing are Target (not currently set up in this repo). Never build UI without considering reusability.

---
# End of Part 2

# ============================================================
# PART 3 — PAGE TEMPLATES, DASHBOARD, UX, MEDIA, AI RULES
# (Public-page templates are Current; Dashboard/CRM/Petition/Kanban sections are Target)
# ============================================================

---

# WEBSITE PAGE STANDARDS (Current)

Every public-facing page must follow a consistent information architecture. Users should always know: where they are, what this page is about, why it matters, what action to take next. Never create pages without a clear conversion goal.

---

# HOMEPAGE TEMPLATE (Current)

1. Hero · 2. Trust Indicators · 3. Services Overview · 4. Why Choose Immigration Horizons · 5. Immigration Process Timeline · 6. Client Success/Testimonials · 7. About · 8. Featured Resources · 9. FAQs · 10. Final Consultation CTA · 11. Footer.

Requirements: premium hero, professional photography (per the site's own content rules: no stock photography of people — real photography via `PhotoSlot` when supplied, SVG illustrations otherwise), animated SVG graphics, statistics, interactive service cards, process timeline, internal links, FAQ schema, Organization schema, strong CTAs, mobile optimized. **This already matches the current homepage structure.**

---

# SERVICE PAGE TEMPLATE (Current)

Hero → Quick Overview → Who Can Apply → Eligibility Criteria → Benefits → Required Evidence → Immigration Process → Timeline Graphic → FAQs → Related Services → Final CTA → Footer, with professional illustration, process diagram, comparison table, FAQ, internal links, external USCIS references, schema, breadcrumb. **Matches the site's actual data-driven service-page renderer** (`app/services/[slug]/page.tsx` + `lib/content/service-pages/*.ts`) — see the site's own `CLAUDE.md`.

---

# ABOUT PAGE, CONTACT PAGE, BLOG PAGE, RESOURCE PAGE, ERROR PAGES (Current, mostly)

Structure as described applies to the existing `/about`, `/contact`, `/blog`, `/resources` pages and the custom 404. "Newsletter" on the blog page and full resource-library search/categories/downloads are **(Target)** — verify what's actually built on `/resources` before assuming the full catalog exists.

---

# DASHBOARD DESIGN (Target)

The dashboard should feel like enterprise software (Linear, Stripe, Vercel, GitHub, Notion, Mercury): Sidebar, Top Navigation, Breadcrumb, Page Header, Quick Actions, Content, Widgets, Activity Feed, Footer. Dashboard Home widgets: Today's Leads, Open Tasks, Pending Reviews, Upcoming Consultations, Recent Activity, Analytics, Notifications, Quick Actions, Calendar. **None of this describes the current admin CMS**, which is a simpler EJS-rendered dashboard (`/admin`) showing lead + content counts and recent activity. This section is the target if/when the admin is rebuilt against this design system.

---

# CRM DESIGN, KANBAN BOARD, TASK MANAGEMENT, PETITION MANAGEMENT (Target)

Full Lead Table / Lead Profile / Kanban columns (New → Contacted → Qualified → Proposal → Client → Evidence Collection → Petition Draft → QA → USCIS Forms → Ready for Submission → Submitted → RFE → Completed → Archived) with drag/drop cards — **this is the target Kanban UI, not what exists today.**

**(Current, real but simpler)**: `/admin/tasks` and `/admin/sprints` provide real task/sprint management (see `DATABASE.md` Part 1, `ADMIN_WORKFLOW.md` Part 1) — server-rendered EJS views with status dropdowns and sprint assignment, not a drag-and-drop Kanban board. Petition Management as a distinct entity/screen doesn't exist — task management today happens directly against the lead (`Consultation`).

---

# BLOG CMS, MEDIA LIBRARY (Current, simpler than described)

**(Current)**: Blog editor with slug/meta title/description/featured image/categories/tags/author, draft/publish toggle — real and working (`/admin/blog`). No SEO score widget, no internal-linking suggestions, no scheduling, no revision history yet.

**(Current)**: Media library supports images/documents via local-disk upload (`/admin/media`) — no folder structure, no video support, no version history yet.

---

# ANALYTICS DASHBOARD, REPORTS (Target)

Traffic/leads/conversions/blog-performance/revenue charts, CSV/Excel/PDF report generation — **not implemented**. Today's `/admin` dashboard only shows counts; there's no stored analytics or report export beyond the existing leads CSV export.

---

# GRAPHICS SYSTEM (Current on public pages; Target for admin)

Homepage/service-page graphics (animated globe/timeline/icons/illustrations) — **(Current)**, all inline SVG + CSS per the site's own performance rules (no canvas/WebGL/JS animation). Admin dashboard graphics (heatmaps, lead funnel, progress rings) — **(Target)**.

---

# PHOTOGRAPHY GUIDELINES (Current — binding content rule)

Only use professional/authentic imagery (office, business meetings, universities, scientists, engineers, researchers, immigration documents) — never fake stock call centers, overused handshake photos, artificial AI faces, generic office cubicles. This is a binding current rule, not aspirational: the site's own content rules already say no stock photography of people, SVG/PhotoSlot instead until real photography is supplied.

---

# ICONOGRAPHY (Current)

Lucide icons only, never mixed with other icon packs. Icons support content, not decorate it.

---

# ANIMATION SYSTEM — the binding current constraint

Animations should improve usability, never distract. Allowed categories (fade, slide, scale, reveal, hover, progress, accordion, timeline, card hover, micro interactions, page transition, number counter, chart animation, notification, skeleton loading, drag & drop) describe *effects*, not *implementation technology* — **on the current public site, all of these must be achieved with CSS only, no JS animation library** (see `FRONTEND_ARCHITECTURE.md` Part 1's hard constraint on Framer Motion). Avoid long animations, infinite floating objects, heavy parallax, autoplay carousels, flashing effects. Durations: Fast 150ms, Medium 250ms, Slow 350ms — anything above 500ms requires justification. **A future admin dashboard (Target) may use a JS animation library if the interaction complexity genuinely justifies it — that doesn't extend to the current public pages.**

---

# ACCESSIBILITY, RESPONSIVE DESIGN, SEO INTEGRATION (Current — binding)

WCAG AA minimum (prefer AAA): keyboard nav, screen reader support, reduced motion, high contrast, focus states, semantic HTML, ARIA labels, alt text, accessible forms, logical heading structure. Responsive breakpoints: Desktop 1440+, Laptop 1024, Tablet 768, Mobile 390+, touch targets minimum 44×44px. SEO: every page auto-includes title/description/canonical/OG/Twitter/schema/breadcrumb/internal links/sitemap/robots — **already true on the current public site** (see the site's own `CLAUDE.md` verification checklist).

---

# AI DESIGN RULES

Before building anything: search existing components, reuse existing layouts, follow this design system, avoid duplicate UI, maintain consistency, improve rather than replace, respect accessibility/SEO/performance. Think like a Senior Product Designer, Frontend Architect, UX Researcher, Creative Director. Never create inconsistent experiences. **Applies to whatever you're building — check whether it's public-site work (bound by the Current sections above) or a future admin/dashboard build (bound by the Target sections) before assuming which constraints apply.**

---

# QUALITY CHECKLIST

Before every commit, verify: brand consistency, typography, colors, responsive, accessibility, SEO, component reuse, performance, animation quality (CSS-only on the public site), professional imagery, internal linking, semantic HTML, mobile/desktop UX, loading/empty/error states, documentation updated, TypeScript passes, lint passes, build passes, production ready.

---

# FINAL DIRECTIVE

Every interface produced for Immigration Horizons must communicate: Trust, Authority, Professionalism, Transparency, Technical Excellence, Premium Quality, Educational Value, Operational Efficiency. Every screen should feel like it belongs to one cohesive enterprise platform — including the current admin CMS, even while it's visually simpler and not yet built against this exact token/component system. If a design decision conflicts with these principles, choose the solution that best supports long-term consistency, usability, accessibility, and maintainability.

This Design System is the single source of truth for all visual, interaction, and user experience decisions across the Immigration Horizons platform — both what's shipped and what's planned.

# End of DESIGN_SYSTEM.md
