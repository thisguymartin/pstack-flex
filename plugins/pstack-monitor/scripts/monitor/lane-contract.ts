// pstack-flex addition. The lane journal is the only interface between the
// pstack plugin's runner (which writes it) and this plugin (which reads it).
// The two plugins install separately, so this file restates the runner's
// shapes; lane-contract.test.ts fails in the repository when they drift.

// Types only: the web page imports these through domain.ts and has no Node types.
// lanesRoot lives in sources.ts.

export const LANES_DIR_VAR = "PSTACK_FLEX_LANES_DIR";

export type Parent = "claude" | "codex";
export type Provider = "claude" | "codex" | "grok" | "deepseek" | "minimax";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type AccessMode = "read-only" | "isolated-write";

export type ReceiptStatus =
  | "complete"
  | "cancelled"
  | "unavailable-cli"
  | "unauthenticated"
  | "unavailable-model"
  | "timed-out"
  | "child-failed"
  | "malformed-output";

export interface NormalizedUsage {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly cacheCreationInputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
  readonly totalTokens?: number;
}

/** `lane.json`: written once when the lane starts. */
export interface LaneRecord {
  readonly schemaVersion: 1;
  readonly laneId: string;
  readonly runnerPid: number;
  readonly startedAt: string;
  readonly parent: Parent;
  readonly parentSessionId: string | null;
  readonly provider: Provider;
  readonly model: string;
  readonly effort: Effort;
  readonly mode: AccessMode;
  readonly label: string | null;
  readonly cwd: string;
  readonly promptPath: string;
  readonly promptHead: string | null;
  readonly outputPath: string;
  readonly receiptPath: string;
}

/** The fields of `receipt.json` (a copy of the runner's receipt) that the monitor reads. */
export interface LaneReceipt {
  readonly schemaVersion: 1;
  readonly status: ReceiptStatus;
  readonly parent: Parent;
  readonly provider: Provider;
  readonly model: string;
  readonly effort: Effort;
  readonly mode: AccessMode;
  readonly completedAt: string;
  readonly reportedModel: string | null;
  readonly usage: NormalizedUsage | null;
  readonly error: { readonly message: string; readonly evidence: string } | null;
}
