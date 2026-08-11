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

test("identifies the root page as AgentDeck Focus", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("AgentDeck Focus");
});

test("registers a Git project and creates a TODO task", async ({ page }) => {
  const fixture = createGitFixture();

  try {
    await page.goto("/projects");
    await page.getByLabel("项目名称").fill("E2E fixture");
    await page.getByLabel("本地项目路径").fill(fixture);
    await page.getByRole("button", { name: "登记项目" }).click();

    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.getByLabel("任务标题").fill("Create the TODO task");
    await page.getByLabel("任务说明").fill("Create a task through the project workspace.");
    await page.getByRole("button", { name: "创建任务" }).click();

    await expect(page.getByText("Create the TODO task")).toBeVisible();
    await expect(page.getByLabel("TODO")).toBeVisible();

    const projectId = new URL(page.url()).pathname.split("/").at(-1);
    const tasksResponse = await page.request.get(`/api/tasks?projectId=${projectId}`);
    await expect(tasksResponse.json()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Create the TODO task", status: "TODO" }),
    ]));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
