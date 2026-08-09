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

function createServerComposition(): ServerComposition {
  const repository = new LocalRepository();
  const runEventBus = new RunEventBus();
  const runEventStore = new RunEventStore({ bus: runEventBus });
  return {
    repository,
    taskService: new TaskService(repository),
    runService: new RunService({
      repository,
      adapter: new FallbackCodexAdapter(new AppServerAdapter(), new ExecFallbackAdapter()),
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
