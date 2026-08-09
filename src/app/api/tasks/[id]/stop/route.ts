import { createTaskStopRouteHandlers } from "../../../../../lib/api/task-action-handlers";
import { serverComposition } from "../../../../../lib/server/composition";

const handlers = createTaskStopRouteHandlers({
  stop: (taskId, runId) => serverComposition.runService.stopTask(taskId, runId),
});

export const POST = handlers.POST;
