---
name: setup-google-play-reports
description: Connect or resume Google Play aggregate acquisition reports through InstallTally MCP and its private local credential companion, without opening a browser. Use for Android report onboarding or missing report evidence.
---

# Set up Google Play reports through MCP

Use an already authorized InstallTally workspace owner MCP. Verify the selected app's real Android package against the repository. List existing products, links, Google Play sources, sync jobs and imported report months. Reuse a matching working source; report pending, paused or permission-error states rather than replacing it. Keep store-listing acquisitions by visit date separate from install totals and first opens. No SDK is needed.

Load and follow [private MCP credential transfer](../setup/references/private-transfer.md). Never open a browser, panel, provider console or URL elicitation, including login and permission repair. If the current OAuth owner connection or companion/remote tools are missing, report that blocker. Do not substitute generic instructions or put JSON keys in MCP arguments.

Use only an existing service-account reader explicitly selected and authorized for this app's Play reports. Bulk export access requires global View app information / nonfinancial access (`CAN_VIEW_NON_FINANCIAL_DATA_GLOBAL`); explain that it covers the developer account, even though InstallTally filters the registered package. Publishing, Admin, financial or permission-management access is unnecessary. Never create a customer Cloud project, invite or IAM grant to work around a missing authority. A missing JSON key for an existing authorized reader account can be created only by the approved local prepare-store-access workflow; this does not grant Play access. Managed InstallTally reader provisioning is not implemented. Missing provider authorization is an explicit prerequisite; no browser fallback.

When no reader is saved, automatically load and follow [prepare-store-access](../prepare-store-access/SKILL.md) before requesting finished JSON files. Reuse any existing approval for the exact files, provider identity and destination. It prepares approved local readers and returns here for transfer and verification; it does not manufacture missing provider authority.

After private transfer, call remote `advance_provider_setup(setup_id, bucket=...)` with the verified nonsecret Play report bucket from the owner's explicitly selected configuration or a saved authorized connection. The bucket is an identifier, not a private key. Do not infer it from a developer ID, enumerate unrelated projects or call private Play Console endpoints. Google's documentation obtains it through Copy Cloud Storage URI; there is no verified public API here that can discover it for every developer. If absent, report `needs_report_bucket` rather than opening the console or inventing a value.

The backend derives the source ID and registered package, configures supported `stats/store_performance` exports with separate country/traffic-source breakdowns, and reuses existing connections. These breakdowns overlap: never sum them. A configured source or queued job is not proof of an imported report. Read actual worker, job, monthly report and row evidence through MCP; verify the package, dates and provider-reported counts. Distinguish permission denied, missing object, successful empty export, privacy suppression and measured values. Verify a later scheduled import before claiming unattended operation. Re-running setup must not rotate keys, duplicate sources or re-enable a paused source.

If provider access must be created or repaired outside documented available APIs, explain the missing prerequisite and continue independent work. Do not use Publishing/Developer Reporting APIs as a third-party permission-provisioning shortcut; their terms impose additional restrictions. Existing InstallTally identity login does not authorize report access. Never claim automatic Google permission provisioning is live.

Report loaded skills, actions actually performed, ready/waiting states and next action. Never change active ads/budgets/campaign URLs, upload customer records, enable individual tracking or invent installation counts. Local disconnect does not revoke Google's external permission.

References: [Google report access](https://support.google.com/googleplay/android-developer/answer/6135870?hl=en), [Cloud Storage scopes](https://docs.cloud.google.com/storage/docs/oauth-scopes), [Publishing API terms](https://developers.google.com/android-publisher/terms).
