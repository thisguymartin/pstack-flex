import type { AgentId, AgentNode, Clipped, MessageLink, TimelineItem } from "../domain.ts";
import { clockTime, compactNumber, duration, kindLabel, modelOf, prettyModel, shortPath, statusLine, summarizeInput } from "../format.ts";
import type { TimelinePage } from "../wire.ts";
import { h, icon, providerIcon, toolIcon, type IconName } from "./dom.ts";

// pstack-flex addition. The drill-down: one agent's facts and its timeline,
// streaming while the agent works.

const STICK_THRESHOLD = 40;
const LOAD_OLDER_THRESHOLD = 160;
const CLAMP_CHARS = 700;

export interface PanelEvents {
  close(): void;
  select(id: AgentId): void;
  loadOlder(agent: AgentId, before: number): Promise<TimelinePage | null>;
}

type ToolCall = Extract<TimelineItem, { kind: "tool-call" }>;
type ToolResult = Extract<TimelineItem, { kind: "tool-result" }>;

function itemOrder(item: TimelineItem): [number, number] {
  const [offset, index] = item.id.split(".");
  return [Number(offset), Number(index ?? 0)];
}

function compareItems(a: TimelineItem, b: TimelineItem): number {
  const [ao, ai] = itemOrder(a);
  const [bo, bi] = itemOrder(b);
  return ao === bo ? ai - bi : ao - bo;
}

function clippedNote(body: Clipped): HTMLElement | null {
  return body.omitted > 0
    ? h("p", { class: "t-clipped", text: `${body.omitted.toLocaleString()} more characters not shown` })
    : null;
}

export class Panel {
  readonly element: HTMLElement;
  private readonly glyph: HTMLElement;
  private readonly title: HTMLElement;
  private readonly kind: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly facts: HTMLElement;
  private readonly note: HTMLElement;
  private readonly scroller: HTMLElement;
  private readonly list: HTMLOListElement;
  private readonly olderButton: HTMLButtonElement;
  private readonly jump: HTMLButtonElement;
  private readonly emptyNote: HTMLElement;
  private agent: AgentNode | null = null;
  private nodes: ReadonlyMap<AgentId, AgentNode> = new Map();
  private links: readonly MessageLink[] = [];
  private readonly items = new Map<string, TimelineItem>();
  private readonly expanded = new Set<string>();
  private older: number | null = null;
  private loaded = false;
  private loadingOlder = false;
  private stuck = true;

  constructor(private readonly events: PanelEvents) {
    this.glyph = h("span", { class: "panel-glyph" });
    this.title = h("h2", { class: "panel-title", attrs: { id: "panel-title" } });
    this.kind = h("p", { class: "panel-kind" });
    this.chip = h("p", { class: "status-chip" });
    this.facts = h("dl", { class: "facts" });
    this.note = h("p", { class: "panel-note", attrs: { hidden: "" } });
    const close = h("button", { class: "icon-button", title: "Close", attrs: { type: "button", "aria-label": "Close agent details" } }, icon("close"));
    close.addEventListener("click", () => this.events.close());
    this.olderButton = h("button", { class: "older", text: "Load earlier activity", attrs: { type: "button", hidden: "" } });
    this.olderButton.addEventListener("click", () => void this.loadOlder());
    this.list = h("ol", { class: "timeline-items" });
    this.emptyNote = h("p", { class: "timeline-empty", attrs: { hidden: "" } });
    this.scroller = h("div", { class: "timeline", attrs: { tabindex: "0", "aria-label": "Activity" } }, this.olderButton, this.list, this.emptyNote);
    this.scroller.addEventListener("scroll", () => this.onScroll(), { passive: true });
    this.jump = h("button", { class: "jump", attrs: { type: "button", hidden: "" } }, icon("arrowDown"), h("span", { text: "New activity" }));
    this.jump.addEventListener("click", () => this.scrollToEnd(true));
    this.element = h(
      "aside",
      { class: "panel", attrs: { "aria-labelledby": "panel-title", "data-open": "false" } },
      h(
        "header",
        { class: "panel-head" },
        h("div", { class: "panel-identity" }, this.glyph, h("div", { class: "panel-names" }, this.title, this.kind), close),
        this.chip,
        this.facts,
        this.note,
      ),
      this.scroller,
      this.jump,
    );
  }

  get current(): AgentId | null {
    return this.agent?.id ?? null;
  }

  open(node: AgentNode, nodes: ReadonlyMap<AgentId, AgentNode>, now: number): void {
    const switched = this.agent?.id !== node.id;
    this.agent = node;
    this.nodes = nodes;
    if (switched) {
      this.items.clear();
      this.expanded.clear();
      this.older = null;
      this.loaded = false;
      this.stuck = true;
      this.list.replaceChildren(this.skeleton());
      this.emptyNote.hidden = true;
      this.olderButton.hidden = true;
      this.jump.hidden = true;
    }
    this.element.dataset.open = "true";
    this.renderHeader(now);
  }

