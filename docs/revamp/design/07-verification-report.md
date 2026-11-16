# 07 — Verification report (Design Gate D0)

Date 2026-11-16. Branch `revamp/d0-design-gate` from `revamp/1-catalogue` @ `ff9ca2b`. Nothing merged, pushed to
`main`, or deployed. No production website file was changed; all changes are under `docs/revamp/design/`.

## 1. What was inspected

| Item | Method | Result |
| --- | --- | --- |
| Repo state | `git status`, `git branch -a`, `git log`, `git fetch origin` | Clean tree except untracked `.vscode/`, `Revamp/`; branch `revamp/1-catalogue` ahead of `main` by the Phase 1 work; draft PR #10 could not be read (`gh` CLI is not installed) |
| Governing docs | Read `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, `docs/revamp/README.md`, `01`–`06`, `phase-1-report.md`, `baseline-2026-11.md`, `IMPLEMENTATION_STATUS.md` | **`docs/revamp/00-competitor-led-experience-blueprint.md`, `07-open-horizons-brand-application.md`, `08-page-design-and-rollout.md` do not exist** on any local or remote branch; `CLAUDE.md` on every branch still specifies navy/gold + Source Serif 4 |
| Prototype branch | `git diff origin/main...origin/feature/open-horizons-revamp`; `cmp` of its logo vs the kit | 7 files; logo identical to master; token ramps and "Check eligibility" label not adopted |
| Untracked `Revamp/` | File listing and diff vs `docs/revamp` | Older copies of `01`–`06`/README (pre owner-decision edits), the strategy PDF, and the brand kit |
| Brand kit | README, manifest, palette and contrast JSON, SVG sources, fonts, favicons, OG | Complete; copied required masters with SHA-256 checksums |
| Marketing components | Listed `src/components/{ui,sections,layout,service}`, `src/lib/content/*`, `src/app/(site)/*`; read `button`, `card`, `section`, `container`, `photo-slot`, `service-hero`, `hero`, `footer`, `header` (grep), `page.tsx`, `services.ts`, `navigation.ts`, `site.ts`, `about.ts`, `testimonials.ts`, `faqs.ts`, `eb2-niw.ts` | All mockup copy drawn from these files or the approved spec |
| Beyond Border | Chromium full-page captures: home (1440 + 390), `/visa/eb2-niw-visa` (1440 + 390), `/about-us` (1440 + 390), mobile menu open; text reads of home, NIW page, About, `/resources/eb-2-niw`, sitemap | Visual analysis done from real renders (see `00`) |
| Deel Immigration | Captures at 1440 + 390; text read | Done |
| Self Petition USA | Captures at 1440 + 390; text read | Done |

## 2. What was built

- `prototypes/tokens.css` — the design system as CSS (tokens, type, 20 component patterns, responsive rules).
- `prototypes/homepage.html` — all 14 sections + footer, desktop and mobile, real logo SVGs and brand fonts.
- `prototypes/service-page.html` — the EB-2 NIW flagship / service-family skeleton.
- `assets/` — verified brand masters + `CHECKSUMS.sha256`.
- Documents `00`–`06` and this report.

## 3. What was rendered and measured (headless Chromium 1.63, DPR 1)

| Check | Homepage | Service page |
| --- | --- | --- |
| Horizontal overflow at 360 / 768 / 1024 / 1440 | none / none / none / none | none / none / none / none |
| `<h1>` count | 1 at every width | 1 at every width |
| Heading-level skips | 0 | 0 |
| Fonts loaded | DM Serif Display, Inter (from `assets/fonts`) | same |
| Page height (360 / 1440) | 17 570 px / 9 391 px | 10 167 px / 6 353 px |
| Mobile menu open / mega menu open | captured (`-360-menu`, `-1440-mega`) | captured (`-360-menu`) |
| Tab order (first 10 stops) | logo → Home → Services → mega links → … (desktop); logo → menu → hero CTAs → proof link → cards (mobile) | logo → nav → CTA → breadcrumbs → … |
| Focus visibility | 3 px clay ring on every focusable (CSS rule, visually confirmed on buttons/links) | same |

Contrast pairs measured in the render (WCAG ratio): eyebrow/ivory 5.40 · muted/sage 5.53 · primary button 9.98 ·
outline/ivory 8.93 · on-dark 9.98 · ghost-dark 13.10 · dark lead 11.72 · badge-clay 4.82 · badge-forest 8.46 ·
tagline/white 6.03 · footer links 11.72 · chip descriptor 6.90 · nav 8.93 · step body 6.18 · mega label 6.03 ·
eyebrow-on-dark and footer labels 8.24 (after changing them from terracotta, which measured 3.89 and failed AA for
small text — the fix is in `tokens.css` and recorded in `02` §1).

Defects found and fixed during the gate: mobile nav rendering inline on desktop (missing base `display:none`); two
inline grids not collapsing at 360 px (moved to `.split`); footer `h4` after `h2` (now `h3`) and nav group labels as
headings (now `p.label`); button text inheriting panel link colour (selector specificity).

## 4. Not verified / not done (stated plainly)

- **Lighthouse** was not run (static prototypes are not the production build; running it would prove nothing about
  the Next.js output). No score is claimed.
- **Real devices and Safari/Firefox** not tested; Chromium only. `backdrop-filter` on the header degrades gracefully.
- **Screen-reader pass** (NVDA/VoiceOver) not performed; only DOM/ARIA structure and tab order were checked.
- **Beyond Border blog article** inspected as text only; visuals of their article template are inferred.
- **Draft PR #10** not opened or updated: `gh` is unavailable in this environment. The branch is pushed; the owner (or
  a session with `gh`) opens the draft PR `revamp/d0-design-gate` → `revamp/1-catalogue` (or `main` after #10 merges).
- **No production build, tests or SEO audit** were run — this gate changes only `docs/`. The Phase 1 report's open
  gates (server calendar DST test failure, stricter robots/description checks) are unchanged and still open.
- **Competitor captures are not committed** (third-party material); they live in the session's temp folder.

## 5. Owner decisions required before Track B

1. **Approve the design direction** in this folder (or request changes), including the differentiation choices in
   `00` §1.4.
2. **Update `CLAUDE.md`** Brand & design system to Open Horizons (forest/terracotta/ivory/sage, DM Serif Display +
   Inter, terracotta contrast rule). Until then the governing rules and this design conflict; Phase 3 must not start.
3. **Confirm the three referenced documents** (00 blueprint, 07 brand application, 08 page design) do not exist
   elsewhere, or supply them so this package can be reconciled.
4. **Founder credentials**: exact publishable wording for the USEFP / Fulbright / FSU background (the mockup uses only
   the lines already in `about.ts`); confirm "200+ cases" and "5+ years" stay.
5. **Founder photo**: supply an approved photograph or confirm the empty PhotoSlot ships.
6. **Upwork rating and count**, and whether the office address and social profiles are published in the footer.
7. **Ramp naming**: keep `navy-*`/`gold-*` class names mapped to the new colours (zero-risk), or rename to
   `forest-*`/`terracotta-*` (mechanical, larger diff).
8. **Nav**: confirm "Blog" leaves the top bar in favour of "Reviews" (+ "Who we help" from Phase 5).
