---
name: setup-pstack
description: Configure pstack's provider-qualified models, per-family requested effort, and parent-owned routes per role, in the global sheet or a private project sheet. Verifies native and external lanes before writing the override sheet. Use for /setup-pstack, "configure pstack models", "set up pstack models for this project", or changing pstack's model choices.
---

# Setup pstack

Configure one portable model sheet for the current parent harness, globally or privately for one project. Read [provider dispatch](../poteto-mode/references/provider-dispatch.md) for model families and [harness integration](../poteto-mode/references/codex-tools.md) for tool and configuration recipes. One family is one `(provider, model)` pair with one requested effort. The model sheet is the only mutable configuration source. No weaker-model fallback.

## Steps

### 1. Establish the parent and scope

Match this session's harness and tools to the exact `id` in the installed [harness table](../poteto-mode/scripts/harnesses.ts), then run `poteto-mode/scripts/pstack-context --parent <id> --cwd <project> --paths-only`. Use the row's identifier rather than an app display name. It returns the adapter, global/project sheet paths, and integration targets without parsing a sheet that setup may need to repair. Resolve once; children never detect or reroute themselves.

Then ask which scope this run configures. Ask every run; never infer the scope from the working directory or from which sheets exist. Before asking, use the project path returned by the context inspector and state both sheet paths and whether each file exists.

- **Project**: this repository only. The sheet replaces the global sheet for work in this project and stays private to this machine.
- **Global**: every project that has no project sheet.

Outside a git repository, say that only global scope is available and continue with it. A project run never reads or writes the parent integration files or the other scope's sheet. The scoped sheet is the file for the chosen scope.

### 2. Load current state

Read the scoped sheet when it exists. In project scope with no project sheet, load the global sheet instead as the starting assignments and say so; if neither exists, this is a first run. Before matrix validation, normalize only the rolling-alias predecessors that earlier pstack releases generated. A provider-qualified Claude model is migratable when its model component starts with `claude-fable-` or `claude-opus-` and the remaining revision contains only digits and hyphens. Replace that component in memory with `fable` or `opus`, preserving the provider, effort, role, and lane order. Record each original and normalized descriptor for the confirmation in step 7. This migration is valid loaded state and does not require a separate operator choice.

Treat the normalized values as current role-to-family assignments. Overlay those rows on the complete first-run role map in step 7. Materialize any missing documented role row from that map on the next successful write. A duplicate role row is inconsistent state; report it and resolve it before probing. A row whose role is not in the step 7 role map, such as `how critics`, is from a retired role. Drop it and list it at confirmation. A bare host-native slug from an older sheet is also invalid because it does not say which provider owns it. A versioned Claude model outside the two migration families remains inconsistent state. If no sheet was loaded, use the complete first-run role map and the model matrix's Default effort cells.

Then ask whether to keep these role-to-family assignments or change named roles. Keeping them is the default. Apply only role changes the operator names; never offer a reset of a customized sheet to the first-run assignments. A changed role may use any stock or flex matrix family, any OpenRouter model ID the operator names (`openrouter:<namespace>/<model>`), any OpenCode model ID the operator names (`opencode:<provider>/<model>`), `inherit-parent`, or `auto`.

List every stock and flex family by name when the operator changes a role, so Claude, Codex, Grok, DeepSeek, MiniMax, and OpenRouter are all on offer and any role can move to any of them. Offer every stock family, including Astra, GPT-6.1 Sol, GPT-6 Sol, and Luna, when changing `architect runners` or another configurable role. Read each model, proposed effort, and selectable efforts from its row. The Codex families are separate families even though they share the Codex provider; changing one family's effort does not change another's. GPT-6.1 Sol uses the `sol-6.1` family and GPT-6 Sol the `sol-6` family; the `sol` family keeps GPT-5.6 Sol for sheets that still assign it.

### 3. Parse per-family efforts

Read the model matrices, stock and flex. Every non-alias value must match `<provider>:<model>@<effort>`. Map it to exactly one matrix family by `(provider, model)`; an `openrouter` descriptor maps to the open `openrouter` row whatever its model ID, and an `opencode` descriptor maps to the open `opencode` row the same way. Require its effort to appear in that row's Selectable efforts cell, and collect the effort. `inherit-parent` and `auto` rows carry no family effort.

