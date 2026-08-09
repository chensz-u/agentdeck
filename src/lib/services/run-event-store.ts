import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { RunEventBus } from "./run-event-bus";

export type RunEventInput = {
  type: string;
  params: unknown;
};

export type RunEvent = RunEventInput & {
  sequence: number;
  occurredAt: string;
  runId: string;
};

type RunEventStoreOptions = {
  runsDirectory?: string;
  now?: () => Date;
  bus?: Pick<RunEventBus, "publish">;
};

const sensitiveKey = /(authorization|token|secret|api[_-]?key|password|credential)/i;
const bearerValue = /(\bBearer\s+)[^\s,;]+/gi;
const namedValue = /(\b(?:token|access[_-]?token|api[_-]?key|apikey|secret)\s*[=:]\s*)[^\s,;]+/gi;
const githubToken = /\b(?:gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,})\b/g;

function redactString(value: string): string {
  return value
    .replace(bearerValue, "$1[REDACTED]")
    .replace(namedValue, "$1[REDACTED]")
    .replace(githubToken, "[REDACTED]");
}

function redact(value: unknown, key?: string): unknown {
  if (key && sensitiveKey.test(key)) {
    return "[REDACTED]";
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([property, item]) => [property, redact(item, property)]),
    );
  }

  return value;
}

function assertRunId(runId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(runId)) {
    throw new TypeError("Invalid run id");
  }
}

/** JSONL-backed event history. The file path is always derived from a validated run id. */
export class RunEventStore {
  private readonly runsDirectory: string;
  private readonly now: () => Date;
  private readonly bus?: Pick<RunEventBus, "publish">;
  private readonly appendQueues = new Map<string, Promise<unknown>>();

  constructor(options: RunEventStoreOptions = {}) {
    this.runsDirectory = resolve(
      options.runsDirectory ?? join(process.cwd(), ".agentdeck", "runs"),
    );
    this.now = options.now ?? (() => new Date());
    this.bus = options.bus;
  }

  async append(runId: string, input: RunEventInput): Promise<RunEvent> {
    assertRunId(runId);
    const previous = this.appendQueues.get(runId) ?? Promise.resolve();
    const next = previous.then(() => this.appendRecord(runId, input));
    this.appendQueues.set(runId, next.catch(() => undefined));
    return next;
  }

  async replay(runId: string): Promise<RunEvent[]> {
    assertRunId(runId);
    try {
      const contents = await readFile(this.eventPath(runId), "utf8");
      return contents
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as RunEvent)
        .sort((left, right) => left.sequence - right.sequence);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private eventPath(runId: string): string {
    return join(this.runsDirectory, `${runId}.jsonl`);
  }

  private async appendRecord(runId: string, input: RunEventInput): Promise<RunEvent> {
    const previous = await this.replay(runId);
    const event: RunEvent = {
      sequence: (previous.at(-1)?.sequence ?? 0) + 1,
      occurredAt: this.now().toISOString(),
      runId,
      type: input.type,
      params: redact(input.params),
    };

    await mkdir(this.runsDirectory, { recursive: true });
    await appendFile(this.eventPath(runId), `${JSON.stringify(event)}\n`, "utf8");
    this.bus?.publish(event);
    return event;
  }
}
