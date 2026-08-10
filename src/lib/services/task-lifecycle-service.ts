import { TaskStatus, type Task } from "../domain/types";

export interface TaskLifecycleRepository {
  findTask(taskId: string): Promise<Task | null>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<void>;
}

/** Owns explicit post-review task transitions; routes only supply a saved task id. */
export class TaskLifecycleService {
  constructor(private readonly repository: TaskLifecycleRepository) {}

  async markMergeReady(taskId: string): Promise<void> {
    await this.transition(taskId, TaskStatus.REVIEW, TaskStatus.MERGE_READY);
  }

  async markDone(taskId: string): Promise<void> {
    const task = await this.requireTask(taskId);
    if (task.status !== TaskStatus.REVIEW && task.status !== TaskStatus.MERGE_READY) {
      throw new Error(`Task ${taskId} is not ready to mark done`);
    }
    await this.repository.updateTaskStatus(taskId, TaskStatus.DONE);
  }

  private async transition(taskId: string, from: TaskStatus, to: TaskStatus): Promise<void> {
    const task = await this.requireTask(taskId);
    if (task.status !== from) throw new Error(`Task ${taskId} is not ready for this action`);
    await this.repository.updateTaskStatus(taskId, to);
  }

  private async requireTask(taskId: string): Promise<Task> {
    const task = await this.repository.findTask(taskId);
    if (!task) throw new Error(`Task ${taskId} was not found`);
    return task;
  }
}