An unmatched provider/model, out-of-domain effort, or duplicate role is inconsistent state. Stop, show the conflicting rows verbatim, and ask for an explicit matrix family or alias replacement. If one or more families have mixed efforts, show every conflicting family and role row, then ask for one normalized effort per family from its Selectable efforts cell. Do not invent a precedence rule. Do not probe or write while any inconsistency is unresolved.

A family is a single `(provider, model)` matrix row. DeepSeek Flash and Pro have independent efforts, as do MiniMax M3 and M3.1 Flash Preview. Each distinct OpenRouter model ID is its own family under the open row, with its own effort and probe, and so is each distinct OpenCode model ID. Never group efforts or deduplicate probes by provider alone.

One distinct effort per family is the current value. A family with no non-alias occurrence is unassigned: do not ask for its effort, check its CLI, or probe it. A family that a step 2 role change newly assigns takes its matrix Default effort as the proposed value.

### 4. Collect one requested effort per family

Ask one effort question for each assigned family. Name each model, its current or proposed value, and the Selectable efforts from its matrix row. Empty input keeps that value. On a first run, state the assigned families' matrix defaults before asking. On a rerun, state the parsed values without offering to reset customized role lanes.

### 5. Probe the requested pairs

Probe only the selected `provider:model@effort` pair of each assigned family. Run one probe per family in the role map, even when two families share a provider. Do not enumerate or offer older models as substitutes. A failed probe writes nothing: report the failing pair and provider, stop, and keep the scoped sheet plus parent integration bytes unchanged. A failed model demands explicit repair or role reassignment before saving. A failed first run creates neither artifact.

Use each descriptor's route from the selected adapter. A native pair uses that adapter's native one-turn invocation; an external pair uses `pstack-runner` with the explicit parent, provider, model, and selected effort. The runner owns CLI/authentication/model preflight. Keep every exact-pair receipt or native transcript. Do not repeat routing by family or invent another harness detector.

For MiniMax M3.1 Flash Preview, disclose the Token Plan requirement before probing. Use the eligible subscription key through `MINIMAX_API_KEY`; do not assume a working M3 key grants preview access. A failed preview probe must not silently select M3. Keep preview thinking enabled and verify requested effort forwarding; distinguish request evidence from hidden applied reasoning depth.

Before the first OpenRouter probe, tell the operator three things: OpenRouter forwards prompts to whichever host serves the model, data-collection and zero-data-retention routing plus the key's credit limit are set on OpenRouter's dashboard, and each probe spends a little credit. Probe exactly the model ID the operator named. A failed OpenRouter probe does not offer another catalog model; report OpenRouter's error and ask for a replacement ID or a role reassignment.

Use a tiny read-only probe returning a unique marker from a scratch file. Leave the marker out of the prompt so success proves a tool call. A login-status check alone does not prove the assigned model and effort work. Inspect offered variants when a runner refuses an effort. A gateway probe also confirms the endpoint default or override.

Receipts and native transcripts prove the requested effort and the route. They do not prove a provider's hidden applied reasoning depth. There is no implicit timeout, weaker-model fallback, same-provider external fallback, or second mutable configuration source.

### 6. Render, preserving role families

Build the new sheet in memory. Do not write it yet.

- First run: start from the complete role assignments in step 7, with the step 2 role changes applied.
- New project sheet seeded from the global sheet: treat it as a rerun of the loaded global rows. The global sheet itself is not rewritten.
- Rerun: start from the normalized complete role map from step 2, with the step 2 role changes applied, preserving each loaded row's lane order and family (or alias) per lane.

Require every documented role to remain present and non-empty, `architect runners` to keep at least two entries, and the final role map to contain at least one assigned matrix family. There is no requirement to assign every matrix family.

Different models sharing a provider count as one provider, even when their efforts differ. An OpenRouter lane counts as its model ID's lab, as `provider-dispatch.md` defines: the namespaces `anthropic`, `openai`, `x-ai`, `deepseek`, and `minimax` match the direct providers, and any other namespace is a provider of its own. An OpenCode lane counts as its model's lab the same way.

Validate panel diversity: `arena runners` and `interrogate reviewers` must span at least two distinct providers. A single-provider panel is written only after the operator explicitly confirms the reduced diversity; record that confirmation in the setup report.

