import type { AgentId, AgentNode, Harness, SourceKind } from "../domain.ts";
import { compactNumber, shortPath } from "../format.ts";
import { countsOf, isLive, rootOf, rootsOf, treeOf } from "../graph.ts";
import type { Delta, ServerInfo, Snapshot, SourceHealth, TimelineAppend, TimelinePage } from "../wire.ts";
import { Canvas } from "./canvas.ts";
import { h, icon, logo } from "./dom.ts";
import { Panel } from "./panel.ts";
import { Rail, type Descendants } from "./rail.ts";

// pstack-flex addition. The page controller: one event stream, one state,
// and a render that every view reads from.

const SOURCE_NAME: Record<SourceKind, string> = {
  "claude-session": "Claude Code",
  "codex-rollout": "Codex",
  "runner-lane": "pstack lanes",
};

const PANEL_WIDTH = 460;
const RETRY_MS = 3_000;

type Connection = "connecting" | "live" | "retrying" | "expired";

interface State {
  nodes: Map<AgentId, AgentNode>;
  health: readonly SourceHealth[];
  server: ServerInfo | null;
  session: AgentId | null;
  agent: AgentId | null;
  connection: Connection;
  dismissed: string;
}

const params = new URLSearchParams(location.search);
const defaultHarness: Harness = params.get("harness") === "codex" ? "codex" : "claude";
let pendingFocus = params.get("focus") as AgentId | null;

const state: State = {
  nodes: new Map(),
  health: [],
  server: null,
  session: null,
  agent: null,
  connection: "connecting",
  dismissed: "",
};

const canvas = new Canvas({ select: (id) => selectAgent(id) });
const panel = new Panel({
  close: () => selectAgent(null),
  select: (id) => selectAgent(id),
  loadOlder: (agent, before) => fetchTimeline(agent, before),
});
const rail = new Rail({ select: (root) => selectSession(root) });

const sessionTitle = h("h1", { class: "bar-title" });
const sessionPath = h("span", { class: "bar-path mono" });
const stats = h("div", { class: "bar-stats", attrs: { "aria-label": "This session" } });
const liveText = h("span", { class: "live-text" });
const live = h("div", { class: "live", attrs: { role: "status" } }, h("span", { class: "live-dot", attrs: { "aria-hidden": "true" } }), liveText);
const railToggle = h("button", { class: "icon-button rail-toggle", title: "Sessions", attrs: { type: "button", "aria-label": "Show sessions" } }, icon("sessions"));
railToggle.addEventListener("click", () => toggleRail());
const banner = h("div", { class: "banner", attrs: { hidden: "", role: "note" } });

const bar = h(
  "header",
  { class: "bar" },
  railToggle,
  h("div", { class: "brand" }, logo(), h("span", { class: "brand-name", text: "pstack monitor" })),
  h("div", { class: "bar-session" }, sessionTitle, sessionPath),
  stats,
  live,
);

const stage = h("main", { class: "stage" }, canvas.element, banner, panel.element);
const scrim = h("div", { class: "scrim", attrs: { "aria-hidden": "true" } });
scrim.addEventListener("click", () => toggleRail(false));
document.body.append(bar, rail.element, stage, scrim);
document.documentElement.dataset.harness = defaultHarness;

// --- data ------------------------------------------------------------------

let source: EventSource | null = null;
let retryTimer: number | null = null;

function connect(): void {
  source?.close();
  if (retryTimer !== null) window.clearTimeout(retryTimer);
  retryTimer = null;
  const url = state.agent === null ? "/api/events" : `/api/events?watch=${encodeURIComponent(state.agent)}`;
  const stream = new EventSource(url);
  source = stream;
  stream.addEventListener("open", () => setConnection("live"));
  stream.addEventListener("snapshot", (event) => onSnapshot(JSON.parse((event as MessageEvent<string>).data) as Snapshot));
  stream.addEventListener("delta", (event) => onDelta(JSON.parse((event as MessageEvent<string>).data) as Delta));
  stream.addEventListener("timeline", (event) => panel.setPage(JSON.parse((event as MessageEvent<string>).data) as TimelinePage));
  stream.addEventListener("append", (event) => {
    const data = JSON.parse((event as MessageEvent<string>).data) as TimelineAppend;
    panel.append(data.agent, data.items);
  });
  stream.addEventListener("error", () => {
    if (stream !== source) return;
    if (stream.readyState === EventSource.CLOSED) void diagnoseClosed();
    else setConnection("retrying");
  });
}

