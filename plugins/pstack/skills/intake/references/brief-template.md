# Brief: <issue title> (#<n>)

- Issue: <url>
- Playbook: <bug-fix | feature | refactoring | perf-issue | investigation | figure-it-out>, because <one sentence>
- Status: <ready | needs a human>
- Worktree: <path, or "not created">

## Goal

<One or two sentences: who notices what when this is done.>

## Scope

In scope:
- <item>

Out of scope:
- <item, including anything the comments ruled out>

## Exit condition

<An observable check: the command to run and its expected output, the test that must pass, the request and expected response, or the screen state to capture.>

## Verification plan

- Unit: <tests to add or run, or n/a: reason>
- Live: <the real-surface check, using the project's verification skill when one exists>
- Perf: <metric, baseline, and threshold, or n/a: reason>

## Grounding

- Entry points: <file:line pointers from how>
- Test command: <command>
- Verification skill: <path, or "none">

## Decisions found in the thread

- <decision and the comment it came from>

## Open questions

1. <question that changes the design, or "none">
