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
        throw new Error(result.error ?? "任务操作失败");
      }
      return response;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "任务操作失败");
      throw caught;
    } finally { setPending(false); }
  }

  const confirmCleanup = () => window.confirm("仅当 Worktree 没有未提交改动时才能清理。确认继续检查并清理吗？");
  return <section className="task-actions" aria-label="任务操作">
    {status === TaskStatus.TODO && <button disabled={pending} onClick={() => void request(`/api/tasks/${taskId}/run`).then(onChanged).catch(() => undefined)}>{pending ? "正在启动…" : "运行任务"}</button>}
    {[TaskStatus.RUNNING, TaskStatus.AWAITING_INPUT].includes(status) && runId && <button className="secondary-button" disabled={pending} onClick={() => void request(`/api/tasks/${taskId}/stop`, { runId }).then(onChanged).catch(() => undefined)}>{pending ? "正在停止…" : "停止运行"}</button>}
    {[TaskStatus.FAILED, TaskStatus.CANCELLED, TaskStatus.REVIEW, TaskStatus.WORKTREE_FAILED].includes(status) && <button className="secondary-button" disabled={pending} onClick={() => void request(`/api/tasks/${taskId}/retry`).then(async (response) => onRetry((await response.json() as { id: string }).id)).catch(() => undefined)}>{pending ? "正在重试…" : "创建重试任务"}</button>}
    {status === TaskStatus.REVIEW && <button disabled={pending} onClick={() => void request(`/api/tasks/${taskId}/merge-ready`).then(onChanged).catch(() => undefined)}>{pending ? "正在更新…" : "标记为可合并"}</button>}
    {status === TaskStatus.MERGE_READY && <button disabled={pending} onClick={() => void request(`/api/tasks/${taskId}/done`).then(onChanged).catch(() => undefined)}>{pending ? "正在更新…" : "标记完成"}</button>}
    {shouldShowWorktreeCleanup(status, Boolean(hasWorktree)) && <div className="danger-action"><button className="danger-button" disabled={pending} onClick={() => { if (confirmCleanup()) void request(`/api/tasks/${taskId}/clean-worktree`).then(onChanged).catch(() => undefined); }}>{pending ? "正在清理…" : "清理 Worktree"}</button><small>仅清理无未提交改动的隔离目录</small></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