// A closed stream is either a server that restarted with a new token or one that is down.
async function diagnoseClosed(): Promise<void> {
  try {
    const response = await fetch("/api/snapshot");
    if (response.status === 401) {
      setConnection("expired");
      return;
    }
  } catch {
    // The server is down; keep trying.
  }
  setConnection("retrying");
  retryTimer = window.setTimeout(connect, RETRY_MS);
}

async function fetchTimeline(agent: AgentId, before: number): Promise<TimelinePage | null> {
  try {
    const response = await fetch(`/api/timeline?agent=${encodeURIComponent(agent)}&before=${before}`);
    return response.ok ? ((await response.json()) as TimelinePage) : null;
  } catch {
    return null;
  }
}

function onSnapshot(snapshot: Snapshot): void {
  state.nodes = new Map(snapshot.agents.map((node) => [node.id, node]));
  state.health = snapshot.health;
  state.server = snapshot.server;
  if (state.session === null || !state.nodes.has(state.session)) state.session = chooseSession();
  if (state.agent !== null && !state.nodes.has(state.agent)) state.agent = null;
  setConnection("live");
  render();
}

function onDelta(delta: Delta): void {
  const pulses: AgentId[] = [];
  for (const node of delta.upserts) {
    const previous = state.nodes.get(node.id);
    if (previous !== undefined && node.activity !== null && (previous.activity?.at !== node.activity.at || previous.activity?.snippet !== node.activity.snippet)) {
      pulses.push(node.id);
    }
    state.nodes.set(node.id, node);
  }
  if (delta.health !== null) state.health = delta.health;
  if (state.server !== null) state.server = { ...state.server, indexing: delta.indexing };
  if (state.session === null) state.session = chooseSession();
  render();
  for (const id of pulses) canvas.pulse(id);
}

function chooseSession(): AgentId | null {
  if (pendingFocus !== null) {
    const focus = pendingFocus;
    if (state.nodes.has(focus)) {
      pendingFocus = null;
      return rootOf(focus, state.nodes);
    }
  }
  const roots = rootsOf(state.nodes);
  return (roots.find(isLive) ?? roots[0])?.id ?? null;
}

// --- selection -------------------------------------------------------------

function selectSession(root: AgentId): void {
  toggleRail(false);
  if (state.session === root) return;
  state.session = root;
  if (state.agent !== null) {
    state.agent = null;
    panel.close();
    canvas.setRightInset(0);
  }
  render();
}

function selectAgent(id: AgentId | null): void {
  if (id === state.agent) return;
  state.agent = id;
  if (id === null) {
    panel.close();
    canvas.setRightInset(0);
    render();
    return;
  }
  const node = state.nodes.get(id);
  if (node === undefined) return;
  const root = rootOf(id, state.nodes);
  if (root !== state.session) state.session = root;
  panel.open(node, state.nodes, Date.now());
  render();
  canvas.setRightInset(wide() ? PANEL_WIDTH : 0);
  canvas.reveal(id);
  // The stream carries the watched agent's timeline, so a new selection reconnects.
  connect();
}

function wide(): boolean {
  return matchMedia("(min-width: 1100px)").matches;
}

function toggleRail(open?: boolean): void {
  const next = open ?? document.body.dataset.rail !== "open";
  document.body.dataset.rail = next ? "open" : "closed";
  railToggle.setAttribute("aria-expanded", String(next));
}

// --- rendering -------------------------------------------------------------

