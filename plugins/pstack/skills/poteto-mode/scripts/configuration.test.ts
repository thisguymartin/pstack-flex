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

  it("preserves mixed efforts, legacy models, grouped keys, custom rows, and lane order", () => {
    const sheet = parseModelSheet([
      "feature, refactoring: codex:gpt-5.6-sol@max",
      "bug-fix: codex:gpt-6.1-sol@high",
      "perf-issue: codex:gpt-6.1-sol@xhigh",
      "judgment and prose: claude:opus@high",
      "why investigators, synthesizer: inherit-parent",
      "reflect tooling, judgment, divergent, synthesizer: claude:claude-opus-5-3@medium",
      "arena runners: claude:opus@high, codex:gpt-6.1-sol@high, claude:opus@medium",
      "custom reviewers: claude:claude-fable-5-3@low, auto",
    ].join("\n"));
    expect(Object.keys(sheet)).toEqual([
      "feature, refactoring", "bug-fix", "perf-issue", "judgment and prose",
      "why investigators, synthesizer", "reflect tooling, judgment, divergent, synthesizer",
      "arena runners", "custom reviewers",
    ]);
    expect(sheet["feature, refactoring"][0].descriptor).toBe("codex:gpt-5.6-sol@max");
    expect(sheet["bug-fix"][0].descriptor).toBe("codex:gpt-6.1-sol@high");
    expect(sheet["perf-issue"][0].descriptor).toBe("codex:gpt-6.1-sol@xhigh");
    expect(sheet["why investigators, synthesizer"][0].descriptor).toBe("inherit-parent");
    expect(sheet["reflect tooling, judgment, divergent, synthesizer"][0]).toMatchObject({
      descriptor: "claude:opus@medium", normalizedFrom: "claude:claude-opus-5-3@medium",
    });
    expect(sheet["arena runners"].map((lane) => lane.descriptor)).toEqual([
      "claude:opus@high", "codex:gpt-6.1-sol@high", "claude:opus@medium",
    ]);
    expect(sheet["custom reviewers"].map((lane) => lane.descriptor)).toEqual(["claude:fable@low", "auto"]);
  });

  it("reads customized project efforts without changing sheets or merging global defaults", () => {
    const { cwd, env } = fixture();
    for (const parent of ["claude", "codex", "opencode", "omp"] as const) {
      const paths = configurationPaths(parent, cwd, env);
      if (paths.projectSheet === null) throw new Error("fixture must have a project sheet");
      const opus = parent === "omp" ? "omp:anthropic/claude-opus-5-5" : "claude:opus";
      const sol = parent === "omp" ? "omp:openai-codex/gpt-6.1-sol" : "codex:gpt-6.1-sol";
      const global = `hardest tasks: ${opus}@high\n`;
      const project = [
        `feature, refactoring: ${sol}@max`,
        `bug-fix: ${sol}@high`,
        `perf-issue: ${sol}@xhigh`,
        `why investigators, synthesizer: ${opus}@low`,
        `reflect tooling, judgment, divergent, synthesizer: ${opus}@medium`,
        `arena runners: ${opus}@high, ${sol}@high, ${opus}@medium`,
        `custom reviewers: ${sol}@low`,
      ].join("\n") + "\n";
      write(paths.globalSheet, global);
      write(paths.projectSheet, project);
      const selected = readConfiguration(parent, cwd, env);
      expect(selected.activeSheet).toBe(paths.projectSheet);
      expect(selected.roles["hardest tasks"]).toBeUndefined();
      expect(Object.fromEntries(Object.entries(selected.roles).map(([role, lanes]) =>
        [role, lanes.map((lane) => lane.descriptor).join(", ")]))).toEqual(
        Object.fromEntries(project.trim().split("\n").map((line) => {
          const colon = line.indexOf(": ");
          return [line.slice(0, colon), line.slice(colon + 2)];
        }))
      );
      expect(readFileSync(paths.projectSheet, "utf8")).toBe(project);
      expect(readFileSync(paths.globalSheet, "utf8")).toBe(global);
    }
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
      write(paths.globalSheet, harness.id === "omp"
        ? "how explorer: omp:openai/gpt-6-luna@high\njudgment and prose: omp:anthropic/claude-opus-4-6@max\n"
        : "how explorer: codex:gpt-6-luna@high\njudgment and prose: claude:fable@max\n");
      write(paths.projectSheet, `how explorer: ${harness.id === "omp" ? "omp" : "opencode"}:openrouter/z-ai/glm-5.3@high\n`);
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
