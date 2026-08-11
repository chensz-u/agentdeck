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
import { ConsoleShell } from "../../../components/console-shell";
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
      if (event.type === "run/finished" || event.type === "human-input/requested") void load();
    };
    source.onmessage = receive;
    return () => source.close();
  }, [detail?.run?.id, load]);

  if (missing) return <ConsoleShell title="任务不存在"><section className="empty-panel"><h1>未找到该任务</h1></section></ConsoleShell>;
  if (!detail) return <ConsoleShell title="正在读取任务"><p className="muted">正在读取本地任务…</p></ConsoleShell>;

  return <ConsoleShell projectId={detail.projectId} title={detail.title} meta={detail.worktree?.taskBranch ?? "当前工作区"}>
    <Link className="back-link" href={`/projects/${detail.projectId}`}>← 返回项目工作区</Link>
    <section className="task-command-header"><div><p className="eyebrow">任务详情</p><h1>{detail.title}</h1><p>{detail.prompt}</p></div><div className="task-state"><StatusBadge status={detail.status} /><span>{detail.worktree ? "隔离 Worktree" : "当前工作区"}</span></div></section>
    <TaskActions taskId={detail.id} status={detail.status} runId={detail.run?.id ?? null} hasWorktree={Boolean(detail.worktree)} onChanged={load} onRetry={(id) => router.push(`/tasks/${id}`)} />
    {detail.run?.error && <p className="form-error run-error" role="alert">运行失败：{detail.run.error}</p>}
    <div className="task-panels">
      <div className="task-primary-column"><HumanInputCard taskId={detail.id} requests={detail.humanInputRequests} onSubmitted={load} /><DiffViewer changedPaths={detail.review?.changedPaths ?? detail.changedPaths} diff={detail.review?.diff ?? detail.diff} baselineBranch={detail.worktree?.baselineBranch} baselineSha={detail.worktree?.baselineSha} taskBranch={detail.worktree?.taskBranch} commitSummary={detail.review?.commitSummary} /></div>
      <aside className="task-side-column"><WorktreeCard worktree={detail.worktree} /><EventFeed events={events} /></aside>
    </div>
  </ConsoleShell>;
}
