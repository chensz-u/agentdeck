import { createTaskRunRouteHandlers } from "../../../../../lib/api/task-action-handlers";
import { serverComposition } from "../../../../../lib/server/composition";

const handlers = createTaskRunRouteHandlers(serverComposition.runService);

export const POST = handlers.POST;
