import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import { parseCodexEvent } from "./protocol";
import type { CodexAdapter, CodexRunCompletion, CodexRunHandle, CodexRunRequest } from "./codex-adapter";

type AppServerAdapterOptions = {
  command?: string;
  startupTimeoutMs?: number;
};

type ManagedProcess = {
  process: ChildProcessWithoutNullStreams;
  completed: Promise<CodexRunCompletion>;
};

/** Supervises one `codex app-server --stdio` child per AgentDeck run. */
export class AppServerAdapter implements CodexAdapter {
  private readonly command: string;
  private readonly startupTimeoutMs: number;
  private readonly processes = new Map<string, ManagedProcess>();

  constructor(options: AppServerAdapterOptions = {}) {
    this.command = options.command ?? "codex";
    this.startupTimeoutMs = options.startupTimeoutMs ?? 2_000;
  }

  async launch(request: CodexRunRequest): Promise<CodexRunHandle> {
    const child = spawn(this.command, ["app-server", "--stdio"], {
      cwd: request.cwd,
      stdio: "pipe",
      windowsHide: true,
    });
    let stderr = "";
    let buffer = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-8_192);
    });
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) this.handleLine(line, request);
    });

    const completed = new Promise<CodexRunCompletion>((resolve) => {
      child.once("error", (error) => resolve({ exitCode: null, error: error.message }));
      child.once("close", (exitCode) => resolve({
        exitCode,
        error: exitCode === 0 ? undefined : stderr.trim() || `codex app-server exited with ${exitCode}`,
      }));
    });
    this.processes.set(request.runId, { process: child, completed });
    completed.finally(() => this.processes.delete(request.runId)).catch(() => undefined);

    try {
      await this.awaitStartup(child, completed);
      child.stdin.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "thread/start",
        params: { cwd: request.cwd },
      })}\n`);
      child.stdin.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "turn/start",
        params: { input: [{ type: "text", text: request.prompt }] },
      })}\n`);
    } catch (error) {
      child.kill();
      throw error;
    }

    return { pid: child.pid ?? null, completed };
  }

  async stop(runId: string): Promise<void> {
    const managed = this.processes.get(runId);
    if (!managed) throw new Error(`Run ${runId} is not active`);
    managed.process.kill();
  }

  private async awaitStartup(
    child: ChildProcessWithoutNullStreams,
    completed: Promise<CodexRunCompletion>,
  ): Promise<void> {
    await Promise.race([
      new Promise<void>((resolve) => child.once("spawn", resolve)),
      completed.then((result) => Promise.reject(new Error(result.error ?? "codex app-server exited during startup"))),
      new Promise<void>((_, reject) => setTimeout(
        () => reject(new Error("codex app-server startup timed out")),
        this.startupTimeoutMs,
      )),
    ]);
  }

  private handleLine(line: string, request: CodexRunRequest): void {
    if (!line.trim()) return;
    try {
      void Promise.resolve(request.onEvent(parseCodexEvent(JSON.parse(line))));
    } catch {
      void request.onEvent({ type: "codex/invalid-json-rpc", params: { line } });
    }
  }
}
