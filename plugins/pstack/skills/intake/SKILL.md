---
name: intake
description: "Turn one or more GitHub issues into ready-to-run poteto-mode briefs: read the issue and its comments, ground it in the repo with how, pick a playbook, write a brief with an observable exit condition, and prepare a worktree. Use for /intake, 'intake #41 #42', 'turn these issues into briefs', or before autopilot-stack or a batch of unattended work."
---

# Intake

Every pstack run starts from a brief. Intake writes it from the issue, so the human reviews a brief instead of writing a prompt.

Intake is read-only. It never edits product code. Launching poteto-mode on a brief is a separate, explicit step.

**Dispatch contract.** Grounding runs `how`, which resolves its `how explorer` and `how explainer` roles through [`provider-dispatch.md`](../poteto-mode/references/provider-dispatch.md). Intake adds no route of its own. Children never pick a model. No implicit timeout and no fallback model.

**Platform note.** Forge commands below use GitHub CLI (`gh`), the default forge in the Babysit and Shipping playbooks. On Codex, resolve Claude tool names via [`codex-tools.md`](../poteto-mode/references/codex-tools.md).

## Start

Open a todolist with one entry per phase, plus one entry per issue under Phase B.

1. Collect
2. Ground and brief, per issue
3. Gate
4. Hand off

## Phase A: Collect

1. Resolve the repository once with `gh repo view --json nameWithOwner` and record it as `<repo>`. Pass `--repo "$repo"` to every `gh` command.
2. Read each issue in full: `gh issue view <n> --repo "$repo" --json number,title,body,labels,comments,state,url`. Read every comment. Comments often hold the real decision ("we agreed on OIDC only").
3. Read linked PRs and referenced issues when the body or comments point at them. A closed duplicate or a reverted PR is part of the spec.
4. Skip closed issues and say so.

## Phase B: Ground and brief, per issue

Run issues in parallel when there are several. Each issue gets its own grounding and its own brief.

1. **Ground.** Run the **how** skill on the subsystem the issue names. Collect file pointers, entry points, the test command, and the project's verification skill if one exists (`.claude/skills/verify-*` or the equivalent). Keep pointers, not pasted code (the **guard-the-context-window** principle skill).
2. **Classify.** Pick exactly one poteto-mode playbook and say why in one sentence:

   | The issue asks for | Playbook |
   | --- | --- |
   | A defect with a symptom to reproduce | `bug-fix` |
   | New or changed behavior | `feature` |
   | Same behavior, different structure | `refactoring` |
   | Measured slowness | `perf-issue` |
   | A question, not a change | `investigation` |
   | A large or cross-cutting change, or nothing above fits | the **figure-it-out** skill |

3. **Write the brief.** Copy [`references/brief-template.md`](references/brief-template.md) to `<run-dir>/issue-<n>.md` and fill every field. `<run-dir>` defaults to `.pstack/intake/<yyyy-mm-dd>/` in the repository. Add `.pstack/` to `.git/info/exclude` so briefs stay out of commits unless the operator asks to keep them.
   - The exit condition is observable: a command, a test name, a URL and expected response, or a screenshot. "Works" is not an exit condition.
   - The verification plan names unit, live, and perf boxes. A box that does not apply says `n/a: <reason>`.
   - Every ambiguity the issue leaves open becomes a numbered question. Do not answer product questions yourself.
   - When the issue carries a repro (sample input and expected output), turn it into the failing-test candidate for the **tdd** skill and say so.

## Phase C: Gate

Mark each brief **ready** or **needs a human**.

- **Ready.** Scope is clear, the exit condition is observable, and no open question changes the design.
- **Needs a human.** An open question changes what gets built, or the exit condition needs a number nobody gave (for example "make search faster" with no target).

The **never-block-on-the-human** principle covers mechanics, not intent. Product and preference calls go to the operator. When the operator is present, ask the questions in one batch. When running unattended, post the questions as one comment on the issue with `gh issue comment <n> --repo "$repo" --body-file <file>`, ending with a line that says an agent wrote it, and leave the brief parked.

## Phase D: Hand off

1. For each **ready** brief, prepare a worktree off the default branch: `git worktree add -b issue-<n>-<slug> <worktree-root>/issue-<n> origin/<default-branch>`. Record the path in the brief. Writers never use the primary checkout.
2. Default: stop here and return the briefs for review.
3. When the operator asked intake to run the briefs, start each one in its worktree as `Use pstack:poteto-mode. Follow the brief at <path>.` For several ready briefs, hand the set to the Autopilot-stack playbook (`../poteto-mode/playbooks/autopilot-stack.md`) instead of starting them one by one.

**Reply:** one row per issue: issue link, playbook, ready or needs a human, brief path, worktree path, and the open questions. Then the single next action for the operator.
