---
name: monitor
description: "Open a live local view of the agents on this machine: Claude Code and Codex sessions, every subagent they spawn, and pstack's external model lanes, with each agent's activity streaming in a drill-down panel. Use for /monitor, 'show me the agents', 'what is running', or to watch an arena, swarm, or interrogate fan-out."
---

# Monitor

Start the agent monitor and hand the user its link.

The launcher lives at `skills/poteto-mode/scripts/monitor/pstack-monitor` under the installed plugin. Run it with the harness you are running in:

```text
pstack-monitor start --parent <claude|codex>
```

`start` returns at once. It reuses a running monitor of the same build, replaces one from an older build, or launches a new one in the background, then prints one link. Give the user that link exactly as printed and say nothing else is needed. The link carries the server's access token: never paste it anywhere but the reply to the user, and never open it with a fetch tool.

The first `start` also turns on the lane journal, so external lanes launched through `pstack-runner` appear while they run, and says so on stderr. Relay that line: the journal keeps lane output on disk for 7 days, and `pstack-monitor journal off` stops it and deletes what it kept.

`--parent` sets the page's theme (warm for Claude Code, blue for Codex) and selects your own session first. It names the harness you are; it does not route anything.

Other commands:

- `pstack-monitor status` prints a one-line summary and the link.
- `pstack-monitor stop` stops the server.
- `pstack-monitor doctor` reports how well recent transcripts parsed, as counts only. Run it when the page warns that a source is degraded or newer than the monitor was checked against, and relay the result.
- `pstack-monitor journal <on|off|status>` controls the lane journal.

Apart from the lane journal, the monitor only reads transcripts that Claude Code and Codex already write. It changes no harness setting, adds no hook, and has no idle timeout: it runs until `stop`.

If `start` fails because the sandbox blocks a local port or `~/.pstack-flex/monitor`, do not raise permissions. Give the user the command to run in their own terminal; in Claude Code they can type it after `!`.
