"use client";

import { useState, type FormEvent } from "react";

type PendingRequest = {
  requestId: string; deliveryStatus: string; deliveryError: string | null;
  payload: { kind: "CONFIRMATION" | "QUESTION" | "PERMISSIONS" | null; questions: Array<{ id: string; header: string; question: string; options: string[] }> } | null;
};

export function HumanInputCard({ taskId, requests, onSubmitted }: { taskId: string; requests: PendingRequest[]; onSubmitted: () => Promise<void> }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = requests.find((item) => item.deliveryStatus !== "DELIVERED");
  if (!request || !request.payload) return null;
  const requestId = request.requestId;

  async function submit(action: "APPROVE" | "REJECT" | "TEXT") {
    setPending(action); setError(null);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/human-input`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "TEXT" ? { requestId, action, answers } : { requestId, action }),
      });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "无法发送人工输入");
      await onSubmitted();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "无法发送人工输入"); }
    finally { setPending(null); }
  }

  function submitQuestions(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void submit("TEXT"); }

  return <section className="surface human-input-card" aria-labelledby="human-input-heading">
    <div className="card-heading"><div><p className="eyebrow">需要你处理</p><h2 id="human-input-heading">需要你的确认</h2></div><span className="input-pending">等待回复</span></div>
    {request.payload.kind === "QUESTION" ? <form className="human-input-form" onSubmit={submitQuestions}>
      {request.payload.questions.map((question) => <label key={question.id}><strong>{question.header}</strong><span>{question.question}</span><input name={`answer-${question.id}`} value={answers[question.id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} required maxLength={4000} placeholder={question.options.join(" · ") || "请输入简短回答"} /></label>)}
      <button disabled={pending !== null} type="submit">{pending === "TEXT" ? "正在发送…" : "继续任务"}</button>
    </form> : <div className="human-input-actions"><p>{request.payload.kind === "PERMISSIONS" ? "Codex 正在请求额外权限。批准前请确认该操作符合你的预期。" : "Codex 正在等待你的明确确认，任务会暂停直到收到回复。"}</p><button disabled={pending !== null} onClick={() => void submit("APPROVE")}>{pending === "APPROVE" ? "正在批准…" : "批准继续"}</button><button className="secondary-button" disabled={pending !== null} onClick={() => void submit("REJECT")}>{pending === "REJECT" ? "正在拒绝…" : "拒绝"}</button></div>}
    {request.deliveryError && <p className="form-error" role="alert">{request.deliveryError}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
