import type { AgentId, AgentNode } from "../domain.ts";
import { ago, kindLabel } from "../format.ts";
import { isLive } from "../graph.ts";
import { h, icon, providerIcon } from "./dom.ts";

// pstack-flex addition. The session list: live sessions first, then recent ones.

export interface RailEvents {
  select(root: AgentId): void;
}

export interface Descendants {
  readonly total: number;
  readonly running: number;
}

function folderName(cwd: string | null): string {
  if (cwd === null) return "";
  const parts = cwd.split("/").filter((part) => part.length > 0);
  return parts.at(-1) ?? cwd;
}

export class Rail {
  readonly element: HTMLElement;
  private readonly live: HTMLUListElement;
  private readonly earlier: HTMLUListElement;
  private readonly liveGroup: HTMLElement;
  private readonly earlierGroup: HTMLElement;
  private readonly count: HTMLElement;
  private readonly foot: HTMLElement;
  private readonly empty: HTMLElement;

  constructor(private readonly events: RailEvents) {
    this.count = h("span", { class: "rail-count" });
    this.live = h("ul", { class: "sessions" });
    this.earlier = h("ul", { class: "sessions" });
    this.liveGroup = h("section", { class: "rail-group" }, h("h2", { class: "rail-heading", text: "Live now" }), this.live);
    this.earlierGroup = h("section", { class: "rail-group" }, h("h2", { class: "rail-heading", text: "Earlier" }), this.earlier);
    this.empty = h("p", { class: "rail-empty", text: "Sessions appear here once Claude Code or Codex writes a transcript." });
    this.foot = h("p", { class: "rail-foot" });
    this.element = h(
      "nav",
      { class: "rail", attrs: { "aria-label": "Sessions" } },
      h("header", { class: "rail-head" }, h("span", { class: "rail-title", text: "Sessions" }), this.count),
      h("div", { class: "rail-scroll" }, this.liveGroup, this.earlierGroup, this.empty),
      this.foot,
    );
  }

  render(
    roots: readonly AgentNode[],
    descendants: ReadonlyMap<AgentId, Descendants>,
    selected: AgentId | null,
    now: number,
    footer: string,
  ): void {
    const live = roots.filter(isLive);
    const earlier = roots.filter((root) => !isLive(root));
    this.live.replaceChildren(...live.map((root) => this.row(root, descendants.get(root.id), root.id === selected, now)));
    this.earlier.replaceChildren(...earlier.map((root) => this.row(root, descendants.get(root.id), root.id === selected, now)));
    this.liveGroup.hidden = live.length === 0;
    this.earlierGroup.hidden = earlier.length === 0;
    this.empty.hidden = roots.length > 0;
    this.count.textContent = String(roots.length);
    this.foot.textContent = footer;
  }

  private row(root: AgentNode, counts: Descendants | undefined, selected: boolean, now: number): HTMLElement {
    const folder = folderName(root.cwd);
    const when = ago(root.lastActivityAt, now);
    const meta = [folder, when].filter((part) => part.length > 0).join(" · ");
    const total = counts?.total ?? 0;
    const running = counts?.running ?? 0;
    const button = h(
      "button",
      {
        class: "session",
        title: `${root.title}\n${kindLabel(root)}${root.cwd === null ? "" : `\n${root.cwd}`}`,
        attrs: {
          type: "button",
          "data-status": root.status.kind,
          "data-evidence": root.status.kind === "running" || root.status.kind === "idle" ? root.status.evidence : "",
          "data-harness": root.harness,
          ...(selected ? { "aria-current": "true" } : {}),
        },
      },
      h("span", { class: "session-glyph" }, icon(providerIcon(root.harness))),
      h("span", { class: "session-text" }, h("span", { class: "session-title", text: root.title }), h("span", { class: "session-meta", text: meta })),
      h(
        "span",
        {
          class: "session-side",
          attrs: { "aria-label": `${total} ${total === 1 ? "agent" : "agents"}${running > 0 ? `, ${running} running` : ""}` },
        },
        total > 0 ? h("span", { class: "session-count", attrs: { "data-running": String(running > 0) } }, icon("agent"), h("span", { text: String(total) })) : null,
        h("span", { class: "session-dot", attrs: { "aria-hidden": "true" } }),
      ),
    );
    button.addEventListener("click", () => this.events.select(root.id));
    return h("li", {}, button);
  }
}
