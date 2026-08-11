import type { AgentRegistry } from "../agents/agent-registry";

/** Browser-facing metadata only; it never exposes executable paths or templates. */
export function createAgentRouteHandlers(registry: AgentRegistry) {
  return { GET: async (): Promise<Response> => Response.json(registry.list()) };
}
