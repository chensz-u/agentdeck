import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  AgentRunStatus,
  ExecutionMode,
  HumanInputAction,
  RunInputState,
  TaskStatus,
  WorktreeStatus,
  type AgentRun,
  type HumanInputAuditEntry,
  type Project,
  type Task,
  type Worktree,
} from "../domain/types";
import { transitionTask } from "../domain/task-state";
import type { ProjectStore } from "../api/project-route-handlers";
import type { TaskApiStore } from "../api/task-route-handlers";
import type { RunLifecycleRepository } from "../services/run-service";
import type { RegisteredProject } from "../services/project-service";

type StoredProject = Omit<Project, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };
type StoredTask = Omit<Task, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };
type StoredRun = Omit<AgentRun, "startedAt" | "finishedAt"> & { startedAt: string; finishedAt: string | null };
type StoredWorktree = Omit<Worktree, "createdAt" | "cleanupRequestedAt" | "cleanedAt"> & {
  createdAt: string;
  cleanupRequestedAt: string | null;
  cleanedAt: string | null;
};
type StoredHumanInput = Omit<HumanInputAuditEntry, "createdAt"> & { createdAt: string };
type StoredData = {
  projects: StoredProject[];
  tasks: StoredTask[];
  runs: StoredRun[];
  diffs: Record<string, { changedPaths: string[]; diff: string }>;
  worktrees: StoredWorktree[];
  humanInputs: StoredHumanInput[];
};

const emptyData = (): StoredData => ({ projects: [], tasks: [], runs: [], diffs: {}, worktrees: [], humanInputs: [] });
const restartError = "AgentDeck restarted before this run completed; the process cannot be recovered.";

function asProject(project: StoredProject): Project {
  return { ...project, createdAt: new Date(project.createdAt), updatedAt: new Date(project.updatedAt) };
}

function asTask(task: StoredTask): Task {
  return { ...task, createdAt: new Date(task.createdAt), updatedAt: new Date(task.updatedAt) };
}

function asRun(run: StoredRun): AgentRun {
  return {
    ...run,
    startedAt: new Date(run.startedAt),
    finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
  };
}

function asWorktree(worktree: StoredWorktree): Worktree {
  return {
    ...worktree,
    createdAt: new Date(worktree.createdAt),
    cleanupRequestedAt: worktree.cleanupRequestedAt ? new Date(worktree.cleanupRequestedAt) : null,
    cleanedAt: worktree.cleanedAt ? new Date(worktree.cleanedAt) : null,
  };
}

function asHumanInput(input: StoredHumanInput): HumanInputAuditEntry {
  return { ...input, createdAt: new Date(input.createdAt) };
}

function asRegisteredProject(project: StoredProject): RegisteredProject {
  return {
    id: project.id,
    name: project.name,
    path: project.path,
    isGitRepository: project.gitEnabled,
  };
}

