import { describe, expect, it } from "vitest";

import { TaskStatus } from "./types";
import { canTransitionTask, transitionTask } from "./task-state";

describe("task state transitions", () => {
  it("allows each legal transition", () => {
    expect(canTransitionTask(TaskStatus.TODO, TaskStatus.RUNNING)).toBe(true);
    expect(canTransitionTask(TaskStatus.RUNNING, TaskStatus.REVIEW)).toBe(true);
    expect(canTransitionTask(TaskStatus.RUNNING, TaskStatus.FAILED)).toBe(true);
    expect(canTransitionTask(TaskStatus.RUNNING, TaskStatus.CANCELLED)).toBe(true);
    expect(canTransitionTask(TaskStatus.REVIEW, TaskStatus.DONE)).toBe(true);
  });

  it("allows V2 worktree and human-input transitions", () => {
    expect(canTransitionTask(TaskStatus.TODO, TaskStatus.CREATING_WORKTREE)).toBe(true);
    expect(canTransitionTask(TaskStatus.CREATING_WORKTREE, TaskStatus.RUNNING)).toBe(true);
    expect(canTransitionTask(TaskStatus.CREATING_WORKTREE, TaskStatus.WORKTREE_FAILED)).toBe(true);
    expect(canTransitionTask(TaskStatus.RUNNING, TaskStatus.AWAITING_INPUT)).toBe(true);
    expect(canTransitionTask(TaskStatus.AWAITING_INPUT, TaskStatus.RUNNING)).toBe(true);
    expect(canTransitionTask(TaskStatus.REVIEW, TaskStatus.MERGE_READY)).toBe(true);
    expect(canTransitionTask(TaskStatus.REVIEW, TaskStatus.CLEANED)).toBe(true);
    expect(canTransitionTask(TaskStatus.FAILED, TaskStatus.CLEANED)).toBe(true);
    expect(canTransitionTask(TaskStatus.CANCELLED, TaskStatus.CLEANED)).toBe(true);
    expect(canTransitionTask(TaskStatus.WORKTREE_FAILED, TaskStatus.CLEANED)).toBe(true);
    expect(canTransitionTask(TaskStatus.MERGE_READY, TaskStatus.CLEANED)).toBe(true);
    expect(canTransitionTask(TaskStatus.MERGE_READY, TaskStatus.DONE)).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransitionTask(TaskStatus.TODO, TaskStatus.DONE)).toBe(false);
    expect(canTransitionTask(TaskStatus.FAILED, TaskStatus.RUNNING)).toBe(false);
    expect(canTransitionTask(TaskStatus.WORKTREE_FAILED, TaskStatus.RUNNING)).toBe(false);
    expect(canTransitionTask(TaskStatus.RUNNING, TaskStatus.MERGE_READY)).toBe(false);
    expect(() => transitionTask(TaskStatus.REVIEW, TaskStatus.FAILED)).toThrow(
      "Cannot transition task from REVIEW to FAILED",
    );
  });
});
