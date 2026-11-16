# Revamp Phase 1 — catalogue and information architecture

Date: 2026-11-16. Branch: `revamp/1-catalogue`. Draft PR: [#10](https://github.com/ashderkarim123/Immigration-Horizons/pull/10).
Starting revision: `6a43bd9` (the seven specification commits on top of `origin/main` at `6143996`).

Implementation commits: `f1412cf` (catalogue and consultation values), `1b44c87` (public consumers and publication
gating). These change 25 implementation/test files; five documentation files record the decisions and validation.

## Delivered

- Four core immigrant case categories, six core support services and six secondary nonimmigrant classifications.
  O-1 retains `/services/o1-visa` and is now secondary. No secondary service page content was created.
- Three ordered groups in desktop/mobile navigation, footer, consultation dropdown and services index. Secondary
  navigation uses quieter typography. The existing client header is retained; no client component or dependency was added.
- All public service links use one publication gate, including homepage cards, resources, related services, 404
  recovery links and the sitemap. The lightweight slug manifest is checked against the full renderer registry by
  TypeScript and tests, so the client header does not import the long service-page content files.
- NOID and E-2/F-1/F-2/J-1/B-1/B-2 are selectable for consultation without publishing their unbuilt page URLs.
  EB-2 NIW remains bespoke; all other implemented service pages retain their existing renderer and URLs.
- The owner approved appending exactly six consultation enum values. Both models retain all 12 historic values
  in their original order. O-1's catalogue `enumValue` now matches the historic stored value `O-1 Visa`; previously
  its unused catalogue field said `O-1` while the form actually saved its display name `O-1 Visa`.
- Consultation prefill, dropdown values and server validation now use the same `enumValue`. The existing
  `Immigration Consultation` guidance option is accepted by the action as well as by the model.
- The CMS mirror keeps its existing CommonJS array interface. Regenerate it with
  `node --import tsx scripts/generateServiceCatalogue.ts`; tests compare the entire array with the typed catalogue.
- Replaced "full form filing support" with preparation wording, made filing responsibility explicit, updated
  `site.description` to the supplied copy, and preserved `site.disclaimer` verbatim.
- Recorded owner decisions in the revamp README and bumped the hand-maintained sitemap revision date.

## Validation

| Check | Result |
| --- | --- |
| `npm run lint` | Pass; existing `.eslintignore` deprecation warning |
| `npx tsc --noEmit` | Pass |
| `npm run build` | Pass with local-only public origin and `.env` loading disabled |
| Root `npm test` | 494 passed, 1 skipped (bash unavailable), 0 failed |
| Server `npm test` | 910 passed, 1 failed, 0 skipped; the sole failure is the unchanged calendar DST test (about 33 minutes) |
| Final focused catalogue/form tests | 7 passed, 0 failed after the final generated-copy correction |
| `npm run seo:audit` | Windows cannot execute the configured `python3` command; same script run with `python` passes |
| `python scripts/seo/audit.py --origin http://localhost:3190 --output validation/revamp/seo-phase1.json` | 21 sitemap pages, 0 errors, 0 snippet warnings |
| Browser/DOM audit | All 21 sitemap URLs return 200; 21 distinct public link targets, none broken |
| Headings and FAQ schema | One H1 per sitemap page, no skipped levels; all 115 schema answers match rendered FAQ text |
| Responsive checks | No horizontal overflow on home/services/resources/consultation at 360, 768, 1024, 1440px |
| Navigation | Three mobile/desktop groups; desktop panels stay within viewport; keyboard opening and Escape closing pass |
| Consultation | Seven catalogue prefills plus seven server validation checks; new values and guidance accepted, selections retained after rejection |
| Content scan | No dollar amounts, numbered week/month promises, guaranteed approval, "5-star rated", "we file", or law-firm self-description found |

Browser form checks deliberately submit an invalid short message, verifying the actual server action without
creating leads, sending email or onboarding a client. Each request uses a separate documentation-range test IP
to avoid confusing service validation with the existing rate limiter.

The initial ordinary build attempted the configured Atlas read during prerendering and failed; no application
mutation, migration, index build or production script was run. Subsequent builds set `__NEXT_PROCESSED_ENV=true`
and clear `MONGODB_URI`, preventing Next's dotenv loader from restoring the configured URI. Test suites use their
existing disposable database helpers and run sequentially.

The server calendar failure was also reproduced directly: `localToInstant("2026-11-01T01:30", "America/New_York")`
returns `2026-11-01T06:30:00.000Z`; the test requires `2026-11-01T05:30:00.000Z`. Both
`server/utils/calendarTime.js` and `server/test/calendar-time.test.js` are identical to the starting revision.
The earlier/later occurrence choice is outside this public-site phase and was not changed.

Catalogue-level classification labels were checked against these official Department of State pages on 2026-11-16:

- [Student visas and dependents](https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html)
- [Exchange visitors](https://travel.state.gov/content/travel/en/us-visas/study/exchange.html)
- [Business/tourism visitors](https://travel.state.gov/content/travel/en/us-visas/tourism-visit/visitor.html)
- [Treaty traders and investors](https://travel.state.gov/content/travel/en/us-visas/employment/treaty-trader-investor-visa-e.html)

USCIS's E-2 treaty-investor and students/employment HTML pages returned 403 to the browser tool. The guessed
Department of State `/employment/treaty.html` URL returned 404; the working treaty-investor URL above was verified
instead. No detailed visa eligibility guide or unverified source link was published in this phase.

## Scope decisions and remaining gates

- **Who we help:** audience URLs do not exist until Phase 5. No `/for/*` links were exposed in Phase 1, as required
  by the owner's explicit prohibition on navigation to unbuilt pages.
- **Duplicate route:** opening `https://immigrationhorizons.com/eb2-niw` returned 404 on 2026-11-16. The spec makes
  its permanent redirect conditional on the old URL resolving; no redirect or Next config change was added.
- **Robots tags:** 19 existing sitemap pages emit no explicit robots meta tag; privacy and terms each emit one.
  There are no duplicates. This fails the stricter one-tag requirement even though the current SEO script reports
  no error. Resolve in Phase 7 with a 404 regression check; adding a layout default blindly can duplicate Next's
  automatic not-found `noindex` tag.
- **Descriptions:** eight unchanged descriptions exceed the new 155-character limit: reviews, terms, EB-1A,
  RFE response, expert opinion letters, business plans, evidence packaging and O-1. The changed services-index
  title/description are 55/150 characters. Content/SEO phases must shorten the existing overlong descriptions.
- **Brand conflict:** `CLAUDE.md` specifies navy/gold and Source Serif 4; the owner brief specifies Open Horizons
  forest/terracotta/ivory and DM Serif Display. No visual rebrand was attempted in Phase 1. Confirm/update the
  governing rules before branding work. The older core-O-1 wording in `CLAUDE.md` is scheduled for Phase 7;
  current catalogue priority follows the explicit owner brief.
- **Keyword conflict:** the SEO specification assigns the same primary keyword to home and EB-2 NIW while also
  prohibiting duplicates. No keyword remapping was attempted in this catalogue phase; resolve before the affected
  homepage/content SEO work.
- **Existing imagery:** the unchanged hero renders a person image. Its provenance/owner approval was not
  established; review it against the no-stock-people rule during the homepage phase.
- **Owner inputs for later phases:** Upwork figures, approved founder credentials/photo, publishable address,
  countries-served figure and Search Console baseline remain outstanding. No values were invented.
- **Legacy writer:** the owner confirmed this Next.js site serves production. If the separate legacy repository
  still edits the shared consultations elsewhere, its enum must be updated there; that checkout was not inspected.
- **Performance baseline:** the final homepage's initial script payload is 648,809 uncompressed bytes. No client
  component or dependency was added. An attempted build of the starting revision failed under isolated-path
  tooling, so no reliable before/after payload comparison or Lighthouse score is claimed.

Local evidence is in ignored `validation/revamp/`: `seo-phase1.json`, `browser-report.json`, the QA script and
screenshots at all four widths. Runtime build/test logs are in the task's temporary directory. The Phase 0
measurement limitations are also recorded in `baseline-2026-11.md`.

No merge, deployment, auto-merge or production data change was performed. Untracked IDE settings and the supplied
`Revamp/` materials remain untouched and excluded from commits.
