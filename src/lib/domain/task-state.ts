import { TaskStatus } from "./types";

const legalTransitions: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  [TaskStatus.TODO]: [TaskStatus.RUNNING],
  [TaskStatus.RUNNING]: [
    TaskStatus.REVIEW,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.REVIEW]: [TaskStatus.DONE],
  [TaskStatus.DONE]: [],
  [TaskStatus.FAILED]: [],
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
