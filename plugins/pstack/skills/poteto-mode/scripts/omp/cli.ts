import { parseArgs } from "node:util";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfiguration } from "../configuration.ts";
import { OMP_CONFIG, OMP_VERSION, supportedOmpVersion } from "./adapter.ts";
import { modelRefusal } from "../runner/model-refusal.ts";
import { ALL_EFFORTS } from "../runner/types.ts";

export async function main(args: string[]): Promise<number> {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    cwd: { type: "string" }, model: { type: "string" }, effort: { type: "string" },
    prompt: { type: "string" }, print: { type: "boolean" }, help: { type: "boolean", short: "h" },
  } });
  if (values.help) {
    console.log("Usage: pstack-omp [--cwd <project>] [--model <provider/model>] [--effort <level>] [--print --prompt <text>]\nUses existing OMP configuration and credentials. Set PSTACK_OMP_EXECUTABLE to an explicit OMP 18.10.3 binary if it is not on PATH. Workers require .omp/pstack-models.md or ~/.omp/agent/pstack-models.md with explicit omp:provider/model@effort assignments. No native worker fallback.");
    return 0;
  }
  const cwd = resolve(values.cwd ?? process.cwd());
  const config = readConfiguration("omp", cwd);
  if (values.model && modelRefusal("omp", values.model)) throw new Error(modelRefusal("omp", values.model)!);
  if (values.effort && !(ALL_EFFORTS as readonly string[]).includes(values.effort)) throw new Error("Unsupported effort");
  const executable = process.env.PSTACK_OMP_EXECUTABLE ? resolve(process.env.PSTACK_OMP_EXECUTABLE) : Bun.which("omp");
  if (!executable) throw new Error("OMP is not on PATH. Install OMP or set PSTACK_OMP_EXECUTABLE. No other runtime will be used.");
  const version = Bun.spawnSync([executable, "--version"]);
  if (version.exitCode !== 0 || !supportedOmpVersion(version.stdout.toString())) {
    throw new Error(`This candidate requires tested OMP ${OMP_VERSION}; validate upgrades before changing the pin`);
  }
  const instructions = `You are the OMP parent for pstack-flex. Use shared pstack skills only when requested or instructed by the user. Read the full relevant SKILL.md. Dispatch every worker through pstack_task with an explicit configured role and index. Never start Claude Code, Codex, OpenCode or native OMP task/eval workers. Do not substitute models, lower effort or invent timeouts. Missing roles require setup, not skill defaults. Workers have no shell; run tests in this parent after they finish. Writers need separate worktrees. The bash tool is for project commands, not alternate agent runtimes. Current pstack configuration: ${JSON.stringify(config.roles)}. ${config.activeSheet ? `Model sheet: ${config.activeSheet}` : "No model sheet exists. Ask the user to select role models before delegation."}`;
  const argv = [executable, "--cwd", cwd, "--no-extensions", "-e",
    fileURLToPath(new URL("./parent.ts", import.meta.url)), "--config", OMP_CONFIG,
    "--pstack-parent-required", "--no-prewalk", "--no-title", "--no-lsp", "--tools", "read,grep,write,edit,bash,pstack_task",
    "--append-system-prompt", instructions,
  ];
  if (values.model) argv.push("--model", values.model);
  if (values.effort) argv.push("--thinking", values.effort);
  if (values.print) argv.push("-p", "--mode", "json", "--no-session");
  if (values.prompt) argv.push("--", values.prompt);
  const temporary = mkdtempSync(join(tmpdir(), "pstack-omp-skills-"));
  try {
    const skillConfig = join(temporary, "skills.json");
    writeFileSync(skillConfig, JSON.stringify({ skills: {
      enabled: true, enableSkillCommands: true, includeSkills: [],
      customDirectories: [fileURLToPath(new URL("../../../", import.meta.url))],
    } }));
    const promptIndex = argv.indexOf("--");
    argv.splice(promptIndex < 0 ? argv.length : promptIndex, 0, "--config", skillConfig);
    const child = Bun.spawn(argv, { cwd, stdin: "inherit", stdout: "inherit", stderr: "inherit", env: {
      ...process.env, PSTACK_RUNTIME: "omp", PSTACK_OMP_PARENT: "1", PSTACK_OMP_EXECUTABLE: executable,
      PSTACK_OMP_RUNNER: fileURLToPath(new URL("../runner/pstack-runner", import.meta.url)),
      PSTACK_OMP_PARENT_MODEL: values.model ?? "", PSTACK_OMP_PARENT_EFFORT: values.effort ?? "",
      PATH: `${dirname(executable)}${delimiter}${process.env.PATH ?? ""}`,
    } });
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    process.on("SIGINT", interrupt); process.on("SIGTERM", terminate);
    try { return await child.exited; }
    finally { process.off("SIGINT", interrupt); process.off("SIGTERM", terminate); }
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
