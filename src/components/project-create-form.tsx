"use client";

import { useState, type FormEvent } from "react";

export type WorkspaceProject = {
  id: string;
  name: string;
  path: string;
  isGitRepository: boolean;
};

export function ProjectCreateForm({ onCreated }: { onCreated: (project: WorkspaceProject) => void }) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, path }),
    });
    const body = await response.json() as WorkspaceProject & { error?: string };
    setSubmitting(false);
    if (!response.ok) {
      setError(body.error ?? "无法登记这个项目。");
      return;
    }
    setName("");
    setPath("");
    onCreated(body);
  }

  return (
    <form className="compact-form" onSubmit={submit}>
      <label>
        项目名称
        <input name="project-name" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label className="form-field-wide">
        本地项目路径
        <input name="project-path" autoComplete="off" value={path} onChange={(event) => setPath(event.target.value)} required placeholder="C:\\workspace\\repository" />
      </label>
      <button type="submit" disabled={submitting}>{submitting ? "正在登记…" : "登记项目"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
