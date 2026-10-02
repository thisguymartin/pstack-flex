import { join, relative, sep } from "node:path";
import {
  NOTHING,
  parsed,
  problem,
  type Adapter,
  type Claim,
  type Fact,
  type LineParser,
  type Parsed,
} from "../adapter.ts";
import type { AgentId, TimelineItem } from "../domain.ts";
import {
  array,
  basename,
  clip,
  contentText,
  finite,
  object,
  oneLine,
  parseJson,
  pretty,
  text,
  usageFrom,
} from "../json.ts";
import { BODY_LIMIT, describeTool, itemId, textActivity } from "./blocks.ts";

// pstack-flex addition. Reads Codex rollouts. Each thread, including every
// spawned child, writes its own rollout; children name their parent thread.

const ROLLOUT = /^rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/;

const IGNORED_TYPES = new Set([
  "world_state",
  "token_usage_record",
  "compacted",
  "inter_agent_communication_metadata",
]);

const IGNORED_ITEMS = new Set(["ghost_snapshot"]);

export function threadId(thread: string): AgentId {
  return `codex:${thread}` as AgentId;
}

function threadOf(home: string, path: string): string | null {
  const parts = relative(home, path).split(sep);
  if (parts[0] !== "sessions" || parts.length !== 5) return null;
  return ROLLOUT.exec(parts[4]!)?.[1] ?? null;
}

/** Enter only date folders that can hold rollouts written inside the window. */
export function enterDateFolder(sessionsDir: string, dir: string, sinceMs: number): boolean {
  const parts = relative(sessionsDir, dir).split(sep).filter((part) => part.length > 0);
  if (parts.length === 0) return true;
  // A day folder holds threads that started that day and may still be writing; allow a day of slack.
  const since = new Date(sinceMs - 86_400_000);
  const floor = [
    String(since.getFullYear()),
    String(since.getMonth() + 1).padStart(2, "0"),
    String(since.getDate()).padStart(2, "0"),
  ];
  const prefix = parts.join("-");
  return prefix >= floor.slice(0, parts.length).join("-");
}

// The CLI injects context as user messages wrapped in tags; they are not prompts.
function isInjectedContext(body: string): boolean {
  const trimmed = body.trimStart();
  return trimmed.startsWith("<") || trimmed.startsWith("# AGENTS.md");
}

class RolloutParser implements LineParser {
  private metaSeen = false;
  private historyStart: number | null = null;
  private isChild = false;

  constructor(private readonly agent: AgentId) {}

  line(line: string, offset: number): Parsed {
    const raw = parseJson(line);
    if (raw === undefined) return problem({ kind: "not-json" });
    const record = object(raw);
    if (record === null) return problem({ kind: "shape", recordType: "?", detail: "record is not an object" });
    const type = text(record.type) ?? "?";
    const payload = object(record.payload);
    const at = text(record.timestamp);

    if (type === "session_meta") {
      // A forked child copies its parent's history, including the parent's meta, after its own.
      if (this.metaSeen) return NOTHING;
      this.metaSeen = true;
      if (payload === null) return problem({ kind: "shape", recordType: type, detail: "missing payload" });
      return this.meta(payload, at);
    }
    const ordinal = finite(record.ordinal);
    if (this.historyStart !== null && ordinal !== undefined && ordinal < this.historyStart) return NOTHING;
    if (payload === null) {
      return IGNORED_TYPES.has(type) ? NOTHING : problem({ kind: "shape", recordType: type, detail: "missing payload" });
    }

    switch (type) {
      case "turn_context":
        return parsed([this.settings(text(payload.model), text(payload.effort), text(payload.cwd))]);
      case "event_msg":
        return this.event(payload, offset, at);
      case "response_item":
        return this.item(payload, offset, at, line.length);
      default:
        if (IGNORED_TYPES.has(type)) return NOTHING;
        return problem(
          { kind: "unknown-type", recordType: type },
          [{ id: itemId(offset, 0), at, kind: "unparsed", recordType: type, bytes: line.length }],
        );
    }
  }

