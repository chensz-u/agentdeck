"use client";

export function DiffViewer({ changedPaths, diff }: { changedPaths: string[]; diff: string }) {
  return (
    <section className="surface diff-viewer" aria-labelledby="review-heading">
      <h2 id="review-heading">Review</h2>
      <h3>Changed files</h3>
      {changedPaths.length === 0 ? <p className="muted">No changed files recorded.</p> : <ul>{changedPaths.map((path) => <li key={path}>{path}</li>)}</ul>}
      <h3>Unified diff</h3>
      {diff ? <pre>{diff}</pre> : <p className="muted">No diff recorded yet.</p>}
    </section>
  );
}
