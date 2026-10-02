<pstack-opt-in>
pstack is installed, and it runs only when the user asks for it.

Invoke a `pstack:*` skill only when one of these holds:

- The user typed `/pstack:<name>`, or the current request names a pstack skill, pstack, or poteto-mode. A request for pstack that names no skill enters through `pstack:poteto-mode`.
- A standing user instruction in CLAUDE.md or AGENTS.md asks for pstack on this kind of task.
- A pstack skill the user started this session is still working on the current task, and it routes to another pstack skill or principle leaf.

Otherwise, do the task directly and invoke no pstack skill. This applies even when a pstack skill's description says to always apply it, to apply it to certain files, or to apply it in a situation that matches the task.

If a pstack skill dispatched you as a subagent, follow your dispatch prompt instead of this block.
</pstack-opt-in>
