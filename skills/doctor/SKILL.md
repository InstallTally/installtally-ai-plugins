---
name: doctor
description: Diagnose InstallTally MCP access, app configuration, campaign readiness and aggregate report freshness without changing state. Use when measurement is missing, setup fails, permissions are unclear, or the user asks whether an app is ready.
---

# Diagnose InstallTally

Run read-only checks through the existing selected connection. Do not install a plugin, authenticate, change workspace selection, register/update/archive apps or links, import data, sync sources, retry jobs, rotate/disconnect keys, or change ads/budgets. If authentication is missing, report the blocker and point to `setup`; do not start login during this diagnosis. Do not print credentials.

## Check the loaded plugin version

Once per top-level doctor, call local MCP `check_plugin_version`. It runs the bundled [version checker](../../scripts/check-plugin-version.mjs) without shell access. If that tool is unavailable, use the bundled Node script only when local execution is available; otherwise report NOT RUN and continue authorized diagnostics. Reuse the current invocation's setup result when present. It reads only own manifests and public release metadata. `current`/`ahead`: no update question or downgrade. `update_available`: report installed/latest and release URL, offer an update as a separate action; doctor never installs or updates. `unknown`, offline or missing Node: report unverified/NOT RUN and continue authorized diagnostics. Never request GitHub credentials or install a runtime. Do not claim an old installed skill has acquired a new preflight without a one-time update and new session.

Never open a browser or login/consent URL. Missing authorization is a blocker, not permission to start a login flow.

## Establish the target

Inspect client MCP connection state and available tools using the current client's documented read controls. Verify actual authenticated access with `list_products`; public health200 is insufficient. Select the product requested by the user. If multiple products/workspaces match, report the ambiguity before app-specific checks. Do not imply access to unrelated workspaces or provider accounts.

## Inspect the evidence

Read `get_product`, `get_integration`, `list_links` and `get_report` for an explicit date range. Use `list_data_sources` for configured snapshot bindings. Where available, inspect Google Play and App Store source, period/report and job-status read tools. A missing native source is not proof that generic imported aggregates are absent.

Keep these observations separate:

- App registration and store identifiers.
- Campaign readiness: a missing Apple `pt` blocks iOS campaign redirects, while registration and aggregate imports still work. Android readiness is independent. Do not make synthetic clicks or installs as a diagnostic shortcut.
- Report permissions versus encrypted key storage. A permission error needs owner/provider action; never request the key in chat.
- Worker heartbeat, queued/retry/error state, last successful import, provider reporting date and coverage. Waiting does not mean fresh. A successful empty import is not a measured zero.
- Provider metrics: store visits/clicks, acquisitions, downloads/redownloads and first opens are different. Do not add overlapping sources or currencies. Missing revenue stays unknown; no unsupported CPI/ROAS.

Return a compact table: check, PASS/FAIL/NOT RUN, source/date evidence, next action. For actual import verification, use NOT RUN when no reader/source is configured and no import could be attempted; describe the missing prerequisite. An attempted import/check with a concrete error can FAIL. Configuration readiness may fail separately when a required source is absent. Missing or suppressed evidence is unknown, not zero. Report a partial result when checks cannot run; never mark overall readiness while required access or coverage remains unverified. Recommend fixes without executing them.

Reference: https://installtally.com/guides/why-app-install-data-is-missing/ .