  private meta(payload: Record<string, unknown>, at: string | null): Parsed {
    const source = object(payload.source);
    const subagent = object(source?.subagent);
    const spawn = object(subagent?.thread_spawn);
    const parent = text(payload.parent_thread_id) ?? text(spawn?.parent_thread_id);
    this.isChild = parent !== null;
    this.historyStart = finite(payload.subagent_history_start_ordinal) ?? null;
    const nickname = text(payload.agent_nickname) ?? text(spawn?.agent_nickname);
    const agentPath = text(payload.agent_path) ?? text(spawn?.agent_path);
    const role = text(payload.agent_role) ?? text(spawn?.agent_role) ?? text(subagent?.other);
    const task = agentPath === null ? null : basename(agentPath);
    const named = [nickname, task].filter((part) => part !== null).join(" · ");
    const title = role === "guardian" ? "guardian review" : named.length > 0 ? named : null;
    const cliVersion = text(payload.cli_version);
    const started = text(payload.timestamp) ?? at;
    const facts: Fact[] = [{
      kind: "agent",
      id: this.agent,
      patch: {
        harness: "codex",
        source: "codex-rollout",
        provider: "codex",
        flavor: this.isChild ? { kind: "subagent", agentType: role ?? task } : { kind: "session" },
        ...(text(payload.cwd) !== null ? { cwd: text(payload.cwd)! } : {}),
        ...(started !== null ? { seenAt: started } : {}),
        ...(cliVersion !== null ? { cliVersion } : {}),
        ...(text(payload.originator) !== null ? { entrypoint: text(payload.originator)! } : {}),
        ...(title !== null ? { title } : {}),
      },
    }];
    if (parent !== null) facts.push({ kind: "link", id: this.agent, parent: threadId(parent), via: "thread-spawn" });
    return parsed(facts, [], cliVersion);
  }

  private settings(model: string | null, effort: string | null, cwd: string | null): Fact {
    return {
      kind: "agent",
      id: this.agent,
      patch: {
        ...(model !== null ? { requestedModel: model, reportedModel: model } : {}),
        ...(effort !== null ? { effort } : {}),
        ...(cwd !== null ? { cwd } : {}),
      },
    };
  }

  private event(payload: Record<string, unknown>, offset: number, at: string | null): Parsed {
    const turnId = text(payload.turn_id) ?? "turn";
    switch (payload.type) {
      case "task_started":
        return parsed([{ kind: "turn", id: this.agent, turnId, at, event: { kind: "started" } }]);
      case "task_complete": {
        const error = text(object(payload.error)?.message);
        const items: TimelineItem[] = error === null
          ? []
          : [{ id: itemId(offset, 0), at, kind: "notice", level: "error", text: oneLine(error, 400) }];
        return parsed(
          [{ kind: "turn", id: this.agent, turnId, at, event: { kind: "ended", outcome: error === null ? "done" : "failed", reason: error } }],
          items,
        );
      }
      case "turn_aborted": {
        const reason = text(payload.reason);
        return parsed(
          [{ kind: "turn", id: this.agent, turnId, at, event: { kind: "ended", outcome: "cancelled", reason } }],
          [{ id: itemId(offset, 0), at, kind: "notice", level: "info", text: `turn aborted${reason === null ? "" : `: ${reason}`}` }],
        );
      }
      case "token_count": {
        const usage = usageFrom(object(payload.info)?.total_token_usage);
        return usage === null ? NOTHING : parsed([{ kind: "usage", id: this.agent, key: null, usage }]);
      }
      case "thread_settings_applied": {
        const settings = object(payload.thread_settings);
        return settings === null
          ? NOTHING
          : parsed([this.settings(text(settings.model), text(settings.reasoning_effort), text(settings.cwd))]);
      }
      default:
        // event_msg is a wide family of UI events; the response items carry the content.
        return NOTHING;
    }
  }

