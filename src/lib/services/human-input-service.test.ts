import { describe, expect, it } from "vitest";

import { AgentRunStatus, HumanInputAction, HumanInputDeliveryStatus, RunInputState, TaskStatus, type AgentRun, type HumanInputAuditEntry, type Task } from "../domain/types";
import { HumanInputService } from "./human-input-service";

class FakeRepository {
  readonly entries: HumanInputAuditEntry[] = [];
  readonly task: Task = { id: "task-1", projectId: "project-1", parentTaskId: null, title: "Fixture", prompt: "Work", status: TaskStatus.RUNNING, createdAt: new Date(), updatedAt: new Date() };
  readonly run: AgentRun = { id: "run-1", taskId: "task-1", agent: "codex", status: AgentRunStatus.RUNNING, pid: 12, exitCode: null, error: null, logPath: null, threadId: "thread-1", turnId: "turn-1", inputState: RunInputState.IDLE, startedAt: new Date(), finishedAt: null };

  async findInputContext(taskId: string, runId: string) { return taskId === this.task.id && runId === this.run.id ? { task: this.task, run: this.run } : null; }
  async listHumanInputs(runId: string) { return this.entries.filter((entry) => entry.runId === runId); }
  async appendHumanInput(input: Omit<HumanInputAuditEntry, "id" | "sequence" | "createdAt">) {
    const entry = { ...input, id: `audit-${this.entries.length + 1}`, sequence: this.entries.length + 1, createdAt: new Date() };
    this.entries.push(entry);
    return entry;
  }
  async updateHumanInputDelivery(runId: string, requestId: string, status: HumanInputDeliveryStatus, error: string | null) {
    const entry = this.entries.find((candidate) => candidate.runId === runId && candidate.requestId === requestId);
    if (!entry) throw new Error("Input request not found");
    entry.deliveryStatus = status; entry.deliveryError = error;
  }
  async updateRunSession(_runId: string, update: Partial<Pick<AgentRun, "threadId" | "turnId" | "inputState">>) { Object.assign(this.run, update); }
  async updateTaskStatus(_taskId: string, status: TaskStatus) { this.task.status = status; }
}

class FakeAdapter {
  readonly inputs: Array<{ runId: string; requestId: string; action: HumanInputAction; text: string }> = [];
  failure?: Error;
  async respondToHumanInput(input: { runId: string; requestId: string; action: HumanInputAction; text: string }) {
    this.inputs.push(input);
    if (this.failure) throw this.failure;
  }
}

function createService() {
  const repository = new FakeRepository();
  const adapter = new FakeAdapter();
  return { repository, adapter, service: new HumanInputService({ repository, adapter }) };
}

const confirmation = { requestId: "server-1", rpcId: "server-1", kind: "CONFIRMATION" as const, threadId: "thread-1", turnId: "turn-1", prompt: "Approve?" };
const question = { requestId: "server-2", rpcId: "server-2", kind: "QUESTION" as const, threadId: "thread-1", turnId: "turn-1", prompt: "Choice?", questionIds: ["choice"] };

describe("HumanInputService", () => {
  it("persists a server-originated pending request and delivers the matching approval once", async () => {
    const { repository, adapter, service } = createService();
    await service.recordRequest({ taskId: "task-1", runId: "run-1", request: confirmation });

    await service.submit({ taskId: "task-1", runId: "run-1", requestId: "server-1", action: HumanInputAction.APPROVE });

    expect(repository.entries).toMatchObject([{ action: HumanInputAction.REQUEST, requestId: "server-1", deliveryStatus: HumanInputDeliveryStatus.DELIVERED }]);
    expect(adapter.inputs).toEqual([{ runId: "run-1", requestId: "server-1", action: HumanInputAction.APPROVE, text: "" }]);
    expect(repository.task.status).toBe(TaskStatus.RUNNING);
  });

  it("rejects forged ids and response actions that do not match the pending request kind", async () => {
    const { service } = createService();
    await service.recordRequest({ taskId: "task-1", runId: "run-1", request: question });

    await expect(service.submit({ taskId: "task-1", runId: "run-1", requestId: "forged", action: HumanInputAction.TEXT, text: "yes" })).rejects.toThrow("not pending");
    await expect(service.submit({ taskId: "task-1", runId: "run-1", requestId: "server-2", action: HumanInputAction.APPROVE })).rejects.toThrow("requires text");
  });

  it("retries an exact request id after a failed delivery but never redelivers a delivered response", async () => {
    const { repository, adapter, service } = createService();
    await service.recordRequest({ taskId: "task-1", runId: "run-1", request: question });
    adapter.failure = new Error("connection lost");

    await expect(service.submit({ taskId: "task-1", runId: "run-1", requestId: "server-2", action: HumanInputAction.TEXT, text: "yes" })).rejects.toThrow("recoverable");
    expect(repository.entries[0]).toMatchObject({ deliveryStatus: HumanInputDeliveryStatus.FAILED });
    adapter.failure = undefined;
    await service.submit({ taskId: "task-1", runId: "run-1", requestId: "server-2", action: HumanInputAction.TEXT, text: "yes" });
    await service.submit({ taskId: "task-1", runId: "run-1", requestId: "server-2", action: HumanInputAction.TEXT, text: "yes" });
    expect(adapter.inputs).toHaveLength(2);
    expect(repository.entries[0]).toMatchObject({ deliveryStatus: HumanInputDeliveryStatus.DELIVERED });
  });

  it("serializes concurrent cancellation and reply so no response is delivered after terminal state", async () => {
    const { repository, adapter, service } = createService();
    await service.recordRequest({ taskId: "task-1", runId: "run-1", request: confirmation });
    const stop = service.markTerminal("run-1");
    const reply = service.submit({ taskId: "task-1", runId: "run-1", requestId: "server-1", action: HumanInputAction.APPROVE });

    await stop;
    await expect(reply).rejects.toThrow("no longer active");
    expect(adapter.inputs).toHaveLength(0);
    expect(repository.entries[0]).toMatchObject({ deliveryStatus: HumanInputDeliveryStatus.FAILED });
  });
});
