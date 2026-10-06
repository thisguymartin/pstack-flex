import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
const DESCRIPTOR_RE =
  /(claude|codex|grok):[a-z0-9.-]+@(low|medium|high|xhigh|max)/g;
const PANEL_ROLES = [
  "arena runners",
  "arena cross-judge pool",
  "interrogate reviewers",
] as const;
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
  "### 3. Parse per-family efforts",
  "### 4. Collect one requested effort per family",
  "### 5. Probe the requested pairs",
  "### 6. Render, preserving role families",
  "### 7. Confirm and commit",
] as const;

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

function defaultDescriptor(row: MatrixRow): string {
  return `${row.provider}:${row.model}@${row.defaultEffort}`;
}

function parseDefaultPanel(
  markdown: string,
  heading = "## Default panel"
): string[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) {
    throw new Error(`missing ${heading}`);
  }
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      break;
    }
    if (lines[i].startsWith("`")) {
      return lines[i].match(DESCRIPTOR_RE) ?? [];
    }
  }
  throw new Error(`${heading} has no descriptor line`);
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

function firstRunSheet(setup: string): string {
  const match = setup.match(
    /```markdown\n(# pstack model configuration\n[\s\S]*?)```/
  );
  if (!match) {
    throw new Error("setup-pstack is missing the first-run sheet fence");
  }
  return match[1];
}

describe("model matrix", () => {
  const dispatch = readFileSync(DISPATCH_PATH, "utf8");
  const rows = parseModelMatrix(dispatch);
  const setup = readFileSync(SETUP_PATH, "utf8");
  const panel = parseDefaultPanel(dispatch);
  const architectPanel = parseDefaultPanel(
    dispatch,
    "## Default architect panel"
  );

  it("owns the effort universe and first-run defaults", () => {
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

  it("ships the GPT-6 Codex families as stock rows and puts them in the first-run sheet", () => {
    const gpt6Rows = rows.filter((row) =>
      (GPT6_FAMILIES as readonly string[]).includes(row.family)
    );
    expect(gpt6Rows.map((row) => [row.family, row.model])).toEqual([
      ["astra", "gpt-6-astra"],
      ["sol-6.1", "gpt-6.1-sol"],
      ["sol-6", "gpt-6-sol"],
      ["luna", "gpt-6-luna"],
    ]);
    const sheet = firstRunSheet(setup);
    for (const row of gpt6Rows) {
      expect(row.upstreamChoice).toBe("-");
      expect(row.provider).toBe("codex");
      expect(row.defaultEffort).toBe("high");
      expect(row.selectableEfforts).toEqual([...EFFORTS]);
      expect(row.claudeNativeAgentStem).toBeNull();
      if (row.family !== "sol-6") {
        expect(sheet).toContain(defaultDescriptor(row));
      }
    }
    expect(new Set(rows.map((row) => row.family)).size).toBe(rows.length);
    expect(new Set(rows.map((row) => `${row.provider}:${row.model}`)).size)
      .toBe(rows.length);
    const sol6 = defaultDescriptor(rows.find((row) => row.family === "sol-6.1")!);
    const luna = defaultDescriptor(rows.find((row) => row.family === "luna")!);
    for (const role of ["feature, refactoring", "bug-fix", "perf-issue", "hillclimb"]) {
      expect(sheet).toContain(`${role}: ${sol6}\n`);
    }
    for (const role of ["how explorer", "swarm workers"]) {
      expect(sheet).toContain(`${role}: ${luna}\n`);
    }

  });

  it("owns the default panel: four lanes, three providers, matrix default efforts", () => {
    expect(panel).toEqual([
      "claude:fable@max",
      "codex:gpt-6-astra@high",
      "grok:grok-4.7@xhigh",
      "claude:opus@max",
    ]);
    const byDescriptor = new Set(rows.map(defaultDescriptor));
    for (const descriptor of panel) {
      expect(byDescriptor.has(descriptor)).toBe(true);
    }
    const providers = new Set(panel.map((descriptor) => descriptor.split(":")[0]));
    expect(providers.size).toBeGreaterThanOrEqual(2);
  });

  it("owns the architect default: Astra and Fable at matrix default efforts", () => {
    expect(architectPanel).toEqual([
      "codex:gpt-6-astra@high",
      "claude:fable@max",
    ]);
    const byDescriptor = new Set(rows.map(defaultDescriptor));
    for (const descriptor of architectPanel) {
      expect(byDescriptor.has(descriptor)).toBe(true);
    }
    expect(firstRunSheet(setup)).toContain(
      `architect runners: ${architectPanel.join(", ")}\n`
    );
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

  it("keeps setup's first-run default panel copy aligned with the matrix", () => {
    const sheet = firstRunSheet(setup);
    const roles = sheet
      .split("\n")
      .filter((line) => line.includes(": "))
      .map((line) => line.slice(0, line.indexOf(": ")));
    expect(roles).toEqual([...SHEET_ROLES]);
    const byFamily = new Map<string, MatrixRow>(
      rows.map((row) => [`${row.provider}:${row.model}`, row])
    );
    for (const descriptor of sheet.match(DESCRIPTOR_RE) ?? []) {
      const at = descriptor.lastIndexOf("@");
      const key = descriptor.slice(0, at);
      const effort = descriptor.slice(at + 1);
      const row = byFamily.get(key);
      if (row === undefined) {
        throw new Error(`unknown first-run descriptor: ${descriptor}`);
      }
      expect(effort).toBe(row.defaultEffort);
    }
    const expectedPanel = panel.join(", ");
    for (const role of PANEL_ROLES) {
      const line = sheet
        .split("\n")
        .find((entry) => entry.startsWith(`${role}:`));
      if (line === undefined) {
        throw new Error(`missing first-run panel row: ${role}`);
      }
      expect(line).toBe(`${role}: ${expectedPanel}`);
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
