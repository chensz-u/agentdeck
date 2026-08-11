"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ActivityEvent } from "./event-feed";

function lineFor(event: ActivityEvent): { kind: "stdout" | "stderr" | "system" | "codex"; text: string } {
  const params = typeof event.params === "object" && event.params && "text" in event.params
    ? (event.params as { text?: unknown }).text
    : event.params;
  const text = typeof params === "string" ? params : JSON.stringify(params ?? {});
  if (event.type === "process/stderr") return { kind: "stderr", text };
  if (event.type === "process/stdout") return { kind: "stdout", text };
  if (event.type.startsWith("run/")) return { kind: "system", text: `${event.type} ${text}` };
  return { kind: "codex", text: `${event.type} ${text}` };
}

export function RunOutputPanel({ events }: { events: ActivityEvent[] }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => events.map(lineFor), [events]);
  const text = lines.map((line) => line.text).join("\n");

  useEffect(() => {
    if (following) viewport.current?.scrollTo({ top: viewport.current.scrollHeight });
  }, [following, lines.length]);

  async function copyOutput() {
    if (navigator.clipboard) await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return <section className="surface run-output" aria-labelledby="run-output-heading">
    <div className="card-heading"><div><p className="eyebrow">只读终端</p><h2 id="run-output-heading">运行输出</h2></div><span className="card-note">JSONL · 本机</span></div>
    <p className="panel-note">汇总系统、Codex、标准输出和错误输出；不提供命令输入。</p>
    <div className="terminal-toolbar"><button className="secondary-button" type="button" onClick={() => setFollowing((value) => !value)}>{following ? "暂停跟随" : "恢复跟随"}</button><button className="secondary-button" type="button" onClick={() => void copyOutput()} disabled={!text}>{copied ? "已复制" : "复制输出"}</button></div>
    <div className="terminal-output" ref={viewport} aria-live="polite">
      {lines.length === 0 ? <p>等待本地运行输出…</p> : lines.map((line, index) => <code className={`terminal-line terminal-${line.kind}`} key={`${index}-${line.text}`}>{line.text}</code>)}
    </div>
  </section>;
}
