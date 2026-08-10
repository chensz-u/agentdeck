import { execFile } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { ExecutionMode, TaskStatus, WorktreeStatus, type Project, type Task, type Worktree } from "../domain/types";

const execFileAsync = promisify(execFile);

export interface WorktreeRepository {
  findTaskWithProject(taskId: string): Promise<{ task: Task; project: Project } | null>;
  findWorktreeByTaskId(taskId: string): Promise<Worktree | null>;
  /** This must atomically store the worktree and link it to its task. */
  createWorktree(input: Omit<Worktree, "id" | "createdAt">): Promise<Worktree>;
  /** Atomically claims a READY worktree for cleanup. */
  claimWorktreeCleanup(worktreeId: string, requestedAt: Date): Promise<Worktree>;
  updateWorktree(
    worktreeId: string,
    update: Partial<Omit<Worktree, "id" | "taskId" | "projectId" | "projectPath" | "worktreePath" | "taskBranch" | "baselineBranch" | "baselineSha" | "createdAt">>,
  ): Promise<void>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<void>;
}

export type WorktreeInspection = {
  isClean: boolean;
  changedPaths: string[];
};

type WorktreeServiceOptions = {
  repository: WorktreeRepository;
  now?: () => Date;
};

/** Owns fixed Git worktree commands for persisted, registered project tasks. */
export class WorktreeService {
  private readonly now: () => Date;

