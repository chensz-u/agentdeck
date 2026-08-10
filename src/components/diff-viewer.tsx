"use client";

export function DiffViewer({ changedPaths, diff, baselineBranch, baselineSha, taskBranch, commitSummary }: {
  changedPaths: string[]; diff: string; baselineBranch?: string; baselineSha?: string; taskBranch?: string; commitSummary?: string;
}) {
  return (
    <section className="surface diff-viewer" aria-labelledby="review-heading">
      <h2 id="review-heading">Review</h2>
      {(baselineBranch || taskBranch) && <dl className="metadata-grid"><div><dt>Baseline</dt><dd>{baselineBranch ?? "Current workspace"}{baselineSha ? ` @ ${baselineSha.slice(0, 12)}` : ""}</dd></div><div><dt>Task branch</dt><dd>{taskBranch ?? "Current workspace"}</dd></div></dl>}
      <h3>Commits</h3>
      {commitSummary ? <pre>{commitSummary}</pre> : <p className="muted">No branch-only commits recorded.</p>}
      <h3>Changed files</h3>
      {changedPaths.length === 0 ? <p className="muted">No changed files recorded.</p> : <ul>{changedPaths.map((path) => <li key={path}>{path}</li>)}</ul>}
      <h3>Unified diff</h3>
      {diff ? <pre>{diff}</pre> : <p className="muted">No diff recorded yet.</p>}
    </section>
  );
}
