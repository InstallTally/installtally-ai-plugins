# InstallTally AI plugins

Set up free, privacy-first app acquisition measurement from your app repository. No mobile attribution SDK. Aggregate measurement by default.

[InstallTally](https://installtally.com) · [Create an account](https://app.installtally.com/login) · [MCP documentation](https://installtally.com/docs/mcp/) · [API documentation](https://installtally.com/docs/api/)

| Workflow | Purpose |
| --- | --- |
| `setup` | Connect MCP, reuse or register apps, configure ready platforms and explain remaining inputs |
| `doctor` | Read-only checks of access, app configuration, campaign readiness and report evidence |
| `setup-google-play-reports` (preview) | Guide and resume authorized Play report access using actual server capabilities |
| `setup-app-store-reports` (preview) | Guide Apple reader setup and bootstrap an initial report request with an approved local helper |

The provider skills and local Apple helper are open source under Apache-2.0. They are in development: managed Google readers and Apple pending-reader storage are not enabled on the released service. The skills detect this limitation and retain the existing private owner forms. Helper tests use controlled API responses; native provider onboarding and scheduled-import acceptance remain outstanding. No preview skill is proof of live provider access.

Setup first asks whether you want iOS, Android or both. Run it again to resume: it reads the existing app, links and report sources and requests only missing inputs or permissions. A report still being generated is reported as pending.

One account can have multiple apps. Keep the iOS and Android versions of the same app in one product. An Apple campaign provider token can be added later; Android setup is independent.

## Claude Code

```sh
claude plugin marketplace add InstallTally/installtally-ai-plugins
claude plugin install installtally@installtally
```

Start a new Claude Code session and run `/installtally:setup` or `/installtally:doctor`. Use `/mcp` to complete browser OAuth when requested. Review the selected workspace and requested permissions.

## Codex

```sh
codex plugin marketplace add InstallTally/installtally-ai-plugins
codex plugin add installtally@installtally
```

Start a new task and ask: **“Set up InstallTally for this app”** or **“Run InstallTally doctor.”** If your Codex version does not have `plugin`, use the direct MCP connection below. Client installation may ask you to trust this marketplace.

## Direct MCP connection

The plugin is optional. The same `setup` and `doctor` guidance is available as MCP prompts at:

```text
https://api.installtally.com/mcp
```

```sh
codex mcp add installtally --url https://api.installtally.com/mcp
```

Or, in Claude Code:

```sh
claude mcp add --transport http installtally https://api.installtally.com/mcp
```

Follow your client's OAuth flow. A saved configuration is not proof of access: the setup workflow verifies `list_products`. Read-only authorization is enough for `doctor`; setup writes need the `fpmeasure:read` and `fpmeasure:write` scopes. Revoke access in the customer panel's **AI connections** page.

## What setup can verify

The agent reads the current app repository for store identifiers and reuses matching registered apps. It can register apps, add an initial missing Apple `pt` campaign tag, create ready test links when campaign tags are known, and inspect reports. It reports unsupported changes to existing store destinations instead of replacing the app or its links.

Setup includes provider report connections from the start. Google Play and App Store report access requires separate provider permissions and configuration in the private owner panel. For Apple, an Admin creates an `ONGOING` report request; a `Sales and Reports` team key can read it. Select App Store Downloads Detailed for its `Campaign` (`ct`) dimension. The public `pt` campaign-link tag is independent of report access.

To obtain `pt`: App Store Connect → Apps → your app → Analytics → Acquisition → Campaigns → **+**. Enter a campaign name, copy the generated link, and read its `pt=` value. Apple documents this one-time link-generation flow, not a public provider-token lookup API. See [Apple's instructions](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links). Never paste provider keys, account passwords or OAuth codes into chat, this repository or plugin settings.

A working redirect proves a link works; it does not prove an installation. Store visits, acquisitions, downloads and first opens are different metrics. Missing or suppressed data remains unknown. `doctor` does not import reports, trigger syncs or change configuration. Neither workflow changes active ads or budgets.

## Open source scope

This repository contains the plugin instructions, public MCP endpoint configuration, icon and packaging tools under [Apache-2.0](LICENSE). It contains no customer data or credentials. The hosted service is free; this repository does not contain the service backend and is not a self-hostable measurement server. Publishing this marketplace does not imply listing or endorsement in the official OpenAI or Anthropic directories.

The plugin does not add telemetry or an SDK to your app. The hosted service's account, authorization and report processing are described in the [privacy policy](https://installtally.com/privacy/).

## Develop locally

Python 3.10+ is needed only for packaging tests, not to use the plugin:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
claude plugin validate .claude-plugin/plugin.json --strict --json
claude plugin validate .claude-plugin/marketplace.json --strict --json
python3 scripts/build_plugin.py --output dist/installtally-ai-plugin.zip
```

The optional Apple bootstrap helper and its tests use Node.js 22.17+ or 24. Run `node --test tests/apple_bootstrap.test.mjs` in this repository. It reads an explicitly selected private manifest and key locally; an Admin key is never uploaded to InstallTally.

Load a local checkout in Claude Code with `claude --plugin-dir /absolute/path/to/installtally-ai-plugins`. For Codex, register that directory with `codex plugin marketplace add /absolute/path/to/installtally-ai-plugins`, then install `installtally@installtally`.

The ZIP builder exports an explicit file allowlist, rejects symlink inputs and produces reproducible archives. Development tools and arbitrary local files are excluded.

Support: [hello@installtally.com](mailto:hello@installtally.com). Do not include credentials or customer reports in public issues. Report sensitive issues privately by email.
