"use client";

export function DiffViewer({ changedPaths, diff, baselineBranch, baselineSha, taskBranch, commitSummary }: {
  changedPaths: string[]; diff: string; baselineBranch?: string; baselineSha?: string; taskBranch?: string; commitSummary?: string;
}) {
  return (
    <section className="surface diff-viewer" aria-labelledby="review-heading">
      <div className="card-heading"><div><p className="eyebrow">基线审查</p><h2 id="review-heading">审查变更</h2></div><span className="diff-count">{changedPaths.length} 个文件</span></div>
      {(baselineBranch || taskBranch) && <dl className="review-context"><div><dt>基线</dt><dd>{baselineBranch ?? "当前工作区"}{baselineSha ? ` @ ${baselineSha.slice(0, 12)}` : ""}</dd></div><div><dt>任务分支</dt><dd>{taskBranch ?? "当前工作区"}</dd></div></dl>}
      <div className="diff-layout"><aside className="changed-files"><h3>变更文件</h3>{changedPaths.length === 0 ? <p className="muted">尚未记录变更。</p> : <ul>{changedPaths.map((path) => <li key={path}><span aria-hidden="true">M</span><code>{path}</code></li>)}</ul>}<h3>提交摘要</h3>{commitSummary ? <pre>{commitSummary}</pre> : <p className="muted">任务分支暂无新增提交。</p>}</aside><div className="unified-diff"><h3>统一 Diff</h3>{diff ? <pre>{diff}</pre> : <p className="muted">尚未产生 Diff。</p>}</div></div>
    </section>
  );
}
