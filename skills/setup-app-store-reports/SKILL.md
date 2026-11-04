---
name: setup-app-store-reports
description: Connect or resume Apple aggregate download reports through InstallTally MCP and its private local credential companion, without opening a browser. Use for iOS report onboarding, approved local Admin bootstrap or pending reports.
---

# Set up App Store reports through MCP

Use an already authorized InstallTally workspace owner MCP. Verify the selected app and numeric App Store ID against the repository. List products, App Store sources, periods and jobs first. Reuse the matching app, source and active report request. Keep aggregate measurement without an SDK. Apple report access is independent of the public campaign tag `pt`.

Load and follow [private MCP credential transfer](../setup/references/private-transfer.md). Do not open a browser, panel or provider console at any point, including login or permission repair. If the existing owner connection or required local/remote tools are unavailable, report that precise blocker. Do not substitute a generic workflow, browser or raw-key MCP input.

Use an existing Sales and Reports team reader explicitly selected by the owner. Explain its team-wide access and confirm the intended Apple team/app. Apple does not document report OAuth or API key creation through REST; this skill cannot manufacture a new provider credential. If no authorized reader exists, report `needs_provider_credential` and continue independently ready work. Never silently reuse publishing credentials or upload an Admin key as the permanent reader. Keys remain in privately selected local files; request a path/authorization, never contents.

## Resume report discovery

After private transfer, call remote `advance_provider_setup(setup_id)`. It discovers an active ONGOING request for the registered app, selects one App Store Downloads Detailed definition and binds DAILY reporting. Do not ask users to copy request/report/source IDs or choose report variants. Existing source credentials are reused; paused/disconnected sources remain paused/disconnected.

- `needs_admin_bootstrap`: use local `bootstrap_apple_reports` with the verified `app_id`, an explicitly selected private `credential_manifest` and `approve_create=false`. The private manifest contains `issuer_id`, `key_id`, `private_key_path`; it and the selected p8 file must have owner-only permissions. The companion loads the bundled [Apple helper](scripts/apple-bootstrap.mjs); Admin key material stays local and is sent only as short-lived signed authorization to Apple's official API, never uploaded to InstallTally. If creation is needed, obtain approval for exactly one ONGOING request for this app before calling with `approve_create=true`. Do not infer approval from setup alone. An unknown creation result requires reading/reusing before another create. Never search other accounts or elevate the permanent reader.
- `waiting_for_report_definition`: the encrypted reader is retained. Apple can take 1–2 days to generate reports; rerun this skill and `advance_provider_setup` later without another upload. Automatic background binding of a pending setup is not implemented; do not promise it.
- `ambiguous_request` / `ambiguous_report`: report the ambiguity. Do not choose arbitrary IDs or create replacements.
- `source_connected`: inspect source, worker, sync jobs, periods and actual rows through MCP. It does not prove report access, installed users or a successful scheduled import. Verify a later scheduled import before claiming automatic measurement.
- Provider authentication/permission or disabled-server errors: report the exact missing authorization/deployment prerequisite. Never repair them with a browser or another account's key.

Keep Campaign (`ct`), downloads/redownloads/updates/restores, overlapping periods and privacy limits separate. Missing/suppressed/noised values are not zero. If `pt` is absent, reuse a verified saved public campaign link if explicitly available; Apple has no documented lookup API. Explain the published App Store Connect campaign-link steps as external information only, without opening it. Continue report setup without `pt` and mark iOS campaign links waiting.

Report which skills/tools ran, what is ready, waiting and next. Do not change active ads/budgets/links, upload customer records or invent installation counts.

References: [Apple API keys](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api), [Analytics reports](https://developer.apple.com/documentation/appstoreconnectapi/downloading-analytics-reports), [campaign links](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links).
