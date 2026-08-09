import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import { parseCodexEvent } from "./protocol";
import type { CodexAdapter, CodexRunCompletion, CodexRunHandle, CodexRunRequest } from "./codex-adapter";
import type { CodexEvent } from "./protocol";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageError(value: unknown): Error {
  return new Error(isRecord(value) && typeof value.message === "string" ? value.message : "Codex app-server protocol error");
}

/** App-server emits some server notifications without the JSON-RPC envelope. */
export function normalizeAppServerNotification(message: unknown): CodexEvent | null {
  if (!isRecord(message) || typeof message.method !== "string" || "id" in message) return null;
  if (message.jsonrpc === undefined) return { type: message.method, params: message.params };
  try {
    return parseCodexEvent(message);
  } catch {
    return null;
  }
}

type DisposableAppServerChild = {
  killed?: boolean;
  kill(): unknown;
  removeAllListeners(): unknown;
  stdin: { removeAllListeners(): unknown };
  stdout: { removeAllListeners(): unknown };
  stderr: { removeAllListeners(): unknown };
};

/** Remove local handlers and terminate a failed app-server before falling back. */
export function disposeAppServerChild(child: DisposableAppServerChild): void {
  child.stdin.removeAllListeners();
  child.stdout.removeAllListeners();
  child.stderr.removeAllListeners();
  child.removeAllListeners();
  if (!child.killed) child.kill();
}

export interface AppServerTransport {
  send(message: JsonRecord): void;
  onMessage(listener: (message: unknown) => void): void;
}

export type AppServerRun = {
  completed: Promise<CodexRunCompletion>;
  interrupt(): Promise<void>;
};

/** Performs the protocol handshake; launch only succeeds after `turn/start` responds. */
export async function beginAppServerRun(
  transport: AppServerTransport,
  input: { cwd: string; prompt: string },
): Promise<AppServerRun> {
  let nextId = 1;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  let threadId = "";
  let turnId = "";
  let resolveCompletion!: (result: CodexRunCompletion) => void;
  const completed = new Promise<CodexRunCompletion>((resolve) => { resolveCompletion = resolve; });

  transport.onMessage((message) => {
    if (!isRecord(message)) return;
    if (typeof message.id === "number") {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if ("error" in message) request.reject(messageError(message.error));
      else request.resolve(message.result);
      return;
    }
    if (message.method !== "turn/completed" || !isRecord(message.params)) return;
    const turn = message.params.turn;
    if (!isRecord(turn) || message.params.threadId !== threadId) return;
    const status = turn.status;
    resolveCompletion(status === "completed" ? { exitCode: 0 } : {
      exitCode: 1,
      error: isRecord(turn.error) && typeof turn.error.message === "string"
        ? turn.error.message
        : `Codex turn ${String(status)}`,
    });
  });

  const request = (method: string, params: JsonRecord): Promise<unknown> => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    transport.send({ jsonrpc: "2.0", id, method, params });
  });
  await request("initialize", { clientInfo: { name: "agentdeck", version: "0.1.0" } });
  const threadResponse = await request("thread/start", { cwd: input.cwd });
  const thread = isRecord(threadResponse) && isRecord(threadResponse.thread) ? threadResponse.thread : undefined;
  if (!thread || typeof thread.id !== "string") throw new Error("Codex app-server did not return a thread id");
  threadId = thread.id;
  const turnResponse = await request("turn/start", {
    threadId,
    input: [{ type: "text", text: input.prompt }],
  });
  const turn = isRecord(turnResponse) && isRecord(turnResponse.turn) ? turnResponse.turn : undefined;
  if (!turn || typeof turn.id !== "string") throw new Error("Codex app-server did not return a turn id");
  turnId = turn.id;

  return {
    completed,
    interrupt: async () => { await request("turn/interrupt", { threadId, turnId }); },
  };
}

type AppServerAdapterOptions = { command?: string; startupTimeoutMs?: number };
type ManagedProcess = { process: ChildProcessWithoutNullStreams; interrupt(): Promise<void> };

/** Supervises a complete app-server JSON-RPC turn, not merely a spawned process. */
export class AppServerAdapter implements CodexAdapter {
  private readonly command: string;
  private readonly startupTimeoutMs: number;
  private readonly processes = new Map<string, ManagedProcess>();

  constructor(options: AppServerAdapterOptions = {}) {
    this.command = options.command ?? "codex";
    this.startupTimeoutMs = options.startupTimeoutMs ?? 2_000;
  }

  async launch(request: CodexRunRequest): Promise<CodexRunHandle> {
    const child = spawn(this.command, ["app-server", "--stdio"], { cwd: request.cwd, stdio: "pipe", windowsHide: true });
    let stderr = "";
    let buffer = "";
    let receive: ((message: unknown) => void) | undefined;
    const transport: AppServerTransport = {
      send: (message) => child.stdin.write(`${JSON.stringify(message)}\n`),
      onMessage: (listener) => { receive = listener; },
    };
    child.stderr.on("data", (chunk: Buffer) => { stderr = `${stderr}${chunk}`.slice(-8_192); });
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          receive?.(message);
          const event = normalizeAppServerNotification(message);
          if (event) void Promise.resolve(request.onEvent(event));
        } catch { void Promise.resolve(request.onEvent({ type: "codex/invalid-json-rpc", params: { line } })); }
      }
    });
    const processExit = new Promise<CodexRunCompletion>((resolve) => {
      child.once("error", (error) => resolve({ exitCode: null, error: error.message }));
      child.once("close", (exitCode) => resolve({ exitCode, error: exitCode === 0 ? undefined : stderr.trim() || `codex app-server exited with ${exitCode}` }));
    });
    const startup = beginAppServerRun(transport, { cwd: request.cwd, prompt: request.prompt });
    let protocol: AppServerRun;
    try {
      protocol = await Promise.race([
        startup,
        processExit.then((result) => Promise.reject(new Error(result.error ?? "codex app-server exited during startup"))),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("codex app-server protocol startup timed out")), this.startupTimeoutMs)),
      ]);
    } catch (error) {
      disposeAppServerChild(child);
      throw error;
    }
    this.processes.set(request.runId, { process: child, interrupt: protocol.interrupt });
    const completed = Promise.race([protocol.completed, processExit]);
    completed.finally(() => { this.processes.delete(request.runId); if (!child.killed) child.kill(); }).catch(() => undefined);
    return { pid: child.pid ?? null, completed };
  }

  async stop(runId: string): Promise<void> {
    const managed = this.processes.get(runId);
    if (!managed) throw new Error(`Run ${runId} is not active`);
    await Promise.race([managed.interrupt(), new Promise<void>((resolve) => setTimeout(resolve, 250))]);
    if (!managed.process.killed) managed.process.kill();
  }
}
