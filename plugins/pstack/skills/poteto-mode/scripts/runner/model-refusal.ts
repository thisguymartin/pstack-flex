import { ompModelRefusal } from "../omp/policy.ts";
import { openRouterModelRefusal } from "./flex-providers.ts";
import { openCodeModelRefusal } from "./opencode-lane.ts";
import type { Provider } from "./types.ts";

export function modelRefusal(provider: Provider, model: string): string | null {
  if (provider === "omp") return ompModelRefusal(model);
  if (provider === "openrouter") return openRouterModelRefusal(model);
  if (provider === "opencode") return openCodeModelRefusal(model);
  return null;
}
