# Gateway model probe evidence

Tracking: [issue #5](https://github.com/thisguymartin/pstack-flex/issues/5).

## Candidate and scope

- Source candidate: branch `flex/multiple-gateway-models`, based on `92dc0bc`, with uncommitted implementation changes.
- Implementation diff SHA-256 before this evidence file: `84b4c3ee7fc66902532e1d457048a487e6a63629b31d2d214e52585f72863c75`.
- Packaged version: 1.4.1. This candidate has not been installed as a plugin.
- Actual parent: Codex session, invoking the candidate's external runner with `--parent codex`.
- CLI: Claude Code 2.1.283.
- Each probe used `--effort high`, read-only mode, a separate empty synthetic workspace and isolated Claude configuration, and a synthetic text file. No repository or customer data was used in the prompt.
- Keys were supplied through hidden terminal input, injected into child environments, and were not included in commands, this repository, or evidence below.

## Observed results

Each probe exited 0, returned the exact requested marker, recorded `modelVerified: true` with `modelEvidence: provider-report`, and retained `costUsd: null`.

| Requested model | Reported model | Elapsed milliseconds | Receipt status |
| --- | --- | --- | --- |
| `deepseek-flash` | `deepseek-flash` | 2684 | `complete` |
| `deepseek-v4-pro` | `deepseek-v4-pro` | 7737 | `complete` |
| `MiniMax-M3` | `MiniMax-M3` | 11416 | `complete` |
| `MiniMax-M3.1-Flash-Preview` | `MiniMax-M3.1-Flash-Preview` | 5090 | `complete` |

These single short probes establish authentication, model selection, and successful completion through the runner. They do not rank coding quality or speed, prove hidden reasoning depth, or verify CLI request-body effort forwarding. The prompt included the expected marker, so completion does not independently prove a file tool was used.

## Remaining release gate

Install the exact candidate and run setup from both real Claude Code and Codex user surfaces. Verify independent model effort choices, per-model probes, mixed-provider panels, saved-sheet readback, and unchanged configuration on failed access. Record installed version, surface, action, and observed result before merge or rollout. Changing only the runner's `--parent` flag would not satisfy this gate.

## OpenRouter

Tracking: [issue #7](https://github.com/thisguymartin/pstack-flex/issues/7) and draft PR [#31](https://github.com/thisguymartin/pstack-flex/pull/31). The battery is `scripts/probe-openrouter.sh` (V6 in [LANES.md](LANES.md#live-validation-checklist-before-merge-or-rollout-real-keys-never-in-ci)).

### Dry run with an invalid key (2026-10-05)

- Candidate: branch `feat/openrouter-gateway` at `f6bad90`, run from source, not installed. Parent: a Claude Code session, runner invoked with `--parent claude`. CLI: Claude Code 2.1.289.
- Action: `OPENROUTER_API_KEY=sk-or-v1-invalid-dryrun bash scripts/probe-openrouter.sh z-ai/glm-5.3`. It was stopped after the three per-model lanes.

| Case | Effort | Exit | Elapsed ms | Claude Code result |
| --- | --- | --- | --- | --- |
| chain | high | 1 | 189180 | `api_error_status: 401`, `"Failed to authenticate. API Error: 401 User not found."`, `duration_api_ms: 0` |
| low | low | 1 | 182891 | same |
| high | high | 1 | 178841 | same |

Findings:

- The wrong key reached OpenRouter as the bearer token and was refused with 401. No other credential was used.
- Claude Code retries the 401 for about three minutes before it exits.
- The runner labelled these lanes `child-failed`, because its pattern matched "authentication" but not "Failed to authenticate". Fixed on the branch: Claude Code's 401 result now classifies as `unauthenticated`.
- Claude Code logs `[claude-code:unrecognized_model]` for the OpenRouter ID and still sends the request.
- Claude Code reports `usage.output_tokens_details.thinking_tokens`. The runner now records it as `reasoningTokens`, which the battery's effort check reads.

### Route battery with a real key

Pending.
