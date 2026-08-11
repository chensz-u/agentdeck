import { createTaskWorktreeCleanupRouteHandlers } from "../../../../../lib/api/task-action-handlers";
import { serverComposition } from "../../../../../lib/server/composition";

export const POST = createTaskWorktreeCleanupRouteHandlers(serverComposition.worktreeService).POST;
