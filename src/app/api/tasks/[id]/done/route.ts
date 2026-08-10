import { createTaskMarkDoneRouteHandlers } from "../../../../../lib/api/task-action-handlers";
import { serverComposition } from "../../../../../lib/server/composition";

export const POST = createTaskMarkDoneRouteHandlers(serverComposition.taskLifecycleService).POST;
