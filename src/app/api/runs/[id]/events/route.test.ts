import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

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
});
