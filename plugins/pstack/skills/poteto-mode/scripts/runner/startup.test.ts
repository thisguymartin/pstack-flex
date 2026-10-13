import { afterEach, describe, expect, it } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("runner startup isolation", () => {
  for (const source of ["bun options", "node options", "dotenv", "bunfig", "combined"] as const) {
    it(`ignores ${source} while preserving exported child variables`, () => {
      const cwd = mkdtempSync(join(tmpdir(), "pstack startup "));
      directories.push(cwd);
      const bin = join(cwd, "bin");
      mkdirSync(bin);
      const marker = join(cwd, "preload-ran");
      const preload = join(cwd, "preload.cjs");
      writeFileSync(preload, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "executed");`);
      const executable = join(bin, "codex");
      writeFileSync(executable, `#!/bin/sh
if [ "$1" = login ]; then
  echo 'Logged in using ChatGPT'
  exit 0
fi
env > "$PSTACK_TEST_ENV"
echo '{"type":"item.completed","item":{"type":"agent_message","text":"STARTUP_OK"}}'
echo '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}'
`);
      chmodSync(executable, 0o755);
      if (source === "dotenv" || source === "combined") writeFileSync(join(cwd, ".env"), "PSTACK_DOTENV_SENTINEL=project-only\n");
      if (source === "bunfig" || source === "combined") writeFileSync(join(cwd, "bunfig.toml"), `preload = [${JSON.stringify(preload)}]\n`);
      const prompt = join(cwd, "prompt.md");
      writeFileSync(prompt, "Return STARTUP_OK.");
      const output = join(cwd, "output.txt");
      const receipt = join(cwd, "receipt.json");
      const dump = join(cwd, "child.env");
      const env = {
        ...process.env,
        PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
        PSTACK_TEST_ENV: dump,
        OPENAI_API_KEY: "synthetic-exported-key",
        CODEX_THREAD_ID: "synthetic-parent-identity",
        BUN_OPTIONS: source === "bun options" || source === "combined" ? `--preload=${JSON.stringify(preload)}` : "",
        NODE_OPTIONS: source === "node options" || source === "combined" ? `--require=${JSON.stringify(preload)}` : "",
      };
      const result = Bun.spawnSync([
        join(import.meta.dir, "pstack-runner"),
        "--parent", "claude", "--provider", "codex", "--model", "gpt-5.6-sol", "--effort", "max",
        "--mode", "read-only", "--cwd", cwd, "--prompt", prompt, "--output", output, "--receipt", receipt,
      ], { cwd, env });
      expect(result.exitCode).toBe(0);
      expect(readFileSync(output, "utf8")).toContain("STARTUP_OK");
      expect(JSON.parse(readFileSync(receipt, "utf8"))).toMatchObject({ status: "complete", parent: "claude", provider: "codex" });
      expect(existsSync(marker)).toBe(false);
      const childEnv = readFileSync(dump, "utf8");
      expect(childEnv).not.toContain("PSTACK_DOTENV_SENTINEL=");
      expect(childEnv).not.toContain("BUN_OPTIONS=");
      expect(childEnv).not.toContain("NODE_OPTIONS=");
      expect(childEnv).toContain("OPENAI_API_KEY=synthetic-exported-key\n");
      expect(childEnv).toContain("CODEX_THREAD_ID=synthetic-parent-identity\n");
    });
  }
});
