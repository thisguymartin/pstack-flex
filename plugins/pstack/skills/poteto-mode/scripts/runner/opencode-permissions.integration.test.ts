import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { invocationCommand } from "./commands.ts";
import { childEnvironment } from "./run.ts";
import type { RunnerOptions } from "./types.ts";

const executable = Bun.which("opencode");
const fixtures: string[] = [];

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "pstack-opencode-permissions-")));
  fixtures.push(root);
  const home = join(root, "home");
  const cwd = join(root, "repo");
  const customConfig = join(root, "custom.json");
  const configDirectory = join(root, "custom-directory");
  const managedDirectory = join(root, "managed");
  mkdirSync(cwd, { recursive: true });

  const ambient = {
    permission: { "*": "allow", bash: "allow", edit: "allow", task: "allow", skill: "allow", webfetch: "allow" },
    agent: {
      plan: { permission: { "*": "allow", edit: "allow", webfetch: "allow", bash: { "*": "allow", "touch *": "allow" } } },
      build: { permission: { "*": "allow", external_directory: "allow" } },
    },
    mode: { plan: { permission: "allow" } },
    tools: { edit: true, write: true, bash: true, task: true, skill: true },
  };
  for (const file of [
    join(home, ".config/opencode/opencode.json"),
    join(home, ".opencode/opencode.json"),
    join(cwd, "opencode.json"),
    join(cwd, ".opencode/opencode.json"),
    customConfig,
    join(configDirectory, "opencode.json"),
    join(managedDirectory, "opencode.json"),
  ]) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(ambient));
  }

  const env = {
    PATH: process.env.PATH,
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_CACHE_HOME: join(root, "cache"),
    XDG_STATE_HOME: join(root, "state"),
    OPENCODE_CONFIG: customConfig,
    OPENCODE_CONFIG_DIR: configDirectory,
    OPENCODE_TEST_MANAGED_CONFIG_DIR: managedDirectory,
    OPENCODE_PERMISSION: JSON.stringify({ "*": "allow", bash: "allow", edit: "allow", task: "allow", skill: "allow", webfetch: "allow" }),
    OPENCODE_DISABLE_MODELS_FETCH: "1",
  };
  return { root, cwd, env };
}

describe.skipIf(executable === null)("installed OpenCode permission integration (skipped without CLI)", () => {
  for (const mode of ["read-only", "isolated-write"] as const) {
    it(`enforces ${mode} permissions despite ambient configuration`, () => {
      if (executable === null) throw new Error("OpenCode CLI is required");
      const { root, cwd, env: source } = fixture();
      const options: RunnerOptions = {
        parent: "codex", provider: "opencode", model: "openrouter/z-ai/glm-5.3", effort: "high",
        mode, cwd, promptPath: join(root, "prompt.md"), outputPath: join(root, "output.txt"),
        receiptPath: join(root, "receipt.json"), timeoutMs: null,
      };
      const invocation = invocationCommand(options);
      const agent = invocation.args[invocation.args.indexOf("--agent") + 1];
      expect(agent).toMatch(/^pstack-lane-/);
      const env = { ...childEnvironment("opencode", source, options.model), ...invocation.environment };
      const inspect = Bun.spawnSync([executable, "debug", "agent", agent, "--pure"], { cwd, env });
      expect(inspect.exitCode, inspect.stderr.toString()).toBe(0);
      const resolved = JSON.parse(inspect.stdout.toString()) as { tools: Record<string, boolean> };
      for (const tool of ["bash", "task", "webfetch", "websearch", "skill"]) {
        expect(resolved.tools[tool], tool).toBe(false);
      }
      for (const tool of ["read", "glob", "grep"]) expect(resolved.tools[tool], tool).toBe(true);
      expect(resolved.tools.edit).toBe(mode === "isolated-write");
      expect(resolved.tools.write).toBe(mode === "isolated-write");

      const outside = join(root, "outside.txt");
      const denied = Bun.spawnSync([
        executable, "debug", "agent", agent, "--pure", "--tool", "write",
        "--params", JSON.stringify({ filePath: outside, content: "must not be written" }),
      ], { cwd, env });
      expect(denied.exitCode).not.toBe(0);
      expect(existsSync(outside)).toBe(false);

      if (mode === "isolated-write") {
        const inside = join(cwd, "inside.txt");
        const allowed = Bun.spawnSync([
          executable, "debug", "agent", agent, "--pure", "--tool", "write",
          "--params", JSON.stringify({ filePath: inside, content: "writer remains useful" }),
        ], { cwd, env });
        expect(allowed.exitCode, allowed.stderr.toString()).toBe(0);
        expect(readFileSync(inside, "utf8")).toBe("writer remains useful");
      }
    }, 30_000);
  }
});
