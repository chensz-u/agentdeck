import type { CodexEvent } from "./protocol";
import type { HumanInputAction } from "../domain/types";

export type CodexRunRequest = {
  runId: string;
  prompt: string;
  cwd: string;
  onEvent(event: CodexEvent): Promise<void> | void;
};

export type CodexRunCompletion = {
  exitCode: number | null;
  error?: string;
};

export type CodexRunHandle = {
  pid: number | null;
  completed: Promise<CodexRunCompletion>;
};

export type CodexHumanInputResponse = {
  runId: string;
  action: HumanInputAction.APPROVE | HumanInputAction.REJECT | HumanInputAction.TEXT;
  text: string;
};

export type CodexContinuation = {
  threadId: string;
  turnId: string;
  mode: "steer" | "start";
};

/** Process boundary for Codex. Implementations do not know about tasks or storage. */
export interface CodexAdapter {
  launch(request: CodexRunRequest): Promise<CodexRunHandle>;
  stop(runId: string): Promise<void>;
  continueHumanInput(input: CodexHumanInputResponse): Promise<CodexContinuation>;
}
