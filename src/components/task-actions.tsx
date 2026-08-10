"use client";

import { useState } from "react";

import { TaskStatus } from "../lib/domain/types";

const cleanupStatuses = new Set<TaskStatus>([
  TaskStatus.REVIEW, TaskStatus.MERGE_READY, TaskStatus.DONE, TaskStatus.FAILED, TaskStatus.CANCELLED, TaskStatus.WORKTREE_FAILED,
]);

export function shouldShowWorktreeCleanup(status: TaskStatus, hasWorktree: boolean): boolean {
  return hasWorktree && cleanupStatuses.has(status);
}

export function TaskActions({ taskId, status, runId, hasWorktree, onChanged, onRetry }: {
  taskId: string;
  status: TaskStatus;
  runId: string | null;
  hasWorktree?: boolean;
  onChanged: () => Promise<void>;
  onRetry: (taskId: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(path: string, body?: unknown): Promise<Response> {
    setPending(true); setError(null);
    try {
      const response = await fetch(path, body === undefined ? { method: "POST" } : {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? "Task action failed");
      }
      return response;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Task action failed");
      throw caught;
    } finally { setPending(false); }
  }

  return <section className="task-actions" aria-label="Task actions">
    {status === TaskStatus.TODO && <button disabled={pending} onClick={() => void request(`/api/tasks/${taskId}/run`).then(onChanged).catch(() => undefined)}>{pending ? "Starting…" : "Run task"}</button>}
    {[TaskStatus.RUNNING, TaskStatus.AWAITING_INPUT].includes(status) && runId && <button disabled={pending} onClick={() => void request(`/api/tasks/${taskId}/stop`, { runId }).then(onChanged).catch(() => undefined)}>{pending ? "Stopping…" : "Stop run"}</button>}
    {[TaskStatus.FAILED, TaskStatus.CANCELLED, TaskStatus.REVIEW, TaskStatus.WORKTREE_FAILED].includes(status) && <button disabled={pending} onClick={() => void request(`/api/tasks/${taskId}/retry`).then(async (response) => onRetry((await response.json() as { id: string }).id)).catch(() => undefined)}>{pending ? "Retrying…" : "Retry task"}</button>}
    {status === TaskStatus.REVIEW && <button disabled={pending} onClick={() => void request(`/api/tasks/${taskId}/merge-ready`).then(onChanged).catch(() => undefined)}>{pending ? "Updating…" : "Mark merge ready"}</button>}
    {status === TaskStatus.MERGE_READY && <button disabled={pending} onClick={() => void request(`/api/tasks/${taskId}/done`).then(onChanged).catch(() => undefined)}>{pending ? "Updating…" : "Mark done"}</button>}
    {shouldShowWorktreeCleanup(status, Boolean(hasWorktree)) && <button className="secondary-button" disabled={pending} onClick={() => void request(`/api/tasks/${taskId}/clean-worktree`).then(onChanged).catch(() => undefined)}>{pending ? "Cleaning…" : "Clean worktree"}</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
