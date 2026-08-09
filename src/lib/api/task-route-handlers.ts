import { z } from "zod";

import { TaskStatus, type Task } from "../domain/types";
import type { RegisteredProject } from "../services/project-service";
import { TaskService, type TaskRepository } from "../services/task-service";

const createTaskSchema = z.object({
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
}).strict();

type RouteContext = { params: Promise<{ id: string }> };

export interface TaskApiStore extends TaskRepository {
  findProject(id: string): Promise<RegisteredProject | null>;
  listTasks(projectId?: string): Promise<Task[]>;
}

export function createTaskRouteHandlers(repository: TaskApiStore) {
  const service = new TaskService(repository);

  return {
    async GET(request: Request): Promise<Response> {
      const projectId = new URL(request.url).searchParams.get("projectId")?.trim();
      if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
      if (!await repository.findProject(projectId)) {
        return Response.json({ error: "Project not found" }, { status: 404 });
      }
      return Response.json(await repository.listTasks(projectId));
    },

    async POST(request: Request): Promise<Response> {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const input = createTaskSchema.safeParse(body);
      if (!input.success) return Response.json({ error: "Invalid task payload" }, { status: 400 });
      if (!await repository.findProject(input.data.projectId)) {
        return Response.json({ error: "Project not found" }, { status: 404 });
      }
      return Response.json(await service.createTask(input.data), { status: 201 });
    },
  };
}

export function createTaskDetailRouteHandlers(repository: Pick<TaskApiStore, "findTask">) {
  return {
    async GET(_request: Request, context: RouteContext): Promise<Response> {
      const { id } = await context.params;
      const task = await repository.findTask(id);
      return task
        ? Response.json(task)
        : Response.json({ error: "Task not found" }, { status: 404 });
    },
  };
}

export function createDashboardRouteHandlers(repository: Pick<TaskApiStore, "listTasks">) {
  return {
    async GET(): Promise<Response> {
      const counts = Object.fromEntries(
        Object.values(TaskStatus).map((status) => [status, 0]),
      ) as Record<TaskStatus, number>;
      for (const task of await repository.listTasks()) counts[task.status] += 1;
      return Response.json({ counts });
    },
  };
}
