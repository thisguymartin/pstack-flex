import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { codexAdapter, enterDateFolder } from "./codex.ts";

const home = "/home/u/.codex";
const adapter = codexAdapter(home);
const parentThread = "01a0aaaa-0000-7000-8000-000000000001";
const childThread = "01a0bbbb-0000-7000-8000-000000000002";
const rollout = (thread: string) => join(home, "sessions", "2026", "10", "01", `rollout-2026-10-01T10-00-00-${thread}.jsonl`);

const record = (ordinal: number, type: string, payload: Record<string, unknown>): string =>
  JSON.stringify({ timestamp: "2026-10-01T10:00:00.000Z", ordinal, type, payload });

const childMeta = (extra: Record<string, unknown> = {}) => record(0, "session_meta", {
  id: childThread,
  timestamp: "2026-10-01T10:00:00.000Z",
  cwd: "/repo",
  originator: "codex-tui",
  cli_version: "0.160.0",
  parent_thread_id: parentThread,
  source: {
    subagent: {
      thread_spawn: { parent_thread_id: parentThread, depth: 1, agent_path: "/root/cross_judge", agent_nickname: "Popper", agent_role: null },
    },
  },
  ...extra,
});

describe("claim", () => {
  it("names the thread from the rollout file", () => {
    expect(adapter.claim(rollout(childThread))).toEqual({ kind: "stream", agent: `codex:${childThread}`, root: `codex:${childThread}`, header: true } as never);
    expect(adapter.claim(join(home, "sessions", "2026", "10", "01", "notes.jsonl"))).toBeNull();
    expect(adapter.claim(join(home, "history.jsonl"))).toBeNull();
  });

  it("enters only date folders near the window", () => {
    const sessions = join(home, "sessions");
    const since = new Date(2026, 9, 1, 12).getTime();
    expect(enterDateFolder(sessions, sessions, since)).toBe(true);
    expect(enterDateFolder(sessions, join(sessions, "2026"), since)).toBe(true);
    expect(enterDateFolder(sessions, join(sessions, "2026", "09"), since)).toBe(true);
    expect(enterDateFolder(sessions, join(sessions, "2026", "09", "30"), since)).toBe(true);
    expect(enterDateFolder(sessions, join(sessions, "2026", "09", "29"), since)).toBe(false);
    expect(enterDateFolder(sessions, join(sessions, "2025"), since)).toBe(false);
  });
});

describe("rollout", () => {
  it("links a spawned child to its parent thread and names it", () => {
    const parsed = adapter.open(rollout(childThread)).line(childMeta(), 0);
    expect(parsed.cliVersion).toBe("0.160.0");
    expect(parsed.facts).toContainEqual(expect.objectContaining({
      kind: "agent",
      patch: expect.objectContaining({ flavor: { kind: "subagent", agentType: "cross_judge" }, title: "Popper · cross_judge" }),
    }));
    expect(parsed.facts).toContainEqual({ kind: "link", id: `codex:${childThread}`, parent: `codex:${parentThread}`, via: "thread-spawn" } as never);
  });

  it("skips the parent history a forked child copies", () => {
    const parser = adapter.open(rollout(childThread));
    parser.line(childMeta({ subagent_history_start_ordinal: 3, forked_from_id: parentThread }), 0);
    const copied = parser.line(record(1, "response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "parent said this" }] }), 10);
    expect(copied.items).toEqual([]);
    const parentMeta = parser.line(record(2, "session_meta", { id: parentThread }), 20);
    expect(parentMeta.facts).toEqual([]);
    const own = parser.line(record(3, "response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "child says this" }] }), 30);
    expect(own.items[0]).toMatchObject({ kind: "text", body: { text: "child says this" } });
  });

  it("tracks turns, usage, and settings", () => {
    const parser = adapter.open(rollout(childThread));
    parser.line(childMeta(), 0);
    expect(parser.line(record(1, "event_msg", { type: "task_started", turn_id: "u1" }), 1).facts[0]).toMatchObject({ kind: "turn", event: { kind: "started" } });
    const failed = parser.line(record(2, "event_msg", { type: "task_complete", turn_id: "u1", last_agent_message: null, error: { message: "quota" } }), 2);
    expect(failed.facts[0]).toMatchObject({ kind: "turn", event: { kind: "ended", outcome: "failed", reason: "quota" } });
    expect(failed.items[0]).toMatchObject({ kind: "notice", level: "error" });
    const aborted = parser.line(record(3, "event_msg", { type: "turn_aborted", turn_id: "u2", reason: "interrupted" }), 3);
    expect(aborted.facts[0]).toMatchObject({ event: { kind: "ended", outcome: "cancelled" } });
    const usage = parser.line(record(4, "event_msg", { type: "token_count", info: { total_token_usage: { input_tokens: 9, output_tokens: 4, reasoning_output_tokens: 2 } } }), 4);
    expect(usage.facts[0]).toEqual({ kind: "usage", id: `codex:${childThread}`, key: null, usage: { inputTokens: 9, outputTokens: 4, reasoningTokens: 2 } } as never);
    const context = parser.line(record(5, "turn_context", { model: "gpt-test", effort: "high", cwd: "/repo" }), 5);
    expect(context.facts[0]).toMatchObject({ patch: { requestedModel: "gpt-test", effort: "high" } });
  });

  it("pairs tool calls with outputs and hides injected context", () => {
    const parser = adapter.open(rollout(parentThread));
    parser.line(record(0, "session_meta", { id: parentThread, cwd: "/repo", source: "cli", cli_version: "0.160.0" }), 0);
    const call = parser.line(record(1, "response_item", { type: "function_call", name: "spawn_agent", arguments: '{"task_name":"judge"}', call_id: "c1" }), 1);
    expect(call.items[0]).toMatchObject({ kind: "tool-call", callId: "c1", name: "spawn_agent" });
    const output = parser.line(record(2, "response_item", { type: "function_call_output", call_id: "c1", output: [{ type: "input_text", text: "spawned" }] }), 2);
    expect(output.items[0]).toMatchObject({ kind: "tool-result", callId: "c1", output: { text: "spawned" } });
    const injected = parser.line(record(3, "response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>…</environment_context>" }] }), 3);
    expect(injected.items).toEqual([]);
    const prompt = parser.line(record(4, "response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "Run the arena" }] }), 4);
    expect(prompt.items[0]).toMatchObject({ kind: "prompt" });
    expect(prompt.facts[0]).toMatchObject({ patch: { titleHint: "Run the arena" } });
  });

  it("reports unknown record types instead of dropping them silently", () => {
    const parser = adapter.open(rollout(parentThread));
    const unknown = parser.line(record(1, "response_item", { type: "hologram" }), 7);
    expect(unknown.problem).toEqual({ kind: "unknown-type", recordType: "response_item/hologram" });
    expect(parser.line(record(2, "world_state", { anything: true }), 8).problem).toBeNull();
    expect(parser.line(record(3, "brand_new", { anything: true }), 9).problem).toEqual({ kind: "unknown-type", recordType: "brand_new" });
  });
});
