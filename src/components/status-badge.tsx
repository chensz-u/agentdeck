import { TaskStatus } from "../lib/domain/types";

const labels: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: "待启动",
  [TaskStatus.CREATING_WORKTREE]: "创建 Worktree 中",
  [TaskStatus.RUNNING]: "运行中",
  [TaskStatus.AWAITING_INPUT]: "等待人工输入",
  [TaskStatus.REVIEW]: "待审查",
  [TaskStatus.MERGE_READY]: "可合并",
  [TaskStatus.DONE]: "已完成",
  [TaskStatus.CLEANED]: "已清理",
  [TaskStatus.FAILED]: "运行失败",
  [TaskStatus.WORKTREE_FAILED]: "Worktree 失败",
  [TaskStatus.CANCELLED]: "已停止",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`status-badge status-${status.toLowerCase()}`} aria-label={status} title={status}>{labels[status]}</span>;
}
