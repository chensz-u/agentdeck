import { z } from "zod";

import type { Task } from "../domain/types";

type RouteContext = { params: Promise<{ id: string }> };

export type RunTaskAction = { launch(taskId: string): Promise<unknown> };
export type StopTaskAction = { stop(taskId: string, runId: string): Promise<void> };
export type RetryTaskAction = { createRetryTask(taskId: string): Promise<Task> };

const stopSchema = z.object({ runId: z.string().trim().min(1) }).strict();

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

export function createTaskStopRouteHandlers(service: StopTaskAction) {
  return {
    async POST(request: Request, context: RouteContext): Promise<Response> {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const parsed = stopSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: "Invalid stop payload" }, { status: 400 });
      const { id } = await context.params;
      try {
        await service.stop(id, parsed.data.runId);
        return new Response(null, { status: 204 });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Unable to stop run" },
          { status: 400 },
        );
      }
    },
  };
}

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
