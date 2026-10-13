# Harness integration

Shared skills retain upstream tool names. This file is the harness adapter boundary; its path remains stable for upstream skill references. Model providers are separate. Read [provider dispatch](provider-dispatch.md) for models and receipts.

The parent matches the current session and tools to the exact `id` in [harnesses.ts](../scripts/harnesses.ts) once. Do not infer it inside children. Run `scripts/pstack-context --parent <id> --cwd <project>` under the installed poteto-mode skill before the first configured dispatch. It reads the selected model sheet. Keep that context for the run. It never spawns a lane or writes configuration.

The output includes global/project paths, integration targets, the selected sheet, normalized role descriptors, routes, model labs, and lane capabilities. Report stale `normalizedFrom` values once; setup persists them only after probes and confirmation. Model-family validation uses provider dispatch's matrices. For a task that requires shell execution, add `--role '<role>' --require-shell`; a lane lacking that capability fails explicitly. An inherited lane uses the actual session's available tools.

When a role has no configured row, use the calling skill's defaults with the same routing and capability rules. `--role` checks only persisted assignments.

`lab: null` means the descriptor does not establish a lab. OpenCode aggregators can serve several labs; verify the model's maker before counting panel diversity. Never count an unknown aggregator as an additional lab.

## Tools

| Shared action | Claude Code | Codex | OpenCode |
| --- | --- | --- | --- |
| Read | `Read` | file or shell tool | `read` |
| Write/edit | `Write`, `Edit` | `apply_patch` | `write`, `edit` |
| Shell | `Bash` | persistent exec session | `bash` |
| Search files | `Grep`, `Glob` | `rg` | `grep`, `glob` |
| Fetch/search web | `WebFetch`, `WebSearch` | available web tools | `webfetch`, `websearch` |
| Load skill | `Skill`, `/pstack:<name>` | load `pstack:<name>` | `skill` with `<name>` |
| Subagent | `Agent` | `spawn_agent` | `task` with `general` |
| Wait | retained task handle | `wait_agent` | task response |
| Tasks | `TodoWrite` | available plan tool | `todowrite` |
| Ask user | `AskUserQuestion` | available question tool or plain text | `question` |

`paths` frontmatter is a Claude loading feature. Elsewhere invoke the named skill explicitly. An unavailable native subagent is a named dropout; never replace it with an external or weaker model silently.

## Native dispatch

Use the route returned for the configured descriptor. `inherit-parent` and `auto` always request the session's current model and effort. An explicit model is native only when its provider matches the adapter's `nativeProvider`.

- Claude Code uses `Agent`. Match the descriptor's `(provider, model)` to the matrix's native agent stem, then use `pstack-<stem>-<effort>`. Those definitions set the rolling model alias, effort, and background execution. Ad-hoc inherited work uses `poteto-agent`.
- Codex uses `spawn_agent` with the selected `model` and `reasoning_effort`. Enable `multi_agent` in the Codex feature configuration. There is no `poteto-agent` type; inherited helpers read poteto-mode, and comment reviewers read `agents/comment-sicko.md`. Spawn calls already run concurrently.
- OpenCode's `task` cannot select a model per call. It serves only inherited roles. Its qualified model descriptors use the external runner, even when their provider is `opencode`. A `general` task reads the relevant agent instruction file.

Pass the full task, access mode, grounding paths, and unique output location. Give writers dedicated worktrees. Launch independent lanes together, retain handles, then drain every lane before judging.

## Agent continuity

The parent applies poteto-mode's Subagents rule before dispatch. New tasks, fix rounds, follow-ups, retries, and queue items use fresh agents with the original scope, all later directives, the prior report, and the branch and worktree path. An owner role or an existing branch does not require the same agent. Reuse requires named state that is costly to transfer. Stop and hold orders remain allowed.

- Claude Code starts a new `Agent` call without a resume ID. Use an existing agent's resume or message mechanism only for the costly-state exception. Keep `poteto-agent`'s declared skill preload and full-read instruction.
- Codex uses a new `spawn_agent` for new work. `followup_task` or a work-bearing `send_message` to an existing agent requires the costly-state exception; status reads and stop/hold orders do not. Fresh inherited helpers still read poteto-mode.
- OpenCode starts a new inherited `task` without the prior task's continuation ID. Continue an existing task only for the costly-state exception. Qualified descriptors still use the external runner.
- External lanes, including OMP's `pstack_task`, start a new runner invocation with unique output and receipt paths. A retained task/session handle supervises the current attempt; it is not a continuation API. If work needs a live lane's costly state and that lane has no continuation API, report that limitation rather than restarting it and claiming reuse.

