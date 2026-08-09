import type { RunEvent } from "./run-event-store";

type Subscriber = (event: RunEvent) => void;

/** Process-local fan-out for events that have already been persisted. */
export class RunEventBus {
  private readonly subscribers = new Map<string, Set<Subscriber>>();

  publish(event: RunEvent): void {
    this.subscribers.get(event.runId)?.forEach((subscriber) => subscriber(event));
  }

  subscribe(runId: string, subscriber: Subscriber): () => void {
    const listeners = this.subscribers.get(runId) ?? new Set<Subscriber>();
    listeners.add(subscriber);
    this.subscribers.set(runId, listeners);

    return () => {
      listeners.delete(subscriber);
      if (listeners.size === 0) {
        this.subscribers.delete(runId);
      }
    };
  }
}
