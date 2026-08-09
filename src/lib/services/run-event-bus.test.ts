import { describe, expect, it } from "vitest";

import { RunEventBus } from "./run-event-bus";

describe("RunEventBus", () => {
  it("publishes events only to subscribers for that run", () => {
    const bus = new RunEventBus();
    const received: string[] = [];
    bus.subscribe("run-123", (event) => received.push(event.type));
    bus.subscribe("other-run", (event) => received.push(`other:${event.type}`));

    bus.publish({ sequence: 1, occurredAt: "2026-08-09T12:00:00.000Z", runId: "run-123", type: "run/started", params: {} });

    expect(received).toEqual(["run/started"]);
  });

  it("stops publishing after a subscriber unsubscribes", () => {
    const bus = new RunEventBus();
    const received: string[] = [];
    const unsubscribe = bus.subscribe("run-123", (event) => received.push(event.type));
    unsubscribe();

    bus.publish({ sequence: 1, occurredAt: "2026-08-09T12:00:00.000Z", runId: "run-123", type: "run/started", params: {} });

    expect(received).toEqual([]);
  });
});
