---
name: setup
description: Connect InstallTally MCP and configure aggregate app acquisition measurement from the current app repository. Use when the user asks to set up InstallTally, register an iOS or Android app, or finish its measurement setup.
---

# Set up InstallTally

Use the selected workspace's MCP connection. The hosted service is https://api.installtally.com/mcp; preserve an explicitly selected self-hosted endpoint. The customer panel is https://app.installtally.com. No mobile attribution SDK is needed.

## Connect when needed

Inspect the current client's supported MCP controls before changing configuration. Reuse a matching working connection; preserve unrelated servers. If not connected:

- Codex: `codex mcp add installtally --url https://api.installtally.com/mcp`. Follow browser authentication. If setup needs write access but the grant is read-only, use `codex mcp login installtally --scopes fpmeasure:read,fpmeasure:write` and let the user approve consent.
- Claude Code: `claude mcp add --transport http installtally https://api.installtally.com/mcp`, then `/mcp` to authenticate.
- Other clients: add the Streamable HTTP URL and follow their OAuth flow. Do not invent unsupported flags or an unpublished npm package.

Use command help if the installed client differs. Let the user sign in with Google and choose or create a workspace in the authorization page. Never ask for passwords, bearer tokens, authorization codes or provider keys in chat. A health response or saved config does not prove authenticated MCP access. Verify with `list_products`.

## Configure the app

1. Read this repository's manifests/build configuration for real app names, Android package names and numeric App Store IDs. Do not scan unrelated directories or add code to the app.
2. Compare `list_products` and `get_product` results. Reuse the matching app; clarify ambiguous workspace/app matches. Use `create_product` only when absent, in aggregate mode. Existing destination edits are not exposed: report unsupported additions or changes instead of duplicating/replacing an app or archiving its links. Put iOS and Android destinations for the same app in one product; multiple products may share a workspace/account.
3. Use `get_integration`. Register iOS without its provider token if unavailable. Ask for a generated App Store campaign link when needed; its public `pt` tag can be added later with `set_apple_provider_token`. Never infer it from the App Store ID. That operation cannot replace an existing token.
4. Create a test-mode campaign link only for registered, ready destinations and known campaign tags. If required tags are missing, report the remaining input instead of inventing a production campaign. Verify redirects separately from acquisition evidence. Do not replace active ad links.
5. Direct owners to the private Google Play/App Store connection forms for report credentials. MCP authorization does not grant access to those providers. A saved key, waiting worker or queued import does not prove report access.
6. Finish with the read-only `doctor` workflow and report configured app/platforms, verification evidence and remaining inputs. Distinguish registration, usable links and measured acquisitions.

Do not change ads/budgets, enable referral mode, export individual conversions, upload customer records or assign overall revenue to campaigns. Unknown metrics remain unknown. Scope any write to the user's requested setup; provider permissions and ad-account actions require their own authorization.

References: https://installtally.com/docs/quickstart/ and https://installtally.com/docs/mcp/ .
