# Changelog

## Unreleased

pstack-flex is a separate distribution of open-pstack. The plugin remains `pstack`; install it as `pstack@pstack-flex`.

- Configurable model families and defaults, with direct CLI and DeepSeek, MiniMax, and OpenRouter gateway lanes. Assigned models fail as named dropouts instead of falling back.
- Global or private project model sheets, with role assignments, requested efforts, and live probes before setup writes.
- Shared configuration parsing and harness metadata, plus `pstack-context` for inspecting the parent configuration. Tracked in [#3](https://github.com/thisguymartin/pstack-flex/issues/3), [#34](https://github.com/thisguymartin/pstack-flex/issues/34), and [#35](https://github.com/thisguymartin/pstack-flex/issues/35).
- Opt-in skill invocation in Claude Code and Codex.
- OpenCode as a parent and external lane provider, in beta. Installed OpenCode verification remains required by the [live gate](docs/LIVE-GATE.md); headless CI use is unsupported.
- Optional external lane journal for the separate [psf-monitor](https://github.com/thisguymartin/psf-monitor) plugin.
- `intake` and `diff-behavior` skills for issue briefs and observable branch comparisons.
- Documentation reduced to installation, current runtime contracts, provenance, and the live gate.

## Source release

The latest imported source is [open-pstack v1.5.0](https://github.com/ericlitman/open-pstack/releases/tag/v1.5.0), which tracks Cursor pstack 0.15.5. Exact pins, substitutions, and sync procedure live in [UPSTREAM.md](UPSTREAM.md). Earlier change history is in Git.
