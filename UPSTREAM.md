# Upstream contract

The content source is [Cursor's pstack](https://github.com/cursor/plugins/tree/main/pstack). [open-pstack](https://github.com/ericlitman/open-pstack) ports that content to Claude Code and Codex. pstack-flex keeps their history and owns the model configuration, additional providers, and harness adaptations below.

## Source pins

| Relationship | Version | Commit |
| --- | --- | --- |
| Cursor content imported by open-pstack | pstack 0.15.5 | `12d587dfb20741cafc376c42c696c5f6e2a64487` |
| Latest open-pstack merge | v1.5.0 | `77a91fd6f75483b971fa5cca4a88f1337f6099dd` |
| pstack-flex fork point | open-pstack v1.4.1 | `de67e6b40511814171e5e4c8ad7af3b79f07c9ee` |

Cursor, open-pstack, and pstack-flex versions identify separate distributions. The plugin manifests currently retain version `1.5.0`; use the installed commit to identify an unreleased candidate. [NOTICE.md](NOTICE.md) preserves attribution and license sources.

## Ownership boundaries

There is one `plugins/pstack/skills/` tree for Claude Code, Codex, and OpenCode beta. Keep workflow and principle changes shared. Translate tool names in `poteto-mode/references/codex-tools.md`, whose path stays stable for upstream pointers. Put provider models, dispatch rules, and receipts in `poteto-mode/references/provider-dispatch.md`. The parent resolves routes once; children never detect or reroute themselves.

The fork owns these adaptations:

| Area | Files or contract |
| --- | --- |
| Harness metadata and configuration | `poteto-mode/scripts/harnesses.ts`, `configuration.ts`, and `pstack-context`; scope paths, descriptor parsing, and explicit parent context |
| Model choices | Fork families and default panels in `provider-dispatch.md`; setup's first-run sheet and matching role defaults in skills and playbooks |
| Setup | `setup-pstack/SKILL.md`; scope selection, assignment-first questions, family probes, confirmation, and transactional writes |
| Provider execution | `poteto-mode/scripts/runner/`; gateway specs, OpenCode lanes, isolation, model evidence, and tests |
| Tool translation | `poteto-mode/references/codex-tools.md`; Claude-native workflows mapped to Codex and OpenCode tools |
| Invocation | `hooks/session-start-context.md`; pstack skills start on request or a standing instruction |
| Lane journal | `runner/flex-journal.ts` and call sites; optional journal without changing lane output or receipts |
| Fork skills | `skills/intake/` and `skills/diff-behavior/` |
| Distribution | Marketplace and plugin manifests, packaging checks, docs, and fork attribution |

Paths beginning with `poteto-mode/` are relative to `plugins/pstack/skills/`. Runtime configuration work is tracked in [#3](https://github.com/thisguymartin/pstack-flex/issues/3), project scope in [#34](https://github.com/thisguymartin/pstack-flex/issues/34), and harness mapping in [#35](https://github.com/thisguymartin/pstack-flex/issues/35). [PR #33](https://github.com/thisguymartin/pstack-flex/pull/33) introduced the OpenCode parent and lane work.

## Current substitutions

These substitutions replace Cursor-specific operations without creating separate skill copies:

| Cursor assumption | Shared port |
| --- | --- |
| `Task`, `generalPurpose`, and `readonly` | Parent-native subagents or an external lane, with explicit access mode and isolated writers |
| `AskQuestion` | The parent app's question tool |
| Built-in `loop`, `babysit`, and `create-skill` | Parent built-ins or bundled skills through the tool mapping |
| `control-cli` and `control-ui` | Parent CLI and browser drivers through the tool mapping |
| Cursor transcripts, skills, and model rules | Parent-specific paths; `pstack-models.md` for configured role assignments |
| Cursor MCP directory | Parent tool discovery and installed MCP configuration |
| Cloud agents | Local subagents or CLI processes, with worktrees for writers |
| Standing goal and orchestrator store | Standing instructions and the parent-specific durable run store |
| Upstream model defaults | Fork defaults from `provider-dispatch.md`, copied into setup and consuming roles |

Same-provider Claude and Codex descriptors stay native. OpenCode beta uses the external runner for every qualified descriptor and native `task` only for `inherit-parent` or `auto`. Its writer lanes cannot run shell commands or tests. An unsupported task requirement must be reported explicitly.

## Deliberate exclusions

- Cursor's `automations/benny/`, `make-bot-ui`, and sticky-mode metadata require Cursor's event or UI runtime. The Cursor usage guide stays [upstream](https://github.com/cursor/plugins/tree/main/pstack/docs/guide).
- Upstream planning documents describe its own issue queue. Do not import them or retain completed plans here; durable work belongs in this fork's GitHub Issues.
- `disable-model-invocation: true` from `73f8be4` is omitted for `how`, `why`, `unslop`, and `typescript-best-practices` because it blocks workflow invocation on Claude Code.
- Solo code defaults from `23a56e2`, `889ec4b`, and `70b2dc8` stay on the fork's configured Codex default. Why and Reflect defaults remain `inherit-parent` to retain parent MCP access.
- Setup's budget question and effort reduction from `5bf2b15` are omitted. Requested effort is never silently reduced.
- Configured-model fallback from `12d587d` is omitted. Unavailable models remain named dropouts.
- Expected-runtime stuck detection from `70b2dc8` is omitted. A stuck lane requires affirmative failure evidence; there is no implicit timeout.
- The logo field from `efa2a53` stays out of the Claude manifest, which has no matching schema field. The Codex manifest exposes the asset.

## Sync changes

For a fresh clone, add the source remotes once:

```shell
git remote add cursor https://github.com/cursor/plugins.git
git remote add upstream https://github.com/ericlitman/open-pstack.git
```

Inspect Cursor content changes after the recorded pin:

```shell
git fetch cursor main
git log --oneline 12d587dfb20741cafc376c42c696c5f6e2a64487..cursor/main -- pstack
git diff --stat 12d587dfb20741cafc376c42c696c5f6e2a64487..cursor/main -- pstack
```

No output means the tracked content tree has not changed. Inspect the open-pstack merge separately:

```shell
git fetch upstream
git log --oneline 77a91fd6f75483b971fa5cca4a88f1337f6099dd..upstream/main
```

1. Create or update a GitHub issue and branch from this fork's current `main`.
2. Read upstream commits in order. Bring over their intent while retaining the boundaries and exclusions above.
3. Reconcile setup, model defaults, dispatch, hook instructions, and their invariant tests by hand. Do not treat those files as unchanged upstream bodies.
4. Keep omitted upstream plans deleted. Update the source pins and attribution when imported sources change.
5. Run `bash scripts/check.sh`, install the exact candidate, and follow [the live gate](docs/LIVE-GATE.md) in every affected harness.
6. Record installed evidence in the PR. Merge before tagging only after the live gate passes.

There is no generated README snapshot or parallel skill tree to refresh. Git retains prior content and the complete import history.
