# Flex fork synchronization

pstack-flex layers on top of open-pstack's own upstream tracking. Two sync relationships exist:

1. `cursor/plugins/pstack` -> `ericlitman/open-pstack` — documented in [UPSTREAM.md](UPSTREAM.md), unchanged by this fork.
2. `ericlitman/open-pstack` -> `thisguymartin/pstack-flex` — this document.

## Fork point

| Source | Value |
| --- | --- |
| Repository | `https://github.com/ericlitman/open-pstack.git` |
| Tag | `v1.4.1` |
| Commit | `de67e6b40511814171e5e4c8ad7af3b79f07c9ee` |
| Tracks Cursor pstack | `0.15.1` (`f8abedd`) |

## Last merge

| Source | Value |
| --- | --- |
| Tag | `v1.5.0` |
| Commit | `77a91fd6f75483b971fa5cca4a88f1337f6099dd` |
| Tracks Cursor pstack | `0.15.5` (`12d587d`) |

Not merged: open-pstack's `docs/plans/2026-10-01-triage-and-roadmap.md`, which plans open-pstack's own issue queue. Later upstream edits to that file come back as modify/delete conflicts; resolve them by deleting the file.

The fork keeps full upstream history. The `upstream` remote points at ericlitman/open-pstack.

## What the fork owns

All flex changes are additive and live in port-owned files so upstream merges stay cheap:

- `plugins/pstack/skills/poteto-mode/scripts/runner/flex-providers.ts` and `flex-providers.test.ts` (new)
- Gateway-provider hooks in `runner/{types,commands,run,parse-output,cli}.ts` and their tests
- The three GPT-6 rows in the stock model matrix, the "Default panel" section, the "Flex model matrix" section, and the route-table columns in `references/provider-dispatch.md`
- The first-run sheet in `skills/setup-pstack/SKILL.md` and the default descriptors named in `arena`, `architect`, `interrogate`, `how`, `swarm`, and the `feature`, `refactoring`, `bug-fix`, `perf-issue`, and `hillclimb` playbooks
- The assignment-first restructure of `skills/setup-pstack/SKILL.md`
- `docs/LANES.md`, this file, the README fork section, and the NOTICE/LICENSE/CHANGES additions
- `plugins/pstack/hooks/session-start-context.md`, which the fork rewrote from open-pstack's auto-fire mandate into an opt-in gate, and the docs lines that describe it

Every upstream skill body is byte-unchanged except for the default-descriptor mentions listed above. Since [#17](https://github.com/thisguymartin/pstack-flex/issues/17), the stock matrix carries three fork-owned GPT-6 rows and the first-run sheet uses them, so those two surfaces conflict on every upstream sync and are resolved by hand: keep the fork's rows and defaults, take upstream's wording for everything else.

## Merge procedure

```shell
git fetch upstream
git switch -c merge-rehearsal
git merge --no-ff --no-commit upstream/main
# inspect, resolve, run the full local gate, then merge for real or abort
```

Expected conflict surface on future upstream releases:

- `plugins/pstack/skills/setup-pstack/SKILL.md` — since 1.5.0 the fork uses upstream's step layout (role question in step 2, efforts in step 4). Take upstream's wording; keep the flex families, the GPT-6 guidance, the panel-diversity rule, and the fork's first-run sheet.
- `plugins/pstack/skills/poteto-mode/scripts/runner/model-matrix.test.ts` and `tests/skill-collision-repro.sh` — upstream reads its three-lane panel from the setup sheet; the fork reads its four-lane panel from the "Default panel" line. Take upstream's structural changes; keep the fork's panel source, GPT-6 rows, and flex-matrix checks.
- `plugins/pstack/hooks/session-start-context.md` — keep the fork's opt-in gate. If upstream changes its mandate, port only edits that still make sense for an opt-in gate, such as a renamed entry skill.
- `plugins/pstack/skills/poteto-mode/references/provider-dispatch.md` — the four upstream rows and their prose are upstream's; the GPT-6 rows, the "Default panel" section, and the flex section are fork-owned. Upstream's own panel changes land in the "Default panel" line only if the fork wants them.

After every merge: run the full local gate (`bun install --frozen-lockfile`, `bun run test`, `bun run typecheck`, manifest JSON parse, `PSTACK_STATIC_ONLY=1 bash tests/skill-collision-repro.sh`), then record the installed version, action, and observed result for each affected harness in the pull request before tagging.
