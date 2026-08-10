"use client";

import { useState, type FormEvent } from "react";

import { ExecutionMode, TaskStatus } from "../lib/domain/types";

export type WorkspaceTask = {
  id: string;
  projectId: string;
  title: string;
  prompt: string;
  status: TaskStatus;
  executionMode: ExecutionMode;
};

export function TaskCreateForm({ projectId, projectIsGitRepository, onCreated }: {
  projectId: string;
  projectIsGitRepository: boolean;
  onCreated: (task: WorkspaceTask) => void;
}) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(ExecutionMode.CURRENT_WORKSPACE);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, title, prompt, executionMode }),
    });
    const body = await response.json() as WorkspaceTask & { error?: string };
    setSubmitting(false);
    if (!response.ok) {
      setError(body.error ?? "Unable to create this task.");
      return;
    }
    setTitle("");
    setPrompt("");
    onCreated(body);
  }

  return (
    <form className="task-form" onSubmit={submit}>
      <label>
        Task title
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label>
        Task prompt
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} required rows={3} />
      </label>
      <fieldset className="execution-mode">
        <legend>Execution mode</legend>
        <label><input type="radio" name="execution-mode" value={ExecutionMode.CURRENT_WORKSPACE} checked={executionMode === ExecutionMode.CURRENT_WORKSPACE} onChange={() => setExecutionMode(ExecutionMode.CURRENT_WORKSPACE)} /> Current workspace</label>
        <label title={projectIsGitRepository ? undefined : "Isolated worktrees require a Git project."}><input type="radio" name="execution-mode" value={ExecutionMode.ISOLATED_WORKTREE} checked={executionMode === ExecutionMode.ISOLATED_WORKTREE} onChange={() => setExecutionMode(ExecutionMode.ISOLATED_WORKTREE)} disabled={!projectIsGitRepository} /> Isolated worktree {!projectIsGitRepository && <span className="muted">(requires Git)</span>}</label>
      </fieldset>
      <button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create task"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
