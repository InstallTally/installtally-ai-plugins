---
name: setup
description: Connect InstallTally MCP and configure aggregate app acquisition measurement from the current app repository. Use when the user asks to set up InstallTally, register an iOS or Android app, or finish its measurement setup.
---

# Set up InstallTally

Use the selected workspace's MCP connection. The hosted service is https://api.installtally.com/mcp; preserve an explicitly selected self-hosted endpoint. The customer panel is https://app.installtally.com. No mobile attribution SDK is needed.

## Check the loaded plugin version

Once per top-level setup, run the bundled [version checker](../../scripts/check-plugin-version.mjs) with Node from this loaded plugin's absolute path. Reuse this result if setup later invokes doctor. It reads only its own manifests and unauthenticated public release metadata, never credentials. `current` or `ahead`: continue without an update question or downgrade. `update_available`: show installed/latest and release URL; ask once whether to update unless the user already explicitly requested that update. Execute only the selected client's fixed commands after approval, preserve unrelated plugins, then require a new session before claiming new skills are loaded. If declined, continue compatible authorized work. `unknown`, offline, rate limiting or missing Node: say the version check is unverified/NOT RUN and continue; never claim current, request GitHub credentials or automatically install a runtime. An old installed release needs a one-time update before it gains this preflight.


## Connect when needed

Inspect the current client's supported MCP controls before changing configuration. Reuse a matching working connection; preserve unrelated servers. If not connected:

- Codex: `codex mcp add installtally --url https://api.installtally.com/mcp`. Follow browser authentication. If setup needs write access but the grant is read-only, use `codex mcp login installtally --scopes fpmeasure:read,fpmeasure:write` and let the user approve consent.
- Claude Code: `claude mcp add --transport http installtally https://api.installtally.com/mcp`, then `/mcp` to authenticate.
- Other clients: add the Streamable HTTP URL and follow their OAuth flow. Do not invent unsupported flags or an unpublished npm package.

Use command help if the installed client differs. Let the user sign in with Google and choose or create a workspace in the authorization page. Never ask for passwords, bearer tokens, authorization codes or provider keys in chat. A health response or saved config does not prove authenticated MCP access. Verify with `list_products`.

## Choose the platforms and resume existing work

For a new setup, ask **iOS / Android / both** before any configuration write, unless the user already selected the platforms in their request. Do not infer consent to configure both just because both exist in the repository. On a repeat run reuse the known selection and existing app; ask only when the target or requested platform change is ambiguous. Preserve any platform outside the selected scope.

Treat setup as a resumable workflow: platform choice → verified store identifiers → matching registered app → missing campaign settings → private report API access → first report evidence → doctor. Read current state on each run. Do not restart completed steps, ask for saved inputs again or replace apps/links to work around an unsupported edit. When both platforms were selected, collect both identifiers before registering the app rather than creating separate or incomplete replacement products.

## Load the selected provider skills

Before any store-report setup action, load and follow the bundled skill for each selected platform:

| Selected platform | Required workflow |
| --- | --- |
| iOS | [setup-app-store-reports](../setup-app-store-reports/SKILL.md) |
| Android | [setup-google-play-reports](../setup-google-play-reports/SKILL.md) |
| Both | Load both workflows and complete or report the blocker for each separately |

Use the client's skill invocation when available, or read the linked bundled `SKILL.md` and its required helper references. Do not replace these workflows with generic store instructions. If a required skill is missing, stop that provider's setup and explain how to install/update the official InstallTally plugin and start a new session. Continue independently ready work within the user's scope. Loading instructions is not proof of executing a helper or connecting a store: report which skills were loaded, which actions actually ran and which checks remain pending or NOT RUN.

## Configure the app

