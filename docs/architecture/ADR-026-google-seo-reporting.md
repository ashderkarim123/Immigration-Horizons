# ADR-026: Operator-side Google SEO reporting and explicit GA4 ownership

Date: 2026-10-04. Status: proposed for review before Phase 11.

## Context

The public site already loads GTM and direct GA4. The user selected audit reports first rather than a new CMS dashboard. Supplied Google credentials are a web OAuth client, not an authenticated grant. Staff, Client and Admin must remain excluded from marketing tracking.

## Decision

Keep reporting in an operator-only CLI with Google OAuth state validation, PKCE and read-only Search Console, Analytics and Tag Manager scopes. Use a loopback callback on the operator's own machine. Store credential/token files outside the repository and serve no OAuth endpoint from the website. Discover existing properties rather than create new ones. Export private reports under ignored `validation/`.

GA4 custom events use one explicit transport, selected at build time by `NEXT_PUBLIC_GA_TRANSPORT`: direct (existing default), gtm or off. GTM still loads in direct mode for other container tags; it must not contain duplicate GA4 tags. Moving GA4 ownership requires inspecting/publishing the container and validating it before changing website configuration. Restrict custom-event parameters to categorical values and contain provider failures.

Search Console URL-prefix meta verification belongs only in the public layout. Domain-property verification stays in DNS. Add public robots exclusions for private routes and redirect the www marketing hostname to its existing apex canonical. Private-host routing and authorization remain unchanged.

## Consequences

No new schema, migration, index, website OAuth callback or Admin UI is introduced. Google sign-in, property permissions, API enablement and visitor-consent decisions are still external setup tasks. Read-only APIs cannot submit a sitemap, publish GTM tags or mark GA4 key events. These actions require separately authorized product configuration. The tools' presence is not proof of a live Google connection.

Refer to `docs/seo/GOOGLE_INTEGRATION_SETUP.md` and `docs/seo/SEO_AUDIT_2026-10-04.md`. Release remains governed by ADR-024; Phase 11 is unchanged.
