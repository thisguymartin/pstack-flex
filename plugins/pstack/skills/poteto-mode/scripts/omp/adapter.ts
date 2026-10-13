import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CommandSpec } from "../runner/commands.ts";
import type { ParsedOutput, RunnerOptions } from "../runner/types.ts";

export const OMP_VERSION = "18.10.3";
export function supportedOmpVersion(stdout: string): boolean {
  return stdout.trim() === `omp/${OMP_VERSION}`;
}

export const OMP_GUARD = fileURLToPath(new URL("./guard.ts", import.meta.url));
export const OMP_CONFIG = fileURLToPath(new URL("./settings.json", import.meta.url));
export const OMP_READ_TOOLS = ["read", "grep"];
export const OMP_WRITE_TOOLS = [...OMP_READ_TOOLS, "write", "edit"];

export function ompCommand(options: RunnerOptions): CommandSpec {
  return {
    command: process.env.PSTACK_OMP_EXECUTABLE ? resolve(process.env.PSTACK_OMP_EXECUTABLE) : "omp",
    args: [
      "--cwd", options.cwd, "-p", "--mode", "json", "--model", options.model,
      "--thinking", options.effort, "--no-session", "--no-extensions", "-e", OMP_GUARD,
      "--pstack-guard-required", "--no-skills", "--no-rules", "--no-title", "--no-lsp", "--no-prewalk",
      "--config", OMP_CONFIG, "--approval-mode", "yolo",
      "--tools", (options.mode === "read-only" ? OMP_READ_TOOLS : OMP_WRITE_TOOLS).join(","),
    ],
    stdin: "prompt",
    environment: {
      PSTACK_RUNTIME: "omp", PSTACK_OMP_MODEL: options.model,
      PSTACK_OMP_EFFORT: options.effort, PSTACK_OMP_ACCESS: options.mode,
      PSTACK_OMP_PARENT: "", PI_NO_TITLE: "1", PI_EDIT_VARIANT: "replace",
    },
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function parseOmpOutput(stdout: string, requested: string): ParsedOutput {
  let terminal = false;
  let sessionId: string | null = null;
  let text = "";
  let lastStop: unknown;
  let messages = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let cacheCreationInputTokens = 0;
  for (const line of stdout.split("\n").filter(line => line.trim())) {
    const event = record(JSON.parse(line));
    if (!event) throw new Error("OMP emitted a non-object event");
    if (event.type === "session" && typeof event.id === "string") sessionId = event.id;
    if (event.type === "agent_end" && event.isTerminal === true) terminal = true;
    if (event.type !== "message_end") continue;
    const message = record(event.message);
    if (message?.role !== "assistant") continue;
    messages++;
    if (`${message.provider}/${message.model}` !== requested) throw new Error("OMP changed the assigned model");
    lastStop = message.stopReason;
    if (lastStop === "error" || lastStop === "aborted") throw new Error(`OMP returned ${lastStop}`);
    text = Array.isArray(message.content) ? message.content.map(record)
      .filter(part => part?.type === "text" && typeof part.text === "string")
      .map(part => part!.text).join("\n") : "";
    const usage = record(message.usage);
    const number = (key: string): number => {
      const value = usage?.[key];
      return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
    };
    inputTokens += number("input"); outputTokens += number("output");
    cachedInputTokens += number("cacheRead"); cacheCreationInputTokens += number("cacheWrite");
  }
  if (!terminal || !messages || !text.trim() || lastStop !== "stop") {
    throw new Error("OMP did not finish with terminal assistant text");
  }
  // OMP's selected-model field is not a provider attestation. Retain pinned argv evidence.
  return { text, reportedModel: null, sessionId, costUsd: null,
    usage: { inputTokens, outputTokens, cachedInputTokens, cacheCreationInputTokens } };
}
