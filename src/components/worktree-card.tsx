"use client";

type WorktreeDetail = {
  status: string; projectPath: string; baselineBranch: string; baselineSha: string;
  worktreePath: string; taskBranch: string; error: string | null; cleanupError: string | null;
};

export function WorktreeCard({ worktree }: { worktree: WorktreeDetail | null }) {
  if (!worktree) return null;
  return <section className="surface worktree-card" aria-labelledby="worktree-heading">
    <div className="card-heading"><div><p className="eyebrow">执行位置</p><h2 id="worktree-heading">隔离 Worktree</h2></div><span className="status-badge">{worktree.status}</span></div>
    <dl className="metadata-grid">
      <div><dt>项目路径</dt><dd>{worktree.projectPath}</dd></div>
      <div><dt>基线分支</dt><dd>{worktree.baselineBranch}</dd></div>
      <div><dt>基线提交</dt><dd>{worktree.baselineSha}</dd></div>
      <div><dt>Worktree 路径</dt><dd>{worktree.worktreePath}</dd></div>
      <div><dt>任务分支</dt><dd>{worktree.taskBranch}</dd></div>
    </dl>
    {(worktree.error || worktree.cleanupError) && <p className="form-error" role="alert">{worktree.error ?? worktree.cleanupError}</p>}
  </section>;
}
