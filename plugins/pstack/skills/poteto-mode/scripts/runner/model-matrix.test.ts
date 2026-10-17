import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseModelSheet } from "../configuration.ts";
import { parseArgs } from "./cli.ts";
import { invocationCommand } from "./commands.ts";
import { GATEWAY_SPECS } from "./flex-providers.ts";
import { validateOptions } from "./run.ts";
import {
  EFFORTS,
  GATEWAY_PROVIDERS,
  type Effort,
  type GatewayProvider,
} from "./types.ts";

const PLUGIN_ROOT = join(import.meta.dir, "../../../..");
const DISPATCH_PATH = join(
  PLUGIN_ROOT,
  "skills/poteto-mode/references/provider-dispatch.md"
);
const SETUP_PATH = join(PLUGIN_ROOT, "skills/setup-pstack/SKILL.md");
const AGENTS_DIR = join(PLUGIN_ROOT, "agents");

const MATRIX_HEADER = [
  "Family",
  "Upstream pstack choice",
  "Provider",
  "Model",
  "Default effort",
  "Selectable efforts",
  "Claude-native agent stem",
] as const;

const FAMILY_ORDER = ["fable", "sol", "grok", "opus", "astra", "sol-6.1", "sol-6", "luna"] as const;
const GPT6_FAMILIES = ["astra", "sol-6.1", "sol-6", "luna"] as const;
const PROVIDERS = ["claude", "codex", "grok"] as const;
const SHEET_ROLES = [
  "feature, refactoring",
  "bug-fix",
  "perf-issue",
  "hillclimb",
  "judgment and prose",
  "hardest tasks",
  "how explorer",
  "how explainer",
  "why investigators, synthesizer",
  "reflect tooling, judgment, divergent, synthesizer",
  "arena runners",
  "arena cross-judge pool",
  "swarm workers",
  "architect runners",
  "interrogate reviewers",
] as const;
const SETUP_SECTION_ORDER = [
  "### 2. Load current state",
  "### 3. Parse per-role efforts",
  "### 4. Collect requested effort changes",
  "### 5. Probe the requested pairs",
  "### 6. Render, preserving role families",
  "### 7. Confirm and commit",
] as const;

const DEFAULT_ROLE_DESCRIPTORS = {
  "feature, refactoring": "claude:opus@medium",
  "bug-fix": "codex:gpt-6.1-sol@high",
  "perf-issue": "codex:gpt-6.1-sol@xhigh",
  hillclimb: "codex:gpt-6.1-sol@xhigh",
  "judgment and prose": "claude:opus@high",
  "hardest tasks": "claude:opus@high",
  "how explorer": "codex:gpt-6-luna@low",
  "how explainer": "claude:fable@high",
  "why investigators, synthesizer": "codex:gpt-6-luna@high",
  "reflect tooling, judgment, divergent, synthesizer": "claude:opus@medium",
  "arena runners": "codex:gpt-6.1-sol@high, claude:opus@high",
  "arena cross-judge pool": "codex:gpt-6-astra@high, claude:fable@high",
  "swarm workers": "codex:gpt-6-sol@medium",
  "architect runners": "claude:fable@high, codex:gpt-6-astra@high",
  "interrogate reviewers": "claude:fable@high, codex:gpt-6-astra@high",
} as const;

const OPEN_OPENROUTER_MODEL = "<any OpenRouter model ID>";
const FLEX_MATRIX_HEADER = [
  "Family",
  "Provider",
  "Model",
  "Default effort",
  "Selectable efforts",
  "API key variable",
  "Base URL default",
] as const;

interface MatrixRow {
  family: string;
  upstreamChoice: string;
  provider: string;
  model: string;
  defaultEffort: Effort;
  selectableEfforts: Effort[];
  claudeNativeAgentStem: string | null;
}

function splitRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    throw new Error(`matrix row must be a pipe table: ${line}`);
  }
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim().replaceAll("`", ""));
}

