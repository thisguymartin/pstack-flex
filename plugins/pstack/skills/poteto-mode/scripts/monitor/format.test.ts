import { describe, expect, it } from "bun:test";
import { ago, compactNumber, duration, prettyModel, shortPath, summarizeInput } from "./format.ts";

describe("format", () => {
  it("compacts token counts", () => {
    expect([999, 1_000, 1_250, 12_400, 412_000, 1_200_000].map(compactNumber)).toEqual(["999", "1k", "1.3k", "12k", "412k", "1.2M"]);
  });

  it("formats durations and ages", () => {
    expect(duration(8_000)).toBe("8s");
    expect(duration(134_000)).toBe("2m 14s");
    expect(duration(3 * 3_600_000 + 5 * 60_000)).toBe("3h 05m");
    const now = Date.parse("2026-10-01T12:00:00Z");
    expect(ago("2026-10-01T11:59:55Z", now)).toBe("just now");
    expect(ago("2026-10-01T11:56:00Z", now)).toBe("4m ago");
    expect(ago(null, now)).toBe("");
  });

  it("shortens Claude model slugs and leaves others alone", () => {
    expect(prettyModel(["claude", "opus", "5", "5"].join("-"))).toBe("opus 5.5");
    expect(prettyModel("gpt-6.1-sol")).toBe("gpt-6.1-sol");
    expect(prettyModel(null)).toBeNull();
  });

  it("summarizes tool input by its most telling field", () => {
    expect(summarizeInput('{\n  "command": "git status --short",\n  "description": "x"\n}')).toBe("git status --short");
    expect(summarizeInput('{"file_path": "/repo/a.ts"')).toBe('{"file_path": "/repo/a.ts"');
    expect(summarizeInput("ls -la\nmore")).toBe("ls -la");
  });

  it("keeps the last two path segments", () => {
    expect(shortPath("/Users/me/workspace/pstack-flex")).toBe("…/workspace/pstack-flex");
    expect(shortPath("/repo")).toBe("/repo");
  });
});
