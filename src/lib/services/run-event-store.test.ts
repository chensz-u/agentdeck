import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { RunEventBus } from "./run-event-bus";
import { RunEventStore } from "./run-event-store";

const temporaryDirectories: string[] = [];

async function createStore() {
  const directory = await mkdtemp(join(tmpdir(), "agentdeck-events-"));
  temporaryDirectories.push(directory);
  return {
    directory,
    store: new RunEventStore({
      runsDirectory: directory,
      now: () => new Date("2026-08-09T12:00:00.000Z"),
    }),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("RunEventStore", () => {
  it("publishes the redacted persisted event to its event bus", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentdeck-events-"));
    temporaryDirectories.push(directory);
    const bus = new RunEventBus();
    const received: unknown[] = [];
    bus.subscribe("run-123", (event) => received.push(event.params));
    const store = new RunEventStore({ runsDirectory: directory, bus });

    await store.append("run-123", {
      type: "run/log",
      params: { token: "do-not-broadcast" },
    });

    expect(received).toEqual([{ token: "[REDACTED]" }]);
  });

  it("rejects a run id that could escape the server-derived run directory", async () => {
    const { store } = await createStore();

    await expect(
      store.append("../outside", { type: "run/started", params: {} }),
    ).rejects.toThrow("Invalid run id");
  });

  it("redacts bearer credentials and token-like values before persistence", async () => {
    const { directory, store } = await createStore();

    await store.append("run-123", {
      type: "run/log",
      params: {
        authorization: "Bearer top-secret-value",
        accessToken: "ghp_1234567890abcdefghijk",
        message: "upstream replied token=do-not-save-this",
      },
    });

    const persisted = await readFile(join(directory, "run-123.jsonl"), "utf8");
    expect(persisted).not.toContain("top-secret-value");
    expect(persisted).not.toContain("ghp_1234567890abcdefghijk");
    expect(persisted).not.toContain("do-not-save-this");
    expect(JSON.parse(persisted)).toMatchObject({
      params: {
        authorization: "[REDACTED]",
        accessToken: "[REDACTED]",
        message: "upstream replied token=[REDACTED]",
      },
    });
  });

  it("appends monotonically sequenced JSONL records", async () => {
    const { directory, store } = await createStore();

    await store.append("run-123", { type: "run/started", params: {} });
    await store.append("run-123", { type: "run/progress", params: { step: 1 } });

    const lines = (await readFile(join(directory, "run-123.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines).toEqual([
      expect.objectContaining({ sequence: 1, type: "run/started" }),
      expect.objectContaining({ sequence: 2, type: "run/progress" }),
    ]);
  });

  it("replays persisted events in sequence order from a new store instance", async () => {
    const { directory, store } = await createStore();
    await store.append("run-123", { type: "run/started", params: {} });
    await store.append("run-123", { type: "run/finished", params: {} });

    const replayed = await new RunEventStore({ runsDirectory: directory }).replay(
      "run-123",
    );

    expect(replayed.map((event) => [event.sequence, event.type])).toEqual([
      [1, "run/started"],
      [2, "run/finished"],
    ]);
  });
});
