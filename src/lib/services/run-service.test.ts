import { describe, expect, it } from "vitest";

import {
  AgentRunStatus,
  TaskStatus,
  type AgentRun,
  type Project,
  type Task,
} from "../domain/types";
import type { CodexAdapter, CodexRunRequest } from "../codex/codex-adapter";
import { RunService, type RunLifecycleRepository } from "./run-service";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    projectId: "project-1",
    parentTaskId: null,
    title: "Implement focus mode",
    prompt: "Add the focus interaction.",
    status: TaskStatus.TODO,
    createdAt: new Date("2026-08-09T12:00:00.000Z"),
    updatedAt: new Date("2026-08-09T12:00:00.000Z"),
    ...overrides,
  };
}

function project(): Project {
  return {
    id: "project-1",
    name: "Fixture",
    path: "C:\\fixture",
    gitEnabled: true,
    gitRemote: null,
    gitBranch: "main",
    createdAt: new Date("2026-08-09T12:00:00.000Z"),
    updatedAt: new Date("2026-08-09T12:00:00.000Z"),
  };
}

class InMemoryRunRepository implements RunLifecycleRepository {
  readonly tasks: Task[];
  readonly runs: AgentRun[] = [];
  readonly capturedDiffs = new Map<string, { changedPaths: string[]; diff: string }>();

  constructor(initialTask = task()) {
    this.tasks = [initialTask];
  }

  async findTaskWithProject(id: string) {
    const found = this.tasks.find((candidate) => candidate.id === id);
    return found ? { task: found, project: project() } : null;
  }

  async claimTaskRun(
    id: string,
    input: Omit<AgentRun, "id" | "startedAt" | "finishedAt" | "taskId">,
  ) {
    const found = this.tasks.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`Task ${id} was not found`);
    if (found.status !== TaskStatus.TODO) throw new Error(`Task ${id} is not ready to run`);
    const created: AgentRun = {
      ...input,
      taskId: id,
      id: `run-${this.runs.length + 1}`,
      startedAt: new Date("2026-08-09T12:00:00.000Z"),
      finishedAt: null,
    };
    this.runs.push(created);
    found.status = TaskStatus.RUNNING;
    return { run: created, task: found, project: project() };
  }

  async createRun(input: Omit<AgentRun, "id" | "startedAt" | "finishedAt">): Promise<AgentRun> {
    const created: AgentRun = {
      ...input,
      id: `run-${this.runs.length + 1}`,
      startedAt: new Date("2026-08-09T12:00:00.000Z"),
      finishedAt: null,
    };
    this.runs.push(created);
    return created;
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<void> {
    const found = this.tasks.find((candidate) => candidate.id === id);
    if (!found) throw new Error("Task not found");
    found.status = status;
  }

  async updateRun(id: string, update: Partial<Pick<AgentRun, "pid" | "status" | "exitCode" | "error" | "finishedAt">>): Promise<void> {
    const found = this.runs.find((candidate) => candidate.id === id);
    if (!found) throw new Error("Run not found");
    Object.assign(found, update);
  }

  async saveDiff(runId: string, changedPaths: string[], diff: string): Promise<void> {
    this.capturedDiffs.set(runId, { changedPaths, diff });
  }
}

class MemoryEvents {
  readonly events: Array<{ runId: string; type: string; params: unknown }> = [];

  async append(runId: string, event: { type: string; params: unknown }): Promise<void> {
    this.events.push({ runId, ...event });
  }
}

class FakeAdapter implements CodexAdapter {
  requests: CodexRunRequest[] = [];
  stopped: string[] = [];
  private resolveCompletion!: (result: { exitCode: number | null; error?: string }) => void;

  async launch(request: CodexRunRequest) {
    this.requests.push(request);
    return {
      pid: 4321,
      completed: new Promise<{ exitCode: number | null; error?: string }>((resolve) => {
        this.resolveCompletion = resolve;
      }),
    };
  }

  async stop(runId: string): Promise<void> {
    this.stopped.push(runId);
  }

  complete(exitCode: number | null, error?: string): void {
    this.resolveCompletion({ exitCode, error });
  }
}

function createService(adapter = new FakeAdapter()) {
  const repository = new InMemoryRunRepository();
  const events = new MemoryEvents();
  const git = {
    getChangedPaths: async () => ["note.txt"],
    getDiff: async () => "diff --git a/note.txt b/note.txt",
  };
  return { adapter, repository, events, service: new RunService({ repository, adapter, events, git }) };
}

describe("RunService", () => {
  it("launches a task, records the PID, and persists adapter events", async () => {
    const { adapter, events, repository, service } = createService();

    const run = await service.launch("task-1");
    await adapter.requests[0].onEvent({ type: "item/started", params: { item: "work" } });

    expect(run).toMatchObject({ taskId: "task-1", status: AgentRunStatus.RUNNING, pid: 4321 });
    expect(repository.tasks[0].status).toBe(TaskStatus.RUNNING);
    expect(events.events).toContainEqual({
      runId: run.id,
      type: "item/started",
      params: { item: "work" },
    });
  });

  it("allows only one concurrent launch for a TODO task", async () => {
    const { repository, service } = createService();

    const results = await Promise.allSettled([service.launch("task-1"), service.launch("task-1")]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(repository.runs).toHaveLength(1);
  });

  it("moves a successful run to REVIEW and collects its Git diff", async () => {
    const { adapter, repository, service } = createService();

    const run = await service.launch("task-1");
    adapter.complete(0);
    await service.waitForCompletion(run.id);

    expect(repository.tasks[0].status).toBe(TaskStatus.REVIEW);
    expect(repository.runs[0]).toMatchObject({ status: AgentRunStatus.SUCCEEDED, exitCode: 0 });
    expect(repository.capturedDiffs.get(run.id)).toEqual({
      changedPaths: ["note.txt"],
      diff: "diff --git a/note.txt b/note.txt",
    });
  });

  it("moves a failed process exit to FAILED and retains the error", async () => {
    const { adapter, repository, service } = createService();

    const run = await service.launch("task-1");
    adapter.complete(1, "Codex exited unexpectedly");
    await service.waitForCompletion(run.id);

    expect(repository.tasks[0].status).toBe(TaskStatus.FAILED);
    expect(repository.runs[0]).toMatchObject({
      status: AgentRunStatus.FAILED,
      exitCode: 1,
      error: "Codex exited unexpectedly",
    });
  });

  it("stops a run and keeps its terminal state CANCELLED", async () => {
    const { adapter, repository, service } = createService();

    const run = await service.launch("task-1");
    await service.stop(run.id);
    adapter.complete(null);
    await service.waitForCompletion(run.id);

    expect(adapter.stopped).toEqual([run.id]);
    expect(repository.tasks[0].status).toBe(TaskStatus.CANCELLED);
    expect(repository.runs[0]).toMatchObject({ status: AgentRunStatus.CANCELLED });
  });

  it("returns a persisted FAILED run when adapter startup fails", async () => {
    const adapter: CodexAdapter = {
      launch: async () => { throw new Error("app-server and fallback unavailable"); },
      stop: async () => undefined,
    };
    const { repository, service } = createService(adapter as FakeAdapter);

    const run = await service.launch("task-1");

    expect(run).toMatchObject({ status: AgentRunStatus.FAILED, error: "app-server and fallback unavailable" });
    expect(repository.tasks[0].status).toBe(TaskStatus.FAILED);
  });
});
