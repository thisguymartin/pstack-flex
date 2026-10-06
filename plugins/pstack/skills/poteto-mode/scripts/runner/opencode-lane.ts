import { randomUUID } from "node:crypto";
import type { AccessMode } from "./types.ts";
import { openRouterModelRefusal } from "./flex-providers.ts";

export function openCodeModelRefusal(model: string): string | null {
  const slash = model.indexOf("/");
  if (slash <= 0 || slash === model.length - 1) {
    return `OpenCode model ${model} must be <provider>/<model>, such as openrouter/z-ai/glm-5.3`;
  }
  return model.slice(0, slash) === "openrouter" ? openRouterModelRefusal(model.slice(slash + 1)) : null;
}

export function openCodeProviderId(model: string): string {
  return model.slice(0, model.indexOf("/"));
}

const READ_ONLY = {
  "*": "deny",
  read: "allow",
  list: "allow",
  glob: "allow",
  grep: "allow",
  external_directory: "allow",
} as const;

const ISOLATED_WRITE = {
  "*": "deny",
  read: "allow",
  list: "allow",
  glob: "allow",
  grep: "allow",
  edit: "allow",
} as const;

export function openCodeLane(mode: AccessMode) {
  // Named plan/build agents deep-merge ambient permissions. A fresh name
  // gives this lane its own rules, appended after global permissions.
  const agent = `pstack-lane-${randomUUID()}`;
  const config = JSON.stringify({
    agent: { [agent]: { mode: "primary", permission: mode === "read-only" ? READ_ONLY : ISOLATED_WRITE } },
  });
  // OpenCode has no shell sandbox. Even Git reads can execute diff helpers.
  return { agent, environment: { OPENCODE_CONFIG_CONTENT: config } };
}

export function openCodeEnvironment(): NodeJS.ProcessEnv {
  return {
    // A private database per lane. OpenCode 1.18.31 sets WAL mode before its
    // busy timeout, so lanes sharing the on-disk database fail with
    // "database is locked"; this also keeps lane sessions out of the user's history.
    OPENCODE_DB: ":memory:",
    // Keeps ~/.claude/CLAUDE.md and ~/.claude/skills, pstack included, out of the lane.
    OPENCODE_DISABLE_CLAUDE_CODE: "1",
    OPENCODE_DISABLE_AUTOUPDATE: "1",
  };
}

// OpenCode silently ignores unsupported variants. Inspect the catalog before
// invoking a model so requested effort cannot silently change.
export function inspectOpenCodeModels(stdout: string, model: string, effort: string): {
  readonly status: "passed" | "unavailable-model" | "child-failed";
  readonly evidence: string;
} {
  const entries = stdout.split(/^([^\s{}"\[\],]+\/[^\s{}"\[\],]+)\r?$/m);
  if (entries.length === 1 && stdout.trim() !== "") {
    return { status: "child-failed", evidence: "OpenCode printed an unreadable model listing" };
  }
  for (let i = 1; i < entries.length; i += 2) {
    if (entries[i] !== model) continue;
    let variants: string[];
    try {
      const info = JSON.parse(entries[i + 1].trim()) as { variants?: unknown };
      variants = info.variants !== null && typeof info.variants === "object"
        ? Object.keys(info.variants) : [];
    } catch {
      return { status: "child-failed", evidence: `OpenCode printed unreadable metadata for model ${model}` };
    }
    return variants.includes(effort)
      ? { status: "passed", evidence: `model ${model} listed with a ${effort} effort variant` }
      : { status: "unavailable-model", evidence: `OpenCode model ${model} offers no ${effort} effort variant; it offers ${variants.length === 0 ? "none" : variants.join(", ")}` };
  }
  return { status: "unavailable-model", evidence: `OpenCode lists no model ${model} among ${openCodeProviderId(model)}'s connected models` };
}
