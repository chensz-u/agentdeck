import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ExecutionMode, TaskStatus, WorktreeStatus, type Project, type Task, type Worktree } from "../domain/types";
import { WorktreeService, type WorktreeRepository } from "./worktree-service";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function createGitFixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "agentdeck-worktree-"));
  git(directory, ["init", "--quiet"]);
  git(directory, ["config", "user.email", "test@example.com"]);
  git(directory, ["config", "user.name", "Test User"]);
  writeFileSync(join(directory, "README.md"), "fixture\n");
  git(directory, ["add", "README.md"]);
  git(directory, ["commit", "--quiet", "-m", "initial"]);
  return directory;
}

function fixtureTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    projectId: "project-1",
    parentTaskId: null,
    title: "Worktree fixture",
    prompt: "Create worktree",
    status: TaskStatus.TODO,
    executionMode: ExecutionMode.ISOLATED_WORKTREE,
    worktreeId: null,
    createdAt: new Date("2026-08-10T00:00:00.000Z"),
    updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    ...overrides,
  };
}

function fixtureProject(path: string, overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "Fixture",
    path,
    gitEnabled: true,
    gitRemote: null,
    gitBranch: null,
    createdAt: new Date("2026-08-10T00:00:00.000Z"),
    updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    ...overrides,
  };
}

class MemoryWorktreeRepository implements WorktreeRepository {
  readonly updates: Array<{ id: string; update: Partial<Worktree> }> = [];
  worktree: Worktree | null = null;

  constructor(readonly task: Task, readonly project: Project) {}

  async findTaskWithProject(taskId: string) {
    return taskId === this.task.id ? { task: this.task, project: this.project } : null;
  }

  async findWorktreeByTaskId(taskId: string) {
    return taskId === this.task.id ? this.worktree : null;
  }

  async createWorktree(input: Omit<Worktree, "id" | "createdAt">): Promise<Worktree> {
    this.worktree = { ...input, id: "worktree-1", createdAt: new Date("2026-08-10T00:00:00.000Z") };
    return this.worktree;
  }

  async updateWorktree(id: string, update: Partial<Worktree>): Promise<void> {
    if (!this.worktree || this.worktree.id !== id) throw new Error("Worktree not found");
    this.updates.push({ id, update });
    Object.assign(this.worktree, update);
  }
}

describe("WorktreeService", () => {
  const fixtures: string[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      rmSync(fixture, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  it("creates a task-owned worktree with a server-derived baseline and safe branch", async () => {
    const path = createGitFixture();
    fixtures.push(path);
    const repository = new MemoryWorktreeRepository(fixtureTask(), fixtureProject(path));

    const worktree = await new WorktreeService({ repository }).create("task-1");

    const baselineBranch = git(path, ["symbolic-ref", "--short", "HEAD"]);
    const baselineSha = git(path, ["rev-parse", "HEAD"]);
    expect(worktree).toMatchObject({
      taskId: "task-1",
      projectId: "project-1",
      projectPath: path,
      worktreePath: join(path, ".agentdeck", "worktrees", "task-task-1"),
      taskBranch: "agentdeck/task-task-1",
      baselineBranch,
      baselineSha,
      status: WorktreeStatus.READY,
    });
    expect(git(worktree.worktreePath, ["rev-parse", "--show-toplevel"])).toBe(worktree.worktreePath.replace(/\\/g, "/"));
    expect(git(path, ["rev-parse", worktree.taskBranch])).toBe(baselineSha);
  });

  it("rejects task metadata whose registered project is not Git-enabled", async () => {
    const path = createGitFixture();
    fixtures.push(path);
    const repository = new MemoryWorktreeRepository(fixtureTask(), fixtureProject(path, { gitEnabled: false }));

    await expect(new WorktreeService({ repository }).create("task-1"))
      .rejects.toThrow("registered Git repository");
  });

  it("rejects a second worktree for the same task before calling Git", async () => {
    const path = createGitFixture();
    fixtures.push(path);
    const repository = new MemoryWorktreeRepository(fixtureTask(), fixtureProject(path));
    const service = new WorktreeService({ repository });
    await service.create("task-1");

    await expect(service.create("task-1")).rejects.toThrow("already has a worktree");
  });

  it("removes the created worktree and branch when atomic metadata persistence fails", async () => {
    const path = createGitFixture();
    fixtures.push(path);
    const repository = new MemoryWorktreeRepository(fixtureTask(), fixtureProject(path));
    repository.createWorktree = async () => { throw new Error("disk full"); };
    const worktreePath = join(path, ".agentdeck", "worktrees", "task-task-1");

    await expect(new WorktreeService({ repository }).create("task-1")).rejects.toThrow("disk full");

    expect(existsSync(worktreePath)).toBe(false);
    expect(() => git(path, ["rev-parse", "--verify", "agentdeck/task-1"])).toThrow();
  });

  it("inspects clean and dirty worktree status using the persisted path", async () => {
    const path = createGitFixture();
    fixtures.push(path);
    const repository = new MemoryWorktreeRepository(fixtureTask(), fixtureProject(path));
    const service = new WorktreeService({ repository });
    const worktree = await service.create("task-1");

    await expect(service.inspect("task-1")).resolves.toEqual({ isClean: true, changedPaths: [] });
    writeFileSync(join(worktree.worktreePath, "README.md"), "dirty\n");
    await expect(service.inspect("task-1")).resolves.toEqual({ isClean: false, changedPaths: ["README.md"] });
  });

  it("rejects dirty cleanup with a recorded cause and retains the worktree", async () => {
    const path = createGitFixture();
    fixtures.push(path);
    const repository = new MemoryWorktreeRepository(fixtureTask({ status: TaskStatus.REVIEW }), fixtureProject(path));
    const service = new WorktreeService({ repository });
    const worktree = await service.create("task-1");
    writeFileSync(join(worktree.worktreePath, "README.md"), "dirty\n");

    await expect(service.cleanup("task-1")).rejects.toThrow("worktree has uncommitted changes");

    expect(existsSync(worktree.worktreePath)).toBe(true);
    expect(repository.worktree).toMatchObject({ status: WorktreeStatus.READY, cleanupError: "worktree has uncommitted changes" });
  });

  it("only cleans a clean REVIEW, MERGE_READY, or DONE task and never the project root", async () => {
    const path = createGitFixture();
    fixtures.push(path);
    const repository = new MemoryWorktreeRepository(fixtureTask({ status: TaskStatus.MERGE_READY }), fixtureProject(path));
    const service = new WorktreeService({ repository });
    const worktree = await service.create("task-1");

    await service.cleanup("task-1");

    expect(existsSync(worktree.worktreePath)).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(repository.worktree).toMatchObject({ status: WorktreeStatus.CLEANED, cleanupError: null });
    expect(() => git(path, ["rev-parse", "--verify", worktree.taskBranch])).toThrow();
  });

  it("refuses cleanup before a task reaches review state", async () => {
    const path = createGitFixture();
    fixtures.push(path);
    const repository = new MemoryWorktreeRepository(fixtureTask({ status: TaskStatus.TODO }), fixtureProject(path));
    const service = new WorktreeService({ repository });
    const worktree = await service.create("task-1");

    await expect(service.cleanup("task-1")).rejects.toThrow("Cleanup is only allowed for REVIEW, MERGE_READY, or DONE tasks");
    expect(existsSync(worktree.worktreePath)).toBe(true);
  });
});
