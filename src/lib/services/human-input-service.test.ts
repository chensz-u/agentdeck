import { describe, expect, it } from "vitest";

import { AgentRunStatus, HumanInputAction, RunInputState, TaskStatus, type AgentRun, type HumanInputAuditEntry, type Task } from "../domain/types";
import { HumanInputService } from "./human-input-service";

class FakeRepository {
  readonly entries: HumanInputAuditEntry[] = [];
  readonly task: Task = {
    id: "task-1", projectId: "project-1", parentTaskId: null, title: "Fixture", prompt: "Work",
    status: TaskStatus.AWAITING_INPUT, createdAt: new Date(), updatedAt: new Date(),
  };
  readonly run: AgentRun = {
    id: "run-1", taskId: "task-1", agent: "codex", status: AgentRunStatus.RUNNING, pid: 12,
    exitCode: null, error: null, logPath: null, threadId: "thread-1", turnId: "turn-1",
    inputState: RunInputState.AWAITING_INPUT, startedAt: new Date(), finishedAt: null,
  };

  async findInputContext(taskId: string, runId: string) {
    return taskId === this.task.id && runId === this.run.id ? { task: this.task, run: this.run } : null;
  }

  async listHumanInputs(runId: string) { return this.entries.filter((entry) => entry.runId === runId); }

  async appendHumanInput(input: Omit<HumanInputAuditEntry, "id" | "sequence" | "createdAt">) {
    const entry = { ...input, id: `audit-${this.entries.length + 1}`, sequence: this.entries.length + 1, createdAt: new Date() };
    this.entries.push(entry);
    return entry;
  }

  async updateRunSession(_runId: string, update: Partial<Pick<AgentRun, "threadId" | "turnId" | "inputState">>) { Object.assign(this.run, update); }
  async updateTaskStatus(_taskId: string, status: TaskStatus) { this.task.status = status; }
}

class FakeAdapter {
  readonly inputs: Array<{ runId: string; action: HumanInputAction; text: string }> = [];
  failure?: Error;

  async continueHumanInput(input: { runId: string; action: HumanInputAction; text: string }) {
    if (this.failure) throw this.failure;
    this.inputs.push(input);
    return { threadId: "thread-1", turnId: "turn-1", mode: "steer" as const };
  }
}

function createService() {
  const repository = new FakeRepository();
  const adapter = new FakeAdapter();
  return { repository, adapter, service: new HumanInputService({ repository, adapter }) };
}

describe("HumanInputService", () => {
  it.each([
    [HumanInputAction.APPROVE, undefined, "Approved"],
    [HumanInputAction.REJECT, undefined, "Rejected"],
    [HumanInputAction.TEXT, "Use the safer option.", "Use the safer option."],
  ])("audits and forwards %s on the existing run", async (action, text, expectedText) => {
    const { repository, adapter, service } = createService();

    await service.submit({ taskId: "task-1", runId: "run-1", requestId: `input-${action}`, action, text });

    expect(repository.entries).toMatchObject([{ action, requestId: `input-${action}` }]);
    expect(adapter.inputs).toEqual([{ runId: "run-1", action, text: expectedText }]);
    expect(repository.task.status).toBe(TaskStatus.RUNNING);
  });

  it("does not forward a duplicate response request id twice", async () => {
    const { adapter, service } = createService();

    await service.submit({ taskId: "task-1", runId: "run-1", requestId: "input-1", action: HumanInputAction.APPROVE });
    await service.submit({ taskId: "task-1", runId: "run-1", requestId: "input-1", action: HumanInputAction.APPROVE });

    expect(adapter.inputs).toHaveLength(1);
  });

  it("validates text and rejects action values outside the response enum", async () => {
    const { service } = createService();

    await expect(service.submit({ taskId: "task-1", runId: "run-1", requestId: "invalid", action: HumanInputAction.TEXT, text: "x".repeat(4_001) })).rejects.toThrow("at most 4000");
    await expect(service.submit({ taskId: "task-1", runId: "run-1", requestId: "invalid-action", action: HumanInputAction.REQUEST })).rejects.toThrow("Unsupported human response action");
  });

  it("serializes concurrent stop and response so only the terminal operation wins", async () => {
    const { repository, adapter, service } = createService();
    const stop = service.markTerminal("run-1");
    const response = service.submit({ taskId: "task-1", runId: "run-1", requestId: "input-1", action: HumanInputAction.APPROVE });

    await stop;
    await expect(response).rejects.toThrow("no longer active");
    expect(adapter.inputs).toHaveLength(0);
  });

  it("reports unavailable app-server continuation as recoverable and leaves input awaiting", async () => {
    const { repository, adapter } = createService();
    repository.task.status = TaskStatus.AWAITING_INPUT;
    repository.run.inputState = RunInputState.AWAITING_INPUT;
    adapter.failure = new Error("app-server connection is unavailable; restart the task to recover");
    const fresh = new HumanInputService({ repository, adapter });
    await expect(fresh.submit({ taskId: "task-1", runId: "run-1", requestId: "input-2", action: HumanInputAction.APPROVE })).rejects.toThrow("recoverable");
    expect(repository.task.status).toBe(TaskStatus.AWAITING_INPUT);
  });
});
