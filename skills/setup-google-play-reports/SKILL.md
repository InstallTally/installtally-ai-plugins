---
name: setup-google-play-reports
description: Connect or resume Google Play aggregate acquisition reports for an existing InstallTally app using an authorized provider browser and private credential handoff. Use for Android report onboarding, missing Play permissions or incomplete report setup.
---

# Set up Google Play reports

Connect the selected app's store-listing acquisition exports without adding an SDK. Keep these metrics separate from install totals and first opens.

## Establish the app and current capability

Use the authenticated InstallTally connection to list products, select the requested app and verify its real Android package from the repository. If registration or workspace selection is missing, use the parent `setup` workflow first. Read existing store sources, sync jobs and imported months before creating anything. Reuse a matching working source. Report an existing permission error or pending import accurately.

Inspect the server's actual tools and the private owner panel. Setup intents alone do not provision a reader: `begin_provider_setup` can be available while managed Google provisioning remains disabled. Do not invent tools, endpoints, reader addresses or OAuth flows. The current released manual connection uses a service-account credential uploaded privately. Managed-reader provisioning is under development; a new user must not be told it is already available. If neither a working managed flow nor an explicitly selected existing credential is available, report this deployment prerequisite. Offer the existing private connection as an alternative; do not silently create a customer Cloud project or JSON key.

## Prepare the provider access

Use an available authorized browser, preferably the user's requested browser. If none is available, explain the missing browser capability; remote MCP does not contain the user's Play login. Let the owner complete sign-in and 2FA privately. Confirm the developer account and registered package before making changes.

When managed provisioning is enabled, obtain the exact dedicated reader address from the selected setup's verified private response. Otherwise use only the existing reader credential explicitly selected for this task. Do not reuse credentials from unrelated local projects, publishing accounts or previously visited browser tabs.

In Play Console, open **Manage account → Play apps reports** and locate the selected app's aggregate report section. Read **Copy Cloud Storage URI** through the approved browser and transfer the bucket directly to the private setup form. Do not ask the user to extract the bucket ID or pass it through MCP. Do not use project bucket listing as a substitute: the Play report bucket is Google-managed.

Prepare **Users and permissions → Invite new users** for the exact reader. Bulk reports require global **View app information** / nonfinancial report access (`CAN_VIEW_NON_FINANCIAL_DATA_GLOBAL`). Explain that this underlying Google grant covers reports across the developer account; InstallTally's package filtering does not narrow Google's permission. Do not add publishing, Admin or financial permissions. Obtain action-time approval for this exact principal and scope before adding access. Reuse an existing sufficient invitation instead of duplicating it.

Google documents Cloud Storage reads with `devstorage.read_only`. Do not use the Publishing/Developer Reporting APIs to provision third-party customer users; their terms impose additional restrictions. Do not request broad Google login scopes as a shortcut.

## Save privately and verify

Complete the selected product's **Google Play** owner form in `app.installtally.com`, using browser upload or a private local file transfer. Never read a JSON private key into model context, shell output, chat, MCP arguments, plugin settings or source control. Do not upload the key to a third party. Confirm the account-wide access disclosure in the private form.

Choose the supported `stats/store_performance` acquisition export and the registered package. Let the workflow derive the source ID, report months and object paths. Keep country and traffic-source breakdowns separate: they overlap. A saved key, source or queued sync is not proof of a successful import.

Inspect the real worker result and returned reporting periods through read tools. Reports may arrive several days later. Distinguish permission denied, object not yet available, successful empty export, suppressed data and measured values. Report the last successful import date and what still waits on Google. Verify a later scheduled import before declaring automatic reporting complete. Resume the same source on another run; do not mint a new reader or rotate working credentials to resolve a reporting delay.

Do not change active ads, budgets or campaign URLs; upload customer records; enable individual tracking; or invent installation counts. A grant in Play Console and a local sync setting are separate: disconnecting locally does not revoke Google's permission.

References: [Google's report and access instructions](https://support.google.com/googleplay/android-developer/answer/6135870?hl=en), [Cloud Storage scopes](https://docs.cloud.google.com/storage/docs/oauth-scopes), [Publishing API terms](https://developers.google.com/android-publisher/terms).
