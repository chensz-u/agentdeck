import { TaskStatus } from "../lib/domain/types";

const labels: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: "TODO",
  [TaskStatus.CREATING_WORKTREE]: "CREATING WORKTREE",
  [TaskStatus.RUNNING]: "RUNNING",
  [TaskStatus.AWAITING_INPUT]: "AWAITING INPUT",
  [TaskStatus.REVIEW]: "REVIEW",
  [TaskStatus.MERGE_READY]: "MERGE READY",
  [TaskStatus.DONE]: "DONE",
  [TaskStatus.CLEANED]: "CLEANED",
  [TaskStatus.FAILED]: "FAILED",
  [TaskStatus.WORKTREE_FAILED]: "WORKTREE FAILED",
  [TaskStatus.CANCELLED]: "CANCELLED",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{labels[status]}</span>;
}
