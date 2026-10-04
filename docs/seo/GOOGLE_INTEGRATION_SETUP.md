# Google SEO reporting setup

Prepared October 4, 2026, before Phase 11. Reports-first is the selected scope.
The reporting tools are implemented; Google account authorization and real API responses are still pending.

## Existing properties and measurement

| Product | Observed configuration | Still needed |
| --- | --- | --- |
| Google Tag Manager | Public container `GTM-M9KC3GDW` appears in live HTML; its public script returns 200 | Confirm ownership, published tags/triggers and Tag Assistant results |
| GA4 | Public measurement ID `G-XYD4F5BE1F` appears in live HTML | Discover numeric GA4 property ID, confirm matching web stream and DebugView events |
| Search Console | Public sitemap returns 200 with 23 URLs | Authorize owner; discover exact verified property and confirm sitemap/indexing in Search Console |
| OAuth | Supplied JSON is a web client with client ID and secret | Verify/register callback; enable APIs; complete Google sign-in |

The JSON is not an access token or service account. A Google account grant is required.
Neither OAuth file nor tokens belong in browser code, a public upload folder, a Git commit or a report.

## One-time account setup

1. In the same Google Cloud project as the supplied OAuth client, enable **Google Search Console API**, **Google Analytics Admin API**, **Google Analytics Data API**, and **Tag Manager API**.
2. In **Google Auth Platform → Clients**, edit this web OAuth client and add this exact Authorized redirect URI: `http://127.0.0.1:8765/oauth/callback`. The supplied JSON lists no redirect URIs; the current console configuration has not been inspected. A client secret must never be used as a verification token.
3. Configure the consent screen. If the app is in Testing, add the property owner's Google account as a test user. A testing-mode refresh token for these scopes may expire after seven days; use the appropriate production OAuth configuration for ongoing reporting.
4. That account must have access to the verified Search Console site, the existing GA4 property and the existing GTM container. Domain Search Console properties require DNS verification; a URL-prefix property can use the optional website verification meta tag.
5. Save the supplied JSON and the token file outside the repository, outside `public/`, and outside any served directory. Restrict access to the operator. Unix token files are created with mode 0600; on Windows also use a private folder/ACL.

Set these values in a private, ignored root `.env` on the operator's own machine:

```dotenv
GOOGLE_OAUTH_CLIENT_FILE=/private/operator/google-client.json
GOOGLE_OAUTH_TOKEN_FILE=/private/operator/google-oauth-token.json
```

From the repository root:

```bash
npm ci
npm run seo:google -- authorize
```

Open the printed authorization URL in a browser on **the same machine** where the command runs. Sign in as the property owner and grant the three read-only scopes. The loopback listener validates OAuth state and uses PKCE. The listener exits after one completed grant or five minutes. It stores the refresh token privately and never prints the secret, code or tokens. When running over SSH, the browser's loopback is a different machine; run locally rather than copying authorization codes into chat.

Then run:

```bash
npm run seo:google -- discover
```

Read `validation/google-properties.json` locally. Identify the GA4 property whose web stream measurement ID is `G-XYD4F5BE1F` and whose default URI is the public website. Use its **numeric property ID**, not the measurement ID. Select the existing verified Search Console property. The discovery tool also reads published GTM tag/trigger summaries for `GTM-M9KC3GDW`; it creates or publishes nothing.

Add the selected values to the same private `.env`:

```dotenv
# Use exactly the property returned by discovery; these are alternatives.
GOOGLE_SEARCH_CONSOLE_SITE=sc-domain:immigrationhorizons.com
# Or: GOOGLE_SEARCH_CONSOLE_SITE=https://immigrationhorizons.com/
GOOGLE_GA4_PROPERTY_ID=REPLACE_WITH_NUMERIC_PROPERTY_ID
```

Run:

```bash
npm run seo:google -- report
npm run seo:audit
```

The report covers 28 days ending three days ago to allow Search Console processing. Search Console returns query/page clicks, impressions, CTR and position; GA4 returns public-page sessions/users/views/engaged sessions, channel/source breakdowns and event counts. Exports are private and ignored by Git. Search Console returns top rows rather than a guaranteed complete dataset and may omit anonymized queries. Its client cap is 100,000 rows with a `capped` flag. GA4 responses expose `rowCount`; compare it with returned rows if the site grows beyond the configured 10,000-row limit. Each product failure is recorded explicitly, including permission/API-enable errors; a saved report is not proof of successful account connection.

## GA4 and GTM ownership

Keep `NEXT_PUBLIC_GA_TRANSPORT=direct` during this audit. This preserves the current direct GA4 loader and allows GTM for other tags. **Do not also configure GA4 tags in GTM in direct mode.** Events now go through one transport; configuration inside GTM can still duplicate page views if it contains another GA4 tag.

To move GA4 ownership into GTM after account inspection:

1. Configure the Google tag for `G-XYD4F5BE1F` in the existing container.
2. Configure Custom Event triggers and GA4 event tags for `generate_lead`, `form_error`, `click_whatsapp`, `click_email`, `click_phone`, and `cta_consultation_click`. Map only the categorical parameters `form_name`, `service`, and `error_fields`. Do not map form values, email, phone, free-text link labels or client identifiers.
3. Use Tag Assistant preview and GA4 DebugView on staging to confirm each event fires once. A rejected form must not count as a lead. Configure `generate_lead` as a GA4 key event after verifying success-only behavior. Clicks are engagement, not successful leads.
4. Review Enhanced Measurement: prevent form-interaction telemetry from becoming a second success signal, verify route-change page views, and check URL/query data handling. Account-level behavior is not established by the source-code tests.
5. Decide and implement the visitor consent experience before expanding tracking; no consent manager was found in the source. Consent Mode must be initialized before Google tags and updated from the visitor's choice. This batch does not claim a consent banner is installed.
6. Change `NEXT_PUBLIC_GA_TRANSPORT=gtm` only after publishing the approved container configuration. Rebuild the public site: `NEXT_PUBLIC_*` values are baked into its browser bundle. In GTM mode the direct GA4 loader is omitted. `off` disables both loaders; an unknown transport value also fails closed.

Website-level tracking stays exclusively in `(site)`; never install these tags in Staff, Client or Admin layouts.

## Search Console verification and publishing

For a URL-prefix property, set `GOOGLE_SITE_VERIFICATION` to the **verification token only**, then build/deploy through the approved release process and verify the page in Search Console. Domain properties use DNS instead and need no meta tag. The metadata is scoped to the public layout.

After ownership is confirmed, submit `https://immigrationhorizons.com/sitemap.xml` in Search Console and inspect the homepage, EB-2 NIW page and both published articles. Check canonical selection, indexing exclusions and Core Web Vitals. The read-only tool does not submit sitemaps or request indexing. A successful crawl does not establish Google indexing.

Do not begin Phase 11 or merge/deploy this branch as part of account setup. Production release remains a separate reviewed action under ADR-024.

## Primary references

- [Google web-server OAuth, callbacks and tokens](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Search Console authorization scopes](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing)
- [Search Analytics query and limits](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
- [Analytics Admin account discovery](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list)
- [GA4 report dimensions and metrics](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)
- [GTM published-container read API](https://developers.google.com/tag-platform/tag-manager/api/reference/rest/v2/accounts.containers.versions/live)
- [Google Consent Mode setup](https://developers.google.com/tag-platform/security/guides/consent)