  close(): void {
    this.agent = null;
    this.element.dataset.open = "false";
  }

  update(nodes: ReadonlyMap<AgentId, AgentNode>, now: number, links: readonly MessageLink[]): void {
    if (this.agent === null) return;
    this.nodes = nodes;
    this.links = links;
    const latest = nodes.get(this.agent.id);
    if (latest !== undefined) this.agent = latest;
    this.renderHeader(now);
    if (this.loaded) this.renderItems(false);
  }

  setPage(page: TimelinePage): void {
    if (page.agent !== this.agent?.id) return;
    this.items.clear();
    for (const item of page.items) this.items.set(item.id, item);
    this.older = page.older;
    this.loaded = true;
    this.renderItems(false);
    this.scrollToEnd(false);
  }

  append(agent: AgentId, items: readonly TimelineItem[]): void {
    if (agent !== this.agent?.id || !this.loaded) return;
    for (const item of items) this.items.set(item.id, item);
    this.renderItems(false);
    if (this.stuck) this.scrollToEnd(false);
    else this.jump.hidden = false;
  }

  tick(now: number): void {
    if (this.agent === null) return;
    if (this.agent.status.kind === "running" || this.agent.status.kind === "idle") this.renderHeader(now);
  }

  private renderHeader(now: number): void {
    const node = this.agent;
    if (node === null) return;
    this.element.dataset.harness = node.harness;
    this.element.dataset.provider = node.model.provider;
    const glyphName = node.flavor.kind === "session" ? providerIcon(node.harness) : providerIcon(node.model.provider);
    if (this.glyph.dataset.icon !== glyphName) {
      this.glyph.dataset.icon = glyphName;
      this.glyph.replaceChildren(icon(glyphName));
    }
    this.title.textContent = node.title;
    this.kind.textContent = kindLabel(node);
    this.chip.dataset.status = node.status.kind;
    this.chip.replaceChildren(icon(statusIcon(node)), h("span", { text: statusLine(node, now) }));

    const rows: [string, Node | string][] = [];
    const model = modelOf(node);
    if (model !== null) {
      const requested = prettyModel(node.model.requested);
      const reported = prettyModel(node.model.reported);
      rows.push(["Model", requested !== null && reported !== null && requested !== reported ? `${reported} (asked for ${requested})` : model]);
    }
    if (node.model.effort !== null) rows.push(["Effort", node.model.effort]);
    if (node.startedAt !== null) rows.push(["Started", `${clockTime(node.startedAt)}`]);
    const span = elapsed(node, now);
    if (span !== null) rows.push([node.status.kind === "running" ? "Running for" : "Took", duration(span)]);
    if (node.usage !== null) {
      const input = node.usage.inputTokens ?? 0;
      const output = node.usage.outputTokens ?? 0;
      const cached = node.usage.cachedInputTokens ?? 0;
      rows.push(["Tokens", `${compactNumber(input)} in · ${compactNumber(output)} out${cached > 0 ? ` · ${compactNumber(cached)} cached` : ""}`]);
    }
    const parent = node.parent === null ? undefined : this.nodes.get(node.parent);
    if (parent !== undefined) {
      const link = h("button", { class: "link", text: parent.title, attrs: { type: "button" } });
      link.addEventListener("click", () => this.events.select(parent.id));
      rows.push(["Spawned by", link]);
    }
    const sent = this.links.filter((link) => link.from === node.id).reduce((sum, link) => sum + link.count, 0);
    const received = this.links.filter((link) => link.to === node.id).reduce((sum, link) => sum + link.count, 0);
    if (sent + received > 0) rows.push(["Messages", `${sent} sent · ${received} received`]);
    if (node.cwd !== null) rows.push(["Folder", h("span", { class: "mono", text: shortPath(node.cwd), title: node.cwd })]);
    this.facts.replaceChildren(...rows.flatMap(([term, value]) => [h("dt", { text: term }), h("dd", {}, value)]));

    const notes: string[] = [];
    if (node.status.kind === "unknown") notes.push(capitalize(node.status.why));
    if (node.flavor.kind === "lane" && node.flavor.stream === "at-exit") {
      notes.push("This CLI reports its whole response when it exits, so activity appears at the end.");
    }
    if (node.health === "degraded") notes.push("Some of this agent's records are in a shape the monitor does not recognize.");
    this.note.textContent = notes.join(" ");
    this.note.hidden = notes.length === 0;
  }

