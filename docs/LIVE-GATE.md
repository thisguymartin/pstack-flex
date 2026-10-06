# Live gate

Nothing merges, tags, releases, or rolls out until the exact candidate is installed and the changed behavior passes from the real user surface in every affected harness. Unit tests, validators, source inspection, and agent self-reports do not satisfy this gate. A PR without installed evidence stays a draft.

## Run the local gate

Run `bash scripts/check.sh`. It installs the Bun package, runs tests and strict typechecks, parses manifests, and checks static invariants. It also runs Claude plugin validation when the CLI is installed. Record any skipped check rather than calling it passed.

## Install the exact candidate

Publish the candidate branch so each app installs the same commit. Clone that branch for local marketplace or skill-path installation:

```shell
git clone -b <branch> https://github.com/thisguymartin/pstack-flex ~/src/pstack-flex-candidate
git -C ~/src/pstack-flex-candidate rev-parse HEAD
```

In Claude Code, add that checkout and reload:

```text
/plugin marketplace add ~/src/pstack-flex-candidate
/plugin install pstack@pstack-flex
/reload-plugins
```

For Codex, install the candidate branch from the shell:

```shell
codex plugin marketplace add thisguymartin/pstack-flex --ref <branch>
codex plugin add pstack@pstack-flex
```

For OpenCode beta, point `skills.paths` and the opt-in `instructions` entry at the candidate checkout using the [README configuration](../README.md#opencode-beta). Keep the beta qualification until its installed behavior passes.

Start a fresh session in each affected app. Check the active plugin's source repository and installed commit; a matching version alone is insufficient. Keep only one active `pstack` installation. Record the plugin version or checkout commit, plus the app's CLI version.

## Exercise the changed behavior

Use a scratch repository with synthetic data. Run the rows affected by the change. Runner, configuration, or setup changes require setup, scope, and dispatch checks in every affected parent.

| Change | Action | Required observation |
| --- | --- | --- |
| Opt-in instruction | Request a small fix without naming pstack, then repeat with "Use pstack for this." | Only the second request enters `poteto-mode`. |
| Setup | Run `setup-pstack`, change one role and its effort, then repeat with an invalid model. | Assigned families probe successfully before writes. The invalid probe leaves sheets and integrations unchanged. An unchanged rerun preserves bytes. |
| Sheet scope | Configure different global and project roles, run from the primary checkout and a linked worktree, then inspect `pstack-context`. | Both worktrees select the same project sheet. A separate repository without one uses global scope. Config directory overrides select the expected paths. |
| Mixed panel | Run `interrogate` with qualified native and external roles, plus an inherited role. | Each route matches the context. External receipts name requested models and efforts. Missing providers become named dropouts without substitutions. |
| Gateway lane | Assign a gateway model in setup and run a task that reads a synthetic file marker absent from its prompt. | A tool call reads the marker. The receipt completes with the requested model and `costUsd: null`. Bad auth or model IDs fail without changing the sheet. |
| OpenCode beta parent | Run setup and a panel from a real OpenCode session with qualified and inherited roles. | Qualified roles run externally with parent `opencode`; inherited roles use native `task`. Scope and instructions update once. |
| OpenCode beta lane | Run a read-only lane and a writer lane, then request an unsupported effort and a task requiring tests. | Permissions hold. The invalid effort fails. The writer reports tests as unsupported and does not claim to run them. |
| Background and cancellation | Launch a lane that outlives the parent's foreground shell limit, then send SIGTERM to a throwaway lane. | The first returns a complete receipt after that limit. The cancelled lane writes a cancelled receipt. |
| Lane journal | Run with a temporary `PSTACK_FLEX_LANES_DIR` directory, then repeat with that directory absent. | The directory contains start metadata, growing stdout, and the matching receipt. Without it, the lane still completes without journal files. |
| `intake` | Run against a scratch repository's real issue. | A brief under `.pstack/intake/` names a playbook, observable exit condition, and unresolved questions. Product code stays unchanged. |
| `diff-behavior` | Compare branches with one intended and one accidental observable change. | The report identifies both changes with evidence from each branch. |

New models also need a probe and a role run from each affected app. Gateway protocol changes need a file tool call, a second turn using its result, and explicit bad-key and bad-model results. `scripts/probe-openrouter.sh` supplies the OpenRouter route battery and spends real credit; it is outside CI. Record results in the tracking issue and PR rather than a separate probe archive.

## Record evidence in the PR

Use one block per affected harness:

```text
Harness: <app> <CLI version>
Installed: pstack <version> @ <exact commit>
Surface: <real session and entry point>
Action: <setup, role, scope, model, effort, or failure case exercised>
Observed: <result and receipt, transcript, or screenshot path>
Result: pass | fail | not run
```

Record unsupported requirements and failures directly. Do not convert a runner-only result into proof of parent behavior. Keep the PR draft until every required installed test passes.

Outstanding installed checks from earlier merged work are tracked in [#36](https://github.com/thisguymartin/pstack-flex/issues/36). Each candidate still needs its own evidence.
