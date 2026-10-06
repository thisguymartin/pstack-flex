# Live gate

AGENTS.md says nothing merges, tags, releases, or rolls out until the exact candidate is installed and the changed behavior passes a live test from the real user surface in every affected harness. Unit tests, validators, and source reading do not count. This page is how to run that test and where to record it.

There are two halves:

1. **Local gate.** One command, runs anywhere: `bash scripts/check.sh`. It installs both Bun packages, runs their tests and strict typechecks, parses every manifest, runs the static invariants, and runs `claude plugin validate` on the marketplace and both plugins when the `claude` CLI is present.
2. **Live gate.** You, in a real Claude Code and a real Codex session, with the candidate installed. Steps below.

## 1. Install the exact candidate

Push the branch first, so both harnesses install the same commit.

Claude Code: check out the branch, then add that checkout as the marketplace (inside a session):

```text
! git clone -b <branch> https://github.com/thisguymartin/pstack-flex ~/src/pstack-flex-candidate
/plugin marketplace add ~/src/pstack-flex-candidate
/plugin install pstack@pstack-flex
/reload-plugins
```

Codex (shell):

```shell
codex plugin marketplace add thisguymartin/pstack-flex --ref <branch>
codex plugin add pstack@pstack-flex
```

Start a new session in each harness afterwards. Record the installed version: the `pstack` version from the plugin list, plus `claude --version` and `codex --version`.

If you had open-pstack or an older pstack-flex installed under the `open-pstack` marketplace name, remove it first so only one plugin named `pstack` is active.

## 2. Run the checks for what changed

Run the rows that match the change. A change that touches the runner or the model sheet runs rows A to C in both harnesses.

| Row | Action | Pass when |
| --- | --- | --- |
| A. Opt-in gate | In a fresh session, ask for a two-line fix without naming pstack. Then ask again with "Use pstack for this." | The first request runs no `pstack:` skill. The second enters `pstack:poteto-mode`. |
| B. Setup | Run `/pstack:setup-pstack` (Claude Code) or `Use pstack:setup-pstack.` (Codex). Keep defaults or change one role. | Every assigned family probes `complete`, the sheet is written to `~/.claude/pstack-models.md` or `~/.codex/pstack-models.md`, and a failed probe writes nothing. |
| C. Mixed panel | `Use pstack:interrogate on the last commit.` | Each configured reviewer returns, external lanes write receipts with `status: complete`, and any missing CLI shows as a named dropout, not a substitute. |
| D. Gateway lane | With `DEEPSEEK_API_KEY`, `MINIMAX_API_KEY`, or `OPENROUTER_API_KEY` exported, assign one role to that family in setup (for OpenRouter, any model ID you name) and run it once. | The receipt shows `status: complete`, the requested model, and `costUsd: null`. |
| E. Lane journal | `mkdir -p ~/.pstack-flex/lanes`, run one external lane (for example an interrogate with a Codex reviewer from Claude Code), then `rm -rf ~/.pstack-flex/lanes`. With [psf-monitor](https://github.com/thisguymartin/psf-monitor) installed, watch the lane on its page instead. | While it runs, the lane's directory holds `lane.json` and a growing `stream.jsonl`; after it ends, `receipt.json` matches the runner's receipt. With the directory removed, the next lane writes nothing there and its receipt is unchanged. |
| F. intake | In a scratch repo with a real issue: `Use pstack:intake for #<n>.` | A brief appears under `.pstack/intake/`, with one playbook, an observable exit condition, and open questions when the issue is vague. No product code changes. |
| G. diff-behavior | In a scratch repo, make a branch that changes one scenario on purpose and one by accident. `Use pstack:diff-behavior on this branch.` | The report lists the accidental change as unintended and the deliberate one as intended, with evidence for both sides. |

## 3. Record the evidence

Paste this into the pull request under "Live evidence", one block per harness:

```text
Harness: Claude Code <claude --version> | Codex <codex --version>
Installed: pstack <version> @ <commit>
Row <letter>: <action you took>
Observed: <what happened, with receipt or screenshot path>
Result: pass | fail
```

A pull request without this stays a draft.

## Outstanding live tests

These merged without an installed live test. Clear them with one session per harness on current `main`, then record the results in a tracking issue and tick the rows.

| PR | Change | Rows to run | Status |
| --- | --- | --- | --- |
| #16 | GPT-6 families and first-run defaults | B, C | not run |
| #19, #20 | Opt-in gate (Claude Code and Codex) | A | not run |
| #22 | open-pstack 1.5.0 merge, setup step order, grok-4.7 pin | B, C | not run |
| #24, #25 | Lane journal (the monitor itself moved to psf-monitor in #28) | E | checkout build only, not installed |
| #26 | Rename to pstack-flex, intake, diff-behavior, doc fixes | A, B, F, G | not run |
