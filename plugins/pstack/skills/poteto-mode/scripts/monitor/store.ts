import type {
  Activity,
  AgentId,
  AgentNode,
  AgentStatus,
  Flavor,
  Harness,
  NormalizedUsage,
  SourceKind,
  SpawnVia,
} from "./domain.ts";
import type { AgentPatch, ChildOutcome, Fact, Outcome, ProcessRecord } from "./adapter.ts";

// pstack-flex addition. The single owner of agent state. Adapters report
// facts; status is derived here from evidence and never from file mtimes.

interface Ended {
  readonly outcome: Outcome;
  readonly at: string | null;
  readonly reason: string | null;
}

interface AgentState {
  readonly id: AgentId;
  harness: Harness;
  source: SourceKind;
  flavor: Flavor;
  root: AgentId;
  fallbackParent: AgentId | null;
  spawnCall: string | null;
  via: SpawnVia | null;
  cwd: string | null;
  cliVersion: string | null;
  entrypoint: string | null;
  provider: string;
  requestedModel: string | null;
  reportedModel: string | null;
  effort: string | null;
  title: string | null;
  titleHint: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
  activity: Activity | null;
  usageTotal: NormalizedUsage | null;
  readonly usageByKey: Map<string, NormalizedUsage>;
  outcome: Ended | null;
  openTurn: string | null;
  lastTurn: Ended | null;
  shapeErrors: number;
}

interface ProcessEntry {
  readonly id: AgentId;
  readonly record: ProcessRecord;
  alive: boolean | null;
}

export interface ProbeTarget {
  readonly key: string;
  readonly pid: number;
  readonly startedAtMs: number | null;
}

export interface Flush {
  readonly rev: number;
  readonly upserts: readonly AgentNode[];
}

export interface StatusView {
  process(id: AgentId): ProcessEntry | null;
  childOutcome(callId: string): { readonly outcome: ChildOutcome; readonly at: string | null; readonly reason: string | null } | null;
  /** True once the harness is known to keep per-process records on this machine. */
  keepsProcessRecords(harness: Harness): boolean;
  status(id: AgentId): AgentStatus | null;
}

const USAGE_FIELDS = [
  "inputTokens",
  "cachedInputTokens",
  "cacheCreationInputTokens",
  "outputTokens",
  "reasoningTokens",
  "totalTokens",
] as const;

function sumUsage(values: Iterable<NormalizedUsage>): NormalizedUsage | null {
  const total: Record<string, number> = {};
  let any = false;
  for (const usage of values) {
    for (const field of USAGE_FIELDS) {
      const value = usage[field];
      if (value === undefined) continue;
      total[field] = (total[field] ?? 0) + value;
      any = true;
    }
  }
  return any ? (total as NormalizedUsage) : null;
}

function later(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return b > a ? b : a;
}

function earlier(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return b < a ? b : a;
}

function ended(value: Ended): AgentStatus {
  switch (value.outcome) {
    case "done":
      return { kind: "done", at: value.at };
    case "failed":
      return { kind: "failed", at: value.at, reason: value.reason ?? "failed" };
    case "cancelled":
      return { kind: "cancelled", at: value.at };
  }
}

/** Null when the process is gone. */
function processStatus(entry: ProcessEntry): AgentStatus | null {
  if (entry.alive === false) return null;
  if (entry.alive === null) return { kind: "unknown", why: "process not probed yet" };
  const state = entry.record.state;
  if (state === null || state === "busy" || state === "running") {
    return { kind: "running", evidence: "pid" };
  }
  if (state === "idle") return { kind: "idle", evidence: "pid", detail: null };
  return { kind: "idle", evidence: "pid", detail: state };
}

function childStatusFromOutcome(outcome: ChildOutcome, at: string | null, reason: string | null): AgentStatus | null {
  return outcome === "launched" ? null : ended({ outcome, at, reason });
}

/** Status as a pure function of one agent's evidence and its relatives. */
export function deriveStatus(agent: AgentState, view: StatusView): AgentStatus {
  if (agent.outcome !== null) return ended(agent.outcome);
  const flavor = agent.flavor;
  switch (flavor.kind) {
    case "lane": {
      const entry = view.process(agent.id);
      if (entry === null) return { kind: "unknown", why: "lane has no runner pid" };
      if (entry.alive === false) {
        return { kind: "failed", at: agent.lastActivityAt, reason: "runner exited without a receipt" };
      }
      return processStatus(entry) ?? { kind: "unknown", why: "runner state unknown" };
    }
    case "session":
    case "subagent": {
      if (agent.harness === "codex") return codexStatus(agent, flavor.kind === "session");
      if (flavor.kind === "session") return claudeSessionStatus(agent, view);
      return claudeSubagentStatus(agent, view);
    }
  }
}

