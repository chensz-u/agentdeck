import type { CodexEvent } from "./protocol";
import type { HumanInputAction } from "../domain/types";

export type CodexRunRequest = {
  runId: string;
  prompt: string;
  cwd: string;
  onEvent(event: CodexEvent): Promise<void> | void;
  onSession?(session: { threadId: string; turnId: string }): Promise<void> | void;
  onOutput?(record: { stream: "stdout" | "stderr"; text: string }): Promise<void> | void;
};

export type CodexRunCompletion = {
  exitCode: number | null;
  error?: string;
};

export type CodexRunHandle = {
  pid: number | null;
  completed: Promise<CodexRunCompletion>;
  threadId?: string;
  turnId?: string;
};

export type CodexHumanInputResponse = {
  runId: string;
  requestId: string;
  action: HumanInputAction.APPROVE | HumanInputAction.REJECT | HumanInputAction.TEXT;
  answers?: Record<string, string>;
};

/** Process boundary for Codex. Implementations do not know about tasks or storage. */
export interface CodexAdapter {
  launch(request: CodexRunRequest): Promise<CodexRunHandle>;
  stop(runId: string): Promise<void>;
  respondToHumanInput(input: CodexHumanInputResponse): Promise<void>;
}
