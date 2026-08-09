import { describe, expect, it } from "vitest";

import {
  AgentRunStatus,
  TaskStatus,
  type AgentRun,
  type Task,
} from "../domain/types";
import { TaskService, type TaskRepository } from "./task-service";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-original",
    projectId: "project-1",
    parentTaskId: null,
    title: "Implement focus mode",
    prompt: "Add the focus interaction.",
    status: TaskStatus.FAILED,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

class InMemoryTaskRepository implements TaskRepository {
  readonly tasks: Task[];
  readonly runs: AgentRun[];

  constructor(tasks: Task[], runs: AgentRun[] = []) {
    this.tasks = tasks;
    this.runs = runs;
  }

  async findTask(id: string): Promise<Task | null> {
    return this.tasks.find((candidate) => candidate.id === id) ?? null;
  }

  async createTask(input: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task> {
    const created = task({
      ...input,
      id: `task-${this.tasks.length + 1}`,
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    });
    this.tasks.push(created);
    return created;
  }
}

describe("TaskService.createRetryTask", () => {
  it("exposes the supported agent run statuses", () => {
    expect(AgentRunStatus).toEqual({
      RUNNING: "RUNNING",
      SUCCEEDED: "SUCCEEDED",
      FAILED: "FAILED",
      CANCELLED: "CANCELLED",
    });
  });

  it("creates a TODO retry that preserves its original task context", async () => {
    const original = task();
    const repository = new InMemoryTaskRepository([original]);

    const retry = await new TaskService(repository).createRetryTask(original.id);

    expect(retry).toMatchObject({
      projectId: original.projectId,
      parentTaskId: original.id,
      title: original.title,
      prompt: original.prompt,
      status: TaskStatus.TODO,
    });
  });

  it("preserves the original task and its prior runs", async () => {
    const original = task();
    const priorRun: AgentRun = {
      id: "run-original",
      taskId: original.id,
      agent: "codex",
      status: AgentRunStatus.FAILED,
      pid: 1234,
      exitCode: 1,
      error: "Agent exited unexpectedly",
      startedAt: new Date("2026-01-01T00:01:00.000Z"),
      finishedAt: new Date("2026-01-01T00:02:00.000Z"),
      logPath: "logs/run-original.log",
    };
    const repository = new InMemoryTaskRepository([original], [priorRun]);

    await new TaskService(repository).createRetryTask(original.id);

    expect(repository.tasks).toHaveLength(2);
    expect(repository.tasks[0]).toEqual(original);
    expect(repository.runs).toEqual([priorRun]);
  });

  it("rejects a retry request for an unknown task", async () => {
    const repository = new InMemoryTaskRepository([]);

    await expect(
      new TaskService(repository).createRetryTask("missing-task"),
    ).rejects.toThrow("Task missing-task was not found");
  });
});
