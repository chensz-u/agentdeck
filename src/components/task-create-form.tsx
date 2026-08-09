"use client";

import { useState, type FormEvent } from "react";

import { TaskStatus } from "../lib/domain/types";

export type WorkspaceTask = {
  id: string;
  projectId: string;
  title: string;
  prompt: string;
  status: TaskStatus;
};

export function TaskCreateForm({ projectId, onCreated }: {
  projectId: string;
  onCreated: (task: WorkspaceTask) => void;
}) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, title, prompt }),
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
      <button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create task"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
