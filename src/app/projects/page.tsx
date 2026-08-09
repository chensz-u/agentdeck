"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ProjectCreateForm, type WorkspaceProject } from "../../components/project-create-form";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    void fetch("/api/projects")
      .then((response) => response.json())
      .then((body: WorkspaceProject[]) => setProjects(body))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/">AgentDeck</Link>
        <nav aria-label="Primary navigation"><Link href="/projects">Projects</Link></nav>
      </header>
      <section className="page-heading split-heading">
        <div><p className="eyebrow">PROJECTS</p><h1>Local repositories</h1></div>
        <p>Register a Git checkout, then keep its task queue close at hand.</p>
      </section>
      <section className="surface" aria-labelledby="add-project-heading">
        <h2 id="add-project-heading">Add a repository</h2>
        <ProjectCreateForm onCreated={(project) => router.push(`/projects/${project.id}`)} />
      </section>
      <section className="project-list" aria-labelledby="project-list-heading">
        <div className="section-label"><h2 id="project-list-heading">Registered projects</h2><span>{projects.length}</span></div>
        {loading ? <p className="muted">Loading projects…</p> : projects.length === 0 ? (
          <p className="muted">No projects registered yet.</p>
        ) : projects.map((project) => (
          <Link className="project-row" href={`/projects/${project.id}`} key={project.id}>
            <span className="repository-mark">↗</span>
            <span><strong>{project.name}</strong><small>{project.path}</small></span>
            <span className="git-label">Git repository</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
