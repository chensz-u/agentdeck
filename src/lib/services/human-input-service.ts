import type { CodexAdapter, CodexHumanInputResponse } from "../codex/codex-adapter";
import { AgentRunStatus, HumanInputAction, RunInputState, TaskStatus, type AgentRun, type HumanInputAuditEntry, type Task } from "../domain/types";

const MAX_TEXT_LENGTH = 4_000;
const responseActions = new Set<HumanInputAction>([HumanInputAction.APPROVE, HumanInputAction.REJECT, HumanInputAction.TEXT]);

export type HumanInputSubmission = {
  taskId: string;
  runId: string;
  requestId: string;
  action: HumanInputAction;
  text?: string;
};

export interface HumanInputRepository {
  findInputContext(taskId: string, runId: string): Promise<{ task: Task; run: AgentRun } | null>;
  listHumanInputs(runId: string): Promise<HumanInputAuditEntry[]>;
  appendHumanInput(input: Omit<HumanInputAuditEntry, "id" | "sequence" | "createdAt">): Promise<HumanInputAuditEntry>;
  updateRunSession(runId: string, update: Partial<Pick<AgentRun, "threadId" | "turnId" | "inputState">>): Promise<void>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<void>;
}

type HumanInputServiceOptions = {
  repository: HumanInputRepository;
  adapter: Pick<CodexAdapter, "continueHumanInput">;
};

/** Persists browser-safe responses and relays them only to a live, awaiting app-server run. */
export class HumanInputService {
  private readonly terminalRuns = new Set<string>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly options: HumanInputServiceOptions) {}

  async submit(input: HumanInputSubmission): Promise<HumanInputAuditEntry> {
    this.validate(input);
    return this.serialized(input.runId, async () => {
      if (this.terminalRuns.has(input.runId)) throw new Error(`Run ${input.runId} is no longer active`);
      const existing = (await this.options.repository.listHumanInputs(input.runId)).find((entry) => entry.requestId === input.requestId);
      if (existing) return existing;
      const context = await this.options.repository.findInputContext(input.taskId, input.runId);
      if (!context || context.task.status !== TaskStatus.AWAITING_INPUT || context.run.status !== AgentRunStatus.RUNNING || context.run.inputState !== RunInputState.AWAITING_INPUT) {
        throw new Error(`Run ${input.runId} is not awaiting human input`);
      }
      const text = this.responseText(input);
      const audit = await this.options.repository.appendHumanInput({
        taskId: input.taskId, runId: input.runId, requestId: input.requestId, action: input.action, payload: { text },
      });
      await this.options.repository.updateRunSession(input.runId, { inputState: RunInputState.SUBMITTED });
      await this.options.repository.updateTaskStatus(input.taskId, TaskStatus.RUNNING);
      try {
        await this.options.adapter.continueHumanInput({ runId: input.runId, action: input.action as CodexHumanInputResponse["action"], text });
      } catch (error) {
        await this.options.repository.updateRunSession(input.runId, { inputState: RunInputState.AWAITING_INPUT });
        await this.options.repository.updateTaskStatus(input.taskId, TaskStatus.AWAITING_INPUT);
        throw new Error(`Human input was recorded but app-server continuation failed and is recoverable: ${error instanceof Error ? error.message : String(error)}`);
      }
      return audit;
    });
  }

  /** Called by lifecycle coordination before a stop or terminal process notification is applied. */
  async markTerminal(runId: string): Promise<void> {
    await this.serialized(runId, async () => { this.terminalRuns.add(runId); });
  }

  private validate(input: HumanInputSubmission): void {
    if (!input.taskId || !input.runId || !input.requestId) throw new Error("task id, run id, and request id are required");
    if (!responseActions.has(input.action)) throw new Error(`Unsupported human response action: ${input.action}`);
    if (input.action === HumanInputAction.TEXT && (!input.text || !input.text.trim())) throw new Error("Text input is required");
    if (input.text !== undefined && input.text.length > MAX_TEXT_LENGTH) throw new Error(`Text input must be at most ${MAX_TEXT_LENGTH} characters`);
    if (input.action !== HumanInputAction.TEXT && input.text !== undefined) throw new Error("Only text input may include text");
  }

  private responseText(input: HumanInputSubmission): string {
    if (input.action === HumanInputAction.APPROVE) return "Approved";
    if (input.action === HumanInputAction.REJECT) return "Rejected";
    return input.text!.trim();
  }

  private serialized<T>(runId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(runId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    this.queues.set(runId, next.then(() => undefined, () => undefined));
    return next;
  }
}
