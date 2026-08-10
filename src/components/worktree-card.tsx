"use client";

type WorktreeDetail = {
  status: string; projectPath: string; baselineBranch: string; baselineSha: string;
  worktreePath: string; taskBranch: string; error: string | null; cleanupError: string | null;
};

export function WorktreeCard({ worktree }: { worktree: WorktreeDetail | null }) {
  if (!worktree) return null;
  return <section className="surface" aria-labelledby="worktree-heading">
    <div className="card-heading"><h2 id="worktree-heading">Worktree</h2><span className="status-badge">{worktree.status}</span></div>
    <dl className="metadata-grid">
      <div><dt>Project path</dt><dd>{worktree.projectPath}</dd></div>
      <div><dt>Baseline branch</dt><dd>{worktree.baselineBranch}</dd></div>
      <div><dt>Baseline SHA</dt><dd>{worktree.baselineSha}</dd></div>
      <div><dt>Worktree path</dt><dd>{worktree.worktreePath}</dd></div>
      <div><dt>Task branch</dt><dd>{worktree.taskBranch}</dd></div>
    </dl>
    {(worktree.error || worktree.cleanupError) && <p className="form-error" role="alert">{worktree.error ?? worktree.cleanupError}</p>}
  </section>;
}