function isSeparator(cells: string[]): boolean {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function asEffort(value: string): Effort {
  if ((EFFORTS as readonly string[]).includes(value)) {
    return value as Effort;
  }
  throw new Error(`not an effort: ${value}`);
}

function parseModelMatrix(
  markdown: string,
  heading = "## Model matrix",
  rowCount: number = FAMILY_ORDER.length
): MatrixRow[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) {
    throw new Error(`missing ${heading}`);
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }
  const table = lines
    .slice(start + 1, end)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  if (table.length !== rowCount + 2) {
    throw new Error(
      `${heading} must be header, separator, and ${rowCount} data rows, got ${table.length}`
    );
  }
  const header = splitRow(table[0]);
  if (header.join("|") !== MATRIX_HEADER.join("|")) {
    throw new Error(`unexpected matrix header: ${header.join(" | ")}`);
  }
  if (!isSeparator(splitRow(table[1]))) {
    throw new Error("matrix header separator missing");
  }
  return table.slice(2).map((line) => {
    const cells = splitRow(line);
    if (cells.length !== MATRIX_HEADER.length) {
      throw new Error(`matrix row has ${cells.length} cells: ${line}`);
    }
    const [
      family,
      upstreamChoice,
      provider,
      model,
      defaultEffortRaw,
      selectableRaw,
      stemRaw,
    ] = cells;
    if (!(PROVIDERS as readonly string[]).includes(provider)) {
      throw new Error(`invalid provider: ${provider}`);
    }
    const selectableEfforts = selectableRaw.split(/\s+/).map(asEffort);
    const claudeNativeAgentStem = stemRaw === "-" ? null : stemRaw;
    if (claudeNativeAgentStem !== null && !/^[a-z0-9-]+$/.test(claudeNativeAgentStem)) {
      throw new Error(`invalid Claude-native agent stem: ${stemRaw}`);
    }
    if ((provider === "claude") !== (claudeNativeAgentStem !== null)) {
      throw new Error(`${family} stem must be present iff provider is claude`);
    }
    const defaultEffort = asEffort(defaultEffortRaw);
    if (!selectableEfforts.includes(defaultEffort)) {
      throw new Error(`${family} default effort is not selectable`);
    }
    return {
      family,
      upstreamChoice,
      provider,
      model,
      defaultEffort,
      selectableEfforts,
      claudeNativeAgentStem,
    };
  });
}

function parseFrontmatter(text: string): {
  fields: Record<string, string>;
  body: string;
} {
  if (!text.startsWith("---\n")) {
    throw new Error("missing frontmatter");
  }
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) {
    throw new Error("unterminated frontmatter");
  }
  const fields: Record<string, string> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const idx = line.indexOf(": ");
    if (idx < 0) {
      throw new Error(`bad frontmatter line: ${line}`);
    }
    fields[line.slice(0, idx)] = line.slice(idx + 2);
  }
  return { fields, body: text.slice(end + 5) };
}

function firstRunSheet(markdown: string, heading = "# pstack model configuration"): string {
  const marker = `\`\`\`markdown\n${heading}\n`;
  const start = markdown.indexOf(marker);
  const end = markdown.indexOf("\n```", start + marker.length);
  if (start < 0 || end < 0) throw new Error(`missing first-run sheet: ${heading}`);
  return markdown.slice(start + "```markdown\n".length, end);
}

function roleDescriptors(markdown: string, heading?: string): Record<string, string> {
  return Object.fromEntries(Object.entries(parseModelSheet(firstRunSheet(markdown, heading)))
    .map(([role, lanes]) => [role, lanes.map((lane) => lane.descriptor).join(", ")]));
}

