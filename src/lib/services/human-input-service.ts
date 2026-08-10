import type { AppServerHumanInputRequest } from "../codex/app-server-adapter";
import type { CodexAdapter, CodexHumanInputResponse } from "../codex/codex-adapter";
import { AgentRunStatus, HumanInputAction, HumanInputDeliveryStatus, RunInputState, TaskStatus, type AgentRun, type HumanInputAuditEntry, type Task } from "../domain/types";

const MAX_TEXT_LENGTH = 4_000;
const responseActions = new Set<HumanInputAction>([HumanInputAction.APPROVE, HumanInputAction.REJECT, HumanInputAction.TEXT]);

export type HumanInputSubmission = { taskId: string; runId: string; requestId: string; action: HumanInputAction; text?: string };
export type HumanInputRequestRecord = { taskId: string; runId: string; request: AppServerHumanInputRequest };

export interface HumanInputRepository {
  findInputContext(taskId: string, runId: string): Promise<{ task: Task; run: AgentRun } | null>;
  listHumanInputs(runId: string): Promise<HumanInputAuditEntry[]>;
  appendHumanInput(input: Omit<HumanInputAuditEntry, "id" | "sequence" | "createdAt" | "deliveryStatus" | "deliveryError"> & Partial<Pick<HumanInputAuditEntry, "deliveryStatus" | "deliveryError">>): Promise<HumanInputAuditEntry>;
  updateHumanInputDelivery(runId: string, requestId: string, status: HumanInputDeliveryStatus, error: string | null): Promise<void>;
  updateRunSession(runId: string, update: Partial<Pick<AgentRun, "threadId" | "turnId" | "inputState">>): Promise<void>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<void>;
}

type HumanInputServiceOptions = { repository: HumanInputRepository; adapter: Pick<CodexAdapter, "respondToHumanInput"> };

