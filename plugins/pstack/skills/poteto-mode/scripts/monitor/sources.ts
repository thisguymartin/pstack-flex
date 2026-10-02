import { homedir } from "node:os";
import { join } from "node:path";
import type { Adapter } from "./adapter.ts";
import { claudeAdapter } from "./adapters/claude.ts";
import { codexAdapter } from "./adapters/codex.ts";

// pstack-flex addition. Where each harness keeps its files on this machine.

export interface Homes {
  readonly claude: string;
  readonly codex: string;
  /** The monitor's own state: server record and log. */
  readonly state: string;
}

function configured(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name];
  return value !== undefined && value.trim().length > 0 ? value : null;
}

export function homes(env: NodeJS.ProcessEnv = process.env): Homes {
  const home = homedir();
  return {
    claude: configured(env, "CLAUDE_CONFIG_DIR") ?? join(home, ".claude"),
    codex: configured(env, "CODEX_HOME") ?? join(home, ".codex"),
    state: configured(env, "PSTACK_FLEX_MONITOR_DIR") ?? join(home, ".pstack-flex", "monitor"),
  };
}

export function adapters(where: Homes): Adapter[] {
  return [claudeAdapter(where.claude), codexAdapter(where.codex)];
}
