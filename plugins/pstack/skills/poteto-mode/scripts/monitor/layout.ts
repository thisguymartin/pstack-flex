import type { AgentId, AgentNode } from "./domain.ts";
import type { Tree } from "./graph.ts";

// pstack-flex addition. Left-to-right tree layout. Columns are spawn depth;
// leaves take consecutive rows and parents center on their children, so a
// new child appends below its siblings instead of reshuffling the canvas.

export const CARD_WIDTH = 264;
export const CARD_HEIGHT = 64;
export const ROOT_WIDTH = 304;
export const ROOT_HEIGHT = 80;
export const COLUMN_GAP = 112;
export const ROW_GAP = 24;
/** Room under a card for its model node and label. */
export const SATELLITE_SPACE = 76;

export interface Placed {
  readonly id: AgentId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly satellite: boolean;
}

export interface Edge {
  readonly from: AgentId;
  readonly to: AgentId;
}

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Layout {
  readonly placed: ReadonlyMap<AgentId, Placed>;
  readonly edges: readonly Edge[];
  readonly bounds: Bounds;
}

/** The root column is wider than the rest. */
export function columnX(depth: number): number {
  return depth === 0 ? 0 : ROOT_WIDTH + COLUMN_GAP + (depth - 1) * (CARD_WIDTH + COLUMN_GAP);
}

export function layout(tree: Tree, hasSatellite: (node: AgentNode) => boolean): Layout {
  const placed = new Map<AgentId, Placed>();
  const edges: Edge[] = [];
  let cursor = 0;

  // Returns the vertical center of the node's card.
  const place = (node: AgentNode, depth: number): number => {
    const height = node === tree.root ? ROOT_HEIGHT : CARD_HEIGHT;
    const satellite = hasSatellite(node);
    const slot = height + (satellite ? SATELLITE_SPACE : 0);
    const children = (tree.children.get(node.id) ?? []).filter((child) => tree.depth.get(child.id) === depth + 1);
    let center: number;
    if (children.length === 0) {
      center = cursor + height / 2;
      cursor += slot + ROW_GAP;
    } else {
      const start = cursor;
      const centers = children.map((child) => {
        edges.push({ from: node.id, to: child.id });
        return place(child, depth + 1);
      });
      center = (centers[0]! + centers[centers.length - 1]!) / 2;
      // A parent's own card and model node must not reach past its subtree.
      const top = center - height / 2;
      if (top < start) center += start - top;
      cursor = Math.max(cursor, center - height / 2 + slot + ROW_GAP);
    }
    placed.set(node.id, {
      id: node.id,
      x: columnX(depth),
      y: Math.round(center - height / 2),
      width: node === tree.root ? ROOT_WIDTH : CARD_WIDTH,
      height,
      satellite,
    });
    return center;
  };

  place(tree.root, 0);
  let maxX = 0;
  let maxY = 0;
  for (const node of placed.values()) {
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height + (node.satellite ? SATELLITE_SPACE : 0));
  }
  return { placed, edges, bounds: { x: 0, y: 0, width: maxX, height: maxY } };
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A cubic connector from a parent's output port to a child's input port. */
export function connector(from: Box, to: Box): string {
  const x1 = from.x + from.width;
  const y1 = from.y + from.height / 2;
  const x2 = to.x;
  const y2 = to.y + to.height / 2;
  const bend = Math.max(48, (x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}