function codexStatus(agent: AgentState, isRoot: boolean): AgentStatus {
  if (agent.openTurn !== null) return { kind: "running", evidence: "lifecycle" };
  if (agent.lastTurn === null) return { kind: "unknown", why: "no turn recorded yet" };
  if (isRoot) {
    return agent.lastTurn.outcome === "done"
      ? { kind: "idle", evidence: "lifecycle", detail: null }
      : { kind: "idle", evidence: "lifecycle", detail: agent.lastTurn.outcome === "cancelled" ? "interrupted" : "last turn failed" };
  }
  return ended(agent.lastTurn);
}

function claudeSessionStatus(agent: AgentState, view: StatusView): AgentStatus {
  const entry = view.process(agent.id);
  if (entry !== null) {
    return processStatus(entry) ?? { kind: "ended", at: agent.lastActivityAt };
  }
  // Terminal sessions always keep a process record; a missing one means the process is gone.
  if (view.keepsProcessRecords("claude") && agent.entrypoint === "cli") {
    return { kind: "ended", at: agent.lastActivityAt };
  }
  // Desktop and SDK sessions keep no process record, so liveness cannot be known.
  return {
    kind: "unknown",
    why: agent.entrypoint === null ? "no process record" : `${agent.entrypoint} sessions keep no process record`,
  };
}

function claudeSubagentStatus(agent: AgentState, view: StatusView): AgentStatus {
  if (agent.spawnCall !== null) {
    const result = view.childOutcome(agent.spawnCall);
    if (result !== null) {
      const status = childStatusFromOutcome(result.outcome, result.at, result.reason);
      if (status !== null) return status;
    }
  }
  const root = view.status(agent.root);
  if (root === null) return { kind: "unknown", why: "parent session not indexed" };
  switch (root.kind) {
    case "running":
    case "idle":
      return agent.spawnCall === null
        ? { kind: "unknown", why: "teammate; no lifecycle record" }
        : { kind: "running", evidence: "parent" };
    case "unknown":
      return { kind: "unknown", why: root.why };
    default:
      return { kind: "ended", at: agent.lastActivityAt };
  }
}

function defaultTitle(agent: AgentState): string {
  switch (agent.flavor.kind) {
    case "session":
      return agent.harness === "claude" ? "Claude Code session" : "Codex session";
    case "subagent":
      return agent.flavor.agentType ?? "subagent";
    case "lane":
      return agent.flavor.label ?? `${agent.provider}:${agent.requestedModel ?? "?"}@${agent.effort ?? "?"}`;
  }
}

export class Store implements StatusView {
  private readonly agents = new Map<AgentId, AgentState>();
  private readonly spawnCalls = new Map<string, AgentId>();
  private readonly childOutcomes = new Map<string, { outcome: ChildOutcome; at: string | null; reason: string | null }>();
  private readonly processes = new Map<string, ProcessEntry>();
  private readonly processByAgent = new Map<AgentId, string>();
  private readonly processRecordHarnesses = new Set<Harness>();
  private readonly sent = new Map<AgentId, string>();
  private readonly statusCache = new Map<AgentId, AgentStatus>();
  private dirty = false;
  private revision = 0;

  get rev(): number {
    return this.revision;
  }