describe("model matrix", () => {
  const dispatch = readFileSync(DISPATCH_PATH, "utf8");
  const rows = parseModelMatrix(dispatch);
  const setup = readFileSync(SETUP_PATH, "utf8");
  const defaults = roleDescriptors(dispatch);

  it("owns the effort universe and proposed defaults for newly assigned families", () => {
    expect([...EFFORTS]).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(rows.map((row) => row.family)).toEqual([...FAMILY_ORDER]);
    for (const row of rows) {
      expect(row.upstreamChoice.length).toBeGreaterThan(0);
      expect(row.model.length).toBeGreaterThan(0);
      expect(row.selectableEfforts.length).toBeGreaterThan(0);
      expect(row.selectableEfforts).toEqual(
        EFFORTS.filter((effort) => row.selectableEfforts.includes(effort))
      );
    }
    expect(
      rows.map((row) => [row.family, row.defaultEffort])
    ).toEqual([
      ["fable", "max"],
      ["sol", "max"],
      ["grok", "xhigh"],
      ["opus", "max"],
      ["astra", "high"],
      ["sol-6.1", "high"],
      ["sol-6", "high"],
      ["luna", "high"],
    ]);
    expect(
      rows
        .filter((row) => row.family === "fable" || row.family === "opus")
        .map((row) => [row.family, row.model])
    ).toEqual([
      ["fable", "fable"],
      ["opus", "opus"],
    ]);
  });

  it("ships exactly the declared Claude-native frontier agents", () => {
    const expected = new Set<string>();
    const familyBodies = new Map<string, string>();
    for (const row of rows) {
      const stem = row.claudeNativeAgentStem;
      if (stem === null) {
        continue;
      }
      for (const effort of row.selectableEfforts) {
        const name = `pstack-${stem}-${effort}`;
        expected.add(`${name}.md`);
        const text = readFileSync(join(AGENTS_DIR, `${name}.md`), "utf8");
        const { fields, body } = parseFrontmatter(text);
        expect(fields).toEqual({
          name,
          description: `Native Claude lane for pstack roles configured as ${row.provider}:${row.model}@${effort}.`,
          model: row.model,
          effort,
          background: "true",
          disallowedTools: "Agent, Task",
        });
        const prior = familyBodies.get(stem);
        if (prior === undefined) {
          familyBodies.set(stem, body);
        } else {
          expect(body).toBe(prior);
        }
      }
    }
    const declaredCount = rows.reduce(
      (count, row) =>
        count +
        (row.claudeNativeAgentStem === null
          ? 0
          : row.selectableEfforts.length),
      0
    );
    expect(expected.size).toBe(declaredCount);
    const shipped = readdirSync(AGENTS_DIR)
      .filter((name) => name.startsWith("pstack-") && name.endsWith(".md"))
      .sort();
    expect(shipped).toEqual([...expected].sort());
  });

  it("ships the GPT-6 Codex families as independently selectable stock rows", () => {
    const gpt6Rows = rows.filter((row) =>
      (GPT6_FAMILIES as readonly string[]).includes(row.family)
    );
    expect(gpt6Rows.map((row) => [row.family, row.model])).toEqual([
      ["astra", "gpt-6-astra"],
      ["sol-6.1", "gpt-6.1-sol"],
      ["sol-6", "gpt-6-sol"],
      ["luna", "gpt-6-luna"],
    ]);
    for (const row of gpt6Rows) {
      expect(row.upstreamChoice).toBe("-");
      expect(row.provider).toBe("codex");
      expect(row.defaultEffort).toBe("high");
      expect(row.selectableEfforts).toEqual([...EFFORTS]);
      expect(row.claudeNativeAgentStem).toBeNull();
      expect(firstRunSheet(setup)).toContain(`codex:${row.model}@`);
    }
    expect(new Set(rows.map((row) => row.family)).size).toBe(rows.length);
    expect(new Set(rows.map((row) => `${row.provider}:${row.model}`)).size).toBe(rows.length);
  });

  it("owns a complete role-specific map with independent panels and efforts", () => {
    expect(defaults).toEqual(DEFAULT_ROLE_DESCRIPTORS);
    expect(Object.keys(defaults)).toEqual([...SHEET_ROLES]);
    const byFamily = new Map(rows.map((row) => [`${row.provider}:${row.model}`, row]));
    for (const lanes of Object.values(parseModelSheet(firstRunSheet(dispatch)))) {
      for (const lane of lanes) {
        if (lane.kind !== "model") throw new Error("first-run defaults must select explicit models");
        const row = byFamily.get(`${lane.provider}:${lane.model}`);
        if (row === undefined) throw new Error(`unknown first-run model: ${lane.descriptor}`);
        expect(row.selectableEfforts).toContain(lane.effort);
      }
    }
    for (const role of ["arena runners", "arena cross-judge pool", "architect runners", "interrogate reviewers"]) {
      const lanes = parseModelSheet(firstRunSheet(dispatch))[role];
      expect(lanes).toHaveLength(2);
      expect(new Set(lanes.map((lane) => lane.kind === "model" ? lane.provider : null)).size).toBe(2);
    }
    expect(defaults["arena runners"]).not.toBe(defaults["arena cross-judge pool"]);
  });

  it("passes each GPT-6 family's selected model and effort to the existing runner", () => {
    for (const row of rows.filter((row) => (GPT6_FAMILIES as readonly string[]).includes(row.family))) {
      for (const effort of row.selectableEfforts) {
        const options = parseArgs([
          "--parent", "claude",
          "--provider", row.provider,
          "--model", row.model,
          "--effort", effort,
          "--mode", "read-only",
          "--prompt", DISPATCH_PATH,
          "--cwd", PLUGIN_ROOT,
          "--output", join(PLUGIN_ROOT, `${row.family}-probe.md`),
          "--receipt", join(PLUGIN_ROOT, `${row.family}-probe.json`),
        ]);
        if (options === null) {
          throw new Error("model probe arguments must produce runner options");
        }
        validateOptions(options);
        expect(options.timeoutMs).toBeNull();
        const command = invocationCommand(options);
        expect(command.command).toBe("codex");
        expect(command.args.slice(0, 5)).toEqual([
          "exec", "--model", row.model,
          "--config", `model_reasoning_effort="${effort}"`,
        ]);
        expect(() => validateOptions({ ...options, parent: "codex" }))
          .toThrow("provider codex is native to parent codex");
      }
    }
  });

  it("keeps setup and every consuming default aligned with the canonical role map", () => {
    expect(roleDescriptors(setup)).toEqual(defaults);
    const consumers = [
      ["feature, refactoring", "poteto-mode/playbooks/feature.md"],
      ["feature, refactoring", "poteto-mode/playbooks/refactoring.md"],
      ["bug-fix", "poteto-mode/playbooks/bug-fix.md"],
      ["perf-issue", "poteto-mode/playbooks/perf-issue.md"],
      ["hillclimb", "poteto-mode/playbooks/hillclimb.md"],
      ["how explorer", "how/SKILL.md"],
      ["how explainer", "how/SKILL.md"],
      ["why investigators, synthesizer", "why/SKILL.md"],
      ["reflect tooling, judgment, divergent, synthesizer", "reflect/SKILL.md"],
      ["swarm workers", "swarm/SKILL.md", "Otherwise use"],
    ];
    for (const [role, path, prefix = "default"] of consumers) {
      expect(readFileSync(join(PLUGIN_ROOT, "skills", path), "utf8"))
        .toContain(`${prefix} \`${defaults[role]}\``);
    }
  });

  it("offers a complete OMP preset without bypassing catalog verification or probes", () => {
    const ids: Readonly<Record<string, string>> = {
      "claude:opus": "omp:anthropic/claude-opus-5-5",
      "claude:fable": "omp:anthropic/claude-fable-5-1",
      "codex:gpt-6.1-sol": "omp:openai-codex/gpt-6.1-sol",
      "codex:gpt-6-astra": "omp:openai-codex/gpt-6-astra",
      "codex:gpt-6-luna": "omp:openai-codex/gpt-6-luna",
      "codex:gpt-6-sol": "omp:openai-codex/gpt-6-sol",
    };
    const expected = Object.fromEntries(Object.entries(parseModelSheet(firstRunSheet(dispatch)))
      .map(([role, lanes]) => [role, lanes.map((lane) => {
        if (lane.kind !== "model") throw new Error("OMP preset must use explicit models");
        const id = ids[`${lane.provider}:${lane.model}`];
        if (id === undefined) throw new Error(`missing OMP preset model: ${lane.descriptor}`);
        return `${id}@${lane.effort}`;
      }).join(", ")]));
    expect(roleDescriptors(setup, "# pstack OMP model configuration")).toEqual(expected);
    expect(setup).toContain("Catalog verification and exact-descriptor probes are required before saving.");
    expect(setup).toContain("never replace an existing sheet with the preset");
    expect(setup).toContain("never fall back to another runtime or model");
  });

  it("preserves role effort instead of normalizing a family and probes unique descriptors", () => {
    expect(setup).toContain("Mixed efforts within one family are valid.");
    expect(setup).toContain("Never normalize one family's lanes to a common effort");
    expect(setup).toContain("The same model at two efforts requires two probes");
    expect(setup).toContain("preserving untouched descriptors and lane order");
    expect(setup).not.toContain("one normalized effort per family");
    expect(setup).not.toContain("<requested effort for that family>");
    expect(dispatch).toContain("Matrix Default effort cells are proposals only");
  });

  it("requires evidence handoff for external Why and Reflect lanes", () => {
    for (const name of ["why", "reflect"]) {
      const skill = readFileSync(join(PLUGIN_ROOT, "skills", name, "SKILL.md"), "utf8");
      expect(skill).toContain("External lanes have no parent MCP access.");
      expect(skill).toContain("evidence files");
      expect(skill).toContain("never silently reroute a qualified");
      expect(skill).toContain("verification gap");
      expect(skill).not.toContain("keep them native to the parent");
    }
  });

  it("keeps setup's fail-closed reconfiguration order", () => {
    let previous = -1;
    for (const heading of SETUP_SECTION_ORDER) {
      const current = setup.indexOf(heading);
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
    expect(setup).toContain("Do not probe or write while any inconsistency is unresolved.");
    expect(setup).toContain("A failed probe writes nothing:");
    expect(setup).toContain("Ask for confirmation before writing.");
  });

  it("keeps the flex matrix additive, parseable, and aligned with the runner", () => {
    const dispatch = readFileSync(DISPATCH_PATH, "utf8");
    const lines = dispatch.split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim() === "## Flex model matrix");
    expect(start).toBeGreaterThan(-1);
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].startsWith("## ")) {
        end = i;
        break;
      }
    }
    const table = lines
      .slice(start + 1, end)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("|"));
    expect(table.length).toBeGreaterThan(2 + GATEWAY_PROVIDERS.length);
    expect(splitRow(table[0]).join("|")).toBe(FLEX_MATRIX_HEADER.join("|"));
    expect(isSeparator(splitRow(table[1]))).toBe(true);
    const seen = new Set<GatewayProvider>();
    const families = new Set<string>();
    const pairs = new Set<string>();
    for (const line of table.slice(2)) {
      const cells = splitRow(line);
      expect(cells.length).toBe(FLEX_MATRIX_HEADER.length);
      const [family, provider, model, defaultEffortRaw, selectableRaw, keyVar, baseUrl] =
        cells;
      expect(GATEWAY_PROVIDERS as readonly string[]).toContain(provider);
      const gateway = provider as GatewayProvider;
      seen.add(gateway);
      expect(/^[a-z0-9-]+$/.test(family)).toBe(true);
      expect(families.has(family)).toBe(false);
      families.add(family);
      const pair = `${provider}:${model}`;
      expect(pairs.has(pair)).toBe(false);
      pairs.add(pair);
      if (gateway === "openrouter") {
        expect(model).toBe(OPEN_OPENROUTER_MODEL);
      } else {
        expect(/^[A-Za-z0-9.-]+$/.test(model)).toBe(true);
      }
      const selectable = selectableRaw.split(/\s+/).map(asEffort);
      expect(selectable).toContain(asEffort(defaultEffortRaw));
      expect(keyVar).toBe(GATEWAY_SPECS[gateway].apiKeyVar);
      expect(baseUrl).toBe(GATEWAY_SPECS[gateway].baseUrlDefault);
      expect(baseUrl.startsWith("https://")).toBe(true);
    }
    expect([...seen]).toEqual([...GATEWAY_PROVIDERS]);
    for (const pair of [
      "deepseek:deepseek-flash",
      "deepseek:deepseek-v4-pro",
      "minimax:MiniMax-M3",
      "minimax:MiniMax-M3.1-Flash-Preview",
      `openrouter:${OPEN_OPENROUTER_MODEL}`,
    ]) expect(pairs.has(pair)).toBe(true);
    expect(firstRunSheet(setup)).not.toMatch(/deepseek:|minimax:|openrouter:/i);
  });

});
