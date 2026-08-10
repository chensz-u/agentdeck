export enum TaskStatus {
  TODO = "TODO",
  CREATING_WORKTREE = "CREATING_WORKTREE",
  RUNNING = "RUNNING",
  AWAITING_INPUT = "AWAITING_INPUT",
  REVIEW = "REVIEW",
  MERGE_READY = "MERGE_READY",
  DONE = "DONE",
  CLEANED = "CLEANED",
  FAILED = "FAILED",
  WORKTREE_FAILED = "WORKTREE_FAILED",
  CANCELLED = "CANCELLED",
}

export enum ExecutionMode {
  CURRENT_WORKSPACE = "CURRENT_WORKSPACE",
  ISOLATED_WORKTREE = "ISOLATED_WORKTREE",
}

export enum WorktreeStatus {
  CREATING = "CREATING",
  READY = "READY",
  FAILED = "FAILED",
  CLEANING = "CLEANING",
  CLEANED = "CLEANED",
  CLEANUP_FAILED = "CLEANUP_FAILED",
}

export enum RunInputState {
  IDLE = "IDLE",
  AWAITING_INPUT = "AWAITING_INPUT",
  SUBMITTED = "SUBMITTED",
}

export enum HumanInputAction {
  REQUEST = "REQUEST",
  APPROVE = "APPROVE",
  REJECT = "REJECT",
  TEXT = "TEXT",
}

export enum AgentRunStatus {
  RUNNING = "RUNNING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export type Project = {
  id: string;
  name: string;
  path: string;
  gitEnabled: boolean;
  gitRemote: string | null;
  gitBranch: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Task = {
  id: string;
  projectId: string;
  parentTaskId: string | null;
  title: string;
  prompt: string;
  status: TaskStatus;
  executionMode?: ExecutionMode;
  worktreeId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AgentRun = {
  id: string;
  taskId: string;
  agent: string;
  status: AgentRunStatus;
  pid: number | null;
  exitCode: number | null;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  logPath: string | null;
  threadId?: string | null;
  turnId?: string | null;
  inputState?: RunInputState;
};

export type Worktree = {
  id: string;
  taskId: string;
  projectId: string;
  projectPath: string;
  worktreePath: string;
  taskBranch: string;
  baselineBranch: string;
  baselineSha: string;
  createdAt: Date;
  status: WorktreeStatus;
  error: string | null;
  cleanupRequestedAt: Date | null;
  cleanedAt: Date | null;
  cleanupError: string | null;
};

export type HumanInputAuditEntry = {
  id: string;
  sequence: number;
  taskId: string;
  runId: string;
  action: HumanInputAction;
  requestId: string;
  payload: unknown;
  createdAt: Date;
};
