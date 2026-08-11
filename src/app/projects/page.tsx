"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ProjectCreateForm, type WorkspaceProject } from "../../components/project-create-form";
import { ConsoleShell } from "../../components/console-shell";

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
    <ConsoleShell title="项目" meta="登记并管理本地代码库">
      <section className="workspace-heading split-heading">
        <div><p className="eyebrow">本地项目</p><h1>代码库与任务队列</h1></div>
        <p>AgentDeck 只使用你登记的本地路径，不会接收浏览器提供的命令或运行目录。</p>
      </section>
      <section className="surface project-register" aria-labelledby="add-project-heading">
        <div className="card-heading"><div><p className="eyebrow">登记项目</p><h2 id="add-project-heading">添加本地代码库</h2></div><span className="card-note">仅保存路径与 Git 元数据</span></div>
        <ProjectCreateForm onCreated={(project) => router.push(`/projects/${project.id}`)} />
      </section>
      <section className="project-list" aria-labelledby="project-list-heading">
        <div className="section-label"><h2 id="project-list-heading">已登记项目</h2><span>{projects.length}</span></div>
        {loading ? <p className="muted">正在读取本地项目…</p> : projects.length === 0 ? (
          <p className="muted">还没有项目。登记一个本地目录以开始使用。</p>
        ) : projects.map((project) => (
          <Link className="project-row" href={`/projects/${project.id}`} key={project.id}>
            <span className="repository-mark">↗</span>
            <span><strong>{project.name}</strong><small>{project.path}</small></span>
            <span className={`git-label ${project.isGitRepository ? "" : "not-git"}`}>{project.isGitRepository ? "Git 仓库" : "普通目录"}</span><span aria-hidden="true">→</span>
          </Link>
        ))}
      </section>
    </ConsoleShell>
  );
}