  private item(payload: Record<string, unknown>, offset: number, at: string | null, bytes: number): Parsed {
    const id = itemId(offset, 0);
    const type = text(payload.type) ?? "?";
    switch (type) {
      case "message": {
        const role = text(payload.role);
        const body = contentText(payload.content);
        if (body.length === 0 || role === "developer" || role === "system") return NOTHING;
        if (role === "assistant") {
          return parsed([textActivity(this.agent, body, at)], [{ id, at, kind: "text", body: clip(body, BODY_LIMIT) }]);
        }
        if (isInjectedContext(body)) return NOTHING;
        const facts: Fact[] = this.isChild ? [] : [{ kind: "agent", id: this.agent, patch: { titleHint: oneLine(body, 80) } }];
        return parsed(facts, [{ id, at, kind: "prompt", body: clip(body, BODY_LIMIT) }]);
      }
      case "reasoning": {
        const summary = array(payload.summary)
          .map((part) => text(object(part)?.text))
          .filter((part): part is string => part !== null)
          .join("\n");
        return parsed(
          [{ kind: "activity", id: this.agent, activity: { what: "thinking", snippet: "thinking", at } }],
          [{ id, at, kind: "thinking", body: summary.length === 0 ? null : clip(summary, BODY_LIMIT) }],
        );
      }
      case "function_call":
      case "custom_tool_call":
      case "local_shell_call":
      case "web_search_call": {
        const name = text(payload.name) ?? (type === "web_search_call" ? "web_search" : "shell");
        const input = type === "function_call"
          ? prettyArguments(payload.arguments)
          : type === "custom_tool_call"
            ? text(payload.input) ?? ""
            : pretty(payload.action);
        const callId = text(payload.call_id) ?? text(payload.id) ?? `${offset}`;
        return parsed(
          [{ kind: "activity", id: this.agent, activity: { what: "tool", snippet: describeTool(name, firstLine(input)), at } }],
          [{ id, at, kind: "tool-call", callId, name, input: clip(input, BODY_LIMIT) }],
        );
      }
      case "function_call_output":
      case "custom_tool_call_output":
      case "local_shell_call_output": {
        const callId = text(payload.call_id);
        if (callId === null) return problem({ kind: "shape", recordType: `response_item/${type}`, detail: "missing call_id" });
        const output = typeof payload.output === "string" ? payload.output : contentText(payload.output);
        return parsed([], [{ id, at, kind: "tool-result", callId, ok: null, output: clip(output, BODY_LIMIT) }]);
      }
      case "agent_message": {
        const author = text(payload.author) ?? "agent";
        const recipient = text(payload.recipient) ?? "agent";
        const body = contentText(payload.content);
        return parsed([], [{ id, at, kind: "notice", level: "info", text: `${author} → ${recipient}: ${oneLine(body, 600)}` }]);
      }
      case "compaction":
        return parsed([], [{ id, at, kind: "notice", level: "info", text: "context compacted" }]);
      default:
        if (IGNORED_ITEMS.has(type)) return NOTHING;
        return problem(
          { kind: "unknown-type", recordType: `response_item/${type}` },
          [{ id, at, kind: "unparsed", recordType: `response_item/${type}`, bytes }],
        );
    }
  }
}

function prettyArguments(value: unknown): string {
  if (typeof value !== "string") return pretty(value);
  const parsedValue = parseJson(value);
  return parsedValue === undefined ? value : pretty(parsedValue);
}

function firstLine(value: string): string {
  const trimmed = value.trim();
  const end = trimmed.indexOf("\n");
  return end === -1 ? trimmed : trimmed.slice(0, end);
}

export function codexAdapter(home: string): Adapter {
  const sessions = join(home, "sessions");
  return {
    source: "codex-rollout",
    windowed: true,
    checkedVersion: "0.160.0",
    roots: [{ dir: sessions, depth: 4, enter: (dir, sinceMs) => enterDateFolder(sessions, dir, sinceMs) }],

    claim(path: string): Claim | null {
      const thread = threadOf(home, path);
      if (thread === null) return null;
      return { kind: "stream", agent: threadId(thread), root: threadId(thread), header: true };
    },

    open(path: string): LineParser {
      return new RolloutParser(threadId(threadOf(home, path) ?? path));
    },

    document(): Parsed {
      return NOTHING;
    },

    removed() {
      return [];
    },
  };
}
