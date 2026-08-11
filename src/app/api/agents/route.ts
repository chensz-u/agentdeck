import { createAgentRouteHandlers } from "../../../lib/api/agent-route-handlers";
import { serverComposition } from "../../../lib/server/composition";

export const GET = createAgentRouteHandlers(serverComposition.agentRegistry).GET;
