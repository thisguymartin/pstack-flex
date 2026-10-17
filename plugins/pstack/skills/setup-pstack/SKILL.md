---
name: setup-pstack
description: Configure pstack's provider-qualified models, per-role requested effort, and parent-owned routes per role, in the global sheet or a private project sheet. Verifies native and external lanes before writing the override sheet. Use for /setup-pstack, "configure pstack models", "set up pstack models for this project", or changing pstack's model choices.
---

# Setup pstack

For an OMP parent, use the OMP-only setup rules in `poteto-mode/references/codex-tools.md` and `docs/OMP.md`. Choose exact `omp:<provider>/<model>@<effort>` assignments from the user's existing OMP catalog. On a first run, propose the OMP preset below only after verifying every exact provider/model ID and requested effort in that catalog. Do not seed Claude/Codex/Grok CLI defaults, use inherited roles, or translate model IDs by guesswork. If a preset ID or effort is unavailable, report it and require an explicit replacement before saving. Probe every distinct descriptor through the OMP runner, then write only the selected model sheet after confirmation. Existing sheets keep their assignments and lane order unless the operator changes them. Preserve credentials. OMP workers cannot run shell commands or use MCPs; the parent handles verification and evidence collection. The remaining family matrices describe the other runtimes and do not limit the OMP catalog.

Configure one portable model sheet for the current parent harness, globally or privately for one project. Read [provider dispatch](../poteto-mode/references/provider-dispatch.md) for model families and [harness integration](../poteto-mode/references/codex-tools.md) for tool and configuration recipes. One family is one `(provider, model)` pair. Each role lane keeps its own requested effort. The model sheet is the only mutable configuration source. No weaker-model fallback.

## OMP first-run preset

These exact IDs define the proposed OMP-aligned preset. They are candidates until the user's catalog and live probes confirm them. They are not aliases for the other runtimes. Use this complete map only when no OMP sheet was loaded; never replace an existing sheet with the preset. Keep per-role efforts and lane order. The same grouped Why and Reflect choices apply. The parent supplies evidence files inside each worker's permitted checkout because OMP workers have no MCP tools.

```markdown
# pstack OMP model configuration

feature, refactoring: omp:anthropic/claude-opus-5-5@medium
bug-fix: omp:openai-codex/gpt-6.1-sol@high
perf-issue: omp:openai-codex/gpt-6.1-sol@xhigh
hillclimb: omp:openai-codex/gpt-6.1-sol@xhigh
judgment and prose: omp:anthropic/claude-opus-5-5@high
hardest tasks: omp:anthropic/claude-opus-5-5@high
how explorer: omp:openai-codex/gpt-6-luna@low
how explainer: omp:anthropic/claude-fable-5-1@high
why investigators, synthesizer: omp:openai-codex/gpt-6-luna@high
reflect tooling, judgment, divergent, synthesizer: omp:anthropic/claude-opus-5-5@medium
arena runners: omp:openai-codex/gpt-6.1-sol@high, omp:anthropic/claude-opus-5-5@high
arena cross-judge pool: omp:openai-codex/gpt-6-astra@high, omp:anthropic/claude-fable-5-1@high
swarm workers: omp:openai-codex/gpt-6-sol@medium
architect runners: omp:anthropic/claude-fable-5-1@high, omp:openai-codex/gpt-6-astra@high
interrogate reviewers: omp:anthropic/claude-fable-5-1@high, omp:openai-codex/gpt-6-astra@high
```

Catalog verification and exact-descriptor probes are required before saving. Apply the scope, state-preservation, confirmation, readback, and rollback rules below using the OMP-only integration recipe. Every OMP role must be explicit; unavailable assignments remain named failures and never fall back to another runtime or model.

## Steps

### 1. Establish the parent and scope

Match this session's harness and tools to the exact `id` in the installed [harness table](../poteto-mode/scripts/harnesses.ts), then run `poteto-mode/scripts/pstack-context --parent <id> --cwd <project> --paths-only`. Use the row's identifier rather than an app display name. It returns the adapter, global/project sheet paths, and integration targets without parsing a sheet that setup may need to repair. Resolve once; children never detect or reroute themselves.

Then ask which scope this run configures. Ask every run; never infer the scope from the working directory or from which sheets exist. Before asking, use the project path returned by the context inspector and state both sheet paths and whether each file exists.

