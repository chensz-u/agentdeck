import type { CodexAdapter, CodexHumanInputResponse, CodexRunCompletion, CodexRunHandle, CodexRunRequest } from "./codex-adapter";
import { SupervisedProcess, type SupervisedProcessHandle } from "../runtime/supervised-process";

/** Uses Codex's newline-delimited JSON mode when app-server cannot start. */
export class ExecFallbackAdapter implements CodexAdapter {
  private readonly command: string;
  private readonly processes = new Map<string, SupervisedProcessHandle>();
  private readonly supervisor = new SupervisedProcess();

  constructor(command = "codex") {
    this.command = command;
  }

  async launch(request: CodexRunRequest): Promise<CodexRunHandle> {
    const supervised = this.supervisor.start({ command: this.command, args: ["exec", "--json", request.prompt], cwd: request.cwd });
    const child = supervised.child;
    let stderr = "";
    let buffer = "";

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr = `${stderr}${text}`.slice(-8_192);
      void Promise.resolve(request.onOutput?.({ stream: "stderr", text }));
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

    const completed = supervised.completed.then((result): CodexRunCompletion => ({
      exitCode: result.exitCode,
      error: result.exitCode === 0 ? undefined : stderr.trim() || result.error || `codex exec exited with ${result.exitCode}`,
    }));
    this.processes.set(request.runId, supervised);
    completed.finally(() => this.processes.delete(request.runId)).catch(() => undefined);
    return { pid: supervised.pid, completed };
  }

  async stop(runId: string): Promise<void> {
    const child = this.processes.get(runId);
    if (!child) throw new Error(`Run ${runId} is not active`);
    await child.stop();
  }

  async respondToHumanInput(input: CodexHumanInputResponse): Promise<void> {
    throw new Error(`Codex exec fallback cannot respond to human input for run ${input.runId}; restart the task to recover.`);
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

  async respondToHumanInput(input: CodexHumanInputResponse): Promise<void> {
    const adapter = this.active.get(input.runId);
    if (!adapter) throw new Error(`Run ${input.runId} has no live Codex connection; restart the task to recover.`);
    await adapter.respondToHumanInput(input);
  }
}
