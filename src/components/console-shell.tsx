"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { TaskStatus } from "../lib/domain/types";

type ShellProject = { id: string; name: string; path: string; isGitRepository: boolean };
type ShellTask = { status: TaskStatus };

export function ConsoleShell({ children, projectId, title, meta, actions }: {
  children: ReactNode; projectId?: string; title?: string; meta?: string; actions?: ReactNode;
}) {
  const [projects, setProjects] = useState<ShellProject[]>([]);
  const [runningCount, setRunningCount] = useState(0);
  const refresh = useCallback(() => {
    const tasksUrl = projectId ? `/api/tasks?projectId=${encodeURIComponent(projectId)}` : null;
    return Promise.all([fetch("/api/projects"), tasksUrl ? fetch(tasksUrl) : Promise.resolve(null)])
      .then(async ([projectsResponse, tasksResponse]) => {
        setProjects(projectsResponse.ok ? await projectsResponse.json() as ShellProject[] : []);
        if (tasksResponse?.ok) {
          const tasks = await tasksResponse.json() as ShellTask[];
          setRunningCount(tasks.filter((task) => task.status === TaskStatus.RUNNING || task.status === TaskStatus.AWAITING_INPUT).length);
        }
      }).catch(() => { setProjects([]); setRunningCount(0); });
  }, [projectId]);
  useEffect(() => {
    void refresh();
    window.addEventListener("agentdeck:task-changed", refresh);
    return () => window.removeEventListener("agentdeck:task-changed", refresh);
  }, [refresh]);
  const active = useMemo(() => projects.find((project) => project.id === projectId), [projectId, projects]);
  const contextTitle = active?.name ?? title ?? "本地任务控制台";
  const contextMeta = active?.path ?? meta ?? "项目、任务与审查均保留在本机";

  return <div className="console-frame">
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <aside className="project-sidebar" aria-label="项目导航">
      <Link className="product-mark" href="/"><span aria-hidden="true">◈</span> AgentDeck <em>Focus</em></Link>
      <Link className="sidebar-overview" href="/">概览</Link>
      <div className="sidebar-heading"><span>已登记项目</span><Link href="/projects" aria-label="管理项目">+</Link></div>
      <nav className="project-nav">
        {projects.length === 0 ? <p>尚未登记项目</p> : projects.map((project) => <Link key={project.id} className={project.id === projectId ? "active" : ""} href={`/projects/${project.id}`}>
          <span className="project-nav-dot" aria-hidden="true" /> <span>{project.name}</span>{project.isGitRepository && <small>git</small>}
        </Link>)}
      </nav>
      <div className="sidebar-footer"><span className="local-indicator" aria-hidden="true" />本地优先 · 不上传代码</div>
    </aside>
    <div className="console-main">
      <header className="console-topbar">
        <div className="topbar-context"><span className="context-kicker">{active ? "当前项目" : "工作台"}</span><strong>{contextTitle}</strong><code>{contextMeta}</code></div>
        <div className="topbar-actions">{active?.isGitRepository && <span className="git-context"><i aria-hidden="true" />Git 已连接</span>}{runningCount > 0 && <span className="running-context">运行任务 {runningCount}</span>}{actions}<Link className="quick-create" href={active ? `#create-task` : "/projects"}>+ 新建任务</Link></div>
      </header>
      <main id="main-content" className="app-shell">{children}</main>
    </div>
  </div>;
}
