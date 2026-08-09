import type { CodexAdapter, CodexRunRequest } from "../codex/codex-adapter";
import { AppServerAdapter } from "../codex/app-server-adapter";
import { ExecFallbackAdapter, FallbackCodexAdapter } from "../codex/exec-fallback-adapter";
import { GitService } from "../services/git-service";
import { RunEventBus } from "../services/run-event-bus";
import { RunEventStore } from "../services/run-event-store";
import { RunService } from "../services/run-service";
import { TaskService } from "../services/task-service";
import { LocalRepository } from "./local-repository";

export type ServerComposition = {
  repository: LocalRepository;
  taskService: TaskService;
  runService: RunService;
  runEventBus: RunEventBus;
  runEventStore: RunEventStore;
};

class ControlledE2eAdapter implements CodexAdapter {
  private readonly completions = new Map<string, (result: { exitCode: number }) => void>();
  private launches = 0;

  async launch(request: CodexRunRequest) {
    this.launches += 1;
    await request.onEvent({ type: "codex/exec", params: { message: "stubbed activity" } });
    const completed = new Promise<{ exitCode: number }>((resolve) => {
      this.completions.set(request.runId, resolve);
    });
    if (this.launches > 1) setTimeout(() => this.completions.get(request.runId)?.({ exitCode: 0 }), 20);
    return { pid: 0, completed };
  }

  async stop(runId: string): Promise<void> {
    this.completions.get(runId)?.({ exitCode: 0 });
  }
}

function createServerComposition(): ServerComposition {
  const repository = new LocalRepository(process.env.AGENTDECK_DATA_PATH || undefined);
  const runEventBus = new RunEventBus();
  const runEventStore = new RunEventStore({ bus: runEventBus });
  return {
    repository,
    taskService: new TaskService(repository),
    runService: new RunService({
      repository,
      adapter: process.env.AGENTDECK_E2E_STUB === "1"
        ? new ControlledE2eAdapter()
        : new FallbackCodexAdapter(new AppServerAdapter(), new ExecFallbackAdapter()),
      events: runEventStore,
      git: new GitService(),
    }),
    runEventBus,
    runEventStore,
  };
}

const globalForAgentDeck = globalThis as typeof globalThis & { agentDeckComposition?: ServerComposition };

export const serverComposition = globalForAgentDeck.agentDeckComposition ?? createServerComposition();
globalForAgentDeck.agentDeckComposition = serverComposition;
