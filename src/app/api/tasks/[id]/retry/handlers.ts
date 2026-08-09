import type { Task } from "../../../../../lib/domain/types";

type RouteContext = { params: Promise<{ id: string }> };

export type RetryTaskAction = {
  createRetryTask(taskId: string): Promise<Task>;
};

export function createTaskRetryRouteHandlers(service: RetryTaskAction) {
  return {
    async POST(_request: Request, context: RouteContext): Promise<Response> {
      const { id } = await context.params;
      try {
        return Response.json(await service.createRetryTask(id), { status: 201 });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Unable to retry task" },
          { status: 400 },
        );
      }
    },
  };
}
