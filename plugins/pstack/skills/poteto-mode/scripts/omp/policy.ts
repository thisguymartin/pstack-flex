import { openRouterModelRefusal } from "../runner/flex-providers.ts";

export const OMP_EXTRA_EFFORTS = ["off", "minimal"] as const;

export function ompRuntimeRefusal(
  parent: string,
  provider: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return (parent === "omp" || env.PSTACK_RUNTIME === "omp") && provider !== "omp"
    ? "OMP-only mode refuses other runtimes; choose omp:<provider>/<model>@<effort>"
    : null;
}

export function ompEffortRefusal(provider: string, effort: string): string | null {
  return provider !== "omp" && (OMP_EXTRA_EFFORTS as readonly string[]).includes(effort)
    ? "off and minimal require OMP"
    : null;
}

export function ompModelRefusal(model: string): string | null {
  if (!/^[a-zA-Z0-9_-]+\/[^\s,:@*?]+$/.test(model)) {
    return "OMP model must be an exact <provider>/<model> identifier, without aliases, patterns or effort suffixes";
  }
  return model.startsWith("openrouter/")
    ? openRouterModelRefusal(model.slice("openrouter/".length))
    : null;
}

export function assertOmpAssignments(
  parent: string,
  roles: Readonly<Record<string, readonly { kind: string; provider?: string }[]>>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (parent !== "omp" && env.PSTACK_RUNTIME !== "omp") return;
  for (const choices of Object.values(roles)) {
    for (const choice of choices) {
      if (choice.kind !== "model" || choice.provider !== "omp") {
        throw new Error("OMP-only mode requires explicit omp:<provider>/<model>@<effort> assignments; auto and other runtimes are disabled");
      }
    }
  }
}
