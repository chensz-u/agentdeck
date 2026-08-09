import { createTaskRouteHandlers } from "../../../lib/api/task-route-handlers";
import { serverComposition } from "../../../lib/server/composition";

const handlers = createTaskRouteHandlers(serverComposition.repository);

export const GET = handlers.GET;
export const POST = handlers.POST;
