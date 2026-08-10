import { execFile } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { ExecutionMode, WorktreeStatus, type Project, type Task, type Worktree } from "../domain/types";

const execFileAsync = promisify(execFile);

export interface ReviewRepository {
  findTaskWithProject(taskId: string): Promise<{ task: Task; project: Project } | null>;
  findWorktreeByTaskId(taskId: string): Promise<Worktree | null>;
}

export type Review = {
  changedPaths: string[];
  diff: string;
  commitSummary: string;
};

/** Produces a baseline-relative review for a persisted isolated worktree. */
export class ReviewService {
  constructor(private readonly options: { repository: ReviewRepository }) {}

  async getReview(taskId: string): Promise<Review> {
    const { task, project } = await this.requireTaskContext(taskId);
    if (task.executionMode !== ExecutionMode.ISOLATED_WORKTREE) {
      throw new Error(`Task ${task.id} is not configured for an isolated worktree`);
    }

    const worktree = await this.requireWorktree(task.id);
    if (worktree.status !== WorktreeStatus.READY) {
      throw new Error(`Worktree ${worktree.id} is not READY for review`);
    }
    if (worktree.taskId !== task.id || worktree.projectId !== project.id) {
      throw new Error("Persisted worktree does not belong to the requested task and project");
    }

    const projectPath = await this.requireRegisteredGitProject(project);
    this.assertManagedWorktree(projectPath, worktree);
    const worktreeRoot = await this.git(worktree.worktreePath, ["rev-parse", "--show-toplevel"]);
    if (resolve(worktreeRoot) !== resolve(worktree.worktreePath)) {
      throw new Error("Persisted worktree path is not a Git working tree root");
    }

    const [changed, untracked, diff, commitSummary] = await Promise.all([
      this.git(worktree.worktreePath, ["diff", "--name-only", worktree.baselineSha]),
      this.gitRaw(worktree.worktreePath, ["ls-files", "-z", "--others", "--exclude-standard"]),
      this.gitRaw(worktree.worktreePath, ["diff", "--no-color", worktree.baselineSha]),
      this.git(worktree.worktreePath, ["log", "--oneline", `${worktree.baselineSha}..${worktree.taskBranch}`]),
    ]);
    const untrackedPaths = untracked.split("\0").filter(Boolean);
    const untrackedDiffs = await Promise.all(untrackedPaths.map((path) => this.diffUntracked(worktree.worktreePath, path)));

    return {
      changedPaths: [...new Set([...changed.split("\n").filter(Boolean), ...untrackedPaths])],
      diff: [diff, ...untrackedDiffs].join(""),
      commitSummary,
    };
  }

  private async requireTaskContext(taskId: string): Promise<{ task: Task; project: Project }> {
    const context = await this.options.repository.findTaskWithProject(taskId);
    if (!context) throw new Error(`Task ${taskId} was not found`);
    return context;
  }

  private async requireWorktree(taskId: string): Promise<Worktree> {
    const worktree = await this.options.repository.findWorktreeByTaskId(taskId);
    if (!worktree) throw new Error(`Task ${taskId} does not have a worktree`);
    return worktree;
  }

  private async requireRegisteredGitProject(project: Project): Promise<string> {
    if (!project.gitEnabled) throw new Error("Task project is not a registered Git repository");
    if (!existsSync(project.path)) throw new Error("Registered project path does not exist");
    const projectPath = realpathSync(project.path);
    const topLevel = await this.git(projectPath, ["rev-parse", "--show-toplevel"]);
    if (resolve(topLevel) !== resolve(projectPath)) {
      throw new Error("Registered project path must be the Git working tree root");
    }
    return projectPath;
  }

  private assertManagedWorktree(projectPath: string, worktree: Worktree): void {
    const expected = resolve(projectPath, ".agentdeck", "worktrees", `task-${safeId(worktree.taskId, "task")}`);
    if (resolve(worktree.projectPath) !== resolve(projectPath) || resolve(worktree.worktreePath) !== expected) {
      throw new Error("Persisted worktree path is outside the managed project location");
    }
    if (worktree.taskBranch !== `agentdeck/task-${safeId(worktree.taskId, "task")}`) {
      throw new Error("Persisted worktree branch does not match the managed task branch");
    }
  }

  private async diffUntracked(worktreePath: string, path: string): Promise<string> {
    try {
      return await this.gitRaw(worktreePath, ["diff", "--no-index", "--no-color", "--", "/dev/null", path]);
    } catch (error) {
      if (error && typeof error === "object" && "stdout" in error) return String(error.stdout);
      throw error;
    }
  }

  private async git(cwd: string, args: readonly string[]): Promise<string> {
    return (await this.gitRaw(cwd, args)).trim();
  }

  private async gitRaw(cwd: string, args: readonly string[]): Promise<string> {
    const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
    return stdout;
  }
}

function safeId(value: string, label: string): string {
  const safe = value.trim().replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  if (!safe) throw new Error(`${label} id cannot be used for a managed worktree`);
  return safe;
}
