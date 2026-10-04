import Script from "next/script";

import { analyticsTransport, GA_MEASUREMENT_ID, GTM_ID } from "@/lib/analytics";

/**
 * Tag loading for the marketing site. Production only, so local and preview
 * traffic never pollutes the properties, and each tag only when its ID is
 * well formed. Mounted from the `(site)` layout alone — the client portal and
 * staff app must never send case or client activity to a third party.
 *
 * GA4 ownership is explicit: direct (the existing deployment) or gtm (after
 * configuring and validating the container). GTM may still load in direct
 * mode for other tags, but it must not contain GA4 tags in that mode.
 */
const transport = analyticsTransport();
const enabled = process.env.NODE_ENV === "production" && transport !== "off";
const gtmId = enabled && /^GTM-[A-Z0-9]+$/.test(GTM_ID) ? GTM_ID : null;
const gaId = enabled && transport === "direct" && /^G-[A-Z0-9]+$/.test(GA_MEASUREMENT_ID) ? GA_MEASUREMENT_ID : null;

export function AnalyticsScripts() {
  return (
    <>
      {gtmId ? (
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}
        </Script>
      ) : null}
      {gaId ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${gaId}');`}
          </Script>
        </>
      ) : null}
    </>
  );
}

/** GTM's no-JS fallback; must sit at the top of <body>, so it is the first child of the site layout. */
export function AnalyticsNoscript() {
  if (!gtmId) return null;
  return (
    <noscript>
      <iframe src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`} height="0" width="0" style={{ display: "none", visibility: "hidden" }} title="Google Tag Manager" />
    </noscript>
  );
}
