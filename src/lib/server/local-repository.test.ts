import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  AgentRunStatus,
  ExecutionMode,
  HumanInputAction,
  HumanInputDeliveryStatus,
  RunInputState,
  TaskStatus,
  WorktreeStatus,
} from "../domain/types";
import { TaskService } from "../services/task-service";
import { WorktreeService } from "../services/worktree-service";
import { LocalRepository } from "./local-repository";

const temporaryDirectories: string[] = [];

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

async function createGitFixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "agentdeck-recovery-"));
  git(directory, ["init", "--quiet"]);
  git(directory, ["config", "user.email", "test@example.com"]);
  git(directory, ["config", "user.name", "Test User"]);
  await writeFile(join(directory, "README.md"), "fixture\n");
  git(directory, ["add", "README.md"]);
  git(directory, ["commit", "--quiet", "-m", "initial"]);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("LocalRepository.claimTaskRun", () => {
  it("allows one concurrent claim and persists one RUNNING run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentdeck-local-repository-"));
    temporaryDirectories.push(directory);
    const repository = new LocalRepository(join(directory, "data.json"));
    const project = await repository.createProject({
      name: "Fixture",
      path: directory,
      isGitRepository: true,
    });
    const task = await repository.createTask({
      projectId: project.id,
      parentTaskId: null,
      title: "Run once",
      prompt: "Run once.",
      status: TaskStatus.TODO,
    });
    const input = {
      agent: "codex",
      status: AgentRunStatus.RUNNING,
      pid: null,
      exitCode: null,
      error: null,
      logPath: ".agentdeck/runs/task.jsonl",
    };

    const results = await Promise.allSettled([
      repository.claimTaskRun(task.id, input),
      repository.claimTaskRun(task.id, input),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(repository.findTask(task.id)).resolves.toMatchObject({ status: TaskStatus.RUNNING });
  });

  it("fails persisted RUNNING work on restart so the task can be retried", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentdeck-local-repository-"));
    temporaryDirectories.push(directory);
    const dataPath = join(directory, "data.json");
    const repository = new LocalRepository(dataPath);
    const project = await repository.createProject({
      name: "Fixture",
      path: directory,
      isGitRepository: true,
    });
    const task = await repository.createTask({
      projectId: project.id,
      parentTaskId: null,
      title: "Interrupted task",
      prompt: "Run once.",
      status: TaskStatus.TODO,
    });
    const { run } = await repository.claimTaskRun(task.id, {
      agent: "codex",
      status: AgentRunStatus.RUNNING,
      pid: 4321,
      exitCode: null,
      error: null,
      logPath: ".agentdeck/runs/task.jsonl",
    });

    const restarted = new LocalRepository(dataPath);
    const reopened = new LocalRepository(dataPath);

    await expect(restarted.findTask(task.id)).resolves.toMatchObject({ status: TaskStatus.FAILED });
    await expect(reopened.findLatestRun(task.id)).resolves.toMatchObject({
      id: run.id,
      status: AgentRunStatus.FAILED,
      error: "AgentDeck restarted before this run completed; the process cannot be recovered.",
    });
    await expect(new TaskService(reopened).createRetryTask(task.id)).resolves.toMatchObject({
      parentTaskId: task.id,
      status: TaskStatus.TODO,
    });
  });
});

