# Technical reference

This page is for maintainers and users diagnosing configuration or lane execution. Installation and first use are in the [README](../README.md). Model matrices and execution details live in [provider-dispatch.md](../plugins/pstack/skills/poteto-mode/references/provider-dispatch.md).

## Shared workflow and runtime

`plugins/pstack/skills/` is the sole workflow tree. Claude Code and Codex expose namespaced skills such as `pstack:poteto-mode`; OpenCode beta loads bare names such as `poteto-mode`. The SessionStart instruction keeps invocation opt-in. A started workflow can invoke the skills it needs.

The runtime separates these contracts:

| Source | Owns |
| --- | --- |
| `poteto-mode/scripts/harnesses.ts` | Flat harness rows for native provider, config paths, integration method, identity, session, and launch capability |
| `poteto-mode/scripts/configuration.ts` | Sheet scope paths, reads, descriptor parsing, normalization, and route resolution |
| `poteto-mode/scripts/pstack-context` | Read-only inspection of explicit parent configuration |
| `setup-pstack/SKILL.md` | Role questions, effort selection, live probes, confirmation, and transactional writes |
| `poteto-mode/references/codex-tools.md` | Shared workflow operations mapped to parent tools and built-ins |
| `poteto-mode/references/provider-dispatch.md` | Model families, default panels, native and external execution, isolation, and receipts |
| `poteto-mode/scripts/runner/` | CLI invocation, provider environment, output parsing, receipt files, and lane journal |

Paths in this table are relative to `plugins/pstack/skills/`. The mapping file retains its historical `codex-tools.md` path so upstream references resolve.

## Model sheets

A model sheet maps each role to descriptors of the form `provider:model@effort`. Parsing splits at the first colon and the last `@`, so provider model IDs may contain slashes. `inherit-parent` and `auto` use the parent session's model and effort.

Each parent has a global sheet and a private project sheet:

| Parent | Global sheet | Project sheet | Global override |
| --- | --- | --- | --- |
| Claude Code | `~/.claude/pstack-models.md` | `<project root>/.claude/pstack-models.md` | `CLAUDE_CONFIG_DIR` |
| Codex | `~/.codex/pstack-models.md` | `<project root>/.codex/pstack-models.md` | `CODEX_HOME` |
| OpenCode beta | `~/.config/opencode/pstack-models.md` | `<project root>/.opencode/pstack-models.md` | `$XDG_CONFIG_HOME/opencode` |

`XDG_CONFIG_HOME` defaults to `~/.config`. Claude and Codex overrides replace their global directories. The project root is the primary checkout resolved from Git's common directory; linked worktrees share that project's sheet. Without a repository root, configuration uses the global sheet.

An existing project sheet replaces the global sheet as a whole. Roles are never merged across sheets. Setup starts a new project sheet from the global assignments and excludes it through the repository's `.git/info/exclude`. Project configuration needs no committed instruction file.

Global setup integrates the sheet into the parent's instructions using its existing method. Claude Code uses an include, Codex uses a mirrored block, and OpenCode beta uses its config's `instructions` array. Setup owns the probe and write transaction; context inspection writes nothing.

Known versioned Claude Fable and Opus descriptors normalize to rolling aliases in memory. Setup rewrites stale persisted values only after its probes and confirmation. Other invalid descriptors remain errors. Supported families, efforts, and panel diversity rules have one reference in [provider dispatch](../plugins/pstack/skills/poteto-mode/references/provider-dispatch.md).

## Inspect the active context

The bundled executable requires an explicit parent and accepts the task's directory:

```shell
plugins/pstack/skills/poteto-mode/scripts/pstack-context --parent codex --cwd "$PWD"
```

Accepted parents are `claude`, `codex`, and `opencode`. The JSON result contains:

| Field | Meaning |
| --- | --- |
| `harness` | The parent's metadata row |
| `paths` | `globalSheet`, `projectSheet`, `excludeFile`, and `integrationTargets` |
| `activeSheet` | The selected sheet |
| `roles` | Parsed role descriptors, normalized aliases, native or external routes, capabilities, and known model labs |

The command reads configuration without probing providers, writing sheets, changing integrations, or detecting a parent from inherited environment markers. The caller supplies the parent once.

Setup uses `--paths-only` before choosing a scope so a malformed sheet can be repaired without blocking path inspection.

An aggregator's route does not establish the model's maker. `lab: null` requires verification before counting panel diversity; it never counts as an additional lab.

## Native and external lanes

The parent reads the active sheet and resolves each lane before fan-out. Every child receives its provider, model, effort, access mode, working directory, prompt, and output location. Children do not reroute or launch nested models.

Claude descriptors use native agents in Claude Code. Codex descriptors use native subagents in Codex. Other descriptors use `pstack-runner`. OpenCode beta sends every provider-qualified descriptor through the runner; its native `task` tool handles only `inherit-parent` and `auto`.

