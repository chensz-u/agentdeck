"use client";

import { useState, type FormEvent } from "react";

import { AgentId, ExecutionMode, TaskStatus } from "../lib/domain/types";
import type { AgentDescriptor } from "../lib/agents/agent-registry";
import { AgentSelector } from "./agent-selector";

export type WorkspaceTask = {
  id: string;
  projectId: string;
  title: string;
  prompt: string;
  status: TaskStatus;
  executionMode: ExecutionMode;
  agentId?: AgentId;
};

export function TaskCreateForm({ projectId, projectIsGitRepository, agents, onCreated }: {
  projectId: string;
  projectIsGitRepository: boolean;
  agents: AgentDescriptor[];
  onCreated: (task: WorkspaceTask) => void;
}) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(ExecutionMode.CURRENT_WORKSPACE);
  const [agentId, setAgentId] = useState<AgentId>(AgentId.CODEX);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, title, prompt, executionMode, agentId }),
    });
    const body = await response.json() as WorkspaceTask & { error?: string };
    setSubmitting(false);
    if (!response.ok) {
      setError(body.error ?? "无法创建任务。");
      return;
    }
    setTitle("");
    setPrompt("");
    onCreated(body);
  }

  return (
    <form className="task-form" onSubmit={submit}>
      <label>
        任务标题
        <input name="task-title" autoComplete="off" value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="例如：修复登录超时" />
      </label>
      <label>
        任务说明
        <textarea name="task-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} required rows={3} placeholder="说明目标、约束和验收条件。" />
      </label>
      <fieldset className="execution-mode">
        <legend>运行模式</legend>
        <div className="segmented-control"><label><input type="radio" name="execution-mode" value={ExecutionMode.CURRENT_WORKSPACE} checked={executionMode === ExecutionMode.CURRENT_WORKSPACE} onChange={() => setExecutionMode(ExecutionMode.CURRENT_WORKSPACE)} /><span><strong>当前工作区</strong><small>沿用现有目录</small></span></label>
        <label title={projectIsGitRepository ? undefined : "隔离 Worktree 仅支持 Git 项目。"}><input aria-label="隔离 Worktree" type="radio" name="execution-mode" value={ExecutionMode.ISOLATED_WORKTREE} checked={executionMode === ExecutionMode.ISOLATED_WORKTREE} onChange={() => setExecutionMode(ExecutionMode.ISOLATED_WORKTREE)} disabled={!projectIsGitRepository} /><span><strong>隔离 Worktree</strong><small>{projectIsGitRepository ? "创建独立分支，不直接修改主工作区" : "仅 Git 项目可创建隔离分支"}</small></span></label></div>
      </fieldset>
      <AgentSelector agents={agents} value={agentId} onChange={setAgentId} />
      <button type="submit" disabled={submitting}>{submitting ? "正在创建…" : "创建任务"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
