export enum TaskStatus {
  TODO = "TODO",
  RUNNING = "RUNNING",
  REVIEW = "REVIEW",
  DONE = "DONE",
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
  createdAt: Date;
  updatedAt: Date;
};

export type AgentRun = {
  id: string;
  taskId: string;
  agent: string;
  status: string;
  pid: number | null;
  exitCode: number | null;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  logPath: string | null;
};
