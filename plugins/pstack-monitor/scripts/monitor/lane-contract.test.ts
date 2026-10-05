import { describe, expect, it } from "bun:test";
import * as runnerJournal from "../../../pstack/skills/poteto-mode/scripts/runner/flex-journal.ts";
import type * as Runner from "../../../pstack/skills/poteto-mode/scripts/runner/types.ts";
import { LANES_DIR_VAR, type LaneReceipt, type LaneRecord } from "./lane-contract.ts";
import { lanesRoot } from "./sources.ts";
import type * as Monitor from "./lane-contract.ts";

// Repository-only check: the installed plugins never see each other's files.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const same = <T extends true>(): T => true as T;

same<Same<Monitor.Parent, Runner.Parent>>();
same<Same<Monitor.Provider, Runner.Provider>>();
same<Same<Monitor.Effort, Runner.Effort>>();
same<Same<Monitor.AccessMode, Runner.AccessMode>>();
same<Same<Monitor.ReceiptStatus, Runner.ReceiptStatus>>();
same<Same<Monitor.NormalizedUsage, Runner.NormalizedUsage>>();
same<Same<LaneRecord, runnerJournal.LaneRecord>>();
same<Same<LaneReceipt, Pick<Runner.RunnerReceipt, keyof LaneReceipt>>>();

describe("lane journal contract", () => {
  it("reads the lanes directory the runner writes", () => {
    expect(LANES_DIR_VAR).toBe(runnerJournal.LANES_DIR_VAR);
    expect(lanesRoot({})).toBe(runnerJournal.lanesRoot({}));
    expect(lanesRoot({ [LANES_DIR_VAR]: "/tmp/lanes" })).toBe(runnerJournal.lanesRoot({ [LANES_DIR_VAR]: "/tmp/lanes" }));
  });
});
