import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LANES_DIR_VAR, lanesRoot, openLaneJournal } from "./flex-journal.ts";
import type { RunnerOptions, RunnerReceipt } from "./types.ts";

let scratch = "";

const options: RunnerOptions = {
  parent: "codex",
  provider: "claude",
  model: "fable",
  effort: "max",
  mode: "read-only",
  promptPath: "/repo/prompt.md",
  cwd: "/repo",
  outputPath: "/repo/out.md",
  receiptPath: "/repo/receipt.json",
  timeoutMs: null,
};

const receipt = { schemaVersion: 1, status: "complete" } as unknown as RunnerReceipt;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "pstack-journal-"));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("openLaneJournal", () => {
  it("records the head of the prompt, and nothing when it cannot be read", () => {
    const root = join(scratch, "lanes");
    mkdirSync(root);
    const promptPath = join(scratch, "prompt.md");
    writeFileSync(promptPath, `Judge   the\ncandidates.\n${"x".repeat(400)}`);
    openLaneJournal({ ...options, promptPath }, Date.now(), { [LANES_DIR_VAR]: root });
    openLaneJournal(options, Date.now() + 1, { [LANES_DIR_VAR]: root });
    const heads = readdirSync(root)
      .map((lane) => JSON.parse(readFileSync(join(root, lane, "lane.json"), "utf8")).promptHead as string | null)
      .sort((a, b) => (a === null ? -1 : b === null ? 1 : 0));
    expect(heads[0]).toBeNull();
    expect(heads[1]).toStartWith("Judge the candidates. xxx");
    expect(heads[1]).toHaveLength(300);
  });

  it("defaults under the user's pstack-flex directory and honors an override", () => {
    expect(lanesRoot({})).toEndWith(join(".pstack-flex", "lanes"));
    expect(lanesRoot({ [LANES_DIR_VAR]: "/elsewhere" })).toBe("/elsewhere");
  });

  it("is a no-op when the lanes directory is missing", () => {
    const tap = openLaneJournal(options, Date.now(), { [LANES_DIR_VAR]: join(scratch, "missing") });
    expect(tap.stdout).toBeUndefined();
    tap.finish(receipt);
    expect(readdirSync(scratch)).toEqual([]);
  });

  it("names the parent session from the parent harness's own variable only", () => {
    const root = join(scratch, "lanes");
    mkdirSync(root);
    openLaneJournal(options, Date.now(), { [LANES_DIR_VAR]: root, CODEX_THREAD_ID: "thread-1", CLAUDE_CODE_SESSION_ID: "other" });
    const [lane] = readdirSync(root);
    expect(JSON.parse(readFileSync(join(root, lane!, "lane.json"), "utf8"))).toMatchObject({
      parent: "codex",
      parentSessionId: "thread-1",
      label: null,
    });
  });

  it("writes stdout bytes exactly and never throws after the journal is gone", () => {
    const root = join(scratch, "lanes");
    mkdirSync(root);
    const tap = openLaneJournal(options, Date.now(), { [LANES_DIR_VAR]: root });
    const bytes = new TextEncoder().encode('{"type":"result","result":"héllo ✓"}\n');
    tap.stdout?.(bytes.subarray(0, 20));
    tap.stdout?.(bytes.subarray(20));
    const [lane] = readdirSync(root);
    expect(readFileSync(join(root, lane!, "stream.jsonl"))).toEqual(Buffer.from(bytes));
    rmSync(root, { recursive: true, force: true });
    expect(() => tap.finish(receipt)).not.toThrow();
    expect(() => tap.stdout?.(bytes)).not.toThrow();
  });
});
