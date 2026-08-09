"use client";

import { useState } from "react";

import { TaskStatus } from "../lib/domain/types";

export function TaskActions({ taskId, status, runId, onChanged, onRetry }: {
  taskId: string;
  status: TaskStatus;
  runId: string | null;
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
    {status === TaskStatus.RUNNING && runId && <button disabled={pending} onClick={() => void request(`/api/tasks/${taskId}/stop`, { runId }).then(onChanged).catch(() => undefined)}>{pending ? "Stopping…" : "Stop run"}</button>}
    {[TaskStatus.FAILED, TaskStatus.CANCELLED, TaskStatus.REVIEW].includes(status) && <button disabled={pending} onClick={() => void request(`/api/tasks/${taskId}/retry`).then(async (response) => onRetry((await response.json() as { id: string }).id)).catch(() => undefined)}>{pending ? "Retrying…" : "Retry task"}</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
