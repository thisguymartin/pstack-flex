# Plan: OpenRouter gateway lanes, any model (issue #7)

Status (2026-10-05): Steps 1, 3, and 4 are implemented on `feat/openrouter-gateway`. Step 2 (live route probes) and the live gate are pending.

## Context

Goal: assign any pstack role to **any model OpenRouter serves** through one OpenRouter key, and know that the model you picked is the one that ran. There is no allowlist. The setup probe on the model you pick is the only gate. If the model can't run, the lane fails loudly and nothing silently swaps to another model.

**Which harness? None new.** An OpenRouter lane is the stock Claude Code CLI (`claude -p`), pointed at OpenRouter's Anthropic-compatible endpoint through environment variables. DeepSeek and MiniMax already run this way (the "gateway" path in `pstack-runner`). The parent harness stays Claude Code or Codex. No proxy, no OpenCode, no custom agent loop, no new runner.

**One exclusion: OpenRouter's own router IDs** (`openrouter/auto`, `openrouter/free`, and the rest of the `openrouter/` namespace). They pick the model for you, which breaks the project rule against automatic model selection and fallback. Every model a router could pick is reachable directly by its own ID, so no model is lost.

## Diagram 1: what runs where

```
Parent harness: Claude Code or Codex   (unchanged)
  model sheet → arena runners: claude:fable@max, openrouter:z-ai/glm-5.3@high
        │ argv: --provider openrouter --model z-ai/glm-5.3 --effort high --mode read-only
        ▼
pstack-runner   (existing gateway path)
  1 validate   any namespaced OpenRouter ID; only openrouter/* routers refused
  2 guard      OPENROUTER_API_KEY set?  ~/.pstack-flex/openrouter free of claude.ai OAuth?
  3 env        strip inherited ANTHROPIC_* → inject OpenRouter URL, token, model pins
  4 preflight  claude --version
        │ spawn
        ▼
Child harness: stock `claude -p`   (Claude Code CLI, headless)
  --model z-ai/glm-5.3 --effort high --permission-mode plan --output-format json
  ANTHROPIC_BASE_URL=https://openrouter.ai/api   ANTHROPIC_AUTH_TOKEN=$OPENROUTER_API_KEY
  ANTHROPIC_API_KEY=""                           CLAUDE_CONFIG_DIR=~/.pstack-flex/openrouter
        │ Anthropic Messages API
        ▼
OpenRouter   /api/v1/messages      (normalizes --effort into each model's reasoning setting)
  account: no data collection (or ZDR-only hosts), credit limit on the key
  may fail over between hosts of the SAME model; never swaps the model
        ├──▶ Google   ├──▶ Z.ai   ├──▶ Moonshot   ├──▶ Qwen   ├──▶ … any of ~460 models
        ▼
pstack-runner
  5 parse      claude JSON → text + token usage; costUsd = null
  6 prove      reported model == requested (exact) → else the lane fails, no fallback
  7 receipt    → parent drains it like any other lane
```

## Diagram 2: picking a model in /setup-pstack

```
operator: "use moonshotai/kimi-k3 for interrogate reviewers"
        │
        ▼
descriptor   openrouter:moonshotai/kimi-k3@high
             (each distinct OpenRouter model = its own family: own effort, own probe)
        │
        ▼
probe        runner, read-only, one turn; the marker is in a FILE, not the prompt
             → proves the model answers AND makes a tool call
        │
        ├─ fail ─▶ named error, sheet unchanged
        │          wrong ID / no endpoints → unavailable-model
        │          bad key                 → unauthenticated
        │          no credits / no tools   → child-failed, with OpenRouter's message
        ▼ pass
diversity    lab = the ID's namespace (moonshotai); anthropic/openai/x-ai/deepseek/minimax
             count as the same lab as claude/codex/grok/deepseek/minimax lanes
        │
        ▼
confirm → sheet written
```

## Operator flow (after it ships)

