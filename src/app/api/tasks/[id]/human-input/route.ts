import { createTaskHumanInputRouteHandlers } from "../../../../../lib/api/task-action-handlers";
import { serverComposition } from "../../../../../lib/server/composition";

const handlers = createTaskHumanInputRouteHandlers({
  findLatestRun: (taskId) => serverComposition.repository.findLatestRun(taskId),
  submit: (input) => serverComposition.humanInputService.submit(input),
});

export const POST = handlers.POST;
