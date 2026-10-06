import type { Provider } from "./runner/types.ts";

interface Harness {
  readonly id: string;
  readonly nativeProvider: Provider | null;
  readonly configDirectory: string;
  readonly configDirectoryVariable: string;
  readonly configDirectorySuffix: string;
  readonly projectDirectory: string;
  readonly integration: "include" | "mirror-block" | "instructions-array";
  readonly integrationFiles: readonly string[];
  readonly launch: "task" | "session" | "detached";
  readonly sessionVariable: string | null;
  readonly identityVariables: readonly string[];
}

export const HARNESSES = [
  {
    id: "claude",
    nativeProvider: "claude",
    configDirectory: ".claude",
    configDirectoryVariable: "CLAUDE_CONFIG_DIR",
    configDirectorySuffix: "",
    projectDirectory: ".claude",
    integration: "include",
    integrationFiles: ["CLAUDE.md"],
    launch: "task",
    sessionVariable: "CLAUDE_CODE_SESSION_ID",
    identityVariables: [
      "CLAUDECODE", "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_CODE_SESSION_ID",
      "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS",
    ],
  },
  {
    id: "codex",
    nativeProvider: "codex",
    configDirectory: ".codex",
    configDirectoryVariable: "CODEX_HOME",
    configDirectorySuffix: "",
    projectDirectory: ".codex",
    integration: "mirror-block",
    integrationFiles: ["AGENTS.md"],
    launch: "session",
    sessionVariable: "CODEX_THREAD_ID",
    identityVariables: [
      "CODEX_THREAD_ID", "CODEX_SESSION_ID", "CODEX_CI", "CODEX_SHELL",
      "CODEX_SANDBOX", "CODEX_SANDBOX_NETWORK_DISABLED",
      "CODEX_INTERNAL_ORIGINATOR_OVERRIDE",
    ],
  },
  {
    id: "opencode",
    nativeProvider: null,
    configDirectory: ".config/opencode",
    configDirectoryVariable: "XDG_CONFIG_HOME",
    configDirectorySuffix: "opencode",
    projectDirectory: ".opencode",
    integration: "instructions-array",
    integrationFiles: ["opencode.jsonc", "opencode.json"],
    launch: "detached",
    sessionVariable: null,
    identityVariables: ["OPENCODE", "OPENCODE_PID", "AGENT"],
  },
] as const satisfies readonly Harness[];

export type Parent = (typeof HARNESSES)[number]["id"];
export const PARENTS = HARNESSES.map((harness) => harness.id);

export function harnessAdapter(parent: Parent) {
  const adapter = HARNESSES.find((harness) => harness.id === parent);
  if (adapter === undefined) throw new Error(`unsupported harness: ${parent}`);
  return adapter;
}

export function laneRoute(parent: Parent, provider: Provider | null): "native" | "external" {
  return provider === null || harnessAdapter(parent).nativeProvider === provider
    ? "native"
    : "external";
}

export function withoutParentIdentity(provider: Provider, source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result = { ...source };
  for (const harness of HARNESSES) {
    if (harness.nativeProvider === provider) continue;
    for (const key of harness.identityVariables) delete result[key];
  }
  return result;
}