1. Store the key in the keychain; `pstack-keys` exports `OPENROUTER_API_KEY` (same pattern as the DeepSeek/MiniMax keys in `docs/LANES.md`).
2. OpenRouter dashboard: turn off data collection (or require ZDR), set a credit limit on the key.
3. `/setup-pstack` → name any OpenRouter model ID for any role → choose an effort → the probe runs → confirm.

## Implementation

Branch `feat/openrouter-gateway` from `main`. All edits stay in port-only files. Upstream-derived skill bodies (arena, interrogate, poteto-mode `SKILL.md`) stay byte-unchanged, per `UPSTREAM-FLEX.md`.

### Step 1: the provider (code + unit tests)

All files are under `plugins/pstack/skills/poteto-mode/scripts/runner/`.

- `types.ts`: add `"openrouter"` to `GATEWAY_PROVIDERS`. The guard, preflight, env, parser, and model proof all branch on `isGatewayProvider`, so no new `switch` case is needed.
- `flex-providers.ts`: add a `GATEWAY_SPECS` row:
  - `OPENROUTER_API_KEY`
  - `https://openrouter.ai/api`
  - `OPENROUTER_BASE_URL`
  - `PSTACK_FLEX_OPENROUTER_CONFIG_DIR`
  - no context default
  - `OPENROUTER_MAX_CONTEXT_TOKENS`

  Add one spec field so only OpenRouter gets `ANTHROPIC_API_KEY=""`. `run.ts` already strips the inherited key, so this changes "unset" to "empty" for OpenRouter alone, and the DeepSeek/MiniMax env stays byte-identical.
- `run.ts` `validateOptions`: for `openrouter`, require a namespaced ID (`<namespace>/<model>`) and refuse the `openrouter/` namespace. Nothing else is filtered; the probe decides.
- `parse-output.ts` `reportedModelMatches`: use exact, case-insensitive matching for `openrouter`. The current gateway rule also accepts `${wanted}-…`, so `z-ai/glm-5.3-air` would wrongly pass for `z-ai/glm-5.3`.
- Tests:
  - `flex-providers.test.ts`: the spec, the env map, and the empty key only for OpenRouter.
  - `run.test.ts` `gateway lanes`: missing key, OAuth refusal, a namespaced ID through argv and receipt, a near-miss reported model failing, and `openrouter/auto` refused.
  - `parse-output.test.ts`: exact-match cases.
  - `commands.test.ts` and `cli.test.ts`: provider lists.

### Step 2: prove the route on a spread of models (needs your key; costs cents)

This is evidence that the path works for non-Anthropic models in general. It is not a list.

Run the full #7 battery through the Step 1 runner on 5 models from different labs: `anthropic/claude-sonnet-5.5` (the control OpenRouter guarantees), `google/gemini-3.8-flash`, `moonshotai/kimi-k3`, `z-ai/glm-5.3`, `qwen/qwen3.8-max-0902`. Each run is read-only, in a synthetic workspace.

The battery:
- the exact ID answers;
- a tool call reads a file marker that is not in the prompt;
- a second turn uses that result (thinking blocks survive);
- reasoning tokens differ between low and high;
- the receipt's reported model matches what OpenRouter's activity log shows was served.

Also capture:
- OpenRouter's real failure strings: a wrong ID, 402 insufficient credits, a bad key, and a model without tool support;
- one `~` rolling alias and one `:free` variant, to learn what the receipt reports for each;
- empty versus unset `ANTHROPIC_API_KEY`.

Write the results to `docs/gateway-model-probes.md` and to #7. Then:
- teach `run.ts` `unavailableStatus` the captured strings (for example, "no endpoints found" → `unavailable-model`), with fixtures from the real output;
- if a `~` alias or `:free` variant reports a different string than requested, add one documented translation rule in `reportedModelMatches`, or refuse that form with a clear message if no exact rule is possible.

### Step 3: the contracts