Rewrite every matrix-family descriptor to `provider:model@<requested effort for that family>`. Leave `inherit-parent` and `auto` unchanged. An effort-only rerun cannot change a role's family. Changing Grok's effort updates every Grok occurrence and does not move a Sol role onto Grok. Refuse an unqualified slug, an unavailable route, a model outside the stock and flex matrix families, an OpenRouter ID without a namespace or from the `openrouter/*` routers, an OpenCode ID without its `<provider>/` prefix, or a provider/model mismatch.

### 7. Confirm and commit

Show any rolling-alias migrations as original and normalized descriptors and any retired-role rows dropped in step 2. Then show the scope, the sheet path, the route table for this parent, and every rendered role and descriptor. Ask for confirmation before writing.

Why and Reflect require the parent's live MCP surface. Keep their investigator, reviewer, and synthesizer roles on `inherit-parent` or `auto`; the bounded external runner deliberately omits ambient MCPs. `inherit-parent` and `auto` always validate, but say when they reduce a panel's provider diversity. For panel roles, one lane runs per entry. The list length is the fan-out count. `arena cross-judge pool` is a list from which Arena chooses a provider different from the parent and base candidate when possible. `swarm workers` is the default for every worker unless a race explicitly assigns another descriptor.

Every non-alias value must match `<provider>:<model>@<effort>` and must have passed step 5.

After the operator confirms, pass the in-memory render from step 6 to step 8's write transaction. Never paste the example below as the result. It is only the complete first-run role map used to seed step 2; selected efforts and explicit role changes always replace its example values before writing.

```markdown
# pstack model configuration

Provider-qualified per-role choices. Read the installed pstack provider-dispatch reference before dispatching a configured role. Every documented role remains present. `inherit-parent` and `auto` use the parent model natively and still count as one panel lane.

feature, refactoring: codex:gpt-6.1-sol@high
bug-fix: codex:gpt-6.1-sol@high
perf-issue: codex:gpt-6.1-sol@high
hillclimb: codex:gpt-6.1-sol@high
judgment and prose: claude:fable@max
hardest tasks: claude:fable@max
how explorer: codex:gpt-6-luna@high
how explainer: claude:fable@max
why investigators, synthesizer: inherit-parent
reflect tooling, judgment, divergent, synthesizer: inherit-parent
arena runners: claude:fable@max, codex:gpt-6-astra@high, grok:grok-4.7@xhigh, claude:opus@max
arena cross-judge pool: claude:fable@max, codex:gpt-6-astra@high, grok:grok-4.7@xhigh, claude:opus@max
swarm workers: codex:gpt-6-luna@high
architect runners: codex:gpt-6-astra@high, claude:fable@max
interrogate reviewers: claude:fable@max, codex:gpt-6-astra@high, grok:grok-4.7@xhigh, claude:opus@max
```

### 8. Wire it in

Use the paths and integration type returned by the context inspector and apply the corresponding recipe in harness integration. Project scope writes only the project sheet and the common git directory's `info/exclude`. Never add the sheet to a tracked `.gitignore`, stage it, or commit it. Global scope applies the selected include, mirror-block, or instructions-array recipe. Render both targets in memory before writing.

Snapshot every target's current bytes. Write the sheet and parent integration only after every requested pair passes and the operator confirms. Read both targets back and compare them with the in-memory render. If either write or readback fails, restore every snapshot and report the failure. An unchanged rerun must produce byte-identical sheet and integration content after normalization.

Do not copy the model sheet between harnesses or between projects without rerunning the parent-specific probes; route availability can differ even on the same host.

### 9. Behavioral smoke

Before declaring setup complete, run one small read-only mixed panel from this parent: every distinct chosen descriptor, distinct output/receipt paths, and an independent cross-judge when at least two providers are assigned. Launch every lane with the selected adapter's retained handles, then drain them. Verify the native transcript entries and every external receipt. A structural config check or unit test is not a substitute.

Report the scope, the sheet path, parent route table, requested-effort probe results, smoke results, and external elapsed/token/cost receipts. For a project sheet, add that deleting the file returns the project to the global sheet. Re-running this skill in the same scope re-probes and updates the same sheet. Do not claim the provider exposed hidden applied-effort observability.
