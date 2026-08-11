"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ConsoleShell } from "../components/console-shell";
import { TaskStatus } from "../lib/domain/types";
import { StatusBadge } from "../components/status-badge";

const visibleStatuses = [TaskStatus.RUNNING, TaskStatus.AWAITING_INPUT, TaskStatus.REVIEW, TaskStatus.MERGE_READY, TaskStatus.FAILED, TaskStatus.DONE];

export default function Home() {
  const [counts, setCounts] = useState<Record<TaskStatus, number> | null>(null);

  useEffect(() => {
    void fetch("/api/dashboard")
      .then((response) => response.json())
      .then((body: { counts: Record<TaskStatus, number> }) => setCounts(body.counts))
      .catch(() => setCounts({
        [TaskStatus.TODO]: 0, [TaskStatus.CREATING_WORKTREE]: 0, [TaskStatus.RUNNING]: 0,
        [TaskStatus.AWAITING_INPUT]: 0, [TaskStatus.REVIEW]: 0, [TaskStatus.MERGE_READY]: 0,
        [TaskStatus.DONE]: 0, [TaskStatus.CLEANED]: 0, [TaskStatus.FAILED]: 0,
        [TaskStatus.WORKTREE_FAILED]: 0, [TaskStatus.CANCELLED]: 0,
      }));
  }, []);

  return (
    <ConsoleShell title="任务概览" meta="本地项目的 Codex 工作队列">
      <section className="workspace-heading">
        <div><p className="eyebrow">工作台</p><h1>下一步，清晰可见。</h1></div>
        <p>优先处理阻塞、失败与待审查任务。所有任务、日志和 Git 审查均保留在本机。</p>
      </section>
      <section className="metric-grid" aria-label="任务状态概览">
        {visibleStatuses.map((status) => (
          <article className="metric-card" key={status}>
            <StatusBadge status={status} />
            <strong>{counts?.[status] ?? "—"}</strong>
            <span>个任务</span>
          </article>
        ))}
      </section>
      <section className="overview-callout">
        <div><span className="callout-icon" aria-hidden="true">↗</span><div><h2>从一个本地项目开始</h2><p>登记 Git 仓库后，即可创建任务、选择隔离 Worktree，并在完成后进行基线审查。</p></div></div>
        <Link className="button-link" href="/projects">管理项目</Link>
      </section>
    </ConsoleShell>
  );
}
