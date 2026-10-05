---
name: monitor
description: "Open a live local view of pstack work on this machine: every session that runs pstack and every agent it spawns, including native Claude and Codex subagents and external Codex, Grok, DeepSeek, and MiniMax lanes, with what each is doing now. Also stops it. Use for /monitor, 'show me the agents', 'what is running', watching an arena, swarm, or interrogate fan-out, or 'stop / kill / shut down the monitor'."
---

# Monitor

Run one command and relay its output.

| The user asks to | Run |
| --- | --- |
| open, show, or start the monitor (the default) | `pstack-monitor start --parent <claude\|codex>` |
| see every session, not only pstack's | `pstack-monitor start --parent <claude\|codex> --all` |
| stop, kill, close, or shut down the monitor | `pstack-monitor stop` |
| check whether it is running, or get the link again | `pstack-monitor status` |

The launcher is `scripts/monitor/pstack-monitor` under the installed `pstack-monitor` plugin. Pass the harness you are running in as `--parent`.

`start` returns at once and prints one link. Give the user that link exactly as printed. The link carries an access token: never paste it anywhere else, and never open it with a fetch tool.

The first `start` also turns on the lane journal and says so on stderr. Relay that line: lane output is kept on disk for 7 days, and `pstack-monitor journal off` stops it and deletes what it kept.

`stop` ends the monitor only, never an agent. To stop an agent, the user interrupts it in its own session, or cancels a pstack lane through the background task that launched it.

`pstack-monitor doctor` reports how well recent transcripts parsed. Run it when the page warns that a source is degraded, and relay the result.

If `start` fails because the sandbox blocks a local port or `~/.pstack-flex`, do not raise permissions. Give the user the command to run; in Claude Code they can type it after `!`.
