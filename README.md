# InstallTally AI plugins

Set up free, privacy-first app acquisition measurement from your app repository. No mobile attribution SDK. Aggregate measurement by default.

[InstallTally](https://installtally.com) · [Create an account](https://app.installtally.com/login) · [MCP documentation](https://installtally.com/docs/mcp/) · [API documentation](https://installtally.com/docs/api/)

| Workflow | Purpose |
| --- | --- |
| `setup` | Load the selected store-report skills, connect MCP, reuse/register apps and verify the remaining setup |
| `prepare-store-access` | Prepare missing private reader files with local MCP; reuse approved access before asking for inputs |
| `doctor` | Read-only checks of access, app configuration, campaign readiness and report evidence |
| `setup-google-play-reports` (preview) | Guide and resume authorized Play report access using actual server capabilities |
| `setup-app-store-reports` (preview) | Guide Apple reader setup and bootstrap an initial report request with an approved local helper |

The provider skills and local helpers are open source under Apache-2.0. Version 0.1.9 supports private reader transfer and resumable store setup through MCP, without a browser fallback. The hosted preview enables this workflow. Local MCP connections were checked in Codex and Claude; real owner-authorized provider imports, later scheduled imports and the complete model-led account/provider flow remain unverified. A saved reader or connected source is not proof of installation counts.

Setup first asks whether you want iOS, Android or both. Run it again to resume: it reads the existing app, links and report sources and requests only missing inputs or permissions. A report still being generated is reported as pending.

Use version 0.1.9 or later for automatic platform discovery and private MCP transfer and start a new agent session after installation/update. `setup` must load `setup-app-store-reports` for iOS and `setup-google-play-reports` for Android before their provider actions. If a required skill is missing, it stops that provider workflow and explains how to update; it does not substitute generic instructions. The final report distinguishes loaded skills from actions actually executed. Setup starts discovery immediately, preserves an explicit or previous platform selection, and otherwise configures both verified platforms or the single verified platform. It loads the matching store skills without a platform confirmation. Conflicting IDs, ambiguous app/workspace matches or missing reliable platform evidence need clarification. Detecting platforms does not approve provider key creation, IAM changes or Apple Admin bootstrap. Connecting only the MCP endpoint does not install these skills.

One account can have multiple apps. Keep the iOS and Android versions of the same app in one product. An Apple campaign provider token can be added later; Android setup is independent.

## Claude Code

```sh
claude plugin marketplace add InstallTally/installtally-ai-plugins
claude plugin install installtally@installtally
```

Start a new Claude Code session and run `/installtally:setup` or `/installtally:doctor`. Reuse the existing authorized owner MCP connection. The store workflows never open a browser; missing first-time identity/consent is reported as a prerequisite.

For an existing app, you can explicitly run `/installtally:setup-app-store-reports` or `/installtally:setup-google-play-reports`. To update an older install, run `claude plugin marketplace update installtally`, then `claude plugin update installtally@installtally`, and restart the session.

## Codex

```sh
codex plugin marketplace add InstallTally/installtally-ai-plugins
codex plugin add installtally@installtally
```

Start a new task and ask: **“Load the setup skill from the InstallTally plugin for this app, then load its selected store-report skills.”** For diagnosis, ask for the plugin's `doctor` skill. To update an older install, run `codex plugin marketplace upgrade installtally`, then `codex plugin add installtally@installtally`, and start a new session. Client installation may ask you to trust this marketplace. If your client lacks plugins, the direct MCP connection below provides data tools; install the official skills separately before using the guided store workflows.

## GitHub SSH errors during updates

If an update fails with `git@github.com: Permission denied (publickey)`, check how Git resolves the public marketplace URL:

```sh
git ls-remote --get-url https://github.com/InstallTally/installtally-ai-plugins.git
```

If this prints an SSH URL, a Git `url.*.insteadOf` rule is rewriting HTTPS. You can keep the general rule and add an HTTPS exception scoped to this public repository:

```sh
git config --global --add url."https://github.com/InstallTally/installtally-ai-plugins.git".insteadOf "https://github.com/InstallTally/installtally-ai-plugins.git"
codex plugin marketplace upgrade installtally
codex plugin add installtally@installtally
```

Git uses the longest matching URL prefix, so the repository-specific exception preserves HTTPS for InstallTally while leaving other repositories' routing intact. This public repository does not require an SSH key. Restart the client session after updating; never share a private key or token in chat.

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

Reuse an already authorized owner connection for browserless store setup. The private MCP workflow never opens an OAuth/login URL; first-time account/consent remains a separate prerequisite. A saved configuration is not proof of access: the setup workflow verifies `list_products`. Read-only authorization is enough for `doctor`; setup writes need the `fpmeasure:read` and `fpmeasure:write` scopes. Revoke access in the customer panel's **AI connections** page.

## What setup can verify

The agent reads the current app repository for store identifiers and reuses matching registered apps. It can register apps, add an initial missing Apple `pt` campaign tag, create ready test links when campaign tags are known, and inspect reports. It reports unsupported changes to existing store destinations instead of replacing the app or its links.

Setup routes through the provider skills and a local private MCP companion. It never opens the customer panel or provider browser. An explicitly selected reader file is transferred directly over TLS; raw keys and plaintext upload capabilities never enter MCP arguments/results or model context. Read [the private transfer workflow](skills/setup/references/private-transfer.md). The installed local companion requires Node 22.17+ or 24 and can be registered by the setup skill using the client CLI; reload/new session is required before using newly registered tools.

Version 0.1.4 requires an enabled backend with `begin_provider_setup`, `prepare_provider_handoff` and `advance_provider_setup`. It discovers Apple ONGOING requests and Detailed/DAILY reports and reuses existing connections. Pending Apple readers are encrypted on the server. Version 0.1.9 uses `set_provider_setup_background` and explicit durable owner consent to continue report discovery/binding while the agent is closed. Managed Google reader provisioning, browserless first-time identity/consent and provider key creation are not implemented. Existing Google report permission and a verified report bucket remain prerequisites. Do not substitute browser automation when prerequisites are missing. A connected source is not a real report import.

On setup/doctor startup, the bundled checker compares its own manifest version to the public latest stable GitHub release. No credentials are read or sent. Only a newer stable release prompts an update offer; offline/unknown checks continue without claiming current. Updates need approval and a new session; doctor never installs or updates. An older installed release needs a one-time update to obtain this check. No auto-update setting is changed.

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

The optional Apple bootstrap helper and its tests use Node.js 22.17+ or 24. Run `node --test tests/*.test.mjs` in this repository. It reads an explicitly selected private manifest and key locally; an Admin key is never uploaded to InstallTally.

Load a local checkout in Claude Code with `claude --plugin-dir /absolute/path/to/installtally-ai-plugins`. For Codex, register that directory with `codex plugin marketplace add /absolute/path/to/installtally-ai-plugins`, then install `installtally@installtally`.

The ZIP builder exports an explicit file allowlist, rejects symlink inputs and produces reproducible archives. Development tools and arbitrary local files are excluded.

Support: [hello@installtally.com](mailto:hello@installtally.com). Do not include credentials or customer reports in public issues. Report sensitive issues privately by email.

## Prepare missing reader access

When a store has no saved reader, its report skill automatically loads `prepare-store-access`. The local companion can package an approved Apple Sales and Reports p8 into private JSON and create a key for an explicitly approved existing Google service account using an already-authorized local gcloud account. Prepared files remain outside version control and model context; existing transfer approval is reused. Google creation records prevent blind retries after an uncertain result. Neither helper uploads credentials, creates Apple keys, grants IAM/Play permissions or proves report access. First-time Apple key creation, missing Google report permissions and an unknown report bucket remain explicit prerequisites. These helpers have synthetic file/subprocess tests; real provider provisioning is not verified.

Version 0.1.7 exposes `check_plugin_version` through the local companion, so MCP-only clients do not need shell access for the preflight. `list_google_reader_candidates` reads bounded email/disabled metadata for one exact account/project before asking for a reader file. Cloud project names do not establish or rule out access to an app’s Play reports; candidates still need selection, action-specific key/transfer approval and actual report verification. No other projects, private keys or IAM/Play grants are enumerated or changed. Missing import prerequisites are reported as NOT RUN for actual import verification, separately from configuration readiness.

Version 0.1.9 returns fixed, actionable local discovery blockers for missing Google authorization, IAM read permission, disabled IAM API, unavailable project, missing CLI and metadata timeouts. Raw CLI errors never leave the companion. Blockers carry `request_reader_paths=false` and a next action; a failed discovery is not an empty reader list or proof that previously approved files exist. First provider credentials/authority remain explicit prerequisites.


## Server continuation and credential custody

For an owner-requested unattended integration, setup follows the shared private-transfer instructions and enables `set_provider_setup_background` with the current revision and explicit background acknowledgment. A task can wait for the private upload, then discover and bind supported reports without an open client. Apple definitions are checked again after 15 minutes; transient failures have bounded retries. Admin/bootstrap, missing bucket, revoked provider authority and identity ambiguity remain specific owner actions. Existing approved consent is reused; enabling a task never authorizes new provider keys or grants.

Report readers are encrypted on the selected server. After binding, the reader is promoted to the encrypted source store and its staging copy is cleared. `credential_location=source` means setup must reuse it. MCP credentials are not saved as worker authority. Current owner membership, removal epoch, reader revision and leases fence background commits. Apple Admin bootstrap stays local.

`get_provider_setup.background_setup` and the owner's app page expose the same task progress. Pause pending setup with `set_provider_setup_background(enabled=false)` or cancel the intent. Existing report imports have separate source controls. MCP logout/revocation does not disconnect a separately consented store integration. A connected source is not proof of imported data; inspect reports and a later scheduled import. First provider connection/key creation is still a prerequisite, not a released one-click managed connection.
