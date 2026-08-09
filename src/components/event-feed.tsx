"use client";

export type ActivityEvent = {
  sequence: number;
  occurredAt: string;
  type: string;
  params: unknown;
};

function displayParams(params: unknown): string {
  if (typeof params === "string") return params;
  try { return JSON.stringify(params); } catch { return "[unavailable event data]"; }
}

export function EventFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <section className="surface activity-feed" aria-labelledby="activity-heading">
      <h2 id="activity-heading">Activity</h2>
      {events.length === 0 ? <p className="muted">Waiting for run activity…</p> : <ol>
        {events.map((event) => <li key={event.sequence}>
          <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleTimeString()}</time>
          <strong>{event.type}</strong><span>{displayParams(event.params)}</span>
        </li>)}
      </ol>}
    </section>
  );
}
