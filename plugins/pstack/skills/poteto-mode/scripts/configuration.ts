import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { harnessAdapter, laneRoute, type Parent } from "./harnesses.ts";
import { versionedClaudeAlias } from "./runner/model-aliases.ts";
import { modelRefusal } from "./runner/model-refusal.ts";
import { EFFORTS, PROVIDERS, laneCapabilities, type Effort, type Provider } from "./runner/types.ts";

export type ModelChoice =
  | { readonly kind: "inherit"; readonly descriptor: "inherit-parent" | "auto" }
  | {
      readonly kind: "model";
      readonly descriptor: string;
      readonly provider: Provider;
      readonly model: string;
      readonly effort: Effort;
      readonly normalizedFrom: string | null;
    };

export function parseDescriptor(input: string): ModelChoice {
  const value = input.trim();
  if (value === "inherit-parent" || value === "auto") return { kind: "inherit", descriptor: value };
  const colon = value.indexOf(":");
  const at = value.lastIndexOf("@");
  const provider = PROVIDERS.find((entry) => entry === value.slice(0, colon));
  const effort = EFFORTS.find((entry) => entry === value.slice(at + 1));
  let model = value.slice(colon + 1, at);
  if (colon < 1 || at <= colon + 1 || provider === undefined || effort === undefined || /[\s,]/.test(model)) {
    throw new Error(`invalid model descriptor: ${input}`);
  }
  const alias = provider === "claude" ? versionedClaudeAlias(model) : null;
  if (alias !== null) model = alias;
  const refusal = modelRefusal(provider, model);
  if (refusal !== null) throw new Error(refusal);
  return {
    kind: "model", provider, model, effort,
    descriptor: `${provider}:${model}@${effort}`,
    normalizedFrom: alias === null ? null : value,
  };
}

export function parseModelSheet(text: string): Record<string, ModelChoice[]> {
  const roles: Record<string, ModelChoice[]> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([a-z][a-z ,_-]*):\s*(.*)$/.exec(line);
    if (match === null) continue;
    const [, role, entries] = match;
    if (Object.hasOwn(roles, role)) throw new Error(`duplicate model role: ${role}`);
    if (entries.trim() === "") throw new Error(`empty model role: ${role}`);
    roles[role] = entries.split(",").map(parseDescriptor);
  }
  if (Object.keys(roles).length === 0) throw new Error("model sheet has no role assignments");
  return roles;
}

const LAB_ALIASES: Readonly<Record<string, string>> = {
  anthropic: "claude", openai: "codex", "x-ai": "grok",
};

export function modelLab(choice: ModelChoice): string | null {
  if (choice.kind === "inherit") return null;
  if (choice.provider === "openrouter" || choice.provider === "opencode") {
    const parts = choice.model.split("/");
    if (choice.provider === "opencode" && parts[0] !== "openrouter") {
      return LAB_ALIASES[parts[0]] ?? (parts[0] === "deepseek" || parts[0] === "minimax" ? parts[0] : null);
    }
    const namespace = (choice.provider === "opencode" && parts[0] === "openrouter" ? parts[1] : parts[0]).replace(/^~/, "");
    return LAB_ALIASES[namespace] ?? namespace;
  }
  return choice.provider;
}

export function configurationPaths(parent: Parent, cwd: string, env: NodeJS.ProcessEnv = process.env) {
  if (!statSync(cwd).isDirectory()) throw new Error(`cwd is not a directory: ${cwd}`);
  const harness = harnessAdapter(parent);
  const homeDirectory = env.HOME || homedir();
  const override = env[harness.configDirectoryVariable];
  const configDirectory = override?.trim()
    ? join(resolve(override), harness.configDirectorySuffix)
    : join(homeDirectory, harness.configDirectory);
  let commonDirectory: string | null;
  try {
    commonDirectory = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, LC_ALL: "C" },
    }).trim();
  } catch (error) {
    if (error instanceof Error && "stderr" in error && String(error.stderr).includes("not a git repository")) {
      commonDirectory = null;
    } else {
      throw error;
    }
  }
  return {
    globalSheet: join(configDirectory, "pstack-models.md"),
    projectSheet: commonDirectory === null ? null : join(dirname(commonDirectory), harness.projectDirectory, "pstack-models.md"),
    excludeFile: commonDirectory === null ? null : join(commonDirectory, "info/exclude"),
    integrationTargets: harness.integrationFiles.map((file) => join(configDirectory, file)),
  };
}

export function readConfiguration(parent: Parent, cwd: string, env: NodeJS.ProcessEnv = process.env) {
  const harness = harnessAdapter(parent);
  const paths = configurationPaths(parent, cwd, env);
  const activeSheet = paths.projectSheet !== null && existsSync(paths.projectSheet)
    ? paths.projectSheet : existsSync(paths.globalSheet) ? paths.globalSheet : null;
  const choices = activeSheet === null ? {} : parseModelSheet(readFileSync(activeSheet, "utf8"));
  const roles = Object.fromEntries(Object.entries(choices).map(([role, lanes]) => [
    role, lanes.map((choice) => ({
      ...choice, route: laneRoute(parent, choice.kind === "inherit" ? null : choice.provider), lab: modelLab(choice),
      capabilities: choice.kind === "inherit" ? null : laneCapabilities(choice.provider),
    })),
  ]));
  return { harness, paths, activeSheet, roles };
}
