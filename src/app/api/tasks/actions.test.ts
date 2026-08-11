import { describe, expect, it } from "vitest";

import { AgentRunStatus, HumanInputAction, TaskStatus, type Task } from "../../../lib/domain/types";
import {
  createTaskRetryRouteHandlers,
  createTaskHumanInputRouteHandlers,
  createTaskWorktreeCleanupRouteHandlers,
  createTaskMarkDoneRouteHandlers,
  createTaskMarkMergeReadyRouteHandlers,
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

  it("resolves the task's current run server-side and forwards only typed human input", async () => {
    const submitted: unknown[] = [];
    const handlers = createTaskHumanInputRouteHandlers({
      findLatestRun: async () => ({ id: "run-1", taskId: "task-1", agent: "codex", status: AgentRunStatus.RUNNING, pid: 1, exitCode: null, error: null, logPath: null, startedAt: new Date(), finishedAt: null }),
      submit: async (input) => { submitted.push(input); return { id: "audit-1" }; },
    });

    const response = await handlers.POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ requestId: "server-1", action: HumanInputAction.APPROVE }),
    }), context);

    expect(response.status).toBe(200);
    expect(submitted).toEqual([{ taskId: "task-1", runId: "run-1", requestId: "server-1", action: HumanInputAction.APPROVE }]);
  });

  it("accepts structured answers only for a server-issued human-input request", async () => {
    const submitted: unknown[] = [];
    const handlers = createTaskHumanInputRouteHandlers({
      findLatestRun: async () => ({ id: "run-1", taskId: "task-1", agent: "codex", status: AgentRunStatus.RUNNING, pid: 1, exitCode: null, error: null, logPath: null, startedAt: new Date(), finishedAt: null }),
      submit: async (input) => { submitted.push(input); return { id: "audit-1" }; },
    });

    const response = await handlers.POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ requestId: "server-questions", action: HumanInputAction.TEXT, answers: { approach: "Use the first option", scope: "Keep it focused" } }),
    }), context);

    expect(response.status).toBe(200);
    expect(submitted).toEqual([{
      taskId: "task-1", runId: "run-1", requestId: "server-questions", action: HumanInputAction.TEXT,
      answers: { approach: "Use the first option", scope: "Keep it focused" },
    }]);
  });

  it("rejects browser-supplied protocol identifiers on human input", async () => {
    const handlers = createTaskHumanInputRouteHandlers({
      findLatestRun: async () => null,
      submit: async () => ({ id: "audit-1" }),
    });

    const response = await handlers.POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ requestId: "server-1", action: HumanInputAction.APPROVE, threadId: "forged" }),
    }), context);

    expect(response.status).toBe(400);
  });

  it("rejects the server-only REQUEST audit action", async () => {
    const handlers = createTaskHumanInputRouteHandlers({
      findLatestRun: async () => null,
      submit: async () => ({ id: "audit-1" }),
    });

    const response = await handlers.POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ requestId: "server-1", action: HumanInputAction.REQUEST }),
    }), context);

    expect(response.status).toBe(400);
  });

  it("performs merge-ready, done, and clean-worktree actions using only the route task id", async () => {
    const calls: string[] = [];
    const mergeReady = createTaskMarkMergeReadyRouteHandlers({ markMergeReady: async (id) => { calls.push(`merge:${id}`); } });
    const done = createTaskMarkDoneRouteHandlers({ markDone: async (id) => { calls.push(`done:${id}`); } });
    const cleanup = createTaskWorktreeCleanupRouteHandlers({ cleanup: async (id) => { calls.push(`cleanup:${id}`); } });

    expect((await mergeReady.POST(new Request("http://localhost"), context)).status).toBe(204);
    expect((await done.POST(new Request("http://localhost"), context)).status).toBe(204);
    expect((await cleanup.POST(new Request("http://localhost"), context)).status).toBe(204);
    expect(calls).toEqual(["merge:task-1", "done:task-1", "cleanup:task-1"]);
  });
});
