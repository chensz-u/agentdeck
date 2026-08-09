import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { RunEventBus } from "../../../../../lib/services/run-event-bus";
import { RunEventStore } from "../../../../../lib/services/run-event-store";

import { createRunEventsHandler } from "../../../../../lib/services/run-events-sse";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("GET /api/runs/[id]/events", () => {
  it("replays persisted events as read-only SSE frames", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentdeck-sse-"));
    temporaryDirectories.push(directory);
    const store = new RunEventStore({ runsDirectory: directory });
    await store.append("run-123", { type: "run/started", params: { source: "test" } });
    const handler = createRunEventsHandler({ store, bus: new RunEventBus() });

    const response = await handler(new Request("http://localhost/api/runs/run-123/events"), {
      params: Promise.resolve({ id: "run-123" }),
    });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body?.getReader();
    const firstChunk = await reader?.read();
    expect(new TextDecoder().decode(firstChunk?.value)).toContain(
      'event: run/started\ndata: {"sequence":1',
    );
    await reader?.cancel();
  });

  it("does not lose or duplicate an event published while replay is in progress", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentdeck-sse-"));
    temporaryDirectories.push(directory);
    const bus = new RunEventBus();
    const store = new RunEventStore({ runsDirectory: directory });
    let liveDeliveries = 0;
    const subscribe = bus.subscribe.bind(bus);
    vi.spyOn(bus, "subscribe").mockImplementation((runId, subscriber) =>
      subscribe(runId, (event) => {
        liveDeliveries += 1;
        subscriber(event);
      }),
    );
    const liveEvent = {
      sequence: 1,
      occurredAt: "2026-08-09T12:00:00.000Z",
      runId: "run-123",
      type: "run/started",
      params: { source: "live" },
    };
    vi.spyOn(store, "replay").mockImplementation(async () => {
      bus.publish(liveEvent);
      return [liveEvent];
    });
    const handler = createRunEventsHandler({ store, bus });

    const response = await handler(new Request("http://localhost/api/runs/run-123/events"), {
      params: Promise.resolve({ id: "run-123" }),
    });
    const reader = response.body?.getReader();
    const read = reader?.read();
    const firstChunk = await Promise.race([
      read,
      new Promise<undefined>((resolve) => setTimeout(resolve, 50)),
    ]);
    await reader?.cancel();

    const payload = new TextDecoder().decode(firstChunk?.value);
    expect(liveDeliveries).toBe(1);
    expect(payload.match(/event: run\/started/g)).toHaveLength(1);
  });
});
