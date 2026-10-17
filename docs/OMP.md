# OMP-only mode

This candidate adds an OMP parent and OMP workers. It is tracked in [#46](https://github.com/thisguymartin/pstack-flex/issues/46). It has not passed the installed interactive live gate and is not a release. The integration is pinned to OMP 18.11.3. Validate a new version before changing the pin.

## Start the parent

Install Bun and OMP using their official instructions. Authenticate your chosen connections in OMP. This integration reuses OMP's configuration and credentials; it does not copy keys or configure subscriptions.

From this checkout:

```sh
plugins/pstack/skills/poteto-mode/scripts/pstack-omp --cwd /absolute/project/path
```

Use `PSTACK_OMP_EXECUTABLE=/absolute/path/to/omp` when the pinned executable is not on PATH. The launcher loads the shared skills and the OMP-only extension. Starting plain `omp` does not activate this policy. Once this candidate passes the live gate, use `pstack-omp` as your terminal's coding-agent command.

The parent uses OMP's configured default model. To pin its model and effort for the session:

```sh
plugins/pstack/skills/poteto-mode/scripts/pstack-omp \
  --cwd /absolute/project/path \
  --model openai/EXACT_MODEL_ID --effort high
```

Replace `EXACT_MODEL_ID` with an identifier from your OMP model catalog. A pinned parent refuses a later model or effort change before its next request. Restart without those flags to use your OMP default again. The CLI accepts no arbitrary pass-through flags that could override the policy.

## Select worker models

Keep role assignments in `.omp/pstack-models.md` in the primary checkout, or globally in `~/.omp/agent/pstack-models.md`. A project sheet replaces the global sheet. Linked worktrees share the primary checkout's sheet. `PI_CODING_AGENT_DIR` overrides the global sheet directory. `PI_CONFIG_DIR` also changes the default directory. For a custom OMP profile or XDG layout, explicitly set `PI_CODING_AGENT_DIR` to its agent directory before launching.

Example format, with placeholder IDs to replace before use:

```text
feature, refactoring: omp:openai/EXACT_MODEL_ID@high
how explorer: omp:deepseek/EXACT_MODEL_ID@off
judgment and prose: omp:anthropic/EXACT_MODEL_ID@high
interrogate reviewers: omp:openrouter/anthropic/EXACT_MODEL_ID@high, omp:openai/EXACT_MODEL_ID@high
```

The first `omp` selects the execution adapter. The part after the colon is the exact OMP provider/model identifier. OpenRouter IDs may include another slash for the model maker. Provider choice stays independent of the OMP runtime. An OpenRouter key authenticates calls through OpenRouter, not direct Anthropic or OpenAI calls.

OMP-specific efforts are `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`. Select one the model supports. `off` allows non-reasoning models. Unsupported effort fails before inference. Missing roles, `auto`, `inherit-parent`, wildcard selectors and other runtime descriptors are rejected. Do not use routing aliases such as OpenRouter's automatic model router.

Use the shared `setup-pstack` skill inside the parent to choose and probe assignments. It includes a complete [OMP first-run preset](../plugins/pstack/skills/setup-pstack/SKILL.md#omp-first-run-preset) with exact Anthropic and OpenAI Codex IDs. Verify every ID and requested effort against your existing OMP catalog, then probe every distinct descriptor before saving. An unavailable preset entry requires an explicit replacement. Existing sheets keep their configured rows, efforts, and lane order; the preset is not a runtime fallback. OMP setup writes only the model sheet. It never writes an `instructions` array or credentials into OMP configuration. Adding a role does not require an OMP source change.

## What is enforced

- `pstack-omp` starts OMP and sets `PSTACK_RUNTIME=omp` for its process tree. It does not change your shell configuration.
- The runner rejects every non-OMP provider when that policy is set, or when its parent is `omp`.
- The parent exposes `pstack_task` for delegation. The native `task` and `eval` tools are unavailable. Each task resolves an explicit role and index through the shared configuration reader.
- Workers load a mandatory guard extension. Model, effective effort and credentials must match before inference. Retry fallback, advisor, prewalk, automatic edit repair and automatic compaction are disabled for this candidate.
- Workers expose `read` and `grep`. Writers also get `write` and `edit`, with the replace edit format pinned. The guard rejects paths outside the checkout, `.git`, `.omp`, external symlinks, dangling symlinks and hardlinks. Give each writer a separate worktree.
- Workers have no shell, native delegation, MCP or other tools. Run tests and builds in the parent after draining workers. `pstack-context --require-shell` rejects an OMP worker assignment.
- The runner preserves receipts, optional lane journaling, cancellation and explicit deadlines. It adds no default runtime limit. OMP's selected model label is recorded through pinned argv evidence, not treated as proof of the server's actual model. Unknown actual cost remains null.

This is routing enforcement within pstack. The parent still has a shell and can run project commands. The extension is not an OS sandbox and cannot prevent a user, an arbitrary script or a changed extension from starting another agent program. File checks also assume no concurrent outside process swaps filesystem paths during a tool call. Use an OS sandbox if you need protection against hostile code or concurrent filesystem manipulation.

## Provider access

OMP supports OpenRouter, Anthropic, DeepSeek and OpenAI connections, plus other providers. The connection must exist in your OMP installation and your account must have access to the requested model. Some providers have no configurable reasoning effort. Tool and model features vary.

Use supported API or cloud credentials for Anthropic. OMP's advertised Claude subscription login does not override Anthropic's restrictions on third-party use of Claude.ai credentials. OpenAI documents third-party ChatGPT sign-in routes, but this candidate has not verified your account's eligibility, refresh flow or limits.

Sources: [OMP providers](https://omp.sh/docs/providers), [Anthropic credential rules](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use), [OpenAI sign-in](https://developers.openai.com/siwc/quickstart).

## Code structure

OMP implementation lives in `plugins/pstack/skills/poteto-mode/scripts/omp/`, alongside the existing `runner/`, `orch/` and `watch-pr/` directories.

| File | Responsibility |
| --- | --- |
| `cli.ts` | Launch the parent with the shared skills and required extension |
| `harness.ts` | Register OMP with the shared configuration reader |
| `parent.ts` | Resolve roles and delegate through the shared runner |
| `adapter.ts` | Build worker commands and parse OMP output |
| `guard.ts` | Check models, credentials and file access before tools run |
| `policy.ts`, `settings.json` | Define OMP routing restrictions and runtime settings |
| `adapter.test.ts` | Exercise the adapter and policy through shared entrypoints |

The `scripts/pstack-omp` wrapper stays at the same path. Shared configuration and runner modules call the OMP module at their existing dispatch boundaries. Skills remain in the shared tree.

## Verification

```sh
bash scripts/check.sh
python3 tests/omp-live.py /absolute/path/to/omp
```

The second command uses a temporary configuration and a synthetic localhost provider. It makes no real-provider requests and reads no saved credentials. Its 45-second watchdog belongs to the test, not the worker runtime.

Before release, install the exact candidate and exercise interactive OMP skill loading, setup, a multi-provider review, isolated editing, cancellation and parent-side verification. Record the installed version, command or UI action, and observed result under the existing [live gate](LIVE-GATE.md). Synthetic headless tests do not replace that evidence. Existing Claude Code, Codex and OpenCode configurations remain unchanged.
