"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { StatusBadge } from "../../../components/status-badge";
import { ConsoleShell } from "../../../components/console-shell";
import { TaskCreateForm, type WorkspaceTask } from "../../../components/task-create-form";
import type { WorkspaceProject } from "../../../components/project-create-form";
import type { AgentDescriptor } from "../../../lib/agents/agent-registry";

export default function ProjectWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<WorkspaceProject | null>(null);
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [agents, setAgents] = useState<AgentDescriptor[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void Promise.all([fetch(`/api/projects/${id}`), fetch(`/api/tasks?projectId=${encodeURIComponent(id)}`), fetch("/api/agents")])
      .then(async ([projectResponse, tasksResponse, agentsResponse]) => {
        if (projectResponse.status === 404) { setMissing(true); return; }
        if (!projectResponse.ok || !tasksResponse.ok || !agentsResponse.ok) throw new Error("Unable to load project");
        setProject(await projectResponse.json() as WorkspaceProject);
        setTasks(await tasksResponse.json() as WorkspaceTask[]);
        setAgents(await agentsResponse.json() as AgentDescriptor[]);
      })
      .catch(() => setMissing(true));
  }, [id]);

  if (missing) return <ConsoleShell title="项目不存在"><section className="empty-panel"><div><h1>未找到该项目</h1><p>它可能已从本地存储中移除。</p></div><Link className="button-link" href="/projects">返回项目列表</Link></section></ConsoleShell>;

  return (
    <ConsoleShell projectId={id} title={project?.name} meta={project?.path}>
      <Link className="back-link" href="/projects">← 所有项目</Link>
      <section className="project-summary">
        <div><p className="eyebrow">项目工作区</p><h1>{project?.name ?? "正在加载项目…"}</h1>{project && <code>{project.path}</code>}</div>
        {project && <div className="project-health"><span className={project.isGitRepository ? "git-ready" : "git-missing"}>{project.isGitRepository ? "Git 已连接" : "非 Git 目录"}</span><strong>{tasks.length}</strong><small>个任务</small></div>}
      </section>
      {project && <section className="agent-availability" aria-labelledby="agent-availability-heading"><div><p className="eyebrow">本机 Agent</p><h2 id="agent-availability-heading">可用性</h2></div><div>{agents.map((agent) => <span className={agent.availability === "AVAILABLE" ? "agent-chip available" : "agent-chip"} key={agent.id}>{agent.name}<small>{agent.availability === "AVAILABLE" ? "可用" : "未接入"}</small></span>)}</div></section>}
      {project && <section id="create-task" className="command-center" aria-labelledby="create-task-heading"><div className="command-center-heading"><div><p className="eyebrow">新任务</p><h2 id="create-task-heading">创建任务</h2><p>执行位置、分支与 Agent 能力在启动前确定；仅已验证的本机 Agent 可运行。</p></div><span aria-hidden="true">⌘</span></div><TaskCreateForm projectId={project.id} projectIsGitRepository={project.isGitRepository} agents={agents} onCreated={(task) => setTasks((current) => [task, ...current])} /></section>}
      <section className="task-list" aria-labelledby="task-list-heading">
        <div className="section-label"><div><p className="eyebrow">任务队列</p><h2 id="task-list-heading">优先处理需要你介入的任务</h2></div><span>{tasks.length}</span></div>
        {project && tasks.length === 0 ? <p className="empty-table">暂无任务。用上方命令中心创建第一项工作。</p> : <div className="task-table-wrap"><table><thead><tr><th>任务</th><th>状态</th><th>运行模式</th><th>Agent</th><th>下一步</th></tr></thead><tbody>{tasks.map((task) => (
          <tr className={`task-row task-${task.status.toLowerCase()}`} key={task.id}><td><Link href={`/tasks/${task.id}`}><strong>{task.title}</strong><span>{task.prompt}</span></Link></td><td><StatusBadge status={task.status} /></td><td><span className="mode-label">{task.executionMode === "ISOLATED_WORKTREE" ? "隔离 Worktree" : "当前工作区"}</span></td><td><span className="agent-cell">{agents.find((agent) => agent.id === task.agentId)?.name ?? "Codex"}</span></td><td><Link className="row-action" href={`/tasks/${task.id}`}>{task.status === "AWAITING_INPUT" ? "需要确认 →" : task.status === "REVIEW" ? "开始审查 →" : task.status === "FAILED" ? "查看失败 →" : "查看任务 →"}</Link></td></tr>
        ))}</tbody></table></div>}
      </section>
    </ConsoleShell>
  );
}
