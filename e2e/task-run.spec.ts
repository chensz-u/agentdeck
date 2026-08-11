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
    await page.getByLabel("项目名称").fill("Run fixture");
    await page.getByLabel("本地项目路径").fill(fixture);
    await page.getByRole("button", { name: "登记项目" }).click();
    await page.getByLabel("任务标题").fill("Review a stubbed run");
    await page.getByLabel("任务说明").fill("Use the controlled test adapter.");
    await page.getByRole("button", { name: "创建任务" }).click();
    const projectPath = new URL(page.url()).pathname;
    await page.getByRole("link", { name: "Review a stubbed run" }).click();
    await expect(page.getByRole("link", { name: "返回项目工作区" })).toHaveAttribute("href", projectPath);

    await page.getByRole("button", { name: "运行任务" }).click();
    await expect(page.getByLabel("RUNNING")).toBeVisible();
    await expect(page.getByText("codex/exec", { exact: true })).toBeVisible();
    await expect(page.getByText("stubbed activity")).toBeVisible();
    await page.getByRole("button", { name: "停止运行" }).click();
    await expect(page.getByLabel("CANCELLED")).toBeVisible();

    await page.getByRole("button", { name: "创建重试任务" }).click();
    await expect(page).toHaveURL(/\/tasks\/.+/);
    await page.getByRole("button", { name: "运行任务" }).click();
    await expect(page.getByLabel("REVIEW")).toBeVisible();
    await expect(page.getByText("note.txt", { exact: true })).toBeVisible();
    await expect(page.getByText("diff --git a/note.txt b/note.txt")).toBeVisible();
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
