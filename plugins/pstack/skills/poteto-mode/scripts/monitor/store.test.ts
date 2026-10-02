import { describe, expect, it } from "bun:test";
import type { Fact } from "./adapter.ts";
import type { AgentId } from "./domain.ts";
import { Store } from "./store.ts";

const root = "claude:s1" as AgentId;
const child = "claude:s1:a1" as AgentId;
const grandchild = "claude:s1:a2" as AgentId;

function store(...facts: Fact[]): Store {
  const result = new Store();
  for (const fact of facts) result.apply(fact);
  return result;
}

const session: Fact = {
  kind: "agent",
  id: root,
  patch: { harness: "claude", source: "claude-session", flavor: { kind: "session" }, entrypoint: "cli" },
};
const subagent: Fact = {
  kind: "agent",
  id: child,
  patch: { harness: "claude", source: "claude-session", flavor: { kind: "subagent", agentType: "Explore" }, root },
};
const pidFile = (state: string, pid = 10): Fact => ({
  kind: "process",
  key: "/sessions/10.json",
  id: root,
  process: { pid, startedAtMs: null, state },
});

describe("Claude session status", () => {
  it("follows the live process record", () => {
    const busy = store(session, pidFile("busy"));
    busy.setAlive("/sessions/10.json", true);
    expect(busy.node(root)!.status).toEqual({ kind: "running", evidence: "pid" });

    const waiting = store(session, pidFile("waiting"));
    waiting.setAlive("/sessions/10.json", true);
    expect(waiting.node(root)!.status).toEqual({ kind: "idle", evidence: "pid", detail: "waiting" });
  });

  it("ends when the process is gone or its record is removed", () => {
    const dead = store(session, pidFile("busy"));
    dead.setAlive("/sessions/10.json", false);
    expect(dead.node(root)!.status.kind).toBe("ended");

    const removed = store(session, pidFile("busy"), { kind: "process-gone", key: "/sessions/10.json" });
    removed.noteProcessRecords("claude");
    expect(removed.node(root)!.status.kind).toBe("ended");
  });

  it("does not guess without process records", () => {
    expect(store(session).node(root)!.status.kind).toBe("unknown");
  });

  it("keeps the probe result when the record is rewritten for the same process", () => {
    const result = store(session, pidFile("busy"));
    result.setAlive("/sessions/10.json", true);
    result.apply(pidFile("idle"));
    expect(result.node(root)!.status).toEqual({ kind: "idle", evidence: "pid", detail: null });
    result.apply(pidFile("idle", 11));
    expect(result.node(root)!.status.kind).toBe("unknown");
  });
});

describe("Claude subagent status", () => {
  const live = (...facts: Fact[]): Store => {
    const result = store(session, pidFile("busy"), subagent, ...facts);
    result.setAlive("/sessions/10.json", true);
    return result;
  };

  it("runs while its session lives and finishes on the parent's tool result", () => {
    const spawned = live({ kind: "link-by-call", id: child, callId: "call-1", fallback: root });
    expect(spawned.node(child)!.status).toEqual({ kind: "running", evidence: "parent" });
    spawned.apply({ kind: "child-outcome", callId: "call-1", outcome: "done", at: "t", reason: null });
    expect(spawned.node(child)!.status).toEqual({ kind: "done", at: "t" });
  });

  it("keeps running after an async launch until the notification arrives", () => {
    const spawned = live(
      { kind: "link-by-call", id: child, callId: "call-1", fallback: root },
      { kind: "child-outcome", callId: "call-1", outcome: "launched", at: "t0", reason: null },
    );
    expect(spawned.node(child)!.status.kind).toBe("running");
    spawned.apply({ kind: "child-outcome", callId: "call-1", outcome: "cancelled", at: "t1", reason: null });
    expect(spawned.node(child)!.status).toEqual({ kind: "cancelled", at: "t1" });
  });

  it("treats a user stop as cancelled", () => {
    const stopped = live(
      { kind: "link-by-call", id: child, callId: "call-1", fallback: root },
      { kind: "outcome", id: child, outcome: "cancelled", at: null, reason: "stopped by the user" },
    );
    expect(stopped.node(child)!.status.kind).toBe("cancelled");
  });

  it("ends with its session when no outcome was recorded", () => {
    const orphan = live({ kind: "link-by-call", id: child, callId: "call-1", fallback: root });
    orphan.setAlive("/sessions/10.json", false);
    expect(orphan.node(child)!.status.kind).toBe("ended");
  });

  it("attaches to whichever agent made the spawning call", () => {
    const nested = live(
      { kind: "link-by-call", id: child, callId: "call-1", fallback: root },
      { kind: "agent", id: grandchild, patch: { harness: "claude", flavor: { kind: "subagent", agentType: null }, root } },
      { kind: "link-by-call", id: grandchild, callId: "call-2", fallback: root },
    );
    expect(nested.node(grandchild)!.parent).toBe(root);
    nested.apply({ kind: "spawn-call", by: child, callId: "call-2" });
    expect(nested.node(grandchild)!.parent).toBe(child);
    expect(nested.node(child)!.parent).toBe(root);
  });
});

