import { createTaskDetailRouteHandlers } from "../../../../lib/api/task-route-handlers";
import { serverComposition } from "../../../../lib/server/composition";

const handlers = createTaskDetailRouteHandlers(serverComposition.repository);

export const GET = handlers.GET;
