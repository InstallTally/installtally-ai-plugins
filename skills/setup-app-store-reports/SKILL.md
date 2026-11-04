---
name: setup-app-store-reports
description: Connect or resume Apple App Store aggregate download reports in InstallTally, including an approved local Admin report-request bootstrap and private reader-key handoff. Use for iOS report onboarding, missing Analytics requests or pending report generation.
---

# Set up App Store reports

Connect the selected app's Analytics Reports API without adding an SDK or uploading an Admin key to InstallTally. Report access is independent of the public campaign provider token `pt`.

## Establish the app and current capability

Use the authenticated InstallTally connection to list products, select the requested app and verify its numeric App Store ID against the repository or authorized App Store Connect app. Use the parent `setup` workflow when registration or workspace selection is missing. Read existing App Store sources, periods and jobs. Reuse a matching working source and active report request. Do not create a second product, report request or key merely because a report is delayed.

Inspect actual server capabilities. A setup intent is not an automatic connector. The released owner form requires an existing request and report definition. Pending-reader custody and automatic report selection are under development: do not claim a saved intent will finish them. If the server supports a complete pending flow, use its returned private handoff and progress controls. Otherwise continue through the existing private **App Store** form; if Apple has not generated a report definition, record the pending request and resume later without claiming the reader was stored.

## Prepare a reader privately

Use an available authorized provider browser. Remote MCP does not supply App Store Connect login. Let the owner complete sign-in and 2FA privately, then verify the selected developer team and app.

Apple has no documented report OAuth or API-key creation endpoint. Prepare a **Sales and Reports team API key** in **Users and Access → Integrations → App Store Connect API → Team Keys**. Explain the team key's scope and obtain action-time approval before creating/downloading a new key. Reuse an explicitly selected suitable existing key. Do not silently use publishing keys, unrelated app credentials or an Admin key as the permanent reader. The `.p8` can be downloaded only once; save it directly to a private local file with owner-only permissions, outside the repository. Never print its contents or request it in chat/MCP.

Transfer the reader's issuer ID, key ID and `.p8` directly through the selected product's private browser form or supported private helper handoff. Do not put them in plugin configuration, model-visible command output or source control. Confirm the team-key access disclosure there.

## Reuse or create the initial ONGOING request

Read existing requests for this app. Reuse one active `ONGOING` request. A **Sales and Reports** reader can read reports; an **Admin** is required to create the initial request. Do not elevate the stored reader to Admin.

For approved local Admin bootstrap, use [scripts/apple-bootstrap.mjs](scripts/apple-bootstrap.mjs) with Node.js 22.17+ or 24. Use only an Admin credential explicitly selected by the owner for this operation. Do not search home directories for credentials or expose private key material to the model. A private helper manifest, prepared through the private local/browser channel, contains exactly `issuer_id`, `key_id`, and an absolute `private_key_path`; both files must have owner-only permissions and be outside the app repository. The helper reads the selected files locally, signs two-minute JWTs, talks only to Apple's API, and returns safe request/status metadata. It uploads no private key and writes no credential file.

First inspect without granting a write:

```sh
node scripts/apple-bootstrap.mjs --credentials /absolute/private/admin-manifest.json --app-id 1234567890
```

Replace the illustrative app ID with the verified app; run the script from this skill directory or use its absolute path. If the result is `needs_admin_bootstrap`, prepare the exact change: one `ONGOING` Analytics Report Request for this app, using the selected Admin authority. Obtain action-time approval before adding `--approve-create-ongoing`. That flag represents the approval; the helper does not ask on the user's behalf. Do not claim a POST-only JWT restriction: Apple documents request scoping for GET. The helper handles a creation conflict by re-reading once and never retries a POST automatically.

If the helper reports `creation_status_unknown`, inspect requests on the next run before attempting another creation. Permission/authentication failures require the owner to correct the selected credential; do not probe other local accounts. Never revoke unrelated requests or keys. Keep the Admin credential local and separate from the permanent reader.

## Select and verify the report

Choose **App Store Downloads Detailed** with **DAILY** granularity for campaign measurement; its `Campaign` column contains `ct`. Select identifiers from the real discovery response. If multiple matching definitions exist, clarify the intended source rather than guessing. First generation can take 1–2 days; save a pending reader only if the server actually supports it. An existing request is progress, not imported downloads.

After connection, inspect actual report periods and rows, then a later scheduled import. Keep download types and overlapping standard/detailed or daily/weekly/monthly sources separate. Missing, privacy-suppressed or noised values are not zero. Downloads do not prove first opens or person-level attribution. Report any remaining provider permission, report delay or worker failure explicitly.

If iOS campaign links also need `pt`, obtain a public generated link from **Apps → app → Analytics → Acquisition → Campaigns → +**. Apple does not document a `pt` lookup API; it is not returned by the report API or derived from the App Store ID. Continue report setup without it. Do not change active ads/budgets/links, enable individual tracking or invent installation counts.

References: [API key creation](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api), [Analytics workflow and roles](https://developer.apple.com/documentation/appstoreconnectapi/downloading-analytics-reports), [request creation](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-analyticsreportrequests), [campaign links](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links).
