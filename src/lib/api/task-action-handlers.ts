import { z } from "zod";

import { HumanInputAction, type AgentRun, type Task } from "../domain/types";
import type { HumanInputSubmission } from "../services/human-input-service";

type RouteContext = { params: Promise<{ id: string }> };

export type RunTaskAction = { launch(taskId: string): Promise<unknown> };
export type StopTaskAction = { stop(taskId: string, runId: string): Promise<void> };
export type RetryTaskAction = { createRetryTask(taskId: string): Promise<Task> };
export type HumanInputTaskAction = {
  findLatestRun(taskId: string): Promise<AgentRun | null>;
  submit(input: HumanInputSubmission): Promise<unknown>;
};
export type MarkMergeReadyTaskAction = { markMergeReady(taskId: string): Promise<void> };
export type MarkDoneTaskAction = { markDone(taskId: string): Promise<void> };
export type WorktreeCleanupTaskAction = { cleanup(taskId: string): Promise<void> };

const stopSchema = z.object({ runId: z.string().trim().min(1) }).strict();
const humanInputSchema = z.object({
  requestId: z.string().trim().min(1),
  action: z.enum([HumanInputAction.APPROVE, HumanInputAction.REJECT, HumanInputAction.TEXT]),
  answers: z.record(z.string().trim().min(1).max(4_000)).optional(),
}).strict();

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

export function createTaskHumanInputRouteHandlers(service: HumanInputTaskAction) {
  return {
    async POST(request: Request, context: RouteContext): Promise<Response> {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const parsed = humanInputSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: "Invalid human input payload" }, { status: 400 });
      const { id: taskId } = await context.params;
      const run = await service.findLatestRun(taskId);
      if (!run) return Response.json({ error: "No run found for task" }, { status: 404 });
      try {
        return Response.json(await service.submit({ taskId, runId: run.id, ...parsed.data }));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Unable to deliver human input" }, { status: 400 });
      }
    },
  };
}

function createTaskIdOnlyActionHandlers(action: (taskId: string) => Promise<void>, fallback: string) {
  return {
    async POST(_request: Request, context: RouteContext): Promise<Response> {
      const { id } = await context.params;
      try {
        await action(id);
        return new Response(null, { status: 204 });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : fallback }, { status: 400 });
      }
    },
  };
}

export function createTaskMarkMergeReadyRouteHandlers(service: MarkMergeReadyTaskAction) {
  return createTaskIdOnlyActionHandlers((taskId) => service.markMergeReady(taskId), "Unable to mark task merge ready");
}

export function createTaskMarkDoneRouteHandlers(service: MarkDoneTaskAction) {
  return createTaskIdOnlyActionHandlers((taskId) => service.markDone(taskId), "Unable to mark task done");
}

export function createTaskWorktreeCleanupRouteHandlers(service: WorktreeCleanupTaskAction) {
  return createTaskIdOnlyActionHandlers((taskId) => service.cleanup(taskId), "Unable to clean worktree");
}