/** Binds browser replies to audited server requests; browser input never carries protocol identifiers. */
export class HumanInputService {
  private readonly terminalRuns = new Set<string>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly options: HumanInputServiceOptions) {}

  async recordRequest(input: HumanInputRequestRecord): Promise<HumanInputAuditEntry> {
    return this.serialized(input.runId, async () => {
      if (this.terminalRuns.has(input.runId)) throw new Error(`Run ${input.runId} is no longer active`);
      const context = await this.options.repository.findInputContext(input.taskId, input.runId);
      if (!context || context.run.status !== AgentRunStatus.RUNNING) throw new Error(`Run ${input.runId} is not active`);
      const existing = (await this.options.repository.listHumanInputs(input.runId)).find((entry) => entry.requestId === input.request.requestId);
      if (existing) return existing;
      const audit = await this.options.repository.appendHumanInput({
        taskId: input.taskId,
        runId: input.runId,
        action: HumanInputAction.REQUEST,
        requestId: input.request.requestId,
        payload: { kind: input.request.kind, questionIds: input.request.questionIds ?? [] },
        deliveryStatus: HumanInputDeliveryStatus.PENDING,
        deliveryError: null,
      });
      await this.options.repository.updateRunSession(input.runId, { inputState: RunInputState.AWAITING_INPUT });
      await this.options.repository.updateTaskStatus(input.taskId, TaskStatus.AWAITING_INPUT);
      return audit;
    });
  }

  async submit(input: HumanInputSubmission): Promise<HumanInputAuditEntry> {
    this.validate(input);
    return this.serialized(input.runId, async () => {
      if (this.terminalRuns.has(input.runId)) throw new Error(`Run ${input.runId} is no longer active`);
      const context = await this.options.repository.findInputContext(input.taskId, input.runId);
      const audit = (await this.options.repository.listHumanInputs(input.runId)).find((entry) => entry.requestId === input.requestId && entry.action === HumanInputAction.REQUEST);
      if (!audit) throw new Error(`Human input request ${input.requestId} is not pending for run ${input.runId}`);
      if (audit.deliveryStatus === HumanInputDeliveryStatus.DELIVERED) return audit;
      if (!context || context.task.status !== TaskStatus.AWAITING_INPUT || context.run.status !== AgentRunStatus.RUNNING || context.run.inputState !== RunInputState.AWAITING_INPUT) {
        throw new Error(`Run ${input.runId} is not awaiting human input`);
      }
      const kind = this.requestKind(audit);
      this.validateActionForRequest(kind, input.action);
      const text = input.action === HumanInputAction.TEXT ? input.text!.trim() : "";
      await this.options.repository.updateRunSession(input.runId, { inputState: RunInputState.SUBMITTED });
      try {
        await this.options.adapter.respondToHumanInput({ runId: input.runId, requestId: input.requestId, action: input.action as CodexHumanInputResponse["action"], text });
        await this.options.repository.updateHumanInputDelivery(input.runId, input.requestId, HumanInputDeliveryStatus.DELIVERED, null);
        await this.options.repository.updateRunSession(input.runId, { inputState: RunInputState.IDLE });
        await this.options.repository.updateTaskStatus(input.taskId, TaskStatus.RUNNING);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.options.repository.updateHumanInputDelivery(input.runId, input.requestId, HumanInputDeliveryStatus.FAILED, message);
        await this.options.repository.updateRunSession(input.runId, { inputState: RunInputState.AWAITING_INPUT });
        throw new Error(`Human input delivery failed and is recoverable: ${message}`);
      }
      return { ...audit, deliveryStatus: HumanInputDeliveryStatus.DELIVERED, deliveryError: null };
    });
  }

  async markTerminal(runId: string): Promise<void> {
    await this.serialized(runId, async () => {
      this.terminalRuns.add(runId);
      const pending = (await this.options.repository.listHumanInputs(runId))
        .filter((entry) => entry.action === HumanInputAction.REQUEST && entry.deliveryStatus === HumanInputDeliveryStatus.PENDING);
      await Promise.all(pending.map((entry) => this.options.repository.updateHumanInputDelivery(
        runId, entry.requestId, HumanInputDeliveryStatus.FAILED, "Run is no longer active",
      )));
    });
  }

  private validate(input: HumanInputSubmission): void {
    if (!input.taskId || !input.runId || !input.requestId) throw new Error("task id, run id, and request id are required");
    if (!responseActions.has(input.action)) throw new Error(`Unsupported human response action: ${input.action}`);
    if (input.action === HumanInputAction.TEXT && (!input.text || !input.text.trim())) throw new Error("Text input is required");
    if (input.text !== undefined && input.text.length > MAX_TEXT_LENGTH) throw new Error(`Text input must be at most ${MAX_TEXT_LENGTH} characters`);
    if (input.action !== HumanInputAction.TEXT && input.text !== undefined) throw new Error("Only text input may include text");
  }

  private requestKind(audit: HumanInputAuditEntry): "CONFIRMATION" | "QUESTION" {
    if (!this.isRequestPayload(audit.payload)) throw new Error(`Human input request ${audit.requestId} is not pending`);
    return audit.payload.kind;
  }

  private isRequestPayload(payload: unknown): payload is { kind: "CONFIRMATION" | "QUESTION"; questionIds: string[] } {
    return typeof payload === "object" && payload !== null && !Array.isArray(payload)
      && ((payload as { kind?: unknown }).kind === "CONFIRMATION" || (payload as { kind?: unknown }).kind === "QUESTION");
  }

  private validateActionForRequest(kind: "CONFIRMATION" | "QUESTION", action: HumanInputAction): void {
    if (kind === "CONFIRMATION" && action !== HumanInputAction.APPROVE && action !== HumanInputAction.REJECT) throw new Error("Confirmation request requires approve or reject");
    if (kind === "QUESTION" && action !== HumanInputAction.TEXT) throw new Error("Question request requires text");
  }

  private serialized<T>(runId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(runId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    this.queues.set(runId, next.then(() => undefined, () => undefined));
    return next;
  }
}
