# Revamp Phase 2 — core content

Date: 2026-11-16. Branch: `revamp/2-core-content` (stacked on `revamp/d0-design-gate` → `revamp/1-catalogue`).
Draft PR: not opened from this environment (`gh` is unavailable); the owner opens it against `revamp/d0-design-gate`.
Spec: `02-content-specs.md` §0–2. Nothing merged or deployed.

## Delivered

- **New `/services/noid-response`** (`service-pages/noid-response.ts`, registered in `index.ts` and `slugs.ts`).
  1,738 words, 7 FAQs, definition of 58 words, key facts without any number or timeframe, scope note verbatim from
  the spec, sources 8 CFR 103.2 (eCFR) and USCIS Policy Manual Vol. 1 Part E Ch. 6. The catalogue test now expects
  it to be published; the sitemap, nav, footer and consultation form picked it up through the existing gate.
- **`/services/rfe-response` refocused** on I-140 RFEs: H1 "I-140 RFE Response Preparation for EB-2 NIW and EB-1",
  title 58 characters, notice-type key facts, "petitions we did not prepare" stated in the callout, key facts and
  closing section, RFE-vs-NOID section ends with a link to the NOID page, weak USCIS "tips for filing" source
  replaced by 8 CFR 103.2 and the Policy Manual. Slug and catalogue name unchanged.
- **EB-2 NIW flagship expanded** (`eb2-niw.ts` + bespoke page): H1 per spec, title 52 characters, new sections
  "What our full EB-2 NIW package includes" (eight numbered items phrased as what the client receives), "Who we
  prepare NIW petitions for" (prose; `/for/*` links wait for Phase 5), "Already filed and received an RFE or NOID?"
  with links to both response pages, and "EB-2 NIW client reviews" rendering the existing `TestimonialCard` for the
  two verified EB-2 NIW reviews (the spec asked for 3–5; only two exist and none were invented). TOC updated.
- **EB-1A / EB-1B / EB-1C**: each gains a numbered "What our full package includes" section adapted to the category,
  linking the RFE and NOID pages. EB-1A adds "Coming from O-1?" linking `/services/o1-visa`; EB-1B adds "EB-1B for
  professors, researchers and postdocs" (faculty and postdoc subsections, employer-petitioner statement kept); EB-1C
  adds "EB-1C compared with L-1A" with no external link.
- **Business plans**: "E-2 business plans" section and "E-2" added to the Used-in key fact. The `/services/e2-visa`
  link waits for Phase 6, so the section says the E-2 page is planned.
- **Renderer**: one optional `links` field on content sections, rendered as outline buttons by the existing
  `Button`. No new component. Only published slugs are linked.
- **US spelling pass** across every `service-pages/*.ts` file, `eb2-niw.ts` and the bespoke page (organize,
  recognize, analyze, labeled, judgment, program, license, color, endeavor, center). Zero British forms remain in
  those files.

## Validation

| Check | Result |
| --- | --- |
| `npm run lint` | Pass (existing `.eslintignore` warning only) |
| `npx tsc --noEmit` | Pass |
| `npm run build` | Pass with `__NEXT_PROCESSED_ENV=true` and `MONGODB_URI` cleared (same isolation as Phase 1) |
| Root `npm test` | 495 passed, 0 failed, 0 skipped |
| Server `npm test` | Not run: no `server/` file changed (the generated catalogue mirror was already updated in Phase 1) |
| Rendered-HTML scan on `next start` (eb2-niw, eb1a, eb1b, eb1c, rfe-response, noid-response, business-plans, /services) | One H1, no heading skips, canonical equals path, every FAQPage answer byte-matches visible text, title ≤ 60 and description ≤ 155 on all eight pages, zero dollar amounts, zero week/month/day timeframes, zero approval/success rates, zero attorney self-description. "guarantee" appears only in the two deliberate "we cannot guarantee approval" FAQ answers |
| `<meta name="robots">` | **0 on every page, including untouched pages.** Pre-existing Phase 1 open gate; unchanged here |
| Source URLs | All six new/changed sources return 200 (eCFR 103.2, Policy Manual 1.E.6, I-140, EB-1, 204.5, Dhanasar PDF). `egov.uscis.gov/processing-times` and the Visa Bulletin return 403 to automated clients; both are pre-existing links left in place |
| Word counts | noid 1,738 · rfe 1,594 · eb1a 2,412 · eb1b 2,162 · eb1c 2,218 · business-plans 1,396 (the EB-1 pages were already above the 1,800 ceiling before this phase; nothing was cut) |

Not run: Lighthouse, `npm run seo:audit` (the Phase 1 run covers the unchanged chrome; the per-page checks above
are the same assertions), cross-browser or screen-reader checks. No browser screenshots: this phase changes
content inside the existing renderer only.

## Decisions and deferrals

- `/for/*` audience links (spec §1.1, §1.2) and the `/services/e2-visa` link (§1.4) are deferred to Phases 5 and 6
  because those pages do not exist; linking them now would ship 404s. The sections are written so the links can be
  added as a one-line `links` entry.
- Three NOID FAQ questions use "do not" rather than "don't" so the schema and visible text share one form.
- Spelling normalization touched four pages outside the Phase 2 list (O-1, evidence packaging, recommendation and
  expert opinion letters) because the rule says to normalize as files are touched and the pass is mechanical
  (43 word substitutions, no copy change).

## Open gates carried forward

Robots meta (0 per page), the stricter description checks and the server calendar DST test remain open from Phase 1.
Phase 3 waits on Design Gate D0 approval and the `CLAUDE.md` brand update.
