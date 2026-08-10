"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { DiffViewer } from "../../../components/diff-viewer";
import { EventFeed, type ActivityEvent } from "../../../components/event-feed";
import { HumanInputCard } from "../../../components/human-input-card";
import { StatusBadge } from "../../../components/status-badge";
import { TaskActions } from "../../../components/task-actions";
import { WorktreeCard } from "../../../components/worktree-card";
import { TaskStatus } from "../../../lib/domain/types";

type TaskDetail = {
  id: string; projectId: string; title: string; prompt: string; status: TaskStatus;
  run: { id: string; status: string; error: string | null } | null;
  changedPaths: string[]; diff: string;
  review: { changedPaths: string[]; diff: string; commitSummary: string } | null;
  worktree: { status: string; projectPath: string; baselineBranch: string; baselineSha: string; worktreePath: string; taskBranch: string; error: string | null; cleanupError: string | null } | null;
  humanInputRequests: Array<{ requestId: string; deliveryStatus: string; deliveryError: string | null; payload: { kind: "CONFIRMATION" | "QUESTION" | "PERMISSIONS" | null; questions: Array<{ id: string; header: string; question: string; options: string[] }> } | null }>;
};

export default function TaskDetailClient({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`);
    if (response.status === 404) { setMissing(true); return; }
    if (!response.ok) throw new Error("Unable to load task");
    setDetail(await response.json() as TaskDetail);
  }, [taskId]);

  useEffect(() => { void load().catch(() => setMissing(true)); }, [load]);

  useEffect(() => {
    const runId = detail?.run?.id;
    if (!runId) return;
    setEvents([]);
    const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
    const receive = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as ActivityEvent;
      setEvents((current) => current.some((item) => item.sequence === event.sequence) ? current : [...current, event]);
      if (event.type === "run/finished") void load();
    };
    source.onmessage = receive;
    return () => source.close();
  }, [detail?.run?.id, load]);

  if (missing) return <main className="app-shell"><header className="topbar"><Link className="brand" href="/">AgentDeck</Link></header><section className="empty-panel"><h1>Task not found</h1></section></main>;
  if (!detail) return <main className="app-shell"><p className="muted">Loading task…</p></main>;

  return <main className="app-shell">
    <header className="topbar"><Link className="brand" href="/">AgentDeck</Link><nav aria-label="Primary navigation"><Link href="/projects">Projects</Link></nav></header>
    <Link className="back-link" href={`/projects/${detail.projectId}`}>← Project workspace</Link>
    <section className="project-hero task-hero"><p className="eyebrow">TASK DETAIL</p><h1>{detail.title}</h1><p>{detail.prompt}</p><StatusBadge status={detail.status} /></section>
    <TaskActions taskId={detail.id} status={detail.status} runId={detail.run?.id ?? null} hasWorktree={Boolean(detail.worktree)} onChanged={load} onRetry={(id) => router.push(`/tasks/${id}`)} />
    {detail.run?.error && <p className="form-error" role="alert">{detail.run.error}</p>}
    <WorktreeCard worktree={detail.worktree} />
    <HumanInputCard taskId={detail.id} requests={detail.humanInputRequests} onSubmitted={load} />
    <EventFeed events={events} />
    <DiffViewer changedPaths={detail.review?.changedPaths ?? detail.changedPaths} diff={detail.review?.diff ?? detail.diff} baselineBranch={detail.worktree?.baselineBranch} baselineSha={detail.worktree?.baselineSha} taskBranch={detail.worktree?.taskBranch} commitSummary={detail.review?.commitSummary} />
  </main>;
}
