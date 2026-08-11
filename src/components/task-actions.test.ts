import { describe, expect, it } from "vitest";

import { TaskStatus } from "../lib/domain/types";
import { shouldShowWorktreeCleanup } from "./task-actions";

describe("shouldShowWorktreeCleanup", () => {
  it("offers explicit cleanup for failed isolated worktree creation", () => {
    expect(shouldShowWorktreeCleanup(TaskStatus.WORKTREE_FAILED, true)).toBe(true);
  });

  it("does not offer cleanup when no isolated worktree exists", () => {
    expect(shouldShowWorktreeCleanup(TaskStatus.WORKTREE_FAILED, false)).toBe(false);
  });
});
