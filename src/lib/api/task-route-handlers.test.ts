import { describe, expect, it } from "vitest";

import { AgentAvailability, AgentId, ExecutionMode, HumanInputAction, HumanInputDeliveryStatus, TaskStatus, WorktreeStatus, type Task } from "../domain/types";
import { AgentRegistry } from "../agents/agent-registry";
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

  it("rejects a browser request for an unavailable agent", async () => {
    const registry = new AgentRegistry({ codex: { availability: AgentAvailability.AVAILABLE, version: "0.142.0" } });
    const response = await createTaskRouteHandlers(new InMemoryTaskApiStore(), registry).POST(
      new Request("http://localhost/api/tasks", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: "project-1", title: "No launch", prompt: "Do not select unavailable tools", agentId: AgentId.CLAUDE_CODE }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Selected agent is unavailable" });
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

  it("creates an isolated task only for a registered Git project", async () => {
    const response = await createTaskRouteHandlers(new InMemoryTaskApiStore()).POST(
      new Request("http://localhost/api/tasks", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: "project-1", title: "Isolate it", prompt: "Use a clean worktree.", executionMode: ExecutionMode.ISOLATED_WORKTREE }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ executionMode: ExecutionMode.ISOLATED_WORKTREE });
  });

  it("returns sanitized isolated worktree, baseline review, and human-request metadata", async () => {
    const store = new InMemoryTaskApiStore([task({ status: TaskStatus.REVIEW })]);
    Object.assign(store, {
      findLatestRun: async () => ({ id: "run-1", taskId: "task-1" }),
      findDiff: async () => ({ changedPaths: ["isolated.txt"], diff: "baseline diff" }),
      findWorktreeByTaskId: async () => ({
        id: "worktree-1", taskId: "task-1", projectId: "project-1", projectPath: "C:\\secret-project",
        worktreePath: "C:\\secret-project\\.agentdeck\\worktrees\\task-task-1", taskBranch: "agentdeck/task-task-1",
        baselineBranch: "main", baselineSha: "a".repeat(40), createdAt: new Date(), status: WorktreeStatus.READY,
        error: null, cleanupRequestedAt: null, cleanedAt: null, cleanupError: null,
      }),
      listHumanInputs: async () => [{
        id: "audit-1", sequence: 1, taskId: "task-1", runId: "run-1", action: HumanInputAction.REQUEST,
        requestId: "request-1", payload: { kind: "QUESTION", threadId: "secret-thread", turnId: "secret-turn", questionIds: ["q-1"], questions: [{ id: "q-1", header: "Approach", question: "Which approach?", options: ["A", "B"] }] },
        deliveryStatus: HumanInputDeliveryStatus.PENDING, deliveryError: null, createdAt: new Date(),
      }],
    });

    const response = await createTaskDetailRouteHandlers(store).GET(new Request("http://localhost/api/tasks/task-1"), contextFor("task-1"));
    const body = await response.json();

    expect(body).toMatchObject({
      worktree: { id: "worktree-1", status: WorktreeStatus.READY, taskBranch: "agentdeck/task-task-1", projectPath: "C:\\secret-project", worktreePath: "C:\\secret-project\\.agentdeck\\worktrees\\task-task-1" },
      review: { changedPaths: ["isolated.txt"], diff: "baseline diff" },
      humanInputRequests: [{ requestId: "request-1", payload: { kind: "QUESTION", questionIds: ["q-1"], questions: [{ id: "q-1", header: "Approach", question: "Which approach?", options: ["A", "B"] }] } }],
    });
    expect(JSON.stringify(body)).not.toContain("secret-thread");
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
      counts: {
        TODO: 1, CREATING_WORKTREE: 0, RUNNING: 1, AWAITING_INPUT: 0,
        REVIEW: 1, MERGE_READY: 0, DONE: 0, CLEANED: 0, FAILED: 1,
        WORKTREE_FAILED: 0, CANCELLED: 0,
      },
    });
  });
});

function contextFor(id: string) {
  return { params: Promise.resolve({ id }) };
}