  private renderItems(prepended: boolean): void {
    const node = this.agent;
    if (node === null) return;
    const previousHeight = this.scroller.scrollHeight;
    const sorted = [...this.items.values()].sort(compareItems);
    const calls = new Set<string>();
    const results = new Map<string, ToolResult>();
    for (const item of sorted) if (item.kind === "tool-call") calls.add(item.callId);
    for (const item of sorted) if (item.kind === "tool-result" && calls.has(item.callId)) results.set(item.callId, item);
    const spawned = new Map<string, AgentNode>();
    for (const candidate of this.nodes.values()) {
      if (candidate.parent === node.id && candidate.spawnCall !== null) spawned.set(candidate.spawnCall, candidate);
    }

    const rows: HTMLElement[] = [];
    let unparsed: { count: number; types: Set<string> } | null = null;
    const flushUnparsed = (): void => {
      if (unparsed === null) return;
      const types = [...unparsed.types].join(", ");
      rows.push(row("unparsed", "question", h("p", {
        class: "t-quiet",
        text: `${unparsed.count} unrecognized ${unparsed.count === 1 ? "record" : "records"}${types.length > 0 ? ` (${types})` : ""}`,
      })));
      unparsed = null;
    };
    for (const item of sorted) {
      if (item.kind === "unparsed") {
        unparsed ??= { count: 0, types: new Set() };
        unparsed.count += 1;
        if (item.recordType !== null) unparsed.types.add(item.recordType);
        continue;
      }
      flushUnparsed();
      if (item.kind === "tool-result" && calls.has(item.callId)) continue;
      rows.push(this.renderItem(item, results, spawned));
    }
    flushUnparsed();

    this.list.replaceChildren(...rows);
    this.olderButton.hidden = this.older === null;
    this.emptyNote.hidden = rows.length > 0;
    this.emptyNote.textContent = node.flavor.kind === "lane" && node.flavor.stream === "at-exit"
      ? "Waiting for this lane to finish; its CLI prints everything at exit."
      : "No activity recorded for this agent yet.";
    if (prepended) this.scroller.scrollTop += this.scroller.scrollHeight - previousHeight;
  }

  private renderItem(item: TimelineItem, results: ReadonlyMap<string, ToolResult>, spawned: ReadonlyMap<string, AgentNode>): HTMLElement {
    switch (item.kind) {
      case "prompt":
        return row("prompt", "user", head("Prompt", item.at), this.longText(item.id, item.body));
      case "text":
        return row("text", "reply", head("Response", item.at), this.longText(item.id, item.body));
      case "thinking": {
        if (item.body === null) return row("thinking", "thought", head("Thinking", item.at, h("span", { class: "t-quiet", text: "not recorded" })));
        const open = this.expanded.has(item.id);
        const toggle = this.toggle(item.id, "Thinking", item.at, open);
        return row("thinking", "thought", toggle, open ? h("div", {}, h("p", { class: "t-text t-thinking", text: item.body.text }), clippedNote(item.body)) : null);
      }
      case "tool-call":
        return this.toolRow(item, results.get(item.callId) ?? null, spawned.get(item.callId) ?? null);
      case "tool-result": {
        const open = this.expanded.has(item.id);
        return row(
          "tool",
          item.ok === false ? "alert" : "tool",
          this.toggle(item.id, "Result", item.at, open),
          open ? h("div", {}, h("pre", { class: "t-pre", text: item.output.text }), clippedNote(item.output)) : null,
        );
      }
      case "notice":
        return row(item.level === "error" ? "error" : "notice", item.level === "error" ? "alert" : "info", h("p", { class: "t-notice", text: item.text }));
      case "unparsed":
        return row("unparsed", "question", h("p", { class: "t-quiet", text: "unrecognized record" }));
    }
  }

  private toolRow(call: ToolCall, result: ToolResult | null, child: AgentNode | null): HTMLElement {
    const open = this.expanded.has(call.id);
    const state = result === null ? "pending" : result.ok === false ? "error" : "ok";
    const summary = summarizeInput(call.input.text);
    const toggle = h(
      "button",
      { class: "t-toggle t-tool", attrs: { type: "button", "aria-expanded": String(open) } },
      icon(open ? "chevronDown" : "chevronRight", "icon t-chevron"),
      h("span", { class: "t-tool-name", text: call.name }),
      h("span", { class: "t-tool-summary mono", text: summary }),
      h("span", { class: "t-tool-state", attrs: { "data-state": state, "aria-label": state === "pending" ? "running" : state === "error" ? "failed" : "done" } }, icon(state === "pending" ? "spinner" : state === "error" ? "cross" : "check")),
      h("time", { class: "t-time", text: clockTime(call.at), attrs: { datetime: call.at ?? "" } }),
    );
    toggle.addEventListener("click", () => this.flip(call.id));
    const childLink = child === null ? null : (() => {
      const button = h(
        "button",
        { class: "t-child", attrs: { type: "button", "data-status": child.status.kind } },
        icon("agent"),
        h("span", { class: "t-child-title", text: child.title }),
        h("span", { class: "t-child-status", text: statusLine(child, Date.now()) }),
        icon("arrowRight"),
      );
      button.addEventListener("click", () => this.events.select(child.id));
      return button;
    })();
    const details = open
      ? h(
          "div",
          { class: "t-io" },
          h("p", { class: "t-io-label", text: "Input" }),
          h("pre", { class: "t-pre", text: call.input.text }),
          clippedNote(call.input),
          h("p", { class: "t-io-label", text: "Output" }),
          result === null
            ? h("p", { class: "t-quiet", text: "Waiting for output…" })
            : h("pre", { class: "t-pre", attrs: { "data-state": state }, text: result.output.text.length > 0 ? result.output.text : "(empty)" }),
          result === null ? null : clippedNote(result.output),
        )
      : null;
    return row("tool", toolIcon(call.name), toggle, childLink, details);
  }

