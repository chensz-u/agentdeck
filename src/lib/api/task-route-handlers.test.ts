import { describe, expect, it } from "vitest";

import { TaskStatus, type Task } from "../domain/types";
import {
  createDashboardRouteHandlers,
  createTaskRouteHandlers,
  createTaskDetailRouteHandlers,
  type TaskApiStore,
} from "./task-route-handlers";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    projectId: "project-1",
    parentTaskId: null,
    title: "Add task APIs",
    prompt: "Implement the local task APIs.",
    status: TaskStatus.TODO,
    createdAt: new Date("2026-08-10T00:00:00.000Z"),
    updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    ...overrides,
  };
}

class InMemoryTaskApiStore implements TaskApiStore {
  readonly tasks: Task[];

  constructor(tasks: Task[] = []) {
    this.tasks = tasks;
  }

  async findProject(id: string) {
    return id === "project-1" ? { id, name: "Fixture", path: "C:\\fixture", isGitRepository: true } : null;
  }

  async findTask(id: string): Promise<Task | null> {
    return this.tasks.find((candidate) => candidate.id === id) ?? null;
  }

  async listTasks(projectId?: string): Promise<Task[]> {
    return projectId ? this.tasks.filter((candidate) => candidate.projectId === projectId) : this.tasks;
  }

  async createTask(input: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task> {
    const created = task({ ...input, id: `task-${this.tasks.length + 1}` });
    this.tasks.push(created);
    return created;
  }
}

describe("task API handlers", () => {
  it("creates a TODO task for a registered project", async () => {
    const store = new InMemoryTaskApiStore();
    const response = await createTaskRouteHandlers(store).POST(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "project-1",
          title: "Add task APIs",
          prompt: "Implement the local task APIs.",
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      projectId: "project-1",
      status: TaskStatus.TODO,
    });
  });

  it("rejects task payloads containing execution fields", async () => {
    const response = await createTaskRouteHandlers(new InMemoryTaskApiStore()).POST(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "project-1",
          title: "Unsafe",
          prompt: "Do not accept a client-provided cwd.",
          cwd: "C:\\Windows",
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns the requested task only", async () => {
    const response = await createTaskDetailRouteHandlers(
      new InMemoryTaskApiStore([task()]),
    ).GET(new Request("http://localhost/api/tasks/task-1"), {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: "task-1" });
  });

  it("reports counts grouped by task status", async () => {
    const response = await createDashboardRouteHandlers(new InMemoryTaskApiStore([
      task({ id: "todo", status: TaskStatus.TODO }),
      task({ id: "running", status: TaskStatus.RUNNING }),
      task({ id: "review", status: TaskStatus.REVIEW }),
      task({ id: "failed", status: TaskStatus.FAILED }),
    ])).GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      counts: { TODO: 1, RUNNING: 1, REVIEW: 1, DONE: 0, FAILED: 1, CANCELLED: 0 },
    });
  });
});
