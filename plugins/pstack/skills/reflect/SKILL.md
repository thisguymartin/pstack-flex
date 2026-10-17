---
name: reflect
description: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
---

# Reflect

Mine the current conversation for durable learnings, then route them into skill edits.

**Dispatch contract.** Resolve every configured role through [`provider-dispatch.md`](../poteto-mode/references/provider-dispatch.md). The grouped `reflect tooling, judgment, divergent, synthesizer` role defaults to `claude:opus@medium`. External lanes have no parent MCP access. The parent collects context referenced in the transcript and shares task-scoped evidence files with source links and access gaps. `inherit-parent` and `auto` remain explicit choices for live parent MCP access; never silently reroute a qualified descriptor. Pass the transcript or digest plus the evidence paths. On Codex, resolve remaining Claude tool names via [`codex-tools.md`](../poteto-mode/references/codex-tools.md).

## When to invoke

Invoke when the user says "reflect" or "/reflect". Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## Process

### 1. Locate the active transcript

The parent finds its own transcript file before fanning out. The system prompt names Claude Code's per-project transcripts directory at `~/.claude/projects/<encoded-cwd>/`. Use that path. Do not glob across `~/.claude/projects/`. That crosses workspace boundaries and reads private chats from unrelated projects.

```bash
ls -t ~/.claude/projects/<encoded-cwd>/*.jsonl 2>/dev/null | head -10
```

Three transcript layouts: legacy flat (`<id>.jsonl`), current nested (`<id>/<id>.jsonl`), and subagent (`<parent>/subagents/<child>.jsonl`).

For each candidate, read the first JSONL line and check that `message.content[0].text` contains the conversation's opening user prompt. Take the matching path. If no path resolves, write a tight digest of the session and pass that instead.

### 2. Spawn three reviewers in parallel

Start all three read-only lanes in one fan-out phase through provider dispatch. Resolve the configured route. If it lacks MCP access, the parent looks up tickets, chat threads, and observability traces referenced in the transcript before dispatch and shares evidence files. Report inaccessible evidence instead of claiming a lookup succeeded. The prompt forbids file writes; the parent applies edits.

| Lens | Model descriptor | Prompt template |
|---|---|---|
| Judgment | the `reflect tooling, judgment, divergent, synthesizer` descriptor (default `claude:opus@medium`) | `references/judgment-reviewer.md` |
| Tooling | the `reflect tooling, judgment, divergent, synthesizer` descriptor (default `claude:opus@medium`) | `references/tooling-reviewer.md` |
| Divergent | the `reflect tooling, judgment, divergent, synthesizer` descriptor (default `claude:opus@medium`) | `references/divergent-reviewer.md` |

Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings through the assigned native result or external output file. Include evidence provenance and available tools in the brief; a lane must not claim source access it lacks. The grouped key keeps tooling and the other reviewers on Opus medium by default.

### 3. Synthesize

Dispatch one lane using the `reflect tooling, judgment, divergent, synthesizer` descriptor (default `claude:opus@medium`). Share the evidence files for citation checks. The parent performs any required connected-source spot checks that the lane cannot run, or reports the verification gap. Use `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. The synthesizer returns a structured Accepted / Rejected / Backlog list.

### 4. Structural enforcement check

Sanity-check the synthesizer's Accepted list. For any item that would be enforced more reliably by a lint rule, script, metadata flag, or runtime check, move it from Accepted to Backlog. See the **encode-lessons-in-structure** principle skill.

### 5. Apply

Before applying any Accepted edit, present the synthesizer's full Accepted/Rejected/Backlog output to the user and wait for explicit approval. The user picks which subset to apply and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

Backlog items file to whatever devex / backlog tracker your team uses automatically. Only the Accepted list waits for approval.

For each approved Accepted item, follow the Routing field exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): parent does directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): hand to the **plugin-dev:skill-development** skill and run its draft / test / iterate loop.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): hand to `plugin-dev:skill-development` and run its description-optimization loop.
- `new skill via plugin-dev:skill-development: <kebab-name>`: hand creation to `plugin-dev:skill-development`. Do not invent the shape ad hoc.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done. Skip this step if it doesn't.

### 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
