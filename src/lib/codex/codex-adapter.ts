import type { CodexEvent } from "./protocol";

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

/** Process boundary for Codex. Implementations do not know about tasks or storage. */
export interface CodexAdapter {
  launch(request: CodexRunRequest): Promise<CodexRunHandle>;
  stop(runId: string): Promise<void>;
}
