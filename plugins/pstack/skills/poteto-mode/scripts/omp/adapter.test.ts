import { describe, expect, it, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseOmpOutput, ompCommand, supportedOmpVersion } from "./adapter.ts";
import { writePathAllowed } from "./guard.ts";
import { parseDescriptor, modelLab, readConfiguration } from "../configuration.ts";
import { validateOptions } from "../runner/run.ts";
import type { RunnerOptions } from "../runner/types.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(): RunnerOptions {
  const root = mkdtempSync(join(tmpdir(), "omp-unit-")); roots.push(root);
  const cwd = join(root, "work"); mkdirSync(cwd);
  const promptPath = join(root, "prompt"); writeFileSync(promptPath, "Synthetic prompt");
  return { parent: "omp", provider: "omp", model: "openrouter/anthropic/claude-test", effort: "high",
    cwd, promptPath, outputPath: join(root, "out"), receiptPath: join(root, "receipt"), mode: "read-only", timeoutMs: null };
}
function message(model = "anthropic/claude-test", stopReason = "stop") {
  return { type: "message_end", message: { role: "assistant", provider: "openrouter", model,
    stopReason, content: [{ type: "text", text: "Synthetic answer" }], usage: { input: 10, output: 5 } } };
}
const terminal = { type: "agent_end", isTerminal: true };
const stream = (...events: unknown[]) => events.map(event => JSON.stringify(event)).join("\n");

describe("OMP execution", () => {
  it("pins the tested release and supports explicitly disabled reasoning", () => {
    expect(supportedOmpVersion("omp/18.11.3\n")).toBe(true);
    expect(supportedOmpVersion("omp/18.11.4")).toBe(false);
    expect(parseDescriptor("omp:deepseek/deepseek-chat@off").kind).toBe("model");
    expect(() => parseDescriptor("codex:gpt-6-sol@off")).toThrow("require OMP");
  });
  it("keeps transport and model lab distinct", () => {
    const choice = parseDescriptor("omp:openrouter/anthropic/claude-test@high");
    expect(modelLab(choice)).toBe("claude");
    expect(choice.kind === "model" && choice.model).toBe("openrouter/anthropic/claude-test");
    expect(() => parseDescriptor("omp:openrouter/*@high")).toThrow("exact");
  });
  it("refuses alternate runtimes before creating output files", () => {
    const options = fixture();
    expect(() => validateOptions({ ...options, provider: "codex" })).toThrow("OMP-only");
    expect(() => validateOptions(options)).not.toThrow();
  });
  it("rejects implicit and non-OMP role assignments in OMP configuration", () => {
    const options = fixture();
    const config = join(options.cwd, "config"); mkdirSync(config);
    for (const descriptor of ["auto", "inherit-parent", "claude:opus@high"]) {
      writeFileSync(join(config, "pstack-models.md"), `how explorer: ${descriptor}\n`);
      expect(() => readConfiguration("omp", options.cwd, { PI_CODING_AGENT_DIR: config })).toThrow("explicit omp:");
    }
  });
  it("launches only OMP with a mandatory guard and no shell or native task", () => {
    const command = ompCommand(fixture());
    expect(command.command).toBe("omp");
    expect(command.args).toContain("--pstack-guard-required");
    expect(command.args[command.args.indexOf("--tools") + 1]).toBe("read,grep");
    expect(command.environment?.PSTACK_RUNTIME).toBe("omp");
  });
  it("preserves pinned evidence and counts only message_end usage", () => {
    const end = message();
    const result = parseOmpOutput(stream({ type: "session", id: "synthetic" }, end,
      { type: "turn_end", message: end.message }, terminal), fixture().model);
    expect(result.usage?.inputTokens).toBe(10);
    expect(result.reportedModel).toBeNull(); expect(result.costUsd).toBeNull();
  });
  it("rejects partial completion, truncation, errors and model substitution", () => {
    for (const events of [[message()], [message("other"), terminal], [message(undefined, "error"), terminal],
      [message(undefined, "length"), terminal], [message(undefined, "aborted"), terminal]]) {
      expect(() => parseOmpOutput(stream(...events), fixture().model)).toThrow();
    }
  });
  it("confines file tools, including symlinks and hardlinks", () => {
    const options = fixture();
    const outside = options.promptPath;
    expect(writePathAllowed(options.cwd, "src/new.ts")).toBe(true);
    expect(writePathAllowed(options.cwd, outside)).toBe(false);
    expect(writePathAllowed(options.cwd, ".git/config")).toBe(false);
    expect(writePathAllowed(options.cwd, ".omp/config.yml")).toBe(false);
    symlinkSync(outside, join(options.cwd, "link"));
    expect(writePathAllowed(options.cwd, "link")).toBe(false);
    linkSync(outside, join(options.cwd, "hardlink"));
    expect(writePathAllowed(options.cwd, "hardlink")).toBe(false);
    symlinkSync(join(options.cwd, "..", "not-created"), join(options.cwd, "dangling"));
    expect(writePathAllowed(options.cwd, "dangling")).toBe(false);
  });
});
