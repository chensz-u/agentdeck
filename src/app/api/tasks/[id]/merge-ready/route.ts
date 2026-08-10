import { createTaskMarkMergeReadyRouteHandlers } from "../../../../../lib/api/task-action-handlers";
import { serverComposition } from "../../../../../lib/server/composition";

export const POST = createTaskMarkMergeReadyRouteHandlers(serverComposition.taskLifecycleService).POST;
