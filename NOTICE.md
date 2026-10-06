# Attribution and licenses

pstack-flex is a fork of [ericlitman/open-pstack](https://github.com/ericlitman/open-pstack), originally forked at v1.4.1, commit `de67e6b40511814171e5e4c8ad7af3b79f07c9ee`. open-pstack ports [Lauren Tan's pstack](https://github.com/cursor/plugins/tree/main/pstack) and retains the earlier [Michael Denyer pstack-claude](https://github.com/michael-denyer/pstack-claude) history through import commit `053ed78732e3b71826933170eafe7f7782dda844`.

The latest imported open-pstack release is v1.5.0 at `77a91fd6f75483b971fa5cca4a88f1337f6099dd`, tracking Cursor pstack 0.15.5 at `12d587dfb20741cafc376c42c696c5f6e2a64487`. [UPSTREAM.md](UPSTREAM.md) records current adaptations and sync ownership. Git preserves the individual import commits.

## Sources

| Component | Source | Copyright | License file |
| --- | --- | --- | --- |
| Shared pstack skills, principles, playbooks, agents, scripts, and assets | [Cursor pstack at the current content pin](https://github.com/cursor/plugins/tree/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack) | 2026 Lauren Tan | [LICENSE](LICENSE) |
| `deslop`, `thermo-nuclear-code-quality-review`, `make-pr-easy-to-review`, `fix-ci`, `fix-merge-conflicts`, `get-pr-comments`, and `what-did-i-get-done` skills | [Cursor Team Kit at the import pin](https://github.com/cursor/plugins/tree/e46364b8be46000b7df0f260550cd712afbb8d36/cursor-team-kit/skills) | 2026 Cursor | [LICENSE-cursor-team-kit](LICENSE-cursor-team-kit) |
| `plugins/pstack/hooks/run-hook.cmd` | [Superpowers in the official Claude plugin repository](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/superpowers), imported at 6.1.0, originally obra/superpowers | 2025 Jesse Vincent | [LICENSE-superpowers](LICENSE-superpowers) |
| pstack-flex modifications and additions | [thisguymartin/pstack-flex](https://github.com/thisguymartin/pstack-flex) | 2026 Martin Patino | [LICENSE](LICENSE) |

All listed licenses are MIT. The distribution preserves their notices and license terms.

## Adaptations and original work

open-pstack adds Claude Code and Codex packaging, harness translation, provider dispatch, native Claude agent definitions, tests, and hook integration. Its bundled `babysit` skill is independently authored from Cursor's public workflow behavior, rather than copied from Cursor's built-in implementation.

pstack-flex changes model configuration and defaults, adds gateway and OpenCode execution, scopes model sheets, makes skill invocation opt-in, and adds a lane journal. It also adds `intake` and `diff-behavior`. These are maintained adaptations; upstream-derived skill bodies are not claimed to be verbatim copies.

Retain these notices and all three license files when redistributing the plugin.