function render(): void {
  const now = Date.now();
  const roots = rootsOf(state.nodes);
  const descendants = new Map<AgentId, Descendants>();
  for (const node of state.nodes.values()) {
    const root = rootOf(node.id, state.nodes);
    if (root === node.id) continue;
    const entry = descendants.get(root) ?? { total: 0, running: 0 };
    descendants.set(root, { total: entry.total + 1, running: entry.running + (node.status.kind === "running" ? 1 : 0) });
  }
  const hours = state.server?.windowHours ?? 24;
  rail.render(roots, descendants, state.session, now, `Showing the last ${hours === 24 ? "24 hours" : `${hours} hours`}`);

  const tree = state.session === null ? null : treeOf(state.session, state.nodes);
  canvas.render(tree, state.agent, now);
  document.documentElement.dataset.harness = tree?.root.harness ?? defaultHarness;

  if (state.connection === "expired") {
    canvas.setEmpty(
      h(
        "div",
        { class: "empty" },
        logo(),
        h("h2", { text: "This link has expired" }),
        h("p", {}, "The monitor restarted with a new access token. Run ", h("code", { text: "pstack-monitor start" }), " and open the link it prints."),
      ),
    );
  } else if (state.nodes.size === 0) {
    canvas.setEmpty(emptyState(state.server?.indexing === true));
  } else if (tree !== null && tree.nodes.length === 1) {
    canvas.setEmpty(h("p", { class: "canvas-hint", text: "No subagents in this session yet. When it spawns agents or runs pstack lanes, they appear here." }));
  } else {
    canvas.setEmpty(null);
  }

  if (tree === null) {
    sessionTitle.textContent = "No session selected";
    sessionPath.textContent = "";
    stats.replaceChildren();
  } else {
    sessionTitle.textContent = tree.root.title;
    sessionPath.textContent = shortPath(tree.root.cwd);
    sessionPath.title = tree.root.cwd ?? "";
    const counts = countsOf(tree);
    stats.replaceChildren(
      stat("running", counts.running, "running"),
      stat("spawned", counts.spawned, counts.spawned === 1 ? "agent" : "agents"),
      stat("done", counts.done, "done"),
      stat("failed", counts.failed, "failed"),
      stat("tokens", counts.tokens, "tokens", compactNumber(counts.tokens)),
    );
    document.title = counts.running > 0 ? `(${counts.running}) pstack monitor` : "pstack monitor";
  }

  if (state.agent !== null) panel.update(state.nodes, now);
  renderBanner();
  renderLive();
}

function stat(kind: string, value: number, label: string, shown = String(value)): HTMLElement {
  return h("span", { class: "stat", attrs: { "data-kind": kind, "data-zero": String(value === 0) } }, h("b", { text: shown }), h("span", { text: ` ${label}` }));
}

function emptyState(indexing: boolean): HTMLElement {
  return h(
    "div",
    { class: "empty" },
    logo(),
    h("h2", { text: indexing ? "Reading recent transcripts…" : `No agent activity in the last ${state.server?.windowHours ?? 24} hours` }),
    h("p", {
      text: indexing
        ? "This takes a moment the first time."
        : "Start a Claude Code or Codex session. It appears here as soon as it writes its first message, and every agent it spawns joins the graph.",
    }),
  );
}

function renderBanner(): void {
  const messages: string[] = [];
  for (const source of state.health) {
    if (!source.present) continue;
    const name = SOURCE_NAME[source.source];
    if (source.state === "degraded") {
      messages.push(`${name}: ${source.shape} ${source.shape === 1 ? "record is" : "records are"} in a shape the monitor does not recognize, so some agents may be missing activity.`);
    } else if (source.unchecked.length > 0) {
      messages.push(`${name} ${source.unchecked.join(", ")} is newer than this monitor was checked against.`);
    }
  }
  const text = messages.join(" ");
  if (text.length === 0 || text === state.dismissed) {
    banner.hidden = true;
    return;
  }
  const dismiss = h("button", { class: "icon-button", title: "Dismiss", attrs: { type: "button", "aria-label": "Dismiss" } }, icon("close"));
  dismiss.addEventListener("click", () => {
    state.dismissed = text;
    banner.hidden = true;
  });
  banner.replaceChildren(icon("alert"), h("p", {}, text, " Run ", h("code", { text: "pstack-monitor doctor" }), " for details."), dismiss);
  banner.hidden = false;
}

function setConnection(next: Connection): void {
  if (state.connection === next) return;
  const wasExpired = state.connection === "expired";
  state.connection = next;
  if (wasExpired || next === "expired") render();
  else renderLive();
}

function renderLive(): void {
  const indexing = state.server?.indexing === true;
  const shown: Connection | "indexing" = state.connection === "live" && indexing ? "indexing" : state.connection;
  live.dataset.state = shown;
  liveText.textContent = {
    connecting: "Connecting…",
    live: "Live",
    indexing: "Indexing…",
    retrying: "Reconnecting…",
    expired: "Link expired",
  }[shown];
  live.title = shown === "expired" ? "The monitor restarted. Run `pstack-monitor start` and open the new link." : "";
}

// --- clocks and keys -------------------------------------------------------

window.setInterval(() => {
  const now = Date.now();
  canvas.tick(now);
  panel.tick(now);
}, 1_000);

window.setInterval(() => render(), 30_000);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (document.body.dataset.rail === "open") toggleRail(false);
  else if (state.agent !== null) selectAgent(null);
});

matchMedia("(min-width: 1100px)").addEventListener("change", () => {
  canvas.setRightInset(state.agent !== null && wide() ? PANEL_WIDTH : 0);
});

connect();
