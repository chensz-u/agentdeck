import { AgentRunStatus, TaskStatus, type AgentRun, type Project, type Task } from "../domain/types";
import type { CodexAdapter, CodexRunCompletion } from "../codex/codex-adapter";
import type { RunEventInput } from "./run-event-store";

export interface RunLifecycleRepository {
  findTaskWithProject(taskId: string): Promise<{ task: Task; project: Project } | null>;
  createRun(input: Omit<AgentRun, "id" | "startedAt" | "finishedAt">): Promise<AgentRun>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<void>;
  updateRun(
    runId: string,
    update: Partial<Pick<AgentRun, "pid" | "status" | "exitCode" | "error" | "finishedAt">>,
  ): Promise<void>;
  saveDiff(runId: string, changedPaths: string[], diff: string): Promise<void>;
}

export type RunEventWriter = {
  append(runId: string, event: RunEventInput): Promise<unknown>;
};

export type RunGitService = {
  getChangedPaths(project: Pick<Project, "path" | "gitEnabled">): Promise<string[]>;
  getDiff(project: Pick<Project, "path" | "gitEnabled">): Promise<string>;
};

type ActiveRun = {
  task: Task;
  project: Project;
  cancelled: boolean;
  completion: Promise<void>;
};

type RunServiceOptions = {
  repository: RunLifecycleRepository;
  adapter: CodexAdapter;
  events: RunEventWriter;
  git: RunGitService;
  now?: () => Date;
};

/** Coordinates persisted task/run state around a process-only Codex adapter. */
export class RunService {
  private readonly active = new Map<string, ActiveRun>();
  private readonly now: () => Date;

  constructor(private readonly options: RunServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async launch(taskId: string): Promise<AgentRun> {
    const context = await this.options.repository.findTaskWithProject(taskId);
    if (!context) throw new Error(`Task ${taskId} was not found`);
    if (context.task.status !== TaskStatus.TODO) {
      throw new Error(`Task ${taskId} is not ready to run`);
    }

    const run = await this.options.repository.createRun({
      taskId,
      agent: "codex",
      status: AgentRunStatus.RUNNING,
      pid: null,
      exitCode: null,
      error: null,
      logPath: `.agentdeck/runs/${taskId}.jsonl`,
    });
    await this.options.repository.updateTaskStatus(taskId, TaskStatus.RUNNING);
    await this.options.events.append(run.id, { type: "run/started", params: { taskId } });

    try {
      const handle = await this.options.adapter.launch({
        runId: run.id,
        prompt: context.task.prompt,
        cwd: context.project.path,
        onEvent: async (event) => {
          await this.options.events.append(run.id, event);
        },
      });
      run.pid = handle.pid;
      await this.options.repository.updateRun(run.id, { pid: handle.pid });
      const active: ActiveRun = {
        ...context,
        cancelled: false,
        completion: Promise.resolve(),
      };
      active.completion = handle.completed.then(
        (result) => this.finalize(run, active, result),
        (error) => this.finalize(run, active, { exitCode: null, error: error instanceof Error ? error.message : String(error) }),
      );
      this.active.set(run.id, active);
    } catch (error) {
      await this.finalize(run, { ...context, cancelled: false, completion: Promise.resolve() }, {
        exitCode: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return run;
  }

  async stop(runId: string): Promise<void> {
    const active = this.active.get(runId);
    if (!active) throw new Error(`Run ${runId} is not active`);
    active.cancelled = true;
    await this.options.events.append(runId, { type: "run/cancelling", params: {} });
    await this.options.adapter.stop(runId);
  }

  async stopTask(taskId: string, runId: string): Promise<void> {
    const active = this.active.get(runId);
    if (!active || active.task.id !== taskId) {
      throw new Error(`Run ${runId} is not active for task ${taskId}`);
    }
    await this.stop(runId);
  }

  async waitForCompletion(runId: string): Promise<void> {
    const active = this.active.get(runId);
    if (!active) return;
    await active.completion;
  }

  private async finalize(run: AgentRun, active: ActiveRun, result: CodexRunCompletion): Promise<void> {
    const finishedAt = this.now();
    let runStatus = AgentRunStatus.FAILED;
    let taskStatus = TaskStatus.FAILED;
    let error = result.error ?? null;

    if (active.cancelled) {
      runStatus = AgentRunStatus.CANCELLED;
      taskStatus = TaskStatus.CANCELLED;
      error = null;
    } else if (result.exitCode === 0) {
      try {
        const project = { path: active.project.path, gitEnabled: active.project.gitEnabled };
        const [changedPaths, diff] = await Promise.all([
          this.options.git.getChangedPaths(project),
          this.options.git.getDiff(project),
        ]);
        await this.options.repository.saveDiff(run.id, changedPaths, diff);
        runStatus = AgentRunStatus.SUCCEEDED;
        taskStatus = TaskStatus.REVIEW;
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }
    }

    await this.options.repository.updateRun(run.id, {
      status: runStatus,
      exitCode: result.exitCode,
      error,
      finishedAt,
    });
    await this.options.repository.updateTaskStatus(run.taskId, taskStatus);
    await this.options.events.append(run.id, {
      type: "run/finished",
      params: { status: runStatus, exitCode: result.exitCode, error },
    });
    this.active.delete(run.id);
  }
}