- `references/provider-dispatch.md`:
  - One **open** row in the flex matrix: provider `openrouter`, model `<any OpenRouter model ID>`, default `high`, selectable `low`…`max`, key `OPENROUTER_API_KEY`, URL `https://openrouter.ai/api`.
  - A rule that each distinct OpenRouter model is its own family.
  - The descriptor grammar: split at the first `:` and the last `@`.
  - Panel diversity counts labs: for `openrouter` lanes, the lab is the ID's namespace, and `anthropic`, `openai`, `x-ai`, `deepseek`, `minimax` equal the `claude`, `codex`, `grok`, `deepseek`, `minimax` providers.
  - Add `openrouter` to the `--provider` list, the gateway paragraph, the override variables, and the route table.
- `setup-pstack/SKILL.md`:
  - accept any OpenRouter ID for any role, mapping it to the open row;
  - an OpenRouter probe row that puts the marker in a file;
  - the lab-based diversity wording;
  - a privacy and credit-limit disclosure before the first OpenRouter probe;
  - the description line.
- `references/codex-tools.md`: the diversity lines.
- `runner/model-matrix.test.ts`:
  - the open row's placeholder allowed only for `openrouter`, plus gateway ordering;
  - no `openrouter:` in the first-run sheet;
  - both diversity-string assertions;
  - "Different models sharing a provider count as one provider" stays true for direct providers.

### Step 4: docs

- `docs/LANES.md`: replace "OpenRouter (not shipped)".
  - Add OpenRouter to the lane-kind table, the env reference (including the empty key), prices (no token markup, 5.5% fee on credit purchases), and privacy.
  - Note that `OPENROUTER_BASE_URL` must end in `/api`, not `/api/v1`.
  - Note that models with less than 200K context can fail on long lanes; `OPENROUTER_MAX_CONTEXT_TOKENS` caps it.
- `README.md`: the gateway table and the lane diagram.
- `docs/USAGE.md`: keys, an example sheet with OpenRouter models, and the gateway sequence diagram.
- `docs/LIVE-GATE.md`: row D gets `OPENROUTER_API_KEY`.
- `UPSTREAM-FLEX.md`: list the open row and the lab rule under what the fork owns.
- `CHANGES.md`: an Unreleased entry.

## Verification

1. `bash scripts/check.sh`: Bun tests, strict typecheck, manifests, static invariants, `claude plugin validate`.
2. Step 2 evidence, committed in `docs/gateway-model-probes.md`.
3. Live gate (`docs/LIVE-GATE.md`, rows A–C in both harnesses plus row D): install the exact candidate.
   - From **Claude Code** and from **Codex**, run `/setup-pstack`, type in an OpenRouter model that is **not** among the Step 2 models, and watch the probe pass and the sheet get written.
   - Run a read-only mixed panel (for example `claude:fable` + `openrouter:z-ai/glm-5.3`) and check the receipts: `complete`, `provider-report`, `costUsd: null`.
   - Check that a wrong ID, `openrouter/auto`, and a missing key each fail without changing the sheet.

   Record one evidence block per harness in the PR. The PR stays a draft until this is done.

## Follow-ups (separate issues, not this PR)

- **psf-monitor:** the Setup page's lane regex (`src/setup.ts`) rejects `/`, so OpenRouter roles would disappear from that view.
- **Credential leak risk on all gateways:** `CLAUDE_CODE_OAUTH_TOKEN` is not stripped from gateway children (`flex-providers.ts` `GATEWAY_INHERITED_CONFLICTS`, `run.ts` `CLAUDE_IDENTITY`). A parent's claude.ai token could reach a third-party endpoint. It affects DeepSeek/MiniMax too, so it gets its own fix and live gate.

## Out of scope

OpenRouter presets, the auto router or model fallback lists, real cost from OpenRouter billing, per-model automatic context caps, OpenRouter as the parent session (works today via the zero-subscription env walkthrough, docs only), OpenCode ([open-pstack#68](https://github.com/ericlitman/open-pstack/issues/68)), the registry redesign ([open-pstack#103](https://github.com/ericlitman/open-pstack/issues/103)).