  apply(fact: Fact): void {
    this.changed();
    switch (fact.kind) {
      case "agent":
        this.patch(this.ensure(fact.id, fact.patch), fact.patch);
        return;
      case "link": {
        const agent = this.ensure(fact.id, {});
        if (fact.parent !== fact.id) agent.fallbackParent = fact.parent;
        agent.via = fact.via;
        return;
      }
      case "link-by-call": {
        const agent = this.ensure(fact.id, {});
        agent.spawnCall = fact.callId;
        if (fact.fallback !== fact.id) agent.fallbackParent = fact.fallback;
        agent.via = "tool-use";
        return;
      }
      case "spawn-call":
        this.spawnCalls.set(fact.callId, fact.by);
        return;
      case "activity": {
        const agent = this.ensure(fact.id, {});
        agent.activity = fact.activity;
        agent.lastActivityAt = later(agent.lastActivityAt, fact.activity.at);
        return;
      }
      case "usage": {
        const agent = this.ensure(fact.id, {});
        if (fact.key === null) {
          agent.usageTotal = fact.usage;
          agent.usageByKey.clear();
        } else {
          agent.usageByKey.set(fact.key, fact.usage);
        }
        return;
      }
      case "child-outcome":
        this.childOutcomes.set(fact.callId, { outcome: fact.outcome, at: fact.at, reason: fact.reason });
        return;
      case "outcome":
        this.ensure(fact.id, {}).outcome = { outcome: fact.outcome, at: fact.at, reason: fact.reason };
        return;
      case "turn": {
        const agent = this.ensure(fact.id, {});
        if (fact.event.kind === "started") {
          agent.openTurn = fact.turnId;
        } else {
          if (agent.openTurn === fact.turnId || agent.openTurn === null) agent.openTurn = null;
          agent.lastTurn = { outcome: fact.event.outcome, at: fact.at, reason: fact.event.reason };
        }
        agent.lastActivityAt = later(agent.lastActivityAt, fact.at);
        return;
      }
      case "process": {
        // The record is rewritten on every state change; keep the probe result while it names the same process.
        const previous = this.processes.get(fact.key);
        const same = previous !== undefined && previous.id === fact.id && previous.record.pid === fact.process.pid;
        this.retractProcess(fact.key);
        this.ensure(fact.id, {});
        this.processes.set(fact.key, { id: fact.id, record: fact.process, alive: same ? previous.alive : null });
        this.processByAgent.set(fact.id, fact.key);
        return;
      }
      case "process-gone":
        this.retractProcess(fact.key);
        return;
    }
  }

  noteShapeError(id: AgentId): void {
    const agent = this.agents.get(id);
    if (agent === undefined) return;
    agent.shapeErrors += 1;
    this.changed();
  }

  noteProcessRecords(harness: Harness): void {
    if (this.processRecordHarnesses.has(harness)) return;
    this.processRecordHarnesses.add(harness);
    this.changed();
  }

  probeTargets(): readonly ProbeTarget[] {
    return [...this.processes].map(([key, entry]) => ({
      key,
      pid: entry.record.pid,
      startedAtMs: entry.record.startedAtMs,
    }));
  }

  setAlive(key: string, alive: boolean): void {
    const entry = this.processes.get(key);
    if (entry === undefined || entry.alive === alive) return;
    entry.alive = alive;
    this.changed();
  }

  has(id: AgentId): boolean {
    return this.agents.has(id);
  }

  /** True when the agent's session root has a live process, so its files stay indexed. */
  isLive(id: AgentId): boolean {
    const entry = this.process(id);
    return entry !== null && entry.alive !== false;
  }

  // StatusView
  process(id: AgentId): ProcessEntry | null {
    const key = this.processByAgent.get(id);
    return key === undefined ? null : this.processes.get(key) ?? null;
  }

  childOutcome(callId: string) {
    return this.childOutcomes.get(callId) ?? null;
  }

  keepsProcessRecords(harness: Harness): boolean {
    return this.processRecordHarnesses.has(harness);
  }

  status(id: AgentId): AgentStatus | null {
    const cached = this.statusCache.get(id);
    if (cached !== undefined) return cached;
    const agent = this.agents.get(id);
    if (agent === undefined) return null;
    // Guards a malformed parent cycle; a node never asks about itself twice.
    this.statusCache.set(id, { kind: "unknown", why: "status cycle" });
    const status = deriveStatus(agent, this);
    this.statusCache.set(id, status);
    return status;
  }

  node(id: AgentId): AgentNode | null {
    const agent = this.agents.get(id);
    if (agent === undefined) return null;
    const parent = agent.spawnCall !== null
      ? this.spawnCalls.get(agent.spawnCall) ?? agent.fallbackParent
      : agent.fallbackParent;
    return {
      id: agent.id,
      parent: parent === agent.id ? null : parent,
      via: agent.via,
      spawnCall: agent.spawnCall,
      harness: agent.harness,
      source: agent.source,
      flavor: agent.flavor,
      title: agent.title ?? agent.titleHint ?? defaultTitle(agent),
      cwd: agent.cwd,
      model: {
        provider: agent.provider,
        requested: agent.requestedModel,
        reported: agent.reportedModel,
        effort: agent.effort,
      },
      status: this.status(id) ?? { kind: "unknown", why: "missing" },
      startedAt: agent.startedAt,
      lastActivityAt: agent.lastActivityAt,
      activity: agent.activity,
      usage: agent.usageTotal ?? sumUsage(agent.usageByKey.values()),
      health: agent.shapeErrors > 0 ? "degraded" : "ok",
    };
  }

