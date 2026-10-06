# pstack-flex

[![CI](https://github.com/thisguymartin/pstack-flex/actions/workflows/ci.yml/badge.svg)](https://github.com/thisguymartin/pstack-flex/actions/workflows/ci.yml)
[![MIT license](https://img.shields.io/github/license/thisguymartin/pstack-flex)](LICENSE)

pstack-flex is a portable version of [Lauren Tan's pstack](https://github.com/cursor/plugins/tree/main/pstack): one shared skill and workflow system, with adapters for coding agents and model providers. It builds on [open-pstack](https://github.com/ericlitman/open-pstack). Claude Code and Codex are supported; OpenCode is beta and has not passed the installed live gate.

Give `poteto-mode` a task. It chooses a playbook, investigates the current system, settles the design, makes the change, and verifies real behavior. Skills such as `architect`, `arena`, and `interrogate` can compare work across models. You choose each role's models in a local model sheet.

## Install

Install [Bun](https://bun.sh) for the external lane runner. Install and authenticate only the provider CLIs you assign to roles. Gateway lanes read `DEEPSEEK_API_KEY`, `MINIMAX_API_KEY`, or `OPENROUTER_API_KEY` from the session's environment. Use synthetic data for gateway testing.

### Claude Code

Run inside Claude Code:

```text
/plugin marketplace add thisguymartin/pstack-flex
/plugin install pstack@pstack-flex
/reload-plugins
```

### Codex

Run in your shell:

```shell
codex plugin marketplace add thisguymartin/pstack-flex --ref main
codex plugin add pstack@pstack-flex
```

Enable subagents in your Codex config, normally `~/.codex/config.toml`:

```toml
[features]
multi_agent = true
```

Start a new task after installation. The marketplace is `pstack-flex`; the plugin and skill namespace remain `pstack`. If an older installation uses `pstack@open-pstack`, check its source repository before removing it. Keep only one active `pstack` installation.

### OpenCode beta

Clone the repository:

```shell
git clone https://github.com/thisguymartin/pstack-flex ~/src/pstack-flex
```

Add the checkout to your [OpenCode config](https://opencode.ai/docs/config/), normally `~/.config/opencode/opencode.jsonc`:

```jsonc
{
	"skills": { "paths": ["~/src/pstack-flex/plugins/pstack/skills"] },
	"instructions": ["~/src/pstack-flex/plugins/pstack/hooks/session-start-context.md"]
}
```

OpenCode loads skills under bare names such as `poteto-mode`. Every provider-qualified role uses the external runner. Only `inherit-parent` and `auto` use its native `task` tool. OpenCode writer lanes can edit their worktree but cannot run shell commands, Git commands, tests, or builds. A task requiring those tools must report the unsupported requirement. Headless CI use is unsupported.

## Configure and run

In Claude Code:

```text
/pstack:setup-pstack
/pstack:poteto-mode Add saved filters to search. Verify it in the app.
```

In Codex:

```text
Use pstack:setup-pstack to configure pstack.
Use pstack:poteto-mode. Add saved filters to search. Verify it in the app.
```

In OpenCode beta, ask for `setup-pstack`, then `poteto-mode` by their bare names.

Setup asks for global or project scope, role assignments, and one effort per assigned model family. It probes each assigned family and writes only after all probes pass and you confirm. Existing assignments stay until you change them. See the [model matrix and dispatch contract](plugins/pstack/skills/poteto-mode/references/provider-dispatch.md) for supported descriptors and defaults.

Each app has its own global sheet. A project sheet replaces that app's global sheet for the whole repository, including its worktrees. See [sheet paths and overrides](docs/reference.md#model-sheets). Rerun setup to change assignments with a live probe.

pstack runs when you name it or keep a standing instruction for it. Once started, it can invoke the skills its workflow needs. A failed lane becomes a named dropout. The runner never substitutes a weaker model or adds an implicit timeout. External lanes use the selected CLI account or gateway key and can incur usage charges.

## Find the right reference

- [Technical reference](docs/reference.md) covers configuration, runtime boundaries, receipts, and adding a harness.
- [Provider dispatch](plugins/pstack/skills/poteto-mode/references/provider-dispatch.md) owns model choices and lane execution.
- [Harness tools](plugins/pstack/skills/poteto-mode/references/codex-tools.md) maps shared workflows to each app's tools.
- [Upstream contract](UPSTREAM.md) records source pins, local ownership, and sync rules.
- [Live gate](docs/LIVE-GATE.md) defines installed verification before merge or release.
- [psf-monitor](https://github.com/thisguymartin/psf-monitor) is a separate optional plugin for watching external lanes.

## Contribute

Track durable work in this repository's [GitHub Issues](https://github.com/thisguymartin/pstack-flex/issues). Read [UPSTREAM.md](UPSTREAM.md) before editing upstream-derived content. Keep one shared skill tree, with tool translation and provider routing at their existing boundaries.

Run `bash scripts/check.sh` before opening a PR. Nothing merges, tags, releases, or rolls out until the exact candidate passes from the real user surface in every affected harness. Record that evidence in the [PR template](.github/pull_request_template.md). A PR without it stays a draft.

MIT. pstack was created by Lauren Tan. The distribution also includes work from pstack-claude, Cursor Team Kit, and Superpowers. [NOTICE.md](NOTICE.md) records attribution; [CHANGES.md](CHANGES.md) records the fork's current changes.
