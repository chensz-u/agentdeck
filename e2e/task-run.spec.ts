import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

function createGitFixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "agentdeck-e2e-task-"));
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  writeFileSync(join(directory, "note.txt"), "before\n");
  execFileSync("git", ["add", "note.txt"], { cwd: directory });
  execFileSync("git", ["-c", "user.email=e2e@example.test", "-c", "user.name=E2E", "commit", "--quiet", "-m", "initial"], { cwd: directory });
  writeFileSync(join(directory, "note.txt"), "after\n");
  return directory;
}

test("streams a stubbed run, can stop and retry it, then reviews the diff", async ({ page }) => {
  const fixture = createGitFixture();

  try {
    await page.goto("/projects");
    await page.getByLabel("Project name").fill("Run fixture");
    await page.getByLabel("Local Git repository path").fill(fixture);
    await page.getByRole("button", { name: "Add project" }).click();
    await page.getByLabel("Task title").fill("Review a stubbed run");
    await page.getByLabel("Task prompt").fill("Use the controlled test adapter.");
    await page.getByRole("button", { name: "Create task" }).click();
    const projectPath = new URL(page.url()).pathname;
    await page.getByRole("link", { name: "Review a stubbed run" }).click();
    await expect(page.getByRole("link", { name: "Project workspace" })).toHaveAttribute("href", projectPath);

    await page.getByRole("button", { name: "Run task" }).click();
    await expect(page.getByText("RUNNING", { exact: true })).toBeVisible();
    await expect(page.getByText("codex/exec", { exact: true })).toBeVisible();
    await expect(page.getByText("stubbed activity")).toBeVisible();
    await page.getByRole("button", { name: "Stop run" }).click();
    await expect(page.getByText("CANCELLED", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Retry task" }).click();
    await expect(page).toHaveURL(/\/tasks\/.+/);
    await page.getByRole("button", { name: "Run task" }).click();
    await expect(page.getByText("REVIEW", { exact: true })).toBeVisible();
    await expect(page.getByText("note.txt", { exact: true })).toBeVisible();
    await expect(page.getByText("diff --git a/note.txt b/note.txt")).toBeVisible();
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
