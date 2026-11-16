# Design Gate D0 — competitor-led design direction and handoff

**Status:** complete as a design package; **awaiting owner approval** before any Track B (implementation) phase changes
the public UI. Produced 2026-11-16 on branch `revamp/d0-design-gate` (branched from `revamp/1-catalogue`).

Nothing in this folder is served by the website. The prototypes are static HTML opened from disk; they are not routes.

| File | Deliverable (brief §18) |
| --- | --- |
| [00-competitor-analysis.md](00-competitor-analysis.md) | A — what to adopt from Beyond Border, Deel, Self Petition USA; what not to copy |
| [01-brand-asset-audit.md](01-brand-asset-audit.md) | B — inventory of the approved Open Horizons masters, checksums, what is missing |
| [02-design-system.md](02-design-system.md) | C — tokens, type scale, surfaces, every component spec |
| [03-homepage-design.md](03-homepage-design.md) | D — desktop and mobile homepage, section by section, with rendered previews |
| [04-page-families.md](04-page-families.md) | E — layout and conversion goal for every public page family, and how they differ |
| [05-conversion-journey.md](05-conversion-journey.md) | F — navigation and CTA journey map |
| [06-implementation-mapping.md](06-implementation-mapping.md) | G — which phase and which files each design lands in |
| [07-verification-report.md](07-verification-report.md) | H — what was inspected, rendered, measured, and what remains unverified |
| `prototypes/` | `tokens.css`, `homepage.html`, `service-page.html` — runnable, self-contained, brand fonts and logos from `assets/` |
| `screenshots/` | Chromium renders at 360 / 768 / 1024 / 1440 px, plus the open mobile menu and the open mega menu |
| `assets/` | Verified copies of the approved SVG masters, favicon, fonts and OG art (`CHECKSUMS.sha256`) |

## How to view the prototypes

Open `prototypes/homepage.html` and `prototypes/service-page.html` in a browser. They load the real DM Serif Display
and Inter files and the real logo SVGs relative to this folder, so keep the folder structure intact.

## What the owner needs to decide

See [07-verification-report.md §5](07-verification-report.md#5-owner-decisions-required-before-track-b) — the
governing `CLAUDE.md` still specifies navy/gold and Source Serif 4, the three referenced revamp documents (00, 07, 08)
are not in the repository, and the founder credential wording, founder photo, Upwork figures and address are still
outstanding.