External lanes receive complete tasks directly, without an intermediary model. Each writer gets its own worktree. Each run gets unique output paths. A missing CLI, rejected model, authentication error, or child failure produces a named dropout. The runner adds no implicit timeout and substitutes no model.

Launcher arguments, receipt schema, status codes, and cancellation are defined in [provider dispatch](../plugins/pstack/skills/poteto-mode/references/provider-dispatch.md#external-lanes). A receipt distinguishes the requested model from the provider's reported model. `modelEvidence: "pinned-argv"` proves the requested invocation but does not prove which model answered.

## Gateway and OpenCode limits

DeepSeek, MiniMax, and OpenRouter lanes run the stock Claude CLI against a provider endpoint. The runner strips inherited Anthropic routing, injects the chosen endpoint and key, and uses an isolated config directory. Its OAuth-file guard checks `.credentials.json`; it cannot detect macOS Keychain credentials. Do not authenticate a Claude subscription inside a gateway config directory.

Enable third-party routing per project, including through OpenCode. Keep customer data out of those lanes and use synthetic data for testing. Gateway keys stay in the local environment. Gateway receipts keep usage but set `costUsd` to `null`; the Claude CLI's Anthropic cost estimate is unsuitable for another provider. This repository maintains no pricing table.

OpenCode support is beta. Runner-level checks do not establish installed OpenCode parent support. The real-session gate remains required, and headless CI use is unsupported.

OpenCode lanes use deny-first permissions. Each invocation uses a fresh agent name so ambient `plan` and `build` permissions cannot merge into its access policy. Read-only lanes can inspect files. Writers can also edit files inside their worktree. They cannot run shell commands, Git commands, tests, or builds. A lane that requires those tools must report the unsupported requirement rather than claim verification. OpenCode receipts use `pinned-argv` evidence and `costUsd: null`.

## Optional lane journal

The runner journals lanes while `~/.pstack-flex/lanes/` exists, or while the directory named by `PSTACK_FLEX_LANES_DIR` exists. Each lane directory holds `lane.json`, streamed stdout in `stream.jsonl`, and `receipt.json`.

The start record includes provider, model, effort, mode, label, the first 300 prompt characters, runner PID, and parent identity. A journal error never changes a lane's output, receipt, or exit status. Sending SIGTERM to the runner cancels the lane and produces a cancelled receipt.

The separate [psf-monitor](https://github.com/thisguymartin/psf-monitor) reads this journal. A journal schema change also needs a matching monitor change.

## Dependencies

The runner and orchestration tools use Bun. Git supplies worktree isolation. GitHub workflow skills use `gh`. `check-plan.mjs` uses Node built-ins. `worktree-audit.sh` uses `jq` and `rg` and warns when missing tools leave its PR or last-chat columns blank.

Install and authenticate only CLIs assigned in the active model sheet. Native Codex fan-out requires `multi_agent = true`. CLI and browser verification use the parent tools named in the [harness mapping](../plugins/pstack/skills/poteto-mode/references/codex-tools.md).

## Add a harness

The extension points are the existing metadata, configuration, and mapping boundaries. A new harness needs:

1. A row in `harnesses.ts` naming its native provider, paths, config override, integration, launch capability, and identity or session variables.
2. Configuration tests covering its paths, linked worktrees, and global fallback. The shared resolver reads the metadata row.
3. A tool map in `codex-tools.md` for invocation, questions, subagents, background drain, cancellation, and verification.
4. Tests for runner parent validation and child environment isolation, both derived from the row. Add a provider adapter only if the harness also supplies external model lanes.
5. An integration recipe if its instruction format differs from the existing three. Keep setup's shared probes, confirmation, and write transaction.
6. Static invariants and installed evidence from the new app's real user interface under [LIVE-GATE.md](LIVE-GATE.md).

Unsupported tools need an explicit requirement failure. They do not justify per-harness skill trees, child routing, compatibility layers, implicit timeouts, or weaker-model fallback.

## Diagnose a failed run

The active context and receipt identify different failure points:

| Symptom | Relevant evidence |
| --- | --- |
| Wrong role assignment | `pstack-context` shows the active sheet and parsed role. Project scope replaces global scope. |
| Role never starts | The selected native route or external dropout identifies the unavailable tool or model. |
| Model differs from the request | The receipt's requested model, reported model, and evidence distinguish invocation from provider proof. |
| Writer cannot verify | The access contract identifies allowed tools. OpenCode test and build requirements are unsupported. |
| Setup fails | Failed probes leave the previous sheet and integration intact. |

## Maintainer checks

`bash scripts/check.sh` runs Bun tests, strict typechecks, manifest parsing, static invariants, and Claude plugin validation when that CLI is installed. Local checks are one part of verification. [LIVE-GATE.md](LIVE-GATE.md) defines the installed behavior required before merge or release.

Source pins, substitutions, and sync procedure are in [UPSTREAM.md](../UPSTREAM.md). Copyright and license sources are in [NOTICE.md](../NOTICE.md). Durable work belongs in this repository's GitHub Issues.