  nodes(): AgentNode[] {
    const result: AgentNode[] = [];
    for (const id of this.agents.keys()) {
      const node = this.node(id);
      if (node !== null) result.push(node);
    }
    return result;
  }

  /** Nodes whose serialized form changed since the last flush. */
  flush(): Flush | null {
    if (!this.dirty) return null;
    this.dirty = false;
    const upserts: AgentNode[] = [];
    for (const node of this.nodes()) {
      const serialized = JSON.stringify(node);
      if (this.sent.get(node.id) === serialized) continue;
      this.sent.set(node.id, serialized);
      upserts.push(node);
    }
    if (upserts.length === 0) return null;
    this.revision += 1;
    return { rev: this.revision, upserts };
  }

  private changed(): void {
    this.dirty = true;
    this.statusCache.clear();
  }

  private retractProcess(key: string): void {
    const entry = this.processes.get(key);
    if (entry === undefined) return;
    this.processes.delete(key);
    if (this.processByAgent.get(entry.id) === key) this.processByAgent.delete(entry.id);
  }

  private ensure(id: AgentId, patch: AgentPatch): AgentState {
    const existing = this.agents.get(id);
    if (existing !== undefined) return existing;
    const created: AgentState = {
      id,
      harness: patch.harness ?? "claude",
      source: patch.source ?? "claude-session",
      flavor: patch.flavor ?? { kind: "session" },
      root: patch.root ?? id,
      fallbackParent: null,
      spawnCall: null,
      via: null,
      cwd: null,
      cliVersion: null,
      entrypoint: null,
      provider: patch.provider ?? patch.harness ?? "claude",
      requestedModel: null,
      reportedModel: null,
      effort: null,
      title: null,
      titleHint: null,
      startedAt: null,
      lastActivityAt: null,
      activity: null,
      usageTotal: null,
      usageByKey: new Map(),
      outcome: null,
      openTurn: null,
      lastTurn: null,
      shapeErrors: 0,
    };
    this.agents.set(id, created);
    return created;
  }

  private patch(agent: AgentState, patch: AgentPatch): void {
    if (patch.harness !== undefined) agent.harness = patch.harness;
    if (patch.source !== undefined) agent.source = patch.source;
    if (patch.flavor !== undefined) agent.flavor = mergeFlavor(agent.flavor, patch.flavor);
    if (patch.root !== undefined) {
      agent.root = patch.root;
      if (agent.fallbackParent === null && patch.root !== agent.id) agent.fallbackParent = patch.root;
    }
    if (patch.cwd !== undefined) agent.cwd = patch.cwd;
    if (patch.cliVersion !== undefined) agent.cliVersion = patch.cliVersion;
    if (patch.entrypoint !== undefined) agent.entrypoint = patch.entrypoint;
    if (patch.provider !== undefined) agent.provider = patch.provider;
    if (patch.requestedModel !== undefined) agent.requestedModel = patch.requestedModel;
    if (patch.reportedModel !== undefined) agent.reportedModel = patch.reportedModel;
    if (patch.effort !== undefined) agent.effort = patch.effort;
    if (patch.title !== undefined) agent.title = patch.title;
    if (patch.titleHint !== undefined && agent.titleHint === null) agent.titleHint = patch.titleHint;
    if (patch.seenAt !== undefined) {
      agent.startedAt = earlier(agent.startedAt, patch.seenAt);
      agent.lastActivityAt = later(agent.lastActivityAt, patch.seenAt);
    }
  }
}

// A subagent's meta and its transcript each report a flavor; neither may erase the other's detail.
function mergeFlavor(current: Flavor, next: Flavor): Flavor {
  if (current.kind === "subagent" && next.kind === "subagent") {
    return { kind: "subagent", agentType: next.agentType ?? current.agentType };
  }
  if (current.kind === "lane" && next.kind === "lane") {
    return {
      kind: "lane",
      mode: next.mode,
      stream: next.stream,
      label: next.label ?? current.label,
      receipt: next.receipt ?? current.receipt,
    };
  }
  return next;
}