  private longText(id: string, body: Clipped): HTMLElement {
    const long = body.text.length > CLAMP_CHARS || body.text.split("\n").length > 10;
    const open = this.expanded.has(id);
    const text = h("p", { class: "t-text", text: body.text });
    if (long && !open) text.classList.add("is-clamped");
    const more = long
      ? (() => {
          const button = h("button", { class: "t-more", text: open ? "Show less" : "Show all", attrs: { type: "button" } });
          button.addEventListener("click", () => this.flip(id));
          return button;
        })()
      : null;
    return h("div", {}, text, open ? clippedNote(body) : null, more);
  }

  private toggle(id: string, label: string, at: string | null, open: boolean): HTMLButtonElement {
    const button = h(
      "button",
      { class: "t-toggle", attrs: { type: "button", "aria-expanded": String(open) } },
      icon(open ? "chevronDown" : "chevronRight", "icon t-chevron"),
      h("span", { class: "t-label", text: label }),
      h("time", { class: "t-time", text: clockTime(at), attrs: { datetime: at ?? "" } }),
    );
    button.addEventListener("click", () => this.flip(id));
    return button;
  }

  private flip(id: string): void {
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
    const top = this.scroller.scrollTop;
    this.renderItems(false);
    this.scroller.scrollTop = top;
  }

  private skeleton(): HTMLElement {
    return h("li", { class: "t-skeleton", attrs: { "aria-hidden": "true" } }, h("span"), h("span"), h("span"));
  }

  private onScroll(): void {
    const distance = this.scroller.scrollHeight - this.scroller.scrollTop - this.scroller.clientHeight;
    this.stuck = distance < STICK_THRESHOLD;
    if (this.stuck) this.jump.hidden = true;
    if (this.scroller.scrollTop < LOAD_OLDER_THRESHOLD) void this.loadOlder();
  }

  private async loadOlder(): Promise<void> {
    const agent = this.agent;
    if (agent === null || this.older === null || this.loadingOlder) return;
    this.loadingOlder = true;
    this.olderButton.textContent = "Loading…";
    try {
      const page = await this.events.loadOlder(agent.id, this.older);
      if (page === null || this.agent?.id !== agent.id) return;
      for (const item of page.items) this.items.set(item.id, item);
      this.older = page.older;
      this.renderItems(true);
    } finally {
      this.loadingOlder = false;
      this.olderButton.textContent = "Load earlier activity";
    }
  }

  private scrollToEnd(smooth: boolean): void {
    this.scroller.scrollTo({ top: this.scroller.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    this.stuck = true;
    this.jump.hidden = true;
  }
}

function row(kind: string, iconName: IconName, ...content: (Node | null)[]): HTMLElement {
  return h("li", { class: "t", attrs: { "data-kind": kind } }, h("span", { class: "t-icon" }, icon(iconName)), h("div", { class: "t-body" }, ...content));
}

function head(label: string, at: string | null, extra: Node | null = null): HTMLElement {
  return h(
    "div",
    { class: "t-head" },
    h("span", { class: "t-label", text: label }),
    extra,
    h("time", { class: "t-time", text: clockTime(at), attrs: { datetime: at ?? "" } }),
  );
}

function statusIcon(node: AgentNode): IconName {
  switch (node.status.kind) {
    case "running":
      return "spinner";
    case "idle":
      return "pause";
    case "done":
      return "check";
    case "failed":
      return "cross";
    case "cancelled":
      return "stop";
    case "ended":
      return "dot";
    case "unknown":
      return "question";
  }
}

function elapsed(node: AgentNode, now: number): number | null {
  if (node.startedAt === null) return null;
  const start = Date.parse(node.startedAt);
  const status = node.status;
  const endIso = status.kind === "running"
    ? null
    : ("at" in status && status.at !== null ? status.at : node.lastActivityAt);
  const end = endIso === null ? now : Date.parse(endIso);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1)}`;
}