/** Local JSON storage for the single-user desktop server. Writes are serialized and atomically replaced. */
export class LocalRepository implements ProjectStore, TaskApiStore, RunLifecycleRepository {
  private readonly filePath: string;
  private data: StoredData;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath = join(process.cwd(), ".agentdeck", "data.json")) {
    this.filePath = filePath;
    this.data = this.load();
  }

  async createProject(input: Omit<RegisteredProject, "id">): Promise<RegisteredProject> {
    return this.mutate(() => {
      const now = new Date().toISOString();
      const project: StoredProject = {
        id: randomUUID(),
        name: input.name,
        path: input.path,
        gitEnabled: input.isGitRepository,
        gitRemote: null,
        gitBranch: null,
        createdAt: now,
        updatedAt: now,
      };
      this.data.projects.push(project);
      return asRegisteredProject(project);
    });
  }

  async listProjects(): Promise<RegisteredProject[]> {
    await this.writeQueue;
    return this.data.projects.map(asRegisteredProject);
  }

  async findProject(id: string): Promise<RegisteredProject | null> {
    await this.writeQueue;
    const project = this.data.projects.find((candidate) => candidate.id === id);
    return project ? asRegisteredProject(project) : null;
  }

  async findTask(id: string): Promise<Task | null> {
    await this.writeQueue;
    const task = this.data.tasks.find((candidate) => candidate.id === id);
    return task ? asTask(task) : null;
  }

  async findLatestRun(taskId: string): Promise<AgentRun | null> {
    await this.writeQueue;
    const run = this.data.runs
      .filter((candidate) => candidate.taskId === taskId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
    return run ? asRun(run) : null;
  }

  async findDiff(runId: string): Promise<{ changedPaths: string[]; diff: string } | null> {
    await this.writeQueue;
    const review = this.data.diffs[runId];
    return review ? { changedPaths: [...review.changedPaths], diff: review.diff } : null;
  }

  async listTasks(projectId?: string): Promise<Task[]> {
    await this.writeQueue;
    return this.data.tasks
      .filter((task) => !projectId || task.projectId === projectId)
      .map(asTask);
  }

  async createTask(input: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task> {
    return this.mutate(() => {
      if (!this.data.projects.some((project) => project.id === input.projectId)) {
        throw new Error(`Project ${input.projectId} was not found`);
      }
      const now = new Date().toISOString();
      const task: StoredTask = {
        ...input,
        executionMode: input.executionMode ?? ExecutionMode.CURRENT_WORKSPACE,
        worktreeId: input.worktreeId ?? null,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      this.data.tasks.push(task);
      return asTask(task);
    });
  }

  async findTaskWithProject(taskId: string): Promise<{ task: Task; project: Project } | null> {
    await this.writeQueue;
    const task = this.data.tasks.find((candidate) => candidate.id === taskId);
    if (!task) return null;
    const project = this.data.projects.find((candidate) => candidate.id === task.projectId);
    return project ? { task: asTask(task), project: asProject(project) } : null;
  }

  async claimTaskRun(
    taskId: string,
    input: Omit<AgentRun, "id" | "startedAt" | "finishedAt" | "taskId">,
  ): Promise<{ run: AgentRun; task: Task; project: Project }> {
    return this.mutate(() => {
      const task = this.data.tasks.find((candidate) => candidate.id === taskId);
      if (!task) throw new Error(`Task ${taskId} was not found`);
      if (task.status !== TaskStatus.TODO) throw new Error(`Task ${taskId} is not ready to run`);
      const project = this.data.projects.find((candidate) => candidate.id === task.projectId);
      if (!project) throw new Error(`Project ${task.projectId} was not found`);

      const now = new Date().toISOString();
      const run: StoredRun = {
        ...input,
        threadId: input.threadId ?? null,
        turnId: input.turnId ?? null,
        inputState: input.inputState ?? RunInputState.IDLE,
        id: randomUUID(),
        taskId,
        startedAt: now,
        finishedAt: null,
      };
      task.status = TaskStatus.RUNNING;
      task.updatedAt = now;
      this.data.runs.push(run);
      return { run: asRun(run), task: asTask(task), project: asProject(project) };
    });
  }

  async createRun(input: Omit<AgentRun, "id" | "startedAt" | "finishedAt">): Promise<AgentRun> {
    return this.mutate(() => {
      const run: StoredRun = {
        ...input,
        threadId: input.threadId ?? null,
        turnId: input.turnId ?? null,
        inputState: input.inputState ?? RunInputState.IDLE,
        id: randomUUID(),
        startedAt: new Date().toISOString(),
        finishedAt: null,
      };
      this.data.runs.push(run);
      return asRun(run);
    });
  }

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    await this.mutate(() => {
      const task = this.data.tasks.find((candidate) => candidate.id === taskId);
      if (!task) throw new Error(`Task ${taskId} was not found`);
      task.status = transitionTask(task.status, status);
      task.updatedAt = new Date().toISOString();
    });
  }

  /** Bypasses the public state machine for restart recovery and explicit operator repair. */
  async forceTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    await this.mutate(() => {
      const task = this.data.tasks.find((candidate) => candidate.id === taskId);
      if (!task) throw new Error(`Task ${taskId} was not found`);
      task.status = status;
      task.updatedAt = new Date().toISOString();
    });
  }

  async updateRun(
    runId: string,
    update: Partial<Pick<AgentRun, "pid" | "status" | "exitCode" | "error" | "finishedAt">>,
  ): Promise<void> {
    await this.mutate(() => {
      const run = this.data.runs.find((candidate) => candidate.id === runId);
      if (!run) throw new Error(`Run ${runId} was not found`);
      Object.assign(run, update, {
        finishedAt: update.finishedAt === undefined
          ? run.finishedAt
          : update.finishedAt?.toISOString() ?? null,
      });
    });
  }

  async updateRunSession(
    runId: string,
    update: Partial<Pick<AgentRun, "threadId" | "turnId" | "inputState">>,
  ): Promise<void> {
    await this.mutate(() => {
      const run = this.data.runs.find((candidate) => candidate.id === runId);
      if (!run) throw new Error(`Run ${runId} was not found`);
      Object.assign(run, update);
    });
  }

  async createWorktree(input: Omit<Worktree, "id" | "createdAt">): Promise<Worktree> {
    return this.mutate(() => {
      if (!this.data.tasks.some((task) => task.id === input.taskId)) {
        throw new Error(`Task ${input.taskId} was not found`);
      }
      const task = this.data.tasks.find((candidate) => candidate.id === input.taskId)!;
      if (task.worktreeId || this.data.worktrees.some((worktree) => worktree.taskId === input.taskId)) {
        throw new Error(`Task ${input.taskId} already has a worktree`);
      }
      const worktree: StoredWorktree = {
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        cleanupRequestedAt: input.cleanupRequestedAt?.toISOString() ?? null,
        cleanedAt: input.cleanedAt?.toISOString() ?? null,
      };
      this.data.worktrees.push(worktree);
      task.worktreeId = worktree.id;
      task.updatedAt = worktree.createdAt;
      return asWorktree(worktree);
    });
  }

  async findWorktreeByTaskId(taskId: string): Promise<Worktree | null> {
    await this.writeQueue;
    const worktree = this.data.worktrees.find((candidate) => candidate.taskId === taskId);
    return worktree ? asWorktree(worktree) : null;
  }

  async claimWorktreeCleanup(worktreeId: string, requestedAt: Date): Promise<Worktree> {
    return this.mutate(() => {
      const worktree = this.data.worktrees.find((candidate) => candidate.id === worktreeId);
      if (!worktree) throw new Error(`Worktree ${worktreeId} was not found`);
      if (worktree.status !== WorktreeStatus.READY) {
        throw new Error(`Worktree ${worktreeId} is not READY for cleanup`);
      }
      worktree.status = WorktreeStatus.CLEANING;
      worktree.cleanupRequestedAt = requestedAt.toISOString();
      worktree.cleanupError = null;
      return asWorktree(worktree);
    });
  }

  async updateWorktree(
    worktreeId: string,
    update: Partial<Omit<Worktree, "id" | "taskId" | "projectId" | "projectPath" | "worktreePath" | "taskBranch" | "baselineBranch" | "baselineSha" | "createdAt">>,
  ): Promise<void> {
    await this.mutate(() => {
      const worktree = this.data.worktrees.find((candidate) => candidate.id === worktreeId);
      if (!worktree) throw new Error(`Worktree ${worktreeId} was not found`);
      Object.assign(worktree, update, {
        cleanupRequestedAt: update.cleanupRequestedAt === undefined
          ? worktree.cleanupRequestedAt
          : update.cleanupRequestedAt?.toISOString() ?? null,
        cleanedAt: update.cleanedAt === undefined ? worktree.cleanedAt : update.cleanedAt?.toISOString() ?? null,
      });
    });
  }

  async appendHumanInput(input: Omit<HumanInputAuditEntry, "id" | "sequence" | "createdAt">): Promise<HumanInputAuditEntry> {
    return this.mutate(() => {
      if (!Object.values(HumanInputAction).includes(input.action)) {
        throw new Error(`Unsupported human input action: ${input.action}`);
      }
      const existing = this.data.humanInputs.find((candidate) => candidate.runId === input.runId && candidate.requestId === input.requestId);
      if (existing) return asHumanInput(existing);
      const entry: StoredHumanInput = {
        ...input,
        id: randomUUID(),
        sequence: (this.data.humanInputs.at(-1)?.sequence ?? 0) + 1,
        createdAt: new Date().toISOString(),
      };
      this.data.humanInputs.push(entry);
      return asHumanInput(entry);
    });
  }

  async listHumanInputs(runId: string): Promise<HumanInputAuditEntry[]> {
    await this.writeQueue;
    return this.data.humanInputs
      .filter((input) => input.runId === runId)
      .sort((left, right) => left.sequence - right.sequence)
      .map(asHumanInput);
  }

  async saveDiff(runId: string, changedPaths: string[], diff: string): Promise<void> {
    await this.mutate(() => {
      this.data.diffs[runId] = { changedPaths: [...changedPaths], diff };
    });
  }

  private load(): StoredData {
    if (!existsSync(this.filePath)) return emptyData();
    try {
      const value: unknown = JSON.parse(readFileSync(this.filePath, "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
      const data = value as Partial<StoredData>;
      if (!Array.isArray(data.projects) || !Array.isArray(data.tasks) || !Array.isArray(data.runs) || !data.diffs) {
        throw new Error("missing storage collections");
      }
      const storedWorktrees = Array.isArray(data.worktrees) ? data.worktrees : [];
      const loaded: StoredData = {
        projects: data.projects,
        tasks: data.tasks.map((task) => ({
          ...task,
          executionMode: task.executionMode ?? ExecutionMode.CURRENT_WORKSPACE,
          worktreeId: task.worktreeId ?? storedWorktrees.find((worktree) => worktree.taskId === task.id)?.id ?? null,
        })),
        runs: data.runs.map((run) => ({
          ...run,
          threadId: run.threadId ?? null,
          turnId: run.turnId ?? null,
          inputState: run.inputState ?? RunInputState.IDLE,
        })),
        diffs: data.diffs,
        worktrees: storedWorktrees,
        humanInputs: Array.isArray(data.humanInputs) ? data.humanInputs : [],
      };
      const migrated = !Array.isArray(data.worktrees) || !Array.isArray(data.humanInputs)
        || data.tasks.some((task) => task.executionMode === undefined)
        || data.tasks.some((task) => task.worktreeId === undefined)
        || data.runs.some((run) => run.threadId === undefined || run.turnId === undefined || run.inputState === undefined);
      const reconciled = this.reconcileInterruptedWork(loaded);
      if (migrated || reconciled) this.writeSynchronously(loaded);
      return loaded;
    } catch (error) {
      throw new Error(`Unable to read AgentDeck local storage at ${this.filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private reconcileInterruptedWork(data: StoredData): boolean {
    const now = new Date().toISOString();
    const interruptedTaskIds = new Set<string>();
    for (const run of data.runs) {
      if (run.status !== AgentRunStatus.RUNNING) continue;
      run.status = AgentRunStatus.FAILED;
      run.error = restartError;
      run.finishedAt = now;
      interruptedTaskIds.add(run.taskId);
    }
    let changed = interruptedTaskIds.size > 0;
    for (const task of data.tasks) {
      const active = task.status === TaskStatus.RUNNING
        || task.status === TaskStatus.CREATING_WORKTREE
        || task.status === TaskStatus.AWAITING_INPUT;
      if (!active && !interruptedTaskIds.has(task.id)) continue;
      task.status = task.executionMode === ExecutionMode.ISOLATED_WORKTREE
        ? TaskStatus.WORKTREE_FAILED
        : TaskStatus.FAILED;
      task.updatedAt = now;
      changed = true;
    }
    return changed;
  }

  private writeSynchronously(data: StoredData): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(data), "utf8");
    renameSync(temporaryPath, this.filePath);
  }

  private async mutate<T>(mutation: () => T): Promise<T> {
    let result!: T;
    const write = this.writeQueue.then(async () => {
      result = mutation();
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(this.data), "utf8");
      await rename(temporaryPath, this.filePath);
    });
    this.writeQueue = write.catch(() => undefined);
    await write;
    return result;
  }
}
