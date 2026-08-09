import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { CodexAdapter, CodexRunCompletion, CodexRunHandle, CodexRunRequest } from "./codex-adapter";

/** Uses Codex's newline-delimited JSON mode when app-server cannot start. */
export class ExecFallbackAdapter implements CodexAdapter {
  private readonly command: string;
  private readonly processes = new Map<string, ChildProcessWithoutNullStreams>();

  constructor(command = "codex") {
    this.command = command;
  }

  async launch(request: CodexRunRequest): Promise<CodexRunHandle> {
    const child = spawn(this.command, ["exec", "--json", request.prompt], {
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
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          void Promise.resolve(request.onEvent({ type: "codex/exec", params: JSON.parse(line) }));
        } catch {
          void Promise.resolve(request.onEvent({ type: "codex/exec-output", params: { line } }));
        }
      }
    });

    const completed = new Promise<CodexRunCompletion>((resolve) => {
      child.once("error", (error) => resolve({ exitCode: null, error: error.message }));
      child.once("close", (exitCode) => resolve({
        exitCode,
        error: exitCode === 0 ? undefined : stderr.trim() || `codex exec exited with ${exitCode}`,
      }));
    });
    this.processes.set(request.runId, child);
    completed.finally(() => this.processes.delete(request.runId)).catch(() => undefined);
    return { pid: child.pid ?? null, completed };
  }

  async stop(runId: string): Promise<void> {
    const child = this.processes.get(runId);
    if (!child) throw new Error(`Run ${runId} is not active`);
    child.kill();
  }
}

/** Chooses app-server first, with a bounded startup failure falling back to `codex exec --json`. */
export class FallbackCodexAdapter implements CodexAdapter {
  private readonly active = new Map<string, CodexAdapter>();

  constructor(
    private readonly primary: CodexAdapter,
    private readonly fallback: CodexAdapter,
  ) {}

  async launch(request: CodexRunRequest): Promise<CodexRunHandle> {
    try {
      const handle = await this.primary.launch(request);
      this.active.set(request.runId, this.primary);
      return handle;
    } catch (error) {
      await request.onEvent({
        type: "codex/app-server-fallback",
        params: { error: error instanceof Error ? error.message : String(error) },
      });
      const handle = await this.fallback.launch(request);
      this.active.set(request.runId, this.fallback);
      return handle;
    }
  }

  async stop(runId: string): Promise<void> {
    const adapter = this.active.get(runId);
    if (!adapter) throw new Error(`Run ${runId} is not active`);
    await adapter.stop(runId);
  }
}