describe("LocalRepository V2 persistence", () => {
  it("defaults V1 tasks and runs to current-workspace mode and empty input state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentdeck-local-repository-"));
    temporaryDirectories.push(directory);
    const dataPath = join(directory, "data.json");
    await writeFile(dataPath, JSON.stringify({ projects: [], tasks: [], runs: [], diffs: {} }), "utf8");

    const repository = new LocalRepository(dataPath);
    const project = await repository.createProject({ name: "Fixture", path: directory, isGitRepository: true });
    const task = await repository.createTask({
      projectId: project.id, parentTaskId: null, title: "V2", prompt: "Persist defaults", status: TaskStatus.TODO,
    });
    const run = await repository.createRun({
      taskId: task.id, agent: "codex", status: AgentRunStatus.RUNNING, pid: null,
      exitCode: null, error: null, logPath: null,
    });

    expect(task.executionMode).toBe(ExecutionMode.CURRENT_WORKSPACE);
    expect(run.inputState).toBe(RunInputState.IDLE);
    expect(run.threadId).toBeNull();
    expect(run.turnId).toBeNull();
  });

  it("round-trips worktree metadata, run session state, and ordered human input", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentdeck-local-repository-"));
    temporaryDirectories.push(directory);
    const repository = new LocalRepository(join(directory, "data.json"));
    const project = await repository.createProject({ name: "Fixture", path: directory, isGitRepository: true });
    const task = await repository.createTask({
      projectId: project.id, parentTaskId: null, title: "V2", prompt: "Persist V2", status: TaskStatus.TODO,
      executionMode: ExecutionMode.ISOLATED_WORKTREE,
    });
    const run = await repository.createRun({
      taskId: task.id, agent: "codex", status: AgentRunStatus.RUNNING, pid: null,
      exitCode: null, error: null, logPath: null,
    });
    const worktree = await repository.createWorktree({
      taskId: task.id, projectId: project.id, projectPath: project.path,
      worktreePath: join(directory, "worktrees", task.id), taskBranch: "agentdeck/task-v2",
      baselineBranch: "main", baselineSha: "abc123", status: WorktreeStatus.READY,
      error: null, cleanupRequestedAt: null, cleanedAt: null, cleanupError: null,
    });
    await repository.updateRunSession(run.id, {
      threadId: "thread-1", turnId: "turn-1", inputState: RunInputState.AWAITING_INPUT,
    });
    const first = await repository.appendHumanInput({
      taskId: task.id, runId: run.id, action: HumanInputAction.REQUEST, requestId: "request-1", payload: { question: "Proceed?" }, deliveryStatus: HumanInputDeliveryStatus.PENDING, deliveryError: null,
    });
    const second = await repository.appendHumanInput({
      taskId: task.id, runId: run.id, action: HumanInputAction.APPROVE, requestId: "request-2", payload: { answer: "yes" }, deliveryStatus: HumanInputDeliveryStatus.DELIVERED, deliveryError: null,
    });

    expect(await repository.findWorktreeByTaskId(task.id)).toMatchObject({ id: worktree.id, baselineSha: "abc123" });
    await expect(repository.findTask(task.id)).resolves.toMatchObject({ worktreeId: worktree.id });
    expect(await repository.findLatestRun(task.id)).toMatchObject({
      threadId: "thread-1", turnId: "turn-1", inputState: RunInputState.AWAITING_INPUT,
    });
    expect(await repository.listHumanInputs(run.id)).toMatchObject([
      { sequence: 1, id: first.id, requestId: "request-1", deliveryStatus: HumanInputDeliveryStatus.PENDING },
      { sequence: 2, id: second.id, requestId: "request-2" },
    ]);
  });

  it("updates persisted delivery state and fails stranded pending input on restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentdeck-local-repository-"));
    temporaryDirectories.push(directory);
    const repository = new LocalRepository(join(directory, "data.json"));
    const project = await repository.createProject({ name: "Fixture", path: directory, isGitRepository: true });
    const task = await repository.createTask({ projectId: project.id, parentTaskId: null, title: "V2", prompt: "Audit", status: TaskStatus.TODO });
    const run = await repository.claimTaskRun(task.id, { agent: "codex", status: AgentRunStatus.RUNNING, pid: null, exitCode: null, error: null, logPath: null });
    await repository.updateTaskStatus(task.id, TaskStatus.AWAITING_INPUT);
    await repository.updateRunSession(run.run.id, { inputState: RunInputState.AWAITING_INPUT });
    await repository.appendHumanInput({ taskId: task.id, runId: run.run.id, action: HumanInputAction.REQUEST, requestId: "request-1", payload: {}, deliveryStatus: HumanInputDeliveryStatus.PENDING, deliveryError: null });
    await repository.updateHumanInputDelivery(run.run.id, "request-1", HumanInputDeliveryStatus.DELIVERED, null);
    await repository.appendHumanInput({ taskId: task.id, runId: run.run.id, action: HumanInputAction.REQUEST, requestId: "request-2", payload: {}, deliveryStatus: HumanInputDeliveryStatus.PENDING, deliveryError: null });

    expect((await repository.listHumanInputs(run.run.id))[0]).toMatchObject({ deliveryStatus: HumanInputDeliveryStatus.DELIVERED, deliveryError: null });
    const restarted = new LocalRepository(join(directory, "data.json"));
    await expect(restarted.findTask(task.id)).resolves.toMatchObject({ status: TaskStatus.FAILED });
    await expect(restarted.listHumanInputs(run.run.id)).resolves.toMatchObject([
      { requestId: "request-1", deliveryStatus: HumanInputDeliveryStatus.DELIVERED },
      { requestId: "request-2", deliveryStatus: HumanInputDeliveryStatus.FAILED },
    ]);
  });

  it("deduplicates repeated human input request IDs without advancing the audit sequence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentdeck-local-repository-"));
    temporaryDirectories.push(directory);
    const repository = new LocalRepository(join(directory, "data.json"));
    const project = await repository.createProject({ name: "Fixture", path: directory, isGitRepository: true });
    const task = await repository.createTask({ projectId: project.id, parentTaskId: null, title: "V2", prompt: "Audit", status: TaskStatus.TODO });
    const run = await repository.createRun({ taskId: task.id, agent: "codex", status: AgentRunStatus.RUNNING, pid: null, exitCode: null, error: null, logPath: null });

    const created = await repository.appendHumanInput({ taskId: task.id, runId: run.id, action: HumanInputAction.REQUEST, requestId: "request-1", payload: { question: "Continue?" } });
    const replayed = await repository.appendHumanInput({ taskId: task.id, runId: run.id, action: HumanInputAction.REQUEST, requestId: "request-1", payload: { question: "Changed" } });

    expect(replayed).toEqual(created);
    await expect(repository.listHumanInputs(run.id)).resolves.toHaveLength(1);
  });

  it("migrates V1 JSON and recovers interrupted isolated work without deleting worktree metadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentdeck-local-repository-"));
    temporaryDirectories.push(directory);
    const dataPath = join(directory, "data.json");
    await writeFile(dataPath, JSON.stringify({
      projects: [{ id: "project-1", name: "Fixture", path: directory, gitEnabled: true, gitRemote: null, gitBranch: "main", createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z" }],
      tasks: [{ id: "task-1", projectId: "project-1", parentTaskId: null, title: "Interrupted", prompt: "Work", status: TaskStatus.AWAITING_INPUT, executionMode: ExecutionMode.ISOLATED_WORKTREE, createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z" }],
      runs: [{ id: "run-1", taskId: "task-1", agent: "codex", status: AgentRunStatus.RUNNING, pid: 42, exitCode: null, error: null, startedAt: "2026-08-10T00:00:00.000Z", finishedAt: null, logPath: null }],
      diffs: {},
      worktrees: [{ id: "worktree-1", taskId: "task-1", projectId: "project-1", projectPath: directory, worktreePath: join(directory, "worktrees", "task-1"), taskBranch: "agentdeck/task-1", baselineBranch: "main", baselineSha: "abc123", createdAt: "2026-08-10T00:00:00.000Z", status: WorktreeStatus.READY, error: null, cleanupRequestedAt: null, cleanedAt: null, cleanupError: null }],
      humanInputs: [],
    }), "utf8");

    const repository = new LocalRepository(dataPath);

    await expect(repository.findTask("task-1")).resolves.toMatchObject({ status: TaskStatus.WORKTREE_FAILED, worktreeId: "worktree-1" });
    await expect(repository.findLatestRun("task-1")).resolves.toMatchObject({ status: AgentRunStatus.FAILED });
    await expect(repository.findWorktreeByTaskId("task-1")).resolves.toMatchObject({ id: "worktree-1", status: WorktreeStatus.READY });
    expect(JSON.parse(await readFile(dataPath, "utf8")).worktrees).toHaveLength(1);
  });

  it("associates exactly one worktree with a task", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentdeck-local-repository-"));
    temporaryDirectories.push(directory);
    const repository = new LocalRepository(join(directory, "data.json"));
    const project = await repository.createProject({ name: "Fixture", path: directory, isGitRepository: true });
    const task = await repository.createTask({ projectId: project.id, parentTaskId: null, title: "V2", prompt: "Worktree", status: TaskStatus.TODO });
    const input = {
      taskId: task.id, projectId: project.id, projectPath: project.path, worktreePath: join(directory, "worktrees", task.id),
      taskBranch: "agentdeck/task-v2", baselineBranch: "main", baselineSha: "abc123", status: WorktreeStatus.READY,
      error: null, cleanupRequestedAt: null, cleanedAt: null, cleanupError: null,
    };

    const worktree = await repository.createWorktree(input);

    await expect(repository.createWorktree(input)).rejects.toThrow(`Task ${task.id} already has a worktree`);
    await expect(repository.findTask(task.id)).resolves.toMatchObject({ worktreeId: worktree.id });
  });

  it("atomically claims only a READY worktree for cleanup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentdeck-local-repository-"));
    temporaryDirectories.push(directory);
    const repository = new LocalRepository(join(directory, "data.json"));
    const project = await repository.createProject({ name: "Fixture", path: directory, isGitRepository: true });
    const task = await repository.createTask({ projectId: project.id, parentTaskId: null, title: "V2", prompt: "Worktree", status: TaskStatus.TODO });
    const worktree = await repository.createWorktree({
      taskId: task.id, projectId: project.id, projectPath: project.path, worktreePath: join(directory, "worktrees", task.id),
      taskBranch: "agentdeck/task-v2", baselineBranch: "main", baselineSha: "abc123", status: WorktreeStatus.READY,
      error: null, cleanupRequestedAt: null, cleanedAt: null, cleanupError: null,
    });

    const results = await Promise.allSettled([
      repository.claimWorktreeCleanup(worktree.id, new Date("2026-08-10T01:00:00.000Z")),
      repository.claimWorktreeCleanup(worktree.id, new Date("2026-08-10T01:00:00.000Z")),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(repository.findWorktreeByTaskId(task.id)).resolves.toMatchObject({
      status: WorktreeStatus.CLEANING,
      cleanupRequestedAt: new Date("2026-08-10T01:00:00.000Z"),
    });
  });

  it("recovers an interrupted CLEANING worktree to READY and permits a safe retry", async () => {
    const directory = await createGitFixture();
    temporaryDirectories.push(directory);
    const dataPath = join(directory, ".agentdeck", "data.json");
    const worktreePath = join(directory, ".agentdeck", "worktrees", "task-task-1");
    const taskBranch = "agentdeck/task-task-1";
    git(directory, ["worktree", "add", "--quiet", "-b", taskBranch, worktreePath, "HEAD"]);
    await writeFile(dataPath, JSON.stringify({
      projects: [{ id: "project-1", name: "Fixture", path: directory, gitEnabled: true, gitRemote: null, gitBranch: "main", createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z" }],
      tasks: [{ id: "task-1", projectId: "project-1", parentTaskId: null, title: "Interrupted cleanup", prompt: "Clean", status: TaskStatus.CANCELLED, executionMode: ExecutionMode.ISOLATED_WORKTREE, worktreeId: "worktree-1", createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z" }],
      runs: [], diffs: {}, humanInputs: [],
      worktrees: [{ id: "worktree-1", taskId: "task-1", projectId: "project-1", projectPath: directory, worktreePath, taskBranch, baselineBranch: "master", baselineSha: git(directory, ["rev-parse", "HEAD"]), createdAt: "2026-08-10T00:00:00.000Z", status: WorktreeStatus.CLEANING, error: null, cleanupRequestedAt: "2026-08-10T00:01:00.000Z", cleanedAt: null, cleanupError: null }],
    }), "utf8");

    const repository = new LocalRepository(dataPath);

    await expect(repository.findWorktreeByTaskId("task-1")).resolves.toMatchObject({ status: WorktreeStatus.READY, cleanupError: null });
    await new WorktreeService({ repository }).cleanup("task-1");
    await expect(repository.findTask("task-1")).resolves.toMatchObject({ status: TaskStatus.CLEANED });
  });

  it("marks interrupted CLEANING metadata as retry-diagnosable when a managed resource is missing", async () => {
    const directory = await createGitFixture();
    temporaryDirectories.push(directory);
    const dataPath = join(directory, ".agentdeck", "data.json");
    const worktreePath = join(directory, ".agentdeck", "worktrees", "task-task-1");
    const taskBranch = "agentdeck/task-task-1";
    git(directory, ["worktree", "add", "--quiet", "-b", taskBranch, worktreePath, "HEAD"]);
    git(directory, ["worktree", "remove", "--force", worktreePath]);
    await writeFile(dataPath, JSON.stringify({
      projects: [{ id: "project-1", name: "Fixture", path: directory, gitEnabled: true, gitRemote: null, gitBranch: "main", createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z" }],
      tasks: [{ id: "task-1", projectId: "project-1", parentTaskId: null, title: "Interrupted cleanup", prompt: "Clean", status: TaskStatus.CANCELLED, executionMode: ExecutionMode.ISOLATED_WORKTREE, worktreeId: "worktree-1", createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z" }],
      runs: [], diffs: {}, humanInputs: [],
      worktrees: [{ id: "worktree-1", taskId: "task-1", projectId: "project-1", projectPath: directory, worktreePath, taskBranch, baselineBranch: "master", baselineSha: git(directory, ["rev-parse", "HEAD"]), createdAt: "2026-08-10T00:00:00.000Z", status: WorktreeStatus.CLEANING, error: null, cleanupRequestedAt: "2026-08-10T00:01:00.000Z", cleanedAt: null, cleanupError: null }],
    }), "utf8");

    const repository = new LocalRepository(dataPath);

    await expect(repository.findWorktreeByTaskId("task-1")).resolves.toMatchObject({
      status: WorktreeStatus.CLEANUP_FAILED,
      cleanupError: expect.stringContaining("missing worktree"),
    });
  });

  it("converges an interrupted CLEANING record to CLEANED when both managed resources are already gone", async () => {
    const directory = await createGitFixture();
    temporaryDirectories.push(directory);
    const dataPath = join(directory, ".agentdeck", "data.json");
    const worktreePath = join(directory, ".agentdeck", "worktrees", "task-task-1");
    const taskBranch = "agentdeck/task-task-1";
    git(directory, ["worktree", "add", "--quiet", "-b", taskBranch, worktreePath, "HEAD"]);
    git(directory, ["worktree", "remove", "--force", worktreePath]);
    git(directory, ["branch", "--delete", "--force", taskBranch]);
    await writeFile(dataPath, JSON.stringify({
      projects: [{ id: "project-1", name: "Fixture", path: directory, gitEnabled: true, gitRemote: null, gitBranch: "main", createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z" }],
      tasks: [{ id: "task-1", projectId: "project-1", parentTaskId: null, title: "Interrupted cleanup", prompt: "Clean", status: TaskStatus.CANCELLED, executionMode: ExecutionMode.ISOLATED_WORKTREE, worktreeId: "worktree-1", createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z" }],
      runs: [], diffs: {}, humanInputs: [],
      worktrees: [{ id: "worktree-1", taskId: "task-1", projectId: "project-1", projectPath: directory, worktreePath, taskBranch, baselineBranch: "master", baselineSha: git(directory, ["rev-parse", "HEAD"]), createdAt: "2026-08-10T00:00:00.000Z", status: WorktreeStatus.CLEANING, error: null, cleanupRequestedAt: "2026-08-10T00:01:00.000Z", cleanedAt: null, cleanupError: null }],
    }), "utf8");

    const repository = new LocalRepository(dataPath);

    await expect(repository.findWorktreeByTaskId("task-1")).resolves.toMatchObject({ status: WorktreeStatus.CLEANED, cleanupError: null });
    await expect(repository.findTask("task-1")).resolves.toMatchObject({ status: TaskStatus.CLEANED });
  });

  it("converges a stale terminal task when its worktree was already persisted as CLEANED", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentdeck-local-repository-"));
    temporaryDirectories.push(directory);
    const dataPath = join(directory, "data.json");
    await writeFile(dataPath, JSON.stringify({
      projects: [{ id: "project-1", name: "Fixture", path: directory, gitEnabled: true, gitRemote: null, gitBranch: "main", createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z" }],
      tasks: [{ id: "task-1", projectId: "project-1", parentTaskId: null, title: "Stale cleanup", prompt: "Clean", status: TaskStatus.FAILED, executionMode: ExecutionMode.ISOLATED_WORKTREE, worktreeId: "worktree-1", createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z" }],
      runs: [], diffs: {}, humanInputs: [],
      worktrees: [{ id: "worktree-1", taskId: "task-1", projectId: "project-1", projectPath: directory, worktreePath: join(directory, ".agentdeck", "worktrees", "task-task-1"), taskBranch: "agentdeck/task-task-1", baselineBranch: "main", baselineSha: "a".repeat(40), createdAt: "2026-08-10T00:00:00.000Z", status: WorktreeStatus.CLEANED, error: null, cleanupRequestedAt: "2026-08-10T00:01:00.000Z", cleanedAt: "2026-08-10T00:02:00.000Z", cleanupError: null }],
    }), "utf8");

    await expect(new LocalRepository(dataPath).findTask("task-1")).resolves.toMatchObject({ status: TaskStatus.CLEANED });
  });

  it("rejects illegal public task transitions while exposing an explicit recovery override", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentdeck-local-repository-"));
    temporaryDirectories.push(directory);
    const repository = new LocalRepository(join(directory, "data.json"));
    const project = await repository.createProject({ name: "Fixture", path: directory, isGitRepository: true });
    const task = await repository.createTask({ projectId: project.id, parentTaskId: null, title: "V2", prompt: "State", status: TaskStatus.TODO });

    await expect(repository.updateTaskStatus(task.id, TaskStatus.DONE)).rejects.toThrow(
      "Cannot transition task from TODO to DONE",
    );
    await repository.forceTaskStatus(task.id, TaskStatus.FAILED);

    await expect(repository.findTask(task.id)).resolves.toMatchObject({ status: TaskStatus.FAILED });
  });

  it("accepts only supported human input actions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentdeck-local-repository-"));
    temporaryDirectories.push(directory);
    const repository = new LocalRepository(join(directory, "data.json"));
    const project = await repository.createProject({ name: "Fixture", path: directory, isGitRepository: true });
    const task = await repository.createTask({ projectId: project.id, parentTaskId: null, title: "V2", prompt: "Audit", status: TaskStatus.TODO });
    const run = await repository.createRun({ taskId: task.id, agent: "codex", status: AgentRunStatus.RUNNING, pid: null, exitCode: null, error: null, logPath: null });

    await expect(repository.appendHumanInput({
      taskId: task.id, runId: run.id, action: "unknown" as HumanInputAction, requestId: "request-invalid", payload: {},
    })).rejects.toThrow("Unsupported human input action: unknown");
  });
});
