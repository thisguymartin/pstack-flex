import { lstatSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

// Structural subset of OMP 18.11.3's public extension API. No SDK runtime dependency.
interface Model { provider: string; id: string }
interface Context {
  cwd: string;
  model?: Model;
  modelRegistry: { getApiKey(model: Model): Promise<string | undefined> };
}
interface ToolCall { toolName: string; input: Record<string, unknown> }
interface Extension {
  registerFlag(name: string, options: { type: "boolean" }): void;
  getThinkingLevel(): string | undefined;
  setActiveTools(names: string[]): Promise<void>;
  on(event: "session_start" | "before_agent_start" | "before_provider_request",
    handler: (event: unknown, ctx: Context) => unknown): void;
  on(event: "tool_call", handler: (event: ToolCall, ctx: Context) => unknown): void;
}

export function writePathAllowed(cwd: string, input: unknown): boolean {
  if (typeof input !== "string" || input.length === 0) return false;
  const root = realpathSync(cwd);
  const target = resolve(root, input);
  const inside = (path: string) => {
    const rel = relative(root, path);
    return rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(rel)
      && !rel.split(/[\\/]/).some(part => part === ".git" || part === ".omp");
  };
  if (!inside(target)) return false;
  let existing = target;
  const exists = (path: string) => {
    try { lstatSync(path); return true; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  };
  while (!exists(existing)) {
    const parent = dirname(existing);
    if (parent === existing) return false;
    existing = parent;
  }
  try {
    const stat = statSync(existing);
    return inside(realpathSync(existing)) && (stat.isDirectory() || (stat.isFile() && stat.nlink === 1));
  } catch { return false; }
}

export default function guard(pi: Extension): void {
  pi.registerFlag("pstack-guard-required", { type: "boolean" });
  const expected = process.env.PSTACK_OMP_MODEL;
  const effort = process.env.PSTACK_OMP_EFFORT;
  const access = process.env.PSTACK_OMP_ACCESS;
  if (!expected || !effort || !["read-only", "isolated-write"].includes(access ?? "")) {
    process.stderr.write("pstack: OMP worker guard requires an explicit assignment\n");
    process.exit(64);
  }
  const tools = access === "read-only" ? ["read", "grep"] : ["read", "grep", "write", "edit"];
  function validate(ctx: Context) {
    if (!ctx.model || `${ctx.model.provider}/${ctx.model.id}` !== expected || pi.getThinkingLevel() !== effort) {
      process.stderr.write("pstack: unavailable model or unsupported effort; refusing OMP substitution\n");
      process.exit(69);
    }
  }
  pi.on("session_start", async (_event, ctx) => {
    try {
      validate(ctx);
      if (!await ctx.modelRegistry.getApiKey(ctx.model!)) {
        process.stderr.write("pstack: unauthenticated OMP model\n");
        process.exit(77);
      }
      await pi.setActiveTools(tools);
    } catch {
      process.stderr.write("pstack: OMP worker guard could not verify credentials and tools\n");
      process.exit(77);
    }
  });
  pi.on("before_agent_start", (_event, ctx) => validate(ctx));
  pi.on("before_provider_request", (_event, ctx) => validate(ctx));
  pi.on("tool_call", (event, ctx) => {
    if (!tools.includes(event.toolName)) return { block: true, reason: "OMP worker tool is not allowed" };
    if (["write", "edit"].includes(event.toolName)) {
      try { if (writePathAllowed(ctx.cwd, event.input.path)) return undefined; }
      catch { /* An unreadable path must not turn a failed check into permission. */ }
      return { block: true, reason: "OMP worker writes must stay in its checkout, outside .git and .omp" };
    }
    return undefined;
  });
}
