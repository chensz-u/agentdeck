import { TaskStatus } from "../lib/domain/types";

const labels: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: "TODO",
  [TaskStatus.RUNNING]: "RUNNING",
  [TaskStatus.REVIEW]: "REVIEW",
  [TaskStatus.DONE]: "DONE",
  [TaskStatus.FAILED]: "FAILED",
  [TaskStatus.CANCELLED]: "CANCELLED",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{labels[status]}</span>;
}
