import { describe, expect, it } from "vitest";

import { parseCodexEvent } from "./protocol";

describe("parseCodexEvent", () => {
  it("accepts a JSON-RPC notification", () => {
    expect(
      parseCodexEvent({
        jsonrpc: "2.0",
        method: "thread/started",
        params: { threadId: "thread_123" },
      }),
    ).toEqual({
      type: "thread/started",
      params: { threadId: "thread_123" },
    });
  });

  it("rejects a non-object input", () => {
    expect(() => parseCodexEvent("not an event")).toThrow(
      "Codex event must be an object",
    );
  });

  it("rejects an object without a JSON-RPC version", () => {
    expect(() => parseCodexEvent({ method: "thread/started" })).toThrow(
      "Codex event must use JSON-RPC 2.0",
    );
  });
});