1. Read this repository's manifests/build configuration for real app names, Android package names and numeric App Store IDs. Do not scan unrelated directories or add code to the app.
2. Compare `list_products` and `get_product` results. Reuse the matching app; clarify ambiguous workspace/app matches. Use `create_product` only when absent, in aggregate mode. Existing destination edits are not exposed: report unsupported additions or changes instead of duplicating/replacing an app or archiving its links. Put iOS and Android destinations for the same app in one product; multiple products may share a workspace/account.
3. Use `get_integration`. Register iOS without its provider token if unavailable. When `pt` is missing, explain the steps below before asking for a generated App Store campaign link; its public `pt` tag can be added later with `set_apple_provider_token`. Never infer it from the App Store ID. That operation cannot replace an existing token.
4. Read `list_links` first. Reuse a matching test link for the same intended campaign/tags instead of creating another on every run; clarify ambiguous matches. Create a test-mode campaign link only when absent, for registered, ready destinations and known campaign tags. If required tags are missing, report the remaining input instead of inventing a production campaign. Verify redirects separately from acquisition evidence. Do not replace active ad links.
5. Inspect existing sources first with `list_store_sources`, `list_app_store_sources` and `list_data_sources` as applicable to the selected platforms. Reuse working sources and do not request another key upload. Distinguish absent, paused, pending, permission-error and working connections. Include missing report connections in initial setup, independently of `pt`. Follow the selected provider skills above for browser assistance, private handoff, approved local helper use and current server capability limits. MCP authorization does not grant provider access; a saved key, waiting worker or queued import does not prove report access.
6. After the owner saves a private connection, re-read source, worker/job and report evidence. Explain exactly what remains if access is denied or the first report is still being generated; do not mark setup complete merely because the app or link exists. On the next run continue from that outstanding step. Finish with the read-only `doctor` workflow and report configured app/platforms, verification evidence and remaining inputs. Distinguish registration, usable links and measured acquisitions.

## Explain Apple setup when needed

Do not just request a provider token or tell the user to find a campaign link. Explain: **App Store Connect → Apps → the app → Analytics → Acquisition → Campaigns → +**. Enter a campaign name, copy the generated link, and take the digits after `pt=`. For illustration, `?pt=123456&ct=example&mt=8` contains `pt` value `123456`; never save this illustrative value for the user's app. The user can share the public generated link instead of extracting the tag manually.

`pt` identifies the Apple developer account and is reused across that account's campaigns. `ct` identifies an individual campaign. Neither is the private report API key. Apple's public API does not document a provider-token lookup; do not infer `pt` from the app ID, invent an endpoint or scrape an authenticated session. If Campaigns or `+` is missing, explain that Apple needs app analytics data first; continue registration, Android and report connection setup without `pt`. [Apple's campaign-link steps](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links).

For Apple report access, follow `setup-app-store-reports`. Its approved local helper can reuse/create the initial ONGOING request using explicitly selected Admin authority without uploading an Admin key. The permanent reader uses the private owner form and a Sales and Reports team key. Choose App Store Downloads Detailed / DAILY for Campaign (`ct`) results. `pt` is independent. First generation may take 1–2 days; verify actual report rows and preserve privacy limits. The hosted reader does not perform Admin bootstrap or save a pending connection before report definitions exist. [Apple's report workflow](https://developer.apple.com/documentation/appstoreconnectapi/downloading-analytics-reports).

Do not change ads/budgets, enable referral mode, export individual conversions, upload customer records or assign overall revenue to campaigns. Unknown metrics remain unknown. Scope any write to the user's requested setup; provider permissions and ad-account actions require their own authorization.

References: https://installtally.com/docs/quickstart/ and https://installtally.com/docs/mcp/ .

For the selected platforms, use the bundled [Google Play report workflow](../setup-google-play-reports/SKILL.md) and [App Store report workflow](../setup-app-store-reports/SKILL.md). These preview workflows inspect actual server capability and can assist through an authorized provider browser. The Apple workflow includes an optional approved local Admin bootstrap helper. Do not claim that a setup intent provisions Google readers or stores a pending Apple connection; these backend steps are still in development. Continue independently ready steps and report the exact remaining prerequisite.
