import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { parseArgs } from "./cli.ts";

function argv(extra: readonly string[] = []): string[] {
  return [
    "--parent",
    "claude",
    "--provider",
    "codex",
    "--model",
    "gpt-5.6-sol",
    "--effort",
    "max",
    "--mode",
    "read-only",
    "--prompt",
    join(process.cwd(), "prompt.md"),
    "--cwd",
    process.cwd(),
    "--output",
    join(process.cwd(), "output.md"),
    "--receipt",
    join(process.cwd(), "receipt.json"),
    ...extra,
  ];
}

describe("runner CLI parsing", () => {
  it("does not invent a timeout", () => {
    expect(parseArgs(argv())?.timeoutMs).toBeNull();
  });

  it("honors an explicit positive timeout", () => {
    expect(parseArgs(argv(["--timeout", "5400"]))?.timeoutMs).toBe(5_400_000);
  });

  it("rejects a non-positive timeout", () => {
    expect(() => parseArgs(argv(["--timeout", "0"]))).toThrow(
      "greater than zero"
    );
  });

  it("accepts gateway providers", () => {
    const parsed = parseArgs([
      ...argv().map((value, index, all) =>
        all[index - 1] === "--provider"
          ? "minimax"
          : all[index - 1] === "--model"
            ? "MiniMax-M3"
            : value
      ),
    ]);
    expect(parsed?.provider).toBe("minimax");
    expect(parsed?.model).toBe("MiniMax-M3");
  });

  it("passes a namespaced OpenRouter model through unchanged", () => {
    const parsed = parseArgs(
      argv().map((value, index, all) =>
        all[index - 1] === "--provider"
          ? "openrouter"
          : all[index - 1] === "--model"
            ? "moonshotai/kimi-k3"
            : value
      )
    );
    expect(parsed?.provider).toBe("openrouter");
    expect(parsed?.model).toBe("moonshotai/kimi-k3");
  });

  it("passes an OpenCode model with its provider through unchanged", () => {
    const parsed = parseArgs(
      argv().map((value, index, all) =>
        all[index - 1] === "--provider"
          ? "opencode"
          : all[index - 1] === "--model"
            ? "openrouter/z-ai/glm-5.3"
            : value
      )
    );
    expect(parsed?.provider).toBe("opencode");
    expect(parsed?.model).toBe("openrouter/z-ai/glm-5.3");
  });

  it("accepts OpenCode as a parent", () => {
    const parsed = parseArgs(
      argv().map((value, index, all) =>
        all[index - 1] === "--parent" ? "opencode" : value
      )
    );
    expect(parsed?.parent).toBe("opencode");
    expect(() =>
      parseArgs(
        argv().map((value, index, all) =>
          all[index - 1] === "--parent" ? "cursor" : value
        )
      )
    ).toThrow("claude, codex, opencode");
  });

  it("takes an optional display label and nothing else from it", () => {
    expect(parseArgs(argv())?.label).toBeUndefined();
    expect(parseArgs(argv(["--label", "  arena cross-judge  "]))?.label).toBe("arena cross-judge");
    expect(parseArgs(argv(["--label", "   "]))?.label).toBeUndefined();
    expect(parseArgs(argv(["--label", "x".repeat(500)]))?.label).toHaveLength(120);
  });

  it("names the gateway providers in the provider rejection", () => {
    expect(() =>
      parseArgs(
        argv().map((value, index, all) =>
          all[index - 1] === "--provider" ? "gemini" : value
        )
      )
    ).toThrow("deepseek, minimax, openrouter");
  });
});
