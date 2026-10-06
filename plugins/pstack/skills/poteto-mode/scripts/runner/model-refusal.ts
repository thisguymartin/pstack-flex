import { openRouterModelRefusal } from "./flex-providers.ts";
import { openCodeModelRefusal } from "./opencode-lane.ts";
import type { Provider } from "./types.ts";

export function modelRefusal(provider: Provider, model: string): string | null {
  if (provider === "openrouter") return openRouterModelRefusal(model);
  if (provider === "opencode") return openCodeModelRefusal(model);
  return null;
}
