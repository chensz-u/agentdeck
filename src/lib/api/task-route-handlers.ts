import { z } from "zod";

import { AgentId, ExecutionMode, HumanInputAction, TaskStatus, type AgentRun, type HumanInputAuditEntry, type Task, type Worktree } from "../domain/types";
import { AgentRegistry } from "../agents/agent-registry";
import type { RegisteredProject } from "../services/project-service";
import { TaskService, type TaskRepository } from "../services/task-service";

const createTaskSchema = z.object({
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  executionMode: z.nativeEnum(ExecutionMode).default(ExecutionMode.CURRENT_WORKSPACE),
  agentId: z.nativeEnum(AgentId).default(AgentId.CODEX),
}).strict();

type RouteContext = { params: Promise<{ id: string }> };

export interface TaskApiStore extends TaskRepository {
  findProject(id: string): Promise<RegisteredProject | null>;
  listTasks(projectId?: string): Promise<Task[]>;
}

export function createTaskRouteHandlers(repository: TaskApiStore, registry?: AgentRegistry) {
  const service = new TaskService(repository);

  return {
    async GET(request: Request): Promise<Response> {
      const projectId = new URL(request.url).searchParams.get("projectId")?.trim();
      if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
      if (!await repository.findProject(projectId)) {
        return Response.json({ error: "Project not found" }, { status: 404 });
      }
      return Response.json(await repository.listTasks(projectId));
    },

    async POST(request: Request): Promise<Response> {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const input = createTaskSchema.safeParse(body);
      if (!input.success) return Response.json({ error: "Invalid task payload" }, { status: 400 });
      const project = await repository.findProject(input.data.projectId);
      if (!project) {
        return Response.json({ error: "Project not found" }, { status: 404 });
      }
      if (input.data.executionMode === ExecutionMode.ISOLATED_WORKTREE && !project.isGitRepository) {
        return Response.json({ error: "Isolated worktrees require a Git project" }, { status: 400 });
      }
      try {
        registry?.requireAvailable(input.data.agentId);
      } catch {
        return Response.json({ error: "Selected agent is unavailable" }, { status: 400 });
      }
      return Response.json(await service.createTask(input.data), { status: 201 });
    },
  };
}

export type TaskDetailStore = Pick<TaskApiStore, "findTask"> & {
  findLatestRun?(taskId: string): Promise<AgentRun | null>;
  findDiff?(runId: string): Promise<{ changedPaths: string[]; diff: string } | null>;
  findWorktreeByTaskId?(taskId: string): Promise<Worktree | null>;
  listHumanInputs?(runId: string): Promise<HumanInputAuditEntry[]>;
};

type TaskReviewReader = { getReview(taskId: string): Promise<{ changedPaths: string[]; diff: string; commitSummary: string }> };

export function createTaskDetailRouteHandlers(repository: TaskDetailStore, reviewReader?: TaskReviewReader) {
  return {
    async GET(_request: Request, context: RouteContext): Promise<Response> {
      const { id } = await context.params;
      const task = await repository.findTask(id);
      if (!task) return Response.json({ error: "Task not found" }, { status: 404 });

      const run = repository.findLatestRun ? await repository.findLatestRun(task.id) : null;
      const savedReview = run && repository.findDiff ? await repository.findDiff(run.id) : null;
      const worktree = repository.findWorktreeByTaskId ? await repository.findWorktreeByTaskId(task.id) : null;
      const liveReview = reviewReader && worktree?.status === "READY"
        ? await reviewReader.getReview(task.id).catch(() => null)
        : null;
      const review = liveReview ?? (savedReview ? { ...savedReview, commitSummary: "" } : null);
      const humanInputRequests = run && repository.listHumanInputs
        ? (await repository.listHumanInputs(run.id))
          .filter((entry) => entry.action === HumanInputAction.REQUEST)
          .map(sanitizeHumanInput)
        : [];
      return Response.json({
        ...task,
        run,
        changedPaths: review?.changedPaths ?? [],
        diff: review?.diff ?? "",
        review: review ? { changedPaths: review.changedPaths, diff: review.diff } : null,
        worktree: worktree ? sanitizeWorktree(worktree) : null,
        humanInputRequests,
      });
    },
  };
}

function sanitizeWorktree(worktree: Worktree) {
  return {
    id: worktree.id,
    status: worktree.status,
    taskBranch: worktree.taskBranch,
    baselineBranch: worktree.baselineBranch,
    baselineSha: worktree.baselineSha,
    projectPath: worktree.projectPath,
    worktreePath: worktree.worktreePath,
    error: worktree.error,
    cleanupRequestedAt: worktree.cleanupRequestedAt,
    cleanedAt: worktree.cleanedAt,
    cleanupError: worktree.cleanupError,
  };
}

function sanitizeHumanInput(entry: HumanInputAuditEntry) {
  return {
    requestId: entry.requestId,
    deliveryStatus: entry.deliveryStatus,
    deliveryError: entry.deliveryError,
    createdAt: entry.createdAt,
    payload: sanitizeHumanPayload(entry.payload),
  };
}

function sanitizeHumanPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as { kind?: unknown; questionIds?: unknown; questions?: unknown; permissions?: unknown };
  const questions = Array.isArray(value.questions) ? value.questions.flatMap((question) => {
    if (!question || typeof question !== "object" || Array.isArray(question)) return [];
    const item = question as { id?: unknown; header?: unknown; question?: unknown; options?: unknown };
    if (typeof item.id !== "string" || typeof item.question !== "string") return [];
    return [{
      id: item.id,
      header: typeof item.header === "string" ? item.header : "Question",
      question: item.question,
      options: Array.isArray(item.options) ? item.options.filter((option): option is string => typeof option === "string") : [],
    }];
  }) : [];
  return {
    kind: typeof value.kind === "string" ? value.kind : null,
    questionIds: Array.isArray(value.questionIds) ? value.questionIds.filter((id): id is string => typeof id === "string") : [],
    questions,
    permissions: value.permissions && typeof value.permissions === "object" && !Array.isArray(value.permissions) ? value.permissions : {},
  };
}

export function createDashboardRouteHandlers(repository: Pick<TaskApiStore, "listTasks">) {
  return {
    async GET(): Promise<Response> {
      const counts = Object.fromEntries(
        Object.values(TaskStatus).map((status) => [status, 0]),
      ) as Record<TaskStatus, number>;
      for (const task of await repository.listTasks()) counts[task.status] += 1;
      return Response.json({ counts });
    },
  };
}
