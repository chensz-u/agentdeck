import { TaskStatus, type Task } from "../domain/types";

export interface TaskRepository {
  findTask(id: string): Promise<Task | null>;
  createTask(input: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task>;
}

export class TaskService {
  constructor(private readonly repository: TaskRepository) {}

  async createTask(input: Pick<Task, "projectId" | "title" | "prompt">): Promise<Task> {
    return this.repository.createTask({
      ...input,
      parentTaskId: null,
      status: TaskStatus.TODO,
    });
  }

  async createRetryTask(originalTaskId: string): Promise<Task> {
    const original = await this.repository.findTask(originalTaskId);

    if (!original) {
      throw new Error(`Task ${originalTaskId} was not found`);
    }

    return this.repository.createTask({
      projectId: original.projectId,
      parentTaskId: original.id,
      title: original.title,
      prompt: original.prompt,
      status: TaskStatus.TODO,
    });
  }
}
