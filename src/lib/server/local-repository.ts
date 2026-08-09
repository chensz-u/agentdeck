import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { AgentRunStatus, TaskStatus, type AgentRun, type Project, type Task } from "../domain/types";
import type { ProjectStore } from "../api/project-route-handlers";
import type { TaskApiStore } from "../api/task-route-handlers";
import type { RunLifecycleRepository } from "../services/run-service";
import type { RegisteredProject } from "../services/project-service";

type StoredProject = Omit<Project, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };
type StoredTask = Omit<Task, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };
type StoredRun = Omit<AgentRun, "startedAt" | "finishedAt"> & { startedAt: string; finishedAt: string | null };
type StoredData = {
  projects: StoredProject[];
  tasks: StoredTask[];
  runs: StoredRun[];
  diffs: Record<string, { changedPaths: string[]; diff: string }>;
};

const emptyData = (): StoredData => ({ projects: [], tasks: [], runs: [], diffs: {} });
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
      const task: StoredTask = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
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
      const loaded = { projects: data.projects, tasks: data.tasks, runs: data.runs, diffs: data.diffs } as StoredData;
      if (this.reconcileInterruptedWork(loaded)) this.writeSynchronously(loaded);
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
      if (task.status !== TaskStatus.RUNNING && !interruptedTaskIds.has(task.id)) continue;
      task.status = TaskStatus.FAILED;
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