- **Project**: this repository only. The sheet replaces the global sheet for work in this project and stays private to this machine.
- **Global**: every project that has no project sheet.

Outside a git repository, say that only global scope is available and continue with it. A project run never reads or writes the parent integration files or the other scope's sheet. The scoped sheet is the file for the chosen scope.

### 2. Load current state

Read the scoped sheet when it exists. In project scope with no project sheet, load the global sheet instead as the starting assignments and say so; if neither exists, this is a first run. Before matrix validation, normalize only the rolling-alias predecessors that earlier pstack releases generated. A provider-qualified Claude model is migratable when its model component starts with `claude-fable-` or `claude-opus-` and the remaining revision contains only digits and hyphens. Replace that component in memory with `fable` or `opus`, preserving the provider, effort, role, and lane order. Record each original and normalized descriptor for the confirmation in step 7. This migration is valid loaded state and does not require a separate operator choice.

Treat the normalized values as current role-to-family assignments. Overlay those rows on the complete first-run role map in step 7. Materialize any missing documented role row from that map on the next successful write. A duplicate role row is inconsistent state; report it and resolve it before probing. A row whose role is not in the step 7 role map, such as `how critics`, is from a retired role. Drop it and list it at confirmation. A bare host-native slug from an older sheet is also invalid because it does not say which provider owns it. A versioned Claude model outside the two migration families remains inconsistent state. If no sheet was loaded, use the complete first-run role map with its explicit per-role efforts. Matrix Default effort cells do not override that map.

Then ask whether to keep these role-to-family assignments or change named roles. Keeping them is the default. Apply only role changes the operator names; never offer a reset of a customized sheet to the first-run assignments. A changed role may use any stock or flex matrix family, any OpenRouter model ID the operator names (`openrouter:<namespace>/<model>`), any OpenCode model ID the operator names (`opencode:<provider>/<model>`), `inherit-parent`, or `auto`.

List every stock and flex family by name when the operator changes a role, so Claude, Codex, Grok, DeepSeek, MiniMax, and OpenRouter are all on offer and any role can move to any of them. Offer every stock family, including Astra, GPT-6.1 Sol, GPT-6 Sol, and Luna, when changing `architect runners` or another configurable role. Read each model, proposed effort, and selectable efforts from its row. The Codex families are separate families even though they share the Codex provider. Changing one role lane's effort does not change another lane, even when both use the same family. GPT-6.1 Sol uses the `sol-6.1` family and GPT-6 Sol the `sol-6` family; the `sol` family keeps GPT-5.6 Sol for sheets that still assign it.

### 3. Parse per-role efforts

Read the model matrices, stock and flex. Every non-alias value must match `<provider>:<model>@<effort>`. Map it to exactly one matrix family by `(provider, model)`; an `openrouter` descriptor maps to the open `openrouter` row whatever its model ID, and an `opencode` descriptor maps to the open `opencode` row the same way. Require each lane's effort to appear in that row's Selectable efforts cell. `inherit-parent` and `auto` rows carry no explicit effort.

An unmatched provider/model, out-of-domain effort, or duplicate role is inconsistent state. Stop, show the conflicting rows verbatim, and ask for an explicit matrix family or alias replacement. Do not probe or write while any inconsistency is unresolved.

Mixed efforts within one family are valid. Preserve each role lane's descriptor and order. Never normalize one family's lanes to a common effort or deduplicate probes by provider or model alone. A family with no non-alias occurrence is unassigned; do not ask for its effort, check its CLI, or probe it. A newly assigned family without an explicit effort takes its matrix Default effort as the proposed value for that lane only.

### 4. Collect requested effort changes

Show every role lane's current or proposed effort and its family's Selectable efforts. On a first run, use the default role map's efforts. On a rerun, keep the parsed values. Ask which role lanes to change; empty input keeps every effort. Apply changes only to the named role lanes. A family-wide effort change requires an explicit operator request and must list every affected lane before confirmation. Never reset customized lanes to matrix defaults.

### 5. Probe the requested pairs

