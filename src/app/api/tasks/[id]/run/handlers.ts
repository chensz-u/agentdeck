type RouteContext = { params: Promise<{ id: string }> };

export type RunTaskAction = {
  launch(taskId: string): Promise<unknown>;
};

export function createTaskRunRouteHandlers(service: RunTaskAction) {
  return {
    async POST(_request: Request, context: RouteContext): Promise<Response> {
      const { id } = await context.params;
      try {
        return Response.json(await service.launch(id), { status: 201 });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Unable to start task" },
          { status: 400 },
        );
      }
    },
  };
}
