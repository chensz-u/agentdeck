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
      setError(body.error ?? "Unable to add this project.");
      return;
    }
    setName("");
    setPath("");
    onCreated(body);
  }

  return (
    <form className="compact-form" onSubmit={submit}>
      <label>
        Project name
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label className="form-field-wide">
        Local Git repository path
        <input value={path} onChange={(event) => setPath(event.target.value)} required placeholder="C:\\work\\repository" />
      </label>
      <button type="submit" disabled={submitting}>{submitting ? "Adding…" : "Add project"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
