import { createDashboardRouteHandlers } from "../../../lib/api/task-route-handlers";
import { serverComposition } from "../../../lib/server/composition";

const handlers = createDashboardRouteHandlers(serverComposition.repository);

export const GET = handlers.GET;
