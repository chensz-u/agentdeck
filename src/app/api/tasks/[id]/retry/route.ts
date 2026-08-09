import { createTaskRetryRouteHandlers } from "../../../../../lib/api/task-action-handlers";
import { serverComposition } from "../../../../../lib/server/composition";

const handlers = createTaskRetryRouteHandlers(serverComposition.taskService);

export const POST = handlers.POST;
