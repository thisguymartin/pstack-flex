import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfiguration } from "../configuration.ts";

interface Context { cwd: string; model?: { provider: string; id: string } }
interface TaskArgs { role: string; index: number; prompt: string; cwd: string; mode: string }
interface Extension {
  registerFlag(name: string, options: { type: "boolean" }): void;
  getThinkingLevel(): string | undefined;
  registerTool(tool: {
    name: string; label: string; description: string; parameters: unknown;
    execute(id: string, args: TaskArgs, signal: AbortSignal | undefined, update: unknown, ctx: Context): Promise<unknown>;
  }): void;
  setActiveTools(names: string[]): Promise<void>;
  on(event: "session_start" | "before_provider_request", handler: (event: unknown, ctx: Context) => Promise<void>): void;
  on(event: "tool_call", handler: (event: { toolName: string }) => unknown): void;
}

const TOOLS = ["read", "grep", "write", "edit", "bash", "pstack_task"];

export default function parent(pi: Extension): void {
  pi.registerFlag("pstack-parent-required", { type: "boolean" });
  pi.on("before_provider_request", async (_event, ctx) => {
    const model = process.env.PSTACK_OMP_PARENT_MODEL;
    const effort = process.env.PSTACK_OMP_PARENT_EFFORT;
    if ((model && `${ctx.model?.provider}/${ctx.model?.id}` !== model) ||
        (effort && pi.getThinkingLevel() !== effort)) {
      process.stderr.write("pstack: parent model or effort changed; refusing substitution\n");
      process.exit(69);
    }
  });
  pi.on("session_start", async (_event, ctx) => {
    readConfiguration("omp", ctx.cwd);
    await pi.setActiveTools(TOOLS);
  });
  pi.on("tool_call", event => TOOLS.includes(event.toolName) ? undefined : {
    block: true, reason: "OMP-only mode disables native delegation and unconfigured tools. Use pstack_task.",
  });
  pi.registerTool({
    name: "pstack_task", label: "Pstack OMP worker",
    description: "Run one configured pstack role through OMP only. Index is zero-based. Writers require a dedicated checkout. Workers cannot run shell commands; run verification in the parent after draining workers. Cancellation waits for the worker runner to finish.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: {
        role: { type: "string" }, index: { type: "integer", minimum: 0 },
        prompt: { type: "string" }, cwd: { type: "string" },
        mode: { type: "string", enum: ["read-only", "isolated-write"] },
      }, required: ["role", "index", "prompt", "cwd", "mode"],
    },
    async execute(_id, args, signal, _update, ctx) {
      if (signal?.aborted) throw new Error("OMP worker cancelled before launch");
      const config = readConfiguration("omp", ctx.cwd);
      const choice = config.roles[args.role]?.[args.index];
      if (!choice || choice.kind !== "model" || choice.provider !== "omp") {
        throw new Error("Role must name an explicit OMP assignment in the active model sheet");
      }
      const directory = mkdtempSync(join(tmpdir(), "pstack-omp-"));
      const prompt = join(directory, "prompt.txt");
      const output = join(directory, "output.txt");
      const receipt = join(directory, "receipt.json");
      writeFileSync(prompt, args.prompt, { mode: 0o600 });
      const runner = process.env.PSTACK_OMP_RUNNER;
      if (!runner) throw new Error("Start OMP through pstack-omp to dispatch workers");
      const child = Bun.spawn([runner,
        "--parent", "omp", "--provider", "omp", "--model", choice.model,
        "--effort", choice.effort, "--mode", args.mode, "--cwd", args.cwd,
        "--prompt", prompt, "--output", output, "--receipt", receipt, "--label", args.role,
      ], { env: { ...process.env, PSTACK_RUNTIME: "omp" }, stdout: "pipe", stderr: "pipe" });
      const cancel = () => child.kill("SIGTERM");
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
      try {
        const [code, stdout, stderr] = await Promise.all([
          child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
        ]);
        if (code !== 0) throw new Error(`OMP worker failed. Receipt: ${receipt}\n${stderr || stdout}`);
        const result: unknown = JSON.parse(readFileSync(receipt, "utf8"));
        return { content: [{ type: "text", text: readFileSync(output, "utf8") }], details: { receipt: result, receiptPath: receipt } };
      } finally {
        signal?.removeEventListener("abort", cancel);
      }
    },
  });
}
