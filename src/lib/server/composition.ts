import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type { CodexAdapter, CodexHumanInputResponse, CodexRunRequest } from "../codex/codex-adapter";
import { AppServerAdapter } from "../codex/app-server-adapter";
import { ExecFallbackAdapter, FallbackCodexAdapter } from "../codex/exec-fallback-adapter";
import { GitService } from "../services/git-service";
import { RunEventBus } from "../services/run-event-bus";
import { RunEventStore } from "../services/run-event-store";
import { RunService } from "../services/run-service";
import { HumanInputService } from "../services/human-input-service";
import { TaskService } from "../services/task-service";
import { TaskLifecycleService } from "../services/task-lifecycle-service";
import { WorktreeService } from "../services/worktree-service";
import { ReviewService } from "../services/review-service";
import { LocalRepository } from "./local-repository";

export type ServerComposition = {
  repository: LocalRepository;
  taskService: TaskService;
  taskLifecycleService: TaskLifecycleService;
  runService: RunService;
  worktreeService: WorktreeService;
  reviewService: ReviewService;
  humanInputService: HumanInputService;
  runEventBus: RunEventBus;
  runEventStore: RunEventStore;
};

class ControlledE2eAdapter implements CodexAdapter {
  private readonly completions = new Map<string, (result: { exitCode: number }) => void>();
  private readonly isolatedRuns = new Set<string>();
  private readonly runCwds = new Map<string, string>();
  private launches = 0;

  async launch(request: CodexRunRequest) {
    this.launches += 1;
    await request.onEvent({ type: "codex/exec", params: { message: "stubbed activity" } });
    const completed = new Promise<{ exitCode: number }>((resolve) => {
      this.completions.set(request.runId, resolve);
    });
    if (request.cwd.includes(".agentdeck")) {
      this.isolatedRuns.add(request.runId);
      this.runCwds.set(request.runId, request.cwd);
      await request.onEvent({ type: "human-input/requested", params: {
        requestId: `e2e-input-${request.runId}`, rpcId: `e2e-input-${request.runId}`, kind: "QUESTION",
        threadId: `e2e-thread-${request.runId}`, turnId: `e2e-turn-${request.runId}`, prompt: "Choose the controlled test response.",
        questionIds: ["approach", "scope"], questions: [
          { id: "approach", header: "Approach", question: "Which approach should the task take?", options: ["Contained"] },
          { id: "scope", header: "Scope", question: "What scope should the task use?", options: ["Only this task"] },
        ],
      } });
    } else if (this.launches > 1) setTimeout(() => this.completions.get(request.runId)?.({ exitCode: 0 }), 20);
    return { pid: 0, completed };
  }

  async stop(runId: string): Promise<void> {
    this.completions.get(runId)?.({ exitCode: 0 });
  }

  async respondToHumanInput(input: CodexHumanInputResponse): Promise<void> {
    if (!this.completions.has(input.runId)) throw new Error(`Run ${input.runId} is not active`);
    if (this.isolatedRuns.has(input.runId)) {
      const cwd = this.runCwds.get(input.runId);
      if (!cwd) throw new Error(`Run ${input.runId} has no isolated workspace`);
      writeFileSync(join(cwd, "staged.txt"), "staged review fixture\n");
      execFileSync("git", ["add", "staged.txt"], { cwd, stdio: "ignore" });
      writeFileSync(join(cwd, "unstaged.txt"), "unstaged review fixture\n");
      writeFileSync(join(cwd, "untracked.txt"), "untracked review fixture\n");
      setTimeout(() => this.completions.get(input.runId)?.({ exitCode: 0 }), 20);
    }
  }
}

function createServerComposition(): ServerComposition {
  const repository = new LocalRepository(process.env.AGENTDECK_DATA_PATH || undefined);
  const runEventBus = new RunEventBus();
  const runEventStore = new RunEventStore({ bus: runEventBus });
  const adapter: CodexAdapter = process.env.AGENTDECK_E2E_STUB === "1"
    ? new ControlledE2eAdapter()
    : new FallbackCodexAdapter(new AppServerAdapter(), new ExecFallbackAdapter());
  const humanInputService = new HumanInputService({ repository, adapter });
  const worktreeService = new WorktreeService({ repository });
  const reviewService = new ReviewService({ repository });
  return {
    repository,
    taskService: new TaskService(repository),
    taskLifecycleService: new TaskLifecycleService(repository),
    worktreeService,
    reviewService,
    runService: new RunService({
      repository,
      adapter,
      events: runEventStore,
      git: new GitService(),
      humanInput: humanInputService,
      worktrees: worktreeService,
      reviewService,
    }),
    humanInputService,
    runEventBus,
    runEventStore,
  };
}

const globalForAgentDeck = globalThis as typeof globalThis & { agentDeckComposition?: ServerComposition };

export const serverComposition = globalForAgentDeck.agentDeckComposition ?? createServerComposition();
globalForAgentDeck.agentDeckComposition = serverComposition;
