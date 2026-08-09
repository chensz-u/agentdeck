import { describe, expect, it } from "vitest";

import { TaskStatus, type Task } from "../../../lib/domain/types";
import {
  createTaskRetryRouteHandlers,
  createTaskRunRouteHandlers,
  createTaskStopRouteHandlers,
} from "../../../lib/api/task-action-handlers";

const context = { params: Promise.resolve({ id: "task-1" }) };

describe("task action routes", () => {
  it("starts the task named by the route parameter", async () => {
    const launched: string[] = [];
    const handlers = createTaskRunRouteHandlers({
      launch: async (id) => {
        launched.push(id);
        return { id: "run-1" };
      },
    });

    const response = await handlers.POST(new Request("http://localhost"), context);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "run-1" });
    expect(launched).toEqual(["task-1"]);
  });

  it("rejects a stop request without a run id", async () => {
    const handlers = createTaskStopRouteHandlers({ stop: async () => undefined });

    const response = await handlers.POST(
      new Request("http://localhost", { method: "POST", body: "{}" }),
      context,
    );

    expect(response.status).toBe(400);
  });

  it("stops the requested run", async () => {
    const stopped: string[] = [];
    const handlers = createTaskStopRouteHandlers({
      stop: async (taskId, runId) => { stopped.push(`${taskId}:${runId}`); },
    });

    const response = await handlers.POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ runId: "run-1" }) }),
      context,
    );

    expect(response.status).toBe(204);
    expect(stopped).toEqual(["task-1:run-1"]);
  });

  it("creates a retry without changing the original task", async () => {
    const retried: string[] = [];
    const retry: Task = {
      id: "task-2", projectId: "project-1", parentTaskId: "task-1", title: "Retry", prompt: "Retry",
      status: TaskStatus.TODO, createdAt: new Date(), updatedAt: new Date(),
    };
    const handlers = createTaskRetryRouteHandlers({
      createRetryTask: async (id) => { retried.push(id); return retry; },
    });

    const response = await handlers.POST(new Request("http://localhost"), context);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: "task-2", parentTaskId: "task-1" });
    expect(retried).toEqual(["task-1"]);
  });
});
