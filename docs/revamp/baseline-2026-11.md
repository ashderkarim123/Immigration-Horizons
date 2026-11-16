# Revamp measurement record — 2026-11-16

Reference revision: `6a43bd9`, the specification-only starting point of `revamp/1-catalogue`.

The first baseline build could not fetch the existing Google Fonts inside the sandbox. With network access it
compiled, but prerendering then failed while reading the Atlas URI configured in the local `.env`.

The Phase 1 build passes with `.env` loading disabled, no database connection and the local public origin
`http://localhost:3190`. The resulting sitemap has 21 pages. The existing SEO audit reports no errors and no
snippet warnings. The browser audit measures 648,809 uncompressed bytes across the homepage's initial script URLs.
This is a post-change measurement, not a pre-change baseline or a transferred/gzipped byte count.

An isolated copy of the reference revision could not be built reliably in this Windows/sandbox environment:
temporary-directory access, long paths and a Turbopack module-processing error prevented completion. No before/
after payload delta or Lighthouse score has been established. No homepage client component or dependency was added.

Phase 0 remains incomplete: owner Search Console query/page exports and repeatable mobile Lighthouse measurements
of home and EB-2 NIW are still needed. See `phase-1-report.md` for the rendered checks and pre-existing SEO findings.
