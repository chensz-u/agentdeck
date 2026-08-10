"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { StatusBadge } from "../../../components/status-badge";
import { TaskCreateForm, type WorkspaceTask } from "../../../components/task-create-form";
import type { WorkspaceProject } from "../../../components/project-create-form";

export default function ProjectWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<WorkspaceProject | null>(null);
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void Promise.all([fetch(`/api/projects/${id}`), fetch(`/api/tasks?projectId=${encodeURIComponent(id)}`)])
      .then(async ([projectResponse, tasksResponse]) => {
        if (projectResponse.status === 404) { setMissing(true); return; }
        if (!projectResponse.ok || !tasksResponse.ok) throw new Error("Unable to load project");
        setProject(await projectResponse.json() as WorkspaceProject);
        setTasks(await tasksResponse.json() as WorkspaceTask[]);
      })
      .catch(() => setMissing(true));
  }, [id]);

  if (missing) {
    return <main className="app-shell"><header className="topbar"><Link className="brand" href="/">AgentDeck</Link></header><section className="empty-panel"><div><h1>Project not found</h1><p>It may have been removed from local storage.</p></div><Link className="button-link" href="/projects">Back to projects</Link></section></main>;
  }

  return (
    <main className="app-shell">
      <header className="topbar"><Link className="brand" href="/">AgentDeck</Link><nav aria-label="Primary navigation"><Link href="/projects">Projects</Link></nav></header>
      <Link className="back-link" href="/projects">← All projects</Link>
      <section className="project-hero">
        <p className="eyebrow">PROJECT WORKSPACE</p>
        <h1>{project?.name ?? "Loading project…"}</h1>
        {project && <p>{project.path}</p>}
      </section>
      {project && <section className="surface" aria-labelledby="create-task-heading"><h2 id="create-task-heading">Create a task</h2><TaskCreateForm projectId={project.id} projectIsGitRepository={project.isGitRepository} onCreated={(task) => setTasks((current) => [task, ...current])} /></section>}
      <section className="task-list" aria-labelledby="task-list-heading">
        <div className="section-label"><h2 id="task-list-heading">Task queue</h2><span>{tasks.length}</span></div>
        {project && tasks.length === 0 ? <p className="muted">No tasks yet. Add the first brief above.</p> : tasks.map((task) => (
          <article className="task-row" key={task.id}>
            <div><Link href={`/tasks/${task.id}`}><h3>{task.title}</h3></Link><p>{task.prompt}</p></div>
            <StatusBadge status={task.status} />
          </article>
        ))}
      </section>
    </main>
  );
}