  constructor(private readonly options: WorktreeServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async create(taskId: string): Promise<Worktree> {
    const { task, project } = await this.requireTaskContext(taskId);
    if (task.executionMode !== ExecutionMode.ISOLATED_WORKTREE) {
      throw new Error(`Task ${task.id} is not configured for an isolated worktree`);
    }
    if (await this.options.repository.findWorktreeByTaskId(task.id)) {
      throw new Error(`Task ${task.id} already has a worktree`);
    }

    const projectPath = await this.requireRegisteredGitProject(project);
    const taskSegment = safeId(task.id, "task");
    const worktreePath = join(projectPath, ".agentdeck", "worktrees", `task-${taskSegment}`);
    const taskBranch = `agentdeck/task-${taskSegment}`;
    if (existsSync(worktreePath)) {
      throw new Error(`Managed worktree path already exists for task ${task.id}`);
    }
    if (await this.branchExists(projectPath, taskBranch)) {
      throw new Error(`Managed worktree branch already exists for task ${task.id}`);
    }

    const baselineBranch = await this.currentBranch(projectPath);
    const baselineSha = await this.git(projectPath, ["rev-parse", "HEAD"]);
    let worktreeCreated = false;
    try {
      await this.git(projectPath, ["worktree", "add", "-b", taskBranch, worktreePath, baselineSha]);
      worktreeCreated = true;
      return await this.options.repository.createWorktree({
        taskId: task.id,
        projectId: project.id,
        projectPath,
        worktreePath,
        taskBranch,
        baselineBranch,
        baselineSha,
        status: WorktreeStatus.READY,
        error: null,
        cleanupRequestedAt: null,
        cleanedAt: null,
        cleanupError: null,
      });
    } catch (error) {
      if (worktreeCreated) {
        const rollbackError = await this.rollbackCreation(projectPath, worktreePath, taskBranch);
        if (rollbackError) throw new Error(`${message(error)}; rollback cleanup failed: ${rollbackError}`);
      }
      throw error;
    }
  }

  async inspect(taskId: string): Promise<WorktreeInspection> {
    const worktree = await this.requireWorktree(taskId);
    const { project } = await this.requireTaskContext(taskId);
    const projectPath = await this.requireRegisteredGitProject(project);
    this.assertManagedWorktree(projectPath, worktree);
    const status = await this.gitRaw(worktree.worktreePath, ["status", "--porcelain=v1", "-z"]);
    return parseStatus(status);
  }

  async cleanup(taskId: string): Promise<void> {
    const { task, project } = await this.requireTaskContext(taskId);
    const worktree = await this.requireWorktree(task.id);
    const projectPath = await this.requireRegisteredGitProject(project);

    this.assertManagedWorktree(projectPath, worktree);
    if (worktree.status !== WorktreeStatus.READY) {
      throw new Error(`Worktree ${worktree.id} is not READY for cleanup`);
    }
    if (![TaskStatus.REVIEW, TaskStatus.MERGE_READY, TaskStatus.DONE].includes(task.status)) {
      throw new Error("Cleanup is only allowed for REVIEW, MERGE_READY, or DONE tasks");
    }
    const claimed = await this.options.repository.claimWorktreeCleanup(worktree.id, this.now());

    try {
      const status = await this.gitRaw(claimed.worktreePath, ["status", "--porcelain=v1", "-z"]);
      const inspection = parseStatus(status);
      if (!inspection.isClean) throw new Error("worktree has uncommitted changes");

      await this.git(projectPath, ["worktree", "remove", claimed.worktreePath]);
      try {
        await this.git(projectPath, ["branch", "--delete", "--force", claimed.taskBranch]);
      } catch (error) {
        throw new Error(`Worktree was removed but branch ${claimed.taskBranch} could not be deleted: ${message(error)}`);
      }
      await this.options.repository.updateWorktree(worktree.id, {
        status: WorktreeStatus.CLEANED,
        cleanedAt: this.now(),
        cleanupError: null,
      });
      await this.options.repository.updateTaskStatus(task.id, TaskStatus.CLEANED);
    } catch (error) {
      const cleanupError = message(error);
      await this.options.repository.updateWorktree(worktree.id, {
        status: WorktreeStatus.CLEANUP_FAILED,
        cleanupError,
      });
      throw error;
    }
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

  private async branchExists(projectPath: string, branch: string): Promise<boolean> {
    try {
      await this.git(projectPath, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
      return true;
    } catch {
      return false;
    }
  }

  private async currentBranch(projectPath: string): Promise<string> {
    try {
      return await this.git(projectPath, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    } catch {
      throw new Error("Registered project must have a current Git branch");
    }
  }

  private assertManagedWorktree(projectPath: string, worktree: Worktree): void {
    const expected = resolve(projectPath, ".agentdeck", "worktrees", `task-${safeId(worktree.taskId, "task")}`);
    if (resolve(worktree.projectPath) !== resolve(projectPath) || resolve(worktree.worktreePath) !== expected) {
      throw new Error("Persisted worktree path is outside the managed project location");
    }
    if (resolve(worktree.worktreePath) === resolve(projectPath)) {
      throw new Error("Refusing to remove the registered project root");
    }
    if (worktree.taskBranch !== `agentdeck/task-${safeId(worktree.taskId, "task")}`) {
      throw new Error("Persisted worktree branch does not match the managed task branch");
    }
  }

  private async rollbackCreation(projectPath: string, worktreePath: string, taskBranch: string): Promise<string | null> {
    const failures: string[] = [];
    try {
      await this.git(projectPath, ["worktree", "remove", "--force", worktreePath]);
    } catch (error) {
      failures.push(`worktree removal: ${message(error)}`);
    }
    try {
      await this.git(projectPath, ["branch", "--delete", "--force", taskBranch]);
    } catch (error) {
      failures.push(`branch deletion: ${message(error)}`);
    }
    return failures.length ? failures.join("; ") : null;
  }

  private async git(cwd: string, args: readonly string[]): Promise<string> {
    return (await this.gitRaw(cwd, args)).trim();
  }

  private async gitRaw(cwd: string, args: readonly string[]): Promise<string> {
    const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
    return stdout;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeId(value: string, label: string): string {
  const safe = value.trim().replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  if (!safe) throw new Error(`${label} id cannot be used for a managed worktree`);
  return safe;
}

function parseStatus(output: string): WorktreeInspection {
  if (!output) return { isClean: true, changedPaths: [] };
  const records = output.split("\0");
  const changedPaths: string[] = [];
  for (let index = 0; index < records.length - 1; index += 1) {
    const record = records[index];
    const status = record.slice(0, 2);
    changedPaths.push(record.slice(3));
    if (status.includes("R") || status.includes("C")) {
      index += 1;
      if (records[index]) changedPaths.push(records[index]);
    }
  }
  return { isClean: false, changedPaths };
}
