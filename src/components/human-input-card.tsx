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
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "Unable to deliver human input");
      await onSubmitted();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to deliver human input"); }
    finally { setPending(null); }
  }

  function submitQuestions(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void submit("TEXT"); }

  return <section className="surface" aria-labelledby="human-input-heading">
    <div className="card-heading"><h2 id="human-input-heading">Human input</h2><span className="status-badge">{request.deliveryStatus}</span></div>
    {request.payload.kind === "QUESTION" ? <form className="human-input-form" onSubmit={submitQuestions}>
      {request.payload.questions.map((question) => <label key={question.id}><strong>{question.header}</strong><span>{question.question}</span><input value={answers[question.id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} required maxLength={4000} placeholder={question.options.join(" · ") || "Short answer"} /></label>)}
      <button disabled={pending !== null} type="submit">{pending === "TEXT" ? "Submitting…" : "Submit answers"}</button>
    </form> : <div className="human-input-actions"><p>{request.payload.kind === "PERMISSIONS" ? "Codex requests additional permissions." : "Codex requests approval to continue."}</p><button disabled={pending !== null} onClick={() => void submit("APPROVE")}>{pending === "APPROVE" ? "Approving…" : "Approve"}</button><button className="secondary-button" disabled={pending !== null} onClick={() => void submit("REJECT")}>{pending === "REJECT" ? "Rejecting…" : "Reject"}</button></div>}
    {request.deliveryError && <p className="form-error" role="alert">{request.deliveryError}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