Probe each distinct selected `provider:model@effort` descriptor once. The same model at two efforts requires two probes; identical descriptors across roles share one probe. Do not enumerate or offer older models as substitutes. A failed probe writes nothing: report the failing pair and provider, stop, and keep the scoped sheet plus parent integration bytes unchanged. A failed model demands explicit repair or role reassignment before saving. A failed first run creates neither artifact.

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

Render each lane with its own selected effort, preserving untouched descriptors and lane order. Leave `inherit-parent` and `auto` unchanged. An effort-only rerun cannot change a role's family or another lane's effort. Refuse an unqualified slug, an unavailable route, a model outside the stock and flex matrix families, an OpenRouter ID without a namespace or from the `openrouter/*` routers, an OpenCode ID without its `<provider>/` prefix, or a provider/model mismatch.

### 7. Confirm and commit

Show any rolling-alias migrations as original and normalized descriptors and any retired-role rows dropped in step 2. Then show the scope, the sheet path, the route table for this parent, and every rendered role and descriptor. Ask for confirmation before writing.

Why and Reflect default to the grouped descriptors below. External lanes have no parent MCP access. The parent must collect and share task-scoped evidence files, or report inaccessible evidence. `inherit-parent` and `auto` remain supported explicit choices for live parent MCP access; never silently reroute a qualified descriptor. `inherit-parent` and `auto` always validate, but say when they reduce a panel's provider diversity. For panel roles, one lane runs per entry. The list length is the fan-out count. `arena cross-judge pool` is a list from which Arena chooses a provider different from the parent and base candidate when possible. `swarm workers` is the default for every worker unless a race explicitly assigns another descriptor.

Every non-alias value must match `<provider>:<model>@<effort>` and must have passed step 5.

After the operator confirms, pass the in-memory render from step 6 to step 8's write transaction. Never paste the example below as the result. It is only the complete first-run role map used to seed step 2; selected efforts and explicit role changes always replace its example values before writing.

```markdown
# pstack model configuration

Provider-qualified per-role choices. Read the installed pstack provider-dispatch reference before dispatching a configured role. Every documented role remains present. `inherit-parent` and `auto` use the parent model natively and still count as one panel lane.

feature, refactoring: claude:opus@medium
bug-fix: codex:gpt-6.1-sol@high
perf-issue: codex:gpt-6.1-sol@xhigh
hillclimb: codex:gpt-6.1-sol@xhigh
judgment and prose: claude:opus@high
hardest tasks: claude:opus@high
how explorer: codex:gpt-6-luna@low
how explainer: claude:fable@high
why investigators, synthesizer: codex:gpt-6-luna@high
reflect tooling, judgment, divergent, synthesizer: claude:opus@medium
arena runners: codex:gpt-6.1-sol@high, claude:opus@high
arena cross-judge pool: codex:gpt-6-astra@high, claude:fable@high
swarm workers: codex:gpt-6-sol@medium
architect runners: claude:fable@high, codex:gpt-6-astra@high
interrogate reviewers: claude:fable@high, codex:gpt-6-astra@high
```

### 8. Wire it in

Use the paths and integration type returned by the context inspector and apply the corresponding recipe in harness integration. Project scope writes only the project sheet and the common git directory's `info/exclude`. Never add the sheet to a tracked `.gitignore`, stage it, or commit it. Global scope applies the selected include, mirror-block, or instructions-array recipe. Render both targets in memory before writing.

Snapshot every target's current bytes. Write the sheet and parent integration only after every requested pair passes and the operator confirms. Read both targets back and compare them with the in-memory render. If either write or readback fails, restore every snapshot and report the failure. An unchanged rerun must produce byte-identical sheet and integration content after normalization.

Do not copy the model sheet between harnesses or between projects without rerunning the parent-specific probes; route availability can differ even on the same host.

### 9. Behavioral smoke

Before declaring setup complete, run one small read-only mixed panel from this parent: every distinct chosen descriptor, distinct output/receipt paths, and an independent cross-judge when at least two providers are assigned. Launch every lane with the selected adapter's retained handles, then drain them. Verify the native transcript entries and every external receipt. A structural config check or unit test is not a substitute.

Report the scope, the sheet path, parent route table, requested-effort probe results, smoke results, and external elapsed/token/cost receipts. For a project sheet, add that deleting the file returns the project to the global sheet. Re-running this skill in the same scope re-probes and updates the same sheet. Do not claim the provider exposed hidden applied-effort observability.
