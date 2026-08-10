import { TaskStatus } from "./types";

const legalTransitions: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  [TaskStatus.TODO]: [TaskStatus.RUNNING, TaskStatus.CREATING_WORKTREE],
  [TaskStatus.CREATING_WORKTREE]: [
    TaskStatus.RUNNING,
    TaskStatus.WORKTREE_FAILED,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.RUNNING]: [
    TaskStatus.REVIEW,
    TaskStatus.MERGE_READY,
    TaskStatus.AWAITING_INPUT,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.AWAITING_INPUT]: [
    TaskStatus.RUNNING,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
    TaskStatus.WORKTREE_FAILED,
  ],
  [TaskStatus.REVIEW]: [TaskStatus.DONE],
  [TaskStatus.MERGE_READY]: [TaskStatus.CLEANED, TaskStatus.DONE],
  [TaskStatus.DONE]: [],
  [TaskStatus.CLEANED]: [],
  [TaskStatus.FAILED]: [],
  [TaskStatus.WORKTREE_FAILED]: [],
  [TaskStatus.CANCELLED]: [],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return legalTransitions[from].includes(to);
}

export function transitionTask(from: TaskStatus, to: TaskStatus): TaskStatus {
  if (!canTransitionTask(from, to)) {
    throw new Error(`Cannot transition task from ${from} to ${to}`);
  }

  return to;
}
