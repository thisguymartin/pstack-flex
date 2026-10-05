---
name: diff-behavior
description: "Run the same scenarios against trunk and head, list every observable difference in output, UI, logs, timing, and errors, and flag the ones the change didn't claim. Use for /diff-behavior, 'what did this PR change in behavior', 'prove no behavior change', a dependency bump, a migration, or a perf claim to confirm."
---

# Diff behavior

A diff shows what changed in the code. This skill shows what changed in behavior, and whether all of it was intended. Both sides always run. A head-only run is not a diff.

Companion to **blast-radius**. Blast radius proves the one fact a change is safe because of. Diff behavior drives the whole load-bearing surface on both builds and lists what differs.

**Dispatch contract.** Scenario workers run through the **swarm** skill, which resolves `swarm workers` through [`provider-dispatch.md`](../poteto-mode/references/provider-dispatch.md). Workers never pick a model. No implicit timeout. A dropout is named by provider, model, and receipt, and never replaced. On Codex, resolve Claude tool names via [`codex-tools.md`](../poteto-mode/references/codex-tools.md).

## Start

Open a todolist with one entry per phase before starting.

1. Build both sides
2. Pick scenarios
3. Run both
4. Normalize and diff
5. Classify
6. Report

## Phase A: Build both sides

1. Name the base (trunk by default, or the PR's base branch) and the head. Record both exact SHAs.
2. Create one worktree per side. Never use the primary checkout.
3. Build each side the same way: same command, same env, same config, same seed data. Note anything that cannot match, such as a migration that only head has.

## Phase B: Pick scenarios

1. Start from the project's verification skill and its feature map when one exists. When it does not, say so, and suggest the **create-verification-skill** skill as a follow-up.
2. Add scenarios from **how** on the touched surface and from every claim in the PR description or brief.
3. Keep the load-bearing scenarios even when the diff looks unrelated. Finding unexpected changes is the point.
4. Each scenario names what it captures:

   | Capture | Example |
   | --- | --- |
   | stdout and exit code | a CLI command |
   | HTTP response | status, headers that matter, body |
   | Screenshot | one UI state, compared by image diff as in the Visual parity playbook |
   | Log lines | the lines a scenario emits, filtered by component |
   | Metric | latency, memory, row count, with sample count and method |
   | Files written | path and contents |

5. Write the scenario set to `<run-dir>/scenarios.md` so it can be rerun. `<run-dir>` defaults to `.pstack/diff-behavior/<head-sha>/`.

## Phase C: Run both

1. Run the **swarm** skill as a partition with one worker per scenario. Each worker runs base, then head, and captures both sides to `<run-dir>/<scenario>/base/` and `<run-dir>/<scenario>/head/`. Each brief names both SHAs and both worktree paths.
2. For timing scenarios, interleave base and head runs so drift hits both sides equally, and take enough samples to clear the noise (median or p95 of N, as in the Perf issue playbook).
3. Use the same seed, clock, and fixtures on both sides where the app allows it.

## Phase D: Normalize and diff

1. Strip what the app does not promise: timestamps, generated ids, temp paths, ordering of unordered collections. Put every rule in `<run-dir>/normalize.md` with its reason.
2. Diff what is left. Compare screenshots by image diff. Report metrics as base value, head value, and ratio.
3. Never compute a ratio between unlike scenarios. When base lacks the feature, record that and report head's absolute value against a stated budget instead.

## Phase E: Classify

Give every difference exactly one class:

- **Intended.** A claim in the PR description or brief covers it. Cite the claim.
- **Unintended.** No claim covers it. This list is the deliverable.
- **Noise.** A normalizer gap. Fix the rule in `normalize.md` and rerun that scenario. Noise is never waved off.

Zero unintended differences is a real result. Say so plainly.

## Phase F: Report

Write `<run-dir>/report.md` from [`references/report-template.md`](references/report-template.md). Post it to the PR only when asked.

**Reply:** base and head SHAs, scenario count, the unintended differences first with evidence paths, then intended and the count of identical scenarios, any dropouts, and the rerun command for the scenario set.
