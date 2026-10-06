import { parseArgs } from "node:util";
import { PARENTS, harnessAdapter } from "./harnesses.ts";
import { configurationPaths, readConfiguration } from "./configuration.ts";

export function main(args: string[]): number {
  try {
    const { values } = parseArgs({ args, options: {
      parent: { type: "string" }, cwd: { type: "string" }, role: { type: "string" },
      "require-shell": { type: "boolean" },
      "paths-only": { type: "boolean" },
    } });
    const parent = PARENTS.find((entry) => entry === values.parent);
    if (parent === undefined) throw new Error(`--parent must be one of ${PARENTS.join(", ")}`);
    const cwd = values.cwd ?? process.cwd();
    if (values["paths-only"]) {
      if (values.role !== undefined || values["require-shell"]) throw new Error("--paths-only cannot check a role");
      process.stdout.write(`${JSON.stringify({ harness: harnessAdapter(parent), paths: configurationPaths(parent, cwd) }, null, 2)}\n`);
      return 0;
    }
    const context = readConfiguration(parent, cwd);
    if (values["require-shell"] && values.role === undefined) throw new Error("--require-shell needs --role");
    if (values.role !== undefined) {
      const lanes = context.roles[values.role];
      if (lanes === undefined) throw new Error(`model sheet has no role: ${values.role}`);
      for (const lane of lanes) {
        if (values["require-shell"] && lane.capabilities?.shell === false) {
          throw new Error(`${lane.descriptor} does not support shell execution; ${values.role} requires it`);
        }
      }
    }
    process.stdout.write(`${JSON.stringify(context, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 64;
  }
}
