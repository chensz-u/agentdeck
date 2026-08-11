import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExecutionMode, TaskStatus, WorktreeStatus, type Project, type Task, type Worktree } from "../domain/types";
import { ReviewService, type ReviewRepository } from "./review-service";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function createFixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "agentdeck-review-"));
  git(directory, ["init", "--quiet"]);
  git(directory, ["config", "user.email", "test@example.com"]);
  git(directory, ["config", "user.name", "Test User"]);
  writeFileSync(join(directory, "README.md"), "baseline\n");
  git(directory, ["add", "README.md"]);
  git(directory, ["commit", "--quiet", "-m", "baseline"]);
  return directory;
}

function fixtureTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    projectId: "project-1",
    parentTaskId: null,
    title: "Review fixture",
    prompt: "Review worktree",
    status: TaskStatus.REVIEW,
    executionMode: ExecutionMode.ISOLATED_WORKTREE,
    worktreeId: "worktree-1",
    createdAt: new Date("2026-08-10T00:00:00.000Z"),
    updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    ...overrides,
  };
}

function fixtureProject(path: string): Project {
  return {
    id: "project-1",
    name: "Fixture",
    path,
    gitEnabled: true,
    gitRemote: null,
    gitBranch: null,
    createdAt: new Date("2026-08-10T00:00:00.000Z"),
    updatedAt: new Date("2026-08-10T00:00:00.000Z"),
  };
}

function fixtureWorktree(projectPath: string, baselineSha: string): Worktree {
  const worktreePath = join(projectPath, ".agentdeck", "worktrees", "task-task-1");
  return {
    id: "worktree-1",
    taskId: "task-1",
    projectId: "project-1",
    projectPath,
    worktreePath,
    taskBranch: "agentdeck/task-task-1",
    baselineBranch: "main",
    baselineSha,
    createdAt: new Date("2026-08-10T00:00:00.000Z"),
    status: WorktreeStatus.READY,
    error: null,
    cleanupRequestedAt: null,
    cleanedAt: null,
    cleanupError: null,
  };
}

class MemoryReviewRepository implements ReviewRepository {
  constructor(
    readonly task: Task,
    readonly project: Project,
    readonly worktree: Worktree | null,
  ) {}

  async findTaskWithProject(taskId: string) {
    return taskId === this.task.id ? { task: this.task, project: this.project } : null;
  }

  async findWorktreeByTaskId(taskId: string) {
    return taskId === this.task.id ? this.worktree : null;
  }
}

