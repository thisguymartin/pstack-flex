import { afterEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configurationPaths, modelLab, parseDescriptor, parseModelSheet, readConfiguration } from "./configuration.ts";
import { HARNESSES, laneRoute } from "./harnesses.ts";

const fixtures: string[] = [];
afterEach(() => { for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true }); });

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "pstack-configuration-")));
  fixtures.push(root);
  const cwd = join(root, "repo");
  mkdirSync(cwd);
  execFileSync("git", ["init", "--quiet", cwd]);
  return { root, cwd, env: { HOME: join(root, "home") } };
}

function write(path: string, text: string) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

describe("configuration", () => {
  it("parses qualified IDs without losing catalog punctuation or lane order", () => {
    const sheet = parseModelSheet("# pstack model configuration\ninterrogate reviewers: openrouter:z-ai/glm-5.3:free@high, opencode:openrouter/~google/gemini-flash-latest@max, auto\n");
    expect(sheet["interrogate reviewers"].map((lane) => lane.descriptor)).toEqual([
      "openrouter:z-ai/glm-5.3:free@high", "opencode:openrouter/~google/gemini-flash-latest@max", "auto",
    ]);
    expect(parseDescriptor("claude:claude-fable-5-3@max")).toMatchObject({
      model: "fable", effort: "max", normalizedFrom: "claude:claude-fable-5-3@max",
    });
  });

  it("refuses malformed descriptors, model routers, duplicate and empty roles", () => {
    for (const value of ["fable", "claude:@high", "codex:gpt-6-sol@lowish", "future:model@high", "openrouter:openrouter/auto@high", "opencode:bare-model@high", "opencode:openrouter/openrouter/auto@high"]) {
      expect(() => parseDescriptor(value)).toThrow();
    }
    expect(() => parseModelSheet("how explorer: auto\nhow explorer: inherit-parent")).toThrow("duplicate");
    expect(() => parseModelSheet("how explorer: ")).toThrow("empty");
    expect(() => parseModelSheet("# no assignments")).toThrow("no role");
  });

  it("separates execution routes from model labs", () => {
    const pairs = [
      ["claude:fable@max", "opencode:anthropic/fable@max", "claude"],
      ["codex:gpt-6-sol@high", "opencode:openrouter/openai/gpt-6-sol@high", "codex"],
      ["deepseek:deepseek-flash@high", "openrouter:deepseek/deepseek-v4-pro@high", "deepseek"],
    ];
    for (const [direct, routed, lab] of pairs) {
      expect(modelLab(parseDescriptor(direct))).toBe(lab);
      expect(modelLab(parseDescriptor(routed))).toBe(lab);
    }
    for (const descriptor of ["opencode:opencode/glm-5.3@high", "opencode:amazon-bedrock/claude-fable@high"]) {
      expect(modelLab(parseDescriptor(descriptor))).toBeNull();
    }
    expect(modelLab(parseDescriptor("opencode:openrouter/~google/gemini-flash-latest@max"))).toBe("google");
    expect(laneRoute("claude", "claude")).toBe("native");
    expect(laneRoute("codex", "codex")).toBe("native");
    expect(laneRoute("codex", "claude")).toBe("external");
    expect(laneRoute("opencode", "opencode")).toBe("external");
    expect(laneRoute("opencode", "codex")).toBe("external");
    for (const harness of HARNESSES) expect(laneRoute(harness.id, null)).toBe("native");
  });

  it("uses host directories and their overrides without changing project paths", () => {
    const { cwd, env, root } = fixture();
    for (const harness of HARNESSES) {
      const paths = configurationPaths(harness.id, cwd, env);
      expect(paths.globalSheet).toBe(join(env.HOME, harness.configDirectory, "pstack-models.md"));
      expect(paths.projectSheet).toBe(join(cwd, harness.projectDirectory, "pstack-models.md"));
    }
    for (const [parent, key] of [["claude", "CLAUDE_CONFIG_DIR"], ["codex", "CODEX_HOME"]] as const) {
      const paths = configurationPaths(parent, cwd, { ...env, [key]: join(root, "override") });
      expect(paths.globalSheet).toBe(join(root, "override/pstack-models.md"));
    }
    expect(configurationPaths("opencode", cwd, { ...env, XDG_CONFIG_HOME: join(root, "xdg") }).globalSheet)
      .toBe(join(root, "xdg/opencode/pstack-models.md"));
  });

  it("selects one project sheet, returns to global after deletion, and never merges roles", () => {
    const { cwd, env } = fixture();
    for (const harness of HARNESSES) {
      const paths = configurationPaths(harness.id, cwd, env);
      if (paths.projectSheet === null) throw new Error("fixture must have a project sheet");
      write(paths.globalSheet, "how explorer: codex:gpt-6-luna@high\njudgment and prose: claude:fable@max\n");
      write(paths.projectSheet, "how explorer: opencode:openrouter/z-ai/glm-5.3@high\n");
      const selected = readConfiguration(harness.id, cwd, env);
      expect(selected.activeSheet).toBe(paths.projectSheet);
      expect(Object.keys(selected.roles)).toEqual(["how explorer"]);
      expect(selected.roles["how explorer"][0].route).toBe("external");
      expect(selected.roles["how explorer"][0].capabilities?.shell).toBe(false);
      expect(readFileSync(paths.globalSheet, "utf8")).toContain("judgment and prose:");
      rmSync(paths.projectSheet);
      expect(readConfiguration(harness.id, cwd, env).activeSheet).toBe(paths.globalSheet);
    }
  });

  it("shares primary checkout configuration with linked worktrees and uses global outside git", () => {
    const { cwd, env, root } = fixture();
    execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "fixture"], { cwd });
    const linked = join(root, "linked");
    execFileSync("git", ["worktree", "add", "--detach", linked], { cwd, stdio: "ignore" });
    for (const harness of HARNESSES) {
      expect(configurationPaths(harness.id, linked, env)).toEqual(configurationPaths(harness.id, cwd, env));
      expect(configurationPaths(harness.id, root, env).projectSheet).toBeNull();
    }
  });

  it("refuses an invalid working directory instead of selecting global configuration", () => {
    const { cwd, env } = fixture();
    expect(() => configurationPaths("codex", join(cwd, "missing"), env)).toThrow();
    const file = join(cwd, "file");
    write(file, "synthetic fixture");
    expect(() => configurationPaths("codex", file, env)).toThrow("cwd is not a directory");
  });

  it("fails explicitly when a configured lane cannot provide required shell access", () => {
    const { cwd, env } = fixture();
    const paths = configurationPaths("opencode", cwd, env);
    write(paths.globalSheet, "feature, refactoring: opencode:openrouter/z-ai/glm-5.3@high\n");
    const cli = join(import.meta.dir, "pstack-context");
    const run = Bun.spawnSync([process.execPath, cli, "--parent", "opencode", "--cwd", cwd, "--role", "feature, refactoring", "--require-shell"], { env: { PATH: process.env.PATH, ...env } });
    expect(run.exitCode).toBe(64);
    expect(run.stderr.toString()).toContain("does not support shell execution");
    expect(readFileSync(paths.globalSheet, "utf8")).toBe("feature, refactoring: opencode:openrouter/z-ai/glm-5.3@high\n");
  });

  it("lets setup inspect paths before repairing an invalid project sheet", () => {
    const { cwd, env } = fixture();
    const paths = configurationPaths("codex", cwd, env);
    if (paths.projectSheet === null) throw new Error("fixture must have a project sheet");
    write(paths.projectSheet, "how explorer: invalid-model\n");
    const cli = join(import.meta.dir, "pstack-context");
    const run = Bun.spawnSync([process.execPath, cli, "--parent", "codex", "--cwd", cwd, "--paths-only"], { env: { PATH: process.env.PATH, ...env } });
    expect(run.exitCode).toBe(0);
    expect(JSON.parse(run.stdout.toString()).paths.projectSheet).toBe(paths.projectSheet);
    expect(readFileSync(paths.projectSheet, "utf8")).toBe("how explorer: invalid-model\n");
    expect(() => readConfiguration("codex", cwd, env)).toThrow("invalid model descriptor");
  });
});
