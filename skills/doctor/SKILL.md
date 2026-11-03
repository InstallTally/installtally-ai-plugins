---
name: doctor
description: Diagnose InstallTally MCP access, app configuration, campaign readiness and aggregate report freshness without changing state. Use when measurement is missing, setup fails, permissions are unclear, or the user asks whether an app is ready.
---

# Diagnose InstallTally

Run read-only checks through the existing selected connection. Do not install a plugin, authenticate, change workspace selection, register/update/archive apps or links, import data, sync sources, retry jobs, rotate/disconnect keys, or change ads/budgets. If authentication is missing, report the blocker and point to `setup`; do not start login during this diagnosis. Do not print credentials.

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

Return a compact table: check, PASS/FAIL/NOT RUN, source/date evidence, next action. Missing or suppressed evidence is unknown, not zero. Report a partial result when checks cannot run; never mark overall readiness while required access or coverage remains unverified. Recommend fixes without executing them.

Reference: https://installtally.com/guides/why-app-install-data-is-missing/ .
