export type CodexEvent = {
  type: string;
  params: unknown;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Converts a Codex JSON-RPC notification into the event shape used by the UI. */
export function parseCodexEvent(input: unknown): CodexEvent {
  if (!isRecord(input)) {
    throw new TypeError("Codex event must be an object");
  }

  if (input.jsonrpc !== "2.0") {
    throw new TypeError("Codex event must use JSON-RPC 2.0");
  }

  if ("id" in input) {
    throw new TypeError("Codex event must not include an id");
  }

  if (typeof input.method !== "string") {
    throw new TypeError("Codex event must include a method");
  }

  return {
    type: input.method,
    params: input.params,
  };
}
