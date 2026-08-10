import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

function createGitFixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "agentdeck-e2e-worktree-"));
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "e2e@example.test"], { cwd: directory });
  execFileSync("git", ["config", "user.name", "E2E"], { cwd: directory });
  writeFileSync(join(directory, "baseline.txt"), "baseline\n");
  execFileSync("git", ["add", "baseline.txt"], { cwd: directory });
  execFileSync("git", ["commit", "--quiet", "-m", "baseline"], { cwd: directory });
  return directory;
}

test("runs an isolated worktree through human input, review, lifecycle, and safe cleanup", async ({ page }) => {
  const fixture = createGitFixture();
  try {
    await page.goto("/projects");
    await page.getByLabel("Project name").fill("Worktree fixture");
    await page.getByLabel("Local Git repository path").fill(fixture);
    await page.getByRole("button", { name: "Add project" }).click();
    await page.getByLabel("Task title").fill("Isolated V2 flow");
    await page.getByLabel("Task prompt").fill("Use the controlled worktree adapter.");
    await page.getByLabel("Isolated worktree").check();
    await page.getByRole("button", { name: "Create task" }).click();
    await page.getByRole("link", { name: "Isolated V2 flow" }).click();

    await page.getByRole("button", { name: "Run task" }).click();
    await expect(page.getByRole("heading", { name: "Human input" })).toBeVisible();
    await expect(page.getByText("AWAITING INPUT", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Stop run" }).click();
    await expect(page.getByText("CANCELLED", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Retry task" }).click();
    await page.getByRole("button", { name: "Run task" }).click();
    await expect(page.getByText("AWAITING INPUT", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Human input" })).toBeVisible();
    await page.getByLabel(/Approach/).fill("Use the contained approach");
    await page.getByLabel(/Scope/).fill("Only this task");
    await page.getByRole("button", { name: "Submit answers" }).click();
    await expect(page.getByText("REVIEW", { exact: true })).toBeVisible();
    await expect(page.getByText("staged.txt", { exact: true })).toBeVisible();
    await expect(page.getByText("unstaged.txt", { exact: true })).toBeVisible();
    await expect(page.getByText("untracked.txt", { exact: true })).toBeVisible();
    await expect(page.getByText("Baseline", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Review" }).getByText("Task branch", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Mark merge ready" }).click();
    await expect(page.getByText("MERGE READY", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Mark done" }).click();
    await expect(page.getByText("DONE", { exact: true })).toBeVisible();

    const taskId = new URL(page.url()).pathname.split("/").at(-1)!;
    const detail = await page.request.get(`/api/tasks/${taskId}`).then((response) => response.json() as Promise<{ worktree: { worktreePath: string } }>);
    writeFileSync(join(detail.worktree.worktreePath, "dirty.txt"), "must clean first\n");
    await page.getByRole("button", { name: "Clean worktree" }).click();
    await expect(page.getByText("worktree has uncommitted changes")).toBeVisible();
    execFileSync("git", ["reset", "--hard"], { cwd: detail.worktree.worktreePath, stdio: "ignore" });
    execFileSync("git", ["clean", "-fd"], { cwd: detail.worktree.worktreePath, stdio: "ignore" });
    await page.getByRole("button", { name: "Clean worktree" }).click();
    await expect(page.locator(".task-hero").getByText("CLEANED", { exact: true })).toBeVisible();
  } finally {
    rmSync(fixture, { recursive: true, force: true, maxRetries: 3 });
  }
});