describe("ReviewService", () => {
  const fixtures: string[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      rmSync(fixture, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  it("returns baseline-relative committed, staged, unstaged, and NUL-safe untracked changes without main-branch contamination", async () => {
    const projectPath = createFixture();
    fixtures.push(projectPath);
    const baselineSha = git(projectPath, ["rev-parse", "HEAD"]);
    const worktree = fixtureWorktree(projectPath, baselineSha);
    git(projectPath, ["branch", "-M", "main"]);
    git(projectPath, ["worktree", "add", "--quiet", "-b", worktree.taskBranch, worktree.worktreePath, baselineSha]);

    writeFileSync(join(worktree.worktreePath, "README.md"), "task committed\n");
    git(worktree.worktreePath, ["add", "README.md"]);
    git(worktree.worktreePath, ["commit", "--quiet", "-m", "task commit"]);
    writeFileSync(join(worktree.worktreePath, "staged.txt"), "staged addition\n");
    git(worktree.worktreePath, ["add", "staged.txt"]);
    writeFileSync(join(worktree.worktreePath, "unstaged.txt"), "unstaged addition\n");
    const untrackedName = "untracked file.txt";
    writeFileSync(join(worktree.worktreePath, untrackedName), "untracked addition\n");

    writeFileSync(join(projectPath, "main-only.txt"), "main change\n");
    git(projectPath, ["add", "main-only.txt"]);
    git(projectPath, ["commit", "--quiet", "-m", "main commit after baseline"]);

    const service = new ReviewService({
      repository: new MemoryReviewRepository(fixtureTask(), fixtureProject(projectPath), worktree),
    });

    const review = await service.getReview("task-1");

    expect(review.changedPaths).toEqual(["README.md", "staged.txt", "unstaged.txt", untrackedName]);
    expect(review.diff).toContain("-baseline");
    expect(review.diff).toContain("+task committed");
    expect(review.diff).toContain("+staged addition");
    expect(review.diff).toContain("+unstaged addition");
    expect(review.diff).toContain("+untracked addition");
    expect(review.diff).not.toContain("main change");
    expect(review.commitSummary).toContain("task commit");
    expect(review.commitSummary).not.toContain("main commit after baseline");
  });

  it("rejects missing, non-ready, cleaned, or root-mismatched isolated worktree records", async () => {
    const projectPath = createFixture();
    fixtures.push(projectPath);
    const baselineSha = git(projectPath, ["rev-parse", "HEAD"]);
    const worktree = fixtureWorktree(projectPath, baselineSha);
    git(projectPath, ["worktree", "add", "--quiet", "-b", worktree.taskBranch, worktree.worktreePath, baselineSha]);
    const project = fixtureProject(projectPath);

    await expect(new ReviewService({
      repository: new MemoryReviewRepository(fixtureTask(), project, null),
    }).getReview("task-1")).rejects.toThrow("does not have a worktree");

    await expect(new ReviewService({
      repository: new MemoryReviewRepository(fixtureTask(), project, { ...worktree, status: WorktreeStatus.CLEANED }),
    }).getReview("task-1")).rejects.toThrow("is not READY for review");

    await expect(new ReviewService({
      repository: new MemoryReviewRepository(fixtureTask(), project, { ...worktree, worktreePath: projectPath }),
    }).getReview("task-1")).rejects.toThrow("outside the managed project location");

    await expect(new ReviewService({
      repository: new MemoryReviewRepository(fixtureTask(), project, { ...worktree, taskBranch: "main" }),
    }).getReview("task-1")).rejects.toThrow("does not match the managed task branch");
  });

  it("rejects a current-workspace task so V1 review remains owned by GitService", async () => {
    const projectPath = createFixture();
    fixtures.push(projectPath);
    const baselineSha = git(projectPath, ["rev-parse", "HEAD"]);

    await expect(new ReviewService({
      repository: new MemoryReviewRepository(
        fixtureTask({ executionMode: ExecutionMode.CURRENT_WORKSPACE, worktreeId: null }),
        fixtureProject(projectPath),
        fixtureWorktree(projectPath, baselineSha),
      ),
    }).getReview("task-1")).rejects.toThrow("not configured for an isolated worktree");
  });

  it("rejects option-like and unresolved persisted baseline SHAs before producing a review", async () => {
    const projectPath = createFixture();
    fixtures.push(projectPath);
    const baselineSha = git(projectPath, ["rev-parse", "HEAD"]);
    const worktree = fixtureWorktree(projectPath, baselineSha);
    git(projectPath, ["worktree", "add", "--quiet", "-b", worktree.taskBranch, worktree.worktreePath, baselineSha]);
    const repository = new MemoryReviewRepository(fixtureTask(), fixtureProject(projectPath), worktree);
    const service = new ReviewService({ repository });

    worktree.baselineSha = "--no-index";
    await expect(service.getReview("task-1")).rejects.toThrow("baseline SHA is not a valid Git object ID");

    worktree.baselineSha = "f".repeat(40);
    await expect(service.getReview("task-1")).rejects.toThrow("baseline SHA does not resolve to a commit");
  });

  it("preserves newline-containing tracked and untracked paths from NUL-delimited Git output", async () => {
    const projectPath = createFixture();
    fixtures.push(projectPath);
    const baselineSha = "a".repeat(40);
    const worktree = fixtureWorktree(projectPath, baselineSha);
    const trackedPath = "tracked\nname.txt";
    const untrackedPath = "untracked\nname.txt";
    const repository = new MemoryReviewRepository(fixtureTask(), fixtureProject(projectPath), worktree);

    const execFile = (...call: unknown[]) => {
      const [file, args, options, callback] = call as [string, string[], { cwd: string }, (error: Error | null, stdout?: unknown) => void];
      expect(file).toBe("git");
      if (args[0] === "rev-parse") return callback(null, {
        stdout: args.includes("--show-toplevel") ? options.cwd : baselineSha,
      });
      if (args[0] === "diff" && args[1] === "--name-only") {
        if (!args.includes("-z")) return callback(new Error("tracked paths must be NUL-delimited"));
        return callback(null, { stdout: `${trackedPath}\0` });
      }
      if (args[0] === "ls-files") return callback(null, { stdout: `${untrackedPath}\0` });
      if (args[0] === "diff" && args.includes("--no-index")) {
        const error = Object.assign(new Error("untracked diff"), { stdout: "+untracked\n" });
        return callback(error);
      }
      if (args[0] === "diff") return callback(null, { stdout: "+tracked\n" });
      if (args[0] === "log") return callback(null, { stdout: "" });
      return callback(new Error(`Unexpected Git arguments: ${args.join(" ")}`));
    };

    vi.resetModules();
    vi.doMock("node:child_process", async (importOriginal) => ({
      ...await importOriginal<typeof import("node:child_process")>(),
      execFile,
    }));
    try {
      const { ReviewService: MockedReviewService } = await import("./review-service");
      await expect(new MockedReviewService({ repository }).getReview("task-1")).resolves.toMatchObject({
        changedPaths: [trackedPath, untrackedPath],
        diff: expect.stringContaining("+untracked"),
      });
    } finally {
      vi.doUnmock("node:child_process");
      vi.resetModules();
    }
  });
});