The parent keeps the resolved role route and access mode. Children never reroute themselves. Drain or stop the prior writer and confirm it has stopped before a replacement writes in the same worktree. Preserve its edits and report, check the current branch and diff, and pass that state to the new worker. Concurrent writers still need separate worktrees or output directories. A retry adds neither a model fallback nor an implicit timeout.

## External launch

Use the adapter's `launch` recipe. The runner's own timeout is absent unless the user or task supplies a deadline.

- `task` uses Claude's Bash tool with `run_in_background: true`. Retain its task ID. A foreground call has a ten-minute ceiling.
- `session` uses Codex's persistent exec session. Retain its session ID and poll that handle.
- `detached` uses OpenCode's shell. Its foreground calls default to two minutes and have no background handle. Start `nohup pstack-runner … >"<unique log>" 2>&1 & echo $!` and retain the PID. Drain with short receipt checks. `kill -0 <pid>` checks liveness; `kill -TERM <pid>` requests cancellation. Session abort does not reach a detached lane.

A receipt is terminal only after it contains valid complete JSON. Empty reserved files are still running. Do not judge while another lane is writing.

## Configuration integration

Paths and integration type come from `pstack-context`, including `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, and `XDG_CONFIG_HOME` overrides. Shared scope resolution is in [configuration.ts](../scripts/configuration.ts). Setup asks which scope to edit every run; dispatch uses the existing project sheet in preference to global, without merging roles.

Project setup writes the sheet and lists its repository-relative path in the common git directory's `info/exclude`. It does not change global instructions. Global setup applies the selected integration recipe:

- `include` adds one `@<absolute sheet path>` line to the target instructions file. Leave unrelated lines alone.
- `mirror-block` copies the exact sheet bytes between `<!-- pstack:models:begin -->` and `<!-- pstack:models:end -->` in the target instructions file. Replace that block on rerun. If neither marker exists, append one block. Refuse an unmatched, duplicate, or reversed marker.
- `instructions-array` adds the absolute sheet path once to `instructions` in the first existing integration target. Preserve JSONC comments, unrelated keys, and entries. If no target exists, create the JSON target with `$schema` and that array. Refuse malformed config. Do not create a global `AGENTS.md`, which would shadow OpenCode's Claude-instruction fallback.

Before changing either target, snapshot its bytes. Write only after exact model probes and user confirmation, read back both targets, and restore both on failure. An unchanged rerun leaves bytes unchanged. These recipes are the only harness-specific write rules; setup owns the common transaction.

## Built-ins and local state

Where upstream names `run`, drive the CLI yourself. Where it names `verify`, drive the UI with available tools and observe the artifact. Where it names `plugin-dev:skill-development`, use the current harness's skill-authoring guidance. Where it names `loop`, use an available recurring task or rerun the step at the specified cadence.

Use the current harness's consumed instructions file for standing rules. Transcript paths and native agent stores are host state, not lane-provider configuration. `worktree-audit.sh` reads Claude transcripts; its chat column is unavailable on other hosts. Do not create a Claude transcript directory to compensate.

## OMP-only parent

Start through `pstack-omp`, not plain OMP. Read [OMP setup](../../../../../docs/OMP.md). The launcher loads the same shared skill tree and its parent extension. Use `read`, `grep`, `write`, `edit` and `bash` in the parent. Ask the user in plain text when a question tool is unavailable.

Every worker uses `pstack_task` with a configured role, zero-based index, complete prompt, explicit cwd and access mode. Retain its receipt. It blocks until completion and forwards cancellation to the runner. Independent calls may run together; drain them before judging. No native task or eval delegation is allowed. Missing role assignments require setup; do not take defaults from the calling skill. Workers cannot run shell commands. Run tests and builds in the parent after workers finish.

The OMP `launch` integration recipe writes only the selected model sheet after successful probes and confirmation. The launcher reads it on startup. Do not modify OMP provider configuration, instructions arrays or credentials.
