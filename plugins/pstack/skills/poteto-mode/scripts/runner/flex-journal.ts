import { randomBytes } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AccessMode, Effort, Parent, Provider, RunnerOptions, RunnerReceipt } from "./types.ts";

// pstack-flex addition. An opt-in journal of each external lane, so the agent
// monitor can show a lane while it runs. Journaling is on only when the lanes
// directory exists; `pstack-monitor journal on` creates it. A journal failure
// never changes the lane's receipt, exit code, or output.

export const LANES_DIR_VAR = "PSTACK_FLEX_LANES_DIR";
const PROMPT_HEAD_CHARS = 300;

// The parent harness's own session id, inherited by the runner from the tool that launched it.
const PARENT_SESSION_VAR: Record<Parent, string> = {
  claude: "CLAUDE_CODE_SESSION_ID",
  codex: "CODEX_THREAD_ID",
};

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
  /** The start of the prompt, so the monitor can say what the lane was asked. */
  readonly promptHead: string | null;
  readonly outputPath: string;
  readonly receiptPath: string;
}

export interface LaneTap {
  /** Receives the child's stdout as it arrives; undefined when journaling is off. */
  readonly stdout: ((chunk: Uint8Array) => void) | undefined;
  finish(receipt: RunnerReceipt): void;
}

const OFF: LaneTap = { stdout: undefined, finish() {} };

export function lanesRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env[LANES_DIR_VAR];
  return configured !== undefined && configured.trim().length > 0
    ? configured
    : join(homedir(), ".pstack-flex", "lanes");
}

function promptHead(path: string): string | null {
  try {
    const head = readFileSync(path, "utf8").slice(0, PROMPT_HEAD_CHARS * 4).replace(/\s+/g, " ").trim();
    return head.length === 0 ? null : head.slice(0, PROMPT_HEAD_CHARS);
  } catch {
    return null;
  }
}

function writeAtomic(path: string, value: unknown): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

export function openLaneJournal(
  options: RunnerOptions,
  started: number,
  env: NodeJS.ProcessEnv = process.env
): LaneTap {
  const laneId = `${started.toString(36)}-${process.pid.toString(36)}-${randomBytes(3).toString("hex")}`;
  const dir = join(lanesRoot(env), laneId);
  let descriptor: number | null = null;
  try {
    // Not recursive: a missing lanes directory means journaling is off.
    mkdirSync(dir, { mode: 0o700 });
    const session = env[PARENT_SESSION_VAR[options.parent]];
    const record: LaneRecord = {
      schemaVersion: 1,
      laneId,
      runnerPid: process.pid,
      startedAt: new Date(started).toISOString(),
      parent: options.parent,
      parentSessionId: session !== undefined && session.length > 0 ? session : null,
      provider: options.provider,
      model: options.model,
      effort: options.effort,
      mode: options.mode,
      label: options.label ?? null,
      cwd: options.cwd,
      promptPath: options.promptPath,
      promptHead: promptHead(options.promptPath),
      outputPath: options.outputPath,
      receiptPath: options.receiptPath,
    };
    writeAtomic(join(dir, "lane.json"), record);
    descriptor = openSync(join(dir, "stream.jsonl"), "a", 0o600);
  } catch {
    if (descriptor !== null) closeSync(descriptor);
    return OFF;
  }

  let open: number | null = descriptor;
  const close = (): void => {
    if (open === null) return;
    try {
      closeSync(open);
    } catch {
      // Already closed; nothing to recover.
    }
    open = null;
  };
  return {
    stdout(chunk) {
      if (open === null) return;
      try {
        let written = 0;
        while (written < chunk.length) written += writeSync(open, chunk, written);
      } catch {
        // A full disk or revoked directory stops the journal, never the lane.
        close();
      }
    },
    finish(receipt) {
      close();
      try {
        writeAtomic(join(dir, "receipt.json"), receipt);
      } catch {
        // The canonical receipt is already written; the journal copy is a convenience.
      }
    },
  };
}
