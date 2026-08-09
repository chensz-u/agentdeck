"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { TaskStatus } from "../lib/domain/types";
import { StatusBadge } from "../components/status-badge";

const visibleStatuses = [TaskStatus.TODO, TaskStatus.RUNNING, TaskStatus.REVIEW, TaskStatus.DONE];

export default function Home() {
  const [counts, setCounts] = useState<Record<TaskStatus, number> | null>(null);

  useEffect(() => {
    void fetch("/api/dashboard")
      .then((response) => response.json())
      .then((body: { counts: Record<TaskStatus, number> }) => setCounts(body.counts))
      .catch(() => setCounts({
        [TaskStatus.TODO]: 0, [TaskStatus.RUNNING]: 0, [TaskStatus.REVIEW]: 0,
        [TaskStatus.DONE]: 0, [TaskStatus.FAILED]: 0, [TaskStatus.CANCELLED]: 0,
      }));
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/">AgentDeck</Link>
        <nav aria-label="Primary navigation"><Link href="/projects">Projects</Link></nav>
      </header>
      <section className="page-heading">
        <p className="eyebrow">LOCAL AGENT WORKSPACE</p>
        <h1>Keep active work in view.</h1>
        <p>Track the tasks you have queued for your local projects.</p>
      </section>
      <section className="metric-grid" aria-label="Task status overview">
        {visibleStatuses.map((status) => (
          <article className="metric-card" key={status}>
            <StatusBadge status={status} />
            <strong>{counts?.[status] ?? "—"}</strong>
            <span>tasks</span>
          </article>
        ))}
      </section>
      <section className="empty-panel">
        <div>
          <p className="eyebrow">START HERE</p>
          <h2>Connect a local Git repository</h2>
          <p>Projects provide a focused home for task briefs and their current state.</p>
        </div>
        <Link className="button-link" href="/projects">Manage projects</Link>
      </section>
    </main>
  );
}