describe("Codex thread status", () => {
  const thread = "codex:t1" as AgentId;
  const childThread = "codex:t2" as AgentId;
  const facts = (id: AgentId, flavor: "session" | "subagent"): Fact => ({
    kind: "agent",
    id,
    patch: {
      harness: "codex",
      source: "codex-rollout",
      flavor: flavor === "session" ? { kind: "session" } : { kind: "subagent", agentType: "reviewer" },
    },
  });

  it("runs inside a turn and idles between turns at the root", () => {
    const result = store(facts(thread, "session"), { kind: "turn", id: thread, turnId: "u1", at: "t0", event: { kind: "started" } });
    expect(result.node(thread)!.status).toEqual({ kind: "running", evidence: "lifecycle" });
    result.apply({ kind: "turn", id: thread, turnId: "u1", at: "t1", event: { kind: "ended", outcome: "done", reason: null } });
    expect(result.node(thread)!.status).toEqual({ kind: "idle", evidence: "lifecycle", detail: null });
  });

  it("finishes a child with its last turn and revives it on a new one", () => {
    const result = store(
      facts(childThread, "subagent"),
      { kind: "link", id: childThread, parent: thread, via: "thread-spawn" },
      { kind: "turn", id: childThread, turnId: "u1", at: "t0", event: { kind: "started" } },
      { kind: "turn", id: childThread, turnId: "u1", at: "t1", event: { kind: "ended", outcome: "failed", reason: "boom" } },
    );
    expect(result.node(childThread)!.status).toEqual({ kind: "failed", at: "t1", reason: "boom" });
    expect(result.node(childThread)!.parent).toBe(thread);
    result.apply({ kind: "turn", id: childThread, turnId: "u2", at: "t2", event: { kind: "started" } });
    expect(result.node(childThread)!.status.kind).toBe("running");
  });
});

describe("usage", () => {
  it("counts a message split across records once", () => {
    const usage = { inputTokens: 10, outputTokens: 5 };
    const result = store(
      session,
      { kind: "usage", id: root, key: "msg-1", usage },
      { kind: "usage", id: root, key: "msg-1", usage },
      { kind: "usage", id: root, key: "msg-2", usage },
    );
    expect(result.node(root)!.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
  });

  it("lets a cumulative total replace keyed usage", () => {
    const result = store(
      session,
      { kind: "usage", id: root, key: "msg-1", usage: { outputTokens: 5 } },
      { kind: "usage", id: root, key: null, usage: { outputTokens: 42 } },
    );
    expect(result.node(root)!.usage).toEqual({ outputTokens: 42 });
  });
});

describe("flush", () => {
  it("sends only nodes that changed", () => {
    const result = store(session, subagent);
    const first = result.flush()!;
    expect(first.upserts.map((node) => node.id).sort()).toEqual([root, child]);
    expect(result.flush()).toBeNull();
    result.apply({ kind: "activity", id: child, activity: { what: "text", snippet: "hi", at: "t" } });
    expect(result.flush()!.upserts.map((node) => node.id)).toEqual([child]);
  });
});
