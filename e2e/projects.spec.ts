import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

function createGitFixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "agentdeck-e2e-project-"));
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  return directory;
}

test("registers a Git project and creates a TODO task", async ({ page }) => {
  const fixture = createGitFixture();

  try {
    await page.goto("/projects");
    await page.getByLabel("Project name").fill("E2E fixture");
    await page.getByLabel("Local Git repository path").fill(fixture);
    await page.getByRole("button", { name: "Add project" }).click();

    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.getByLabel("Task title").fill("Create the TODO task");
    await page.getByLabel("Task prompt").fill("Create a task through the project workspace.");
    await page.getByRole("button", { name: "Create task" }).click();

    await expect(page.getByText("Create the TODO task")).toBeVisible();
    await expect(page.getByText("TODO", { exact: true })).toBeVisible();

    const projectId = new URL(page.url()).pathname.split("/").at(-1);
    const tasksResponse = await page.request.get(`/api/tasks?projectId=${projectId}`);
    await expect(tasksResponse.json()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Create the TODO task", status: "TODO" }),
    ]));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
