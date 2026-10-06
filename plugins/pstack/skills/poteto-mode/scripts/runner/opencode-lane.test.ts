import { describe, expect, it } from "bun:test";
import {
  openCodeLane,
  openCodeModelRefusal,
  inspectOpenCodeModels,
} from "./opencode-lane.ts";

function listing(models: Record<string, readonly string[] | null>): string {
  return Object.entries(models)
    .map(([id, variants]) =>
      `${id}\n${JSON.stringify(
        {
          id,
          capabilities: { reasoning: true },
          ...(variants === null ? {} : { variants: Object.fromEntries(variants.map((v) => [v, {}])) }),
        },
        null,
        2
      )}`
    )
    .join("\n");
}

describe("openCodeModelRefusal", () => {
  it("requires OpenCode's <provider>/<model> form", () => {
    expect(openCodeModelRefusal("openrouter/z-ai/glm-5.3")).toBeNull();
    expect(openCodeModelRefusal("opencode/big-pickle")).toBeNull();
    expect(openCodeModelRefusal("openrouter/openrouter/auto")).toContain("router");
    expect(openCodeModelRefusal("openrouter/openrouter/free")).toContain("router");
    for (const model of ["glm-5.3", "/glm-5.3", "openrouter/"]) {
      expect(openCodeModelRefusal(model)).toContain("must be <provider>/<model>");
    }
  });
});

describe("inspectOpenCodeModels", () => {
  const stdout = listing({
    "openrouter/z-ai/glm-5.3": ["low", "high", "max"],
    "openrouter/z-ai/glm-5.3-air": ["low", "medium", "high"],
    "openrouter/acme/plain": [],
    "openrouter/acme/bare": null,
  });

  it("passes a listed model that offers the requested effort", () => {
    expect(inspectOpenCodeModels(stdout, "openrouter/z-ai/glm-5.3", "max").status).toBe("passed");
  });

  it("names the variants a model offers when the effort is not one of them", () => {
    expect(inspectOpenCodeModels(stdout, "openrouter/z-ai/glm-5.3", "medium")).toEqual({ status: "unavailable-model", evidence:
      "OpenCode model openrouter/z-ai/glm-5.3 offers no medium effort variant; it offers low, high, max"
    });
    for (const model of ["openrouter/acme/plain", "openrouter/acme/bare"]) {
      expect(inspectOpenCodeModels(stdout, model, "high").evidence).toEndWith("it offers none");
    }
  });

  it("matches the model ID exactly, never a sibling that extends it", () => {
    expect(inspectOpenCodeModels(stdout, "openrouter/z-ai/glm-5", "high")).toEqual({ status: "unavailable-model", evidence:
      "OpenCode lists no model openrouter/z-ai/glm-5 among openrouter's connected models"
    });
  });
});

describe("OpenCode listing failures", () => {
  it("distinguishes malformed catalog output from a missing model", () => {
    expect(inspectOpenCodeModels("format changed", "openrouter/z-ai/glm-5.3", "high").status).toBe("child-failed");
    expect(inspectOpenCodeModels('openrouter/z-ai/glm-5.3\n{"variants":', "openrouter/z-ai/glm-5.3", "high").status).toBe("child-failed");
    expect(inspectOpenCodeModels("", "openrouter/z-ai/glm-5.3", "high").status).toBe("unavailable-model");
    expect(inspectOpenCodeModels('openrouter/z-ai/glm-5.3\n{"variants":{"high":{}}}', "openrouter/z-ai/glm-5.3", "high").status).toBe("passed");
  });
});

describe("OpenCode lane permissions", () => {
  it("pairs each fresh agent with its access mode and grants no shell", () => {
    const readOnly = openCodeLane("read-only");
    const writer = openCodeLane("isolated-write");
    expect(readOnly.agent).not.toBe(writer.agent);
    for (const lane of [readOnly, writer]) {
      const config = JSON.parse(lane.environment.OPENCODE_CONFIG_CONTENT);
      expect(Object.keys(config.agent)).toEqual([lane.agent]);
      const permission = config.agent[lane.agent].permission;
      expect(Object.entries(permission)[0]).toEqual(["*", "deny"]);
      for (const tool of ["bash", "task", "skill", "webfetch"]) expect(permission[tool]).toBeUndefined();
    }
    expect(JSON.parse(readOnly.environment.OPENCODE_CONFIG_CONTENT).agent[readOnly.agent].permission.edit).toBeUndefined();
    const permission = JSON.parse(writer.environment.OPENCODE_CONFIG_CONTENT).agent[writer.agent].permission;
    expect(permission.edit).toBe("allow");
    expect(permission.external_directory).toBeUndefined();
  });
});
