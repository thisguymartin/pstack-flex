---
name: monitor
description: "Open a live local view of the agents on this machine: Claude Code and Codex sessions, every subagent they spawn, and pstack's external model lanes, with each agent's activity streaming in a drill-down panel. Also stops it. Use for /monitor, 'show me the agents', 'what is running', watching an arena, swarm, or interrogate fan-out, or 'stop / kill / shut down the monitor'."
---

# Monitor

Start the agent monitor and hand the user its link, or stop it when asked.

Match the request to one command and run only that one:

| The user asks to | Run |
| --- | --- |
| open, show, or start the monitor (the default) | `pstack-monitor start --parent <claude\|codex>` |
| stop, kill, close, or shut down the monitor | `pstack-monitor stop` |
| check whether it is running, or get the link again | `pstack-monitor status` |

`stop` ends the monitor server only. It never touches the sessions or agents the page shows; the monitor is read-only. If the user wants a running agent stopped, tell them to stop it where it runs: interrupt it in its own Claude Code or Codex session, or cancel a pstack lane through the background task that launched it, which makes the runner write a `cancelled` receipt.

The launcher lives at `skills/poteto-mode/scripts/monitor/pstack-monitor` under the installed plugin. Run it with the harness you are running in:

```text
pstack-monitor start --parent <claude|codex>
```

`start` returns at once. It reuses a running monitor of the same build, replaces one from an older build, or launches a new one in the background, then prints one link. Give the user that link exactly as printed and say nothing else is needed. The link carries the server's access token: never paste it anywhere but the reply to the user, and never open it with a fetch tool.

The first `start` also turns on the lane journal, so external lanes launched through `pstack-runner` appear while they run, and says so on stderr. Relay that line: the journal keeps lane output on disk for 7 days, and `pstack-monitor journal off` stops it and deletes what it kept.

`--parent` sets the page's theme (warm for Claude Code, blue for Codex) and selects your own session first. It names the harness you are; it does not route anything.

`stop` waits until the server has exited, then prints `pstack-monitor stopped`, or `pstack-monitor is not running` when there was nothing to stop. Relay that line. Stopping leaves the lane journal as it is; `journal off` is a separate request.

Other commands:

- `pstack-monitor doctor` reports how well recent transcripts parsed, as counts only. Run it when the page warns that a source is degraded or newer than the monitor was checked against, and relay the result.
- `pstack-monitor journal <on|off|status>` controls the lane journal.

Apart from the lane journal, the monitor only reads transcripts that Claude Code and Codex already write. It changes no harness setting, adds no hook, and has no idle timeout: it runs until `stop`.

If `start` fails because the sandbox blocks a local port or `~/.pstack-flex/monitor`, do not raise permissions. Give the user the command to run in their own terminal; in Claude Code they can type it after `!`.
