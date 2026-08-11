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
    await page.getByLabel("项目名称").fill("Worktree fixture");
    await page.getByLabel("本地项目路径").fill(fixture);
    await page.getByRole("button", { name: "登记项目" }).click();
    await page.getByLabel("任务标题").fill("Isolated V2 flow");
    await page.getByLabel("任务说明").fill("Use the controlled worktree adapter.");
    await page.getByLabel("隔离 Worktree").check();
    await page.getByRole("button", { name: "创建任务" }).click();
    await page.getByRole("link", { name: "Isolated V2 flow" }).click();

    await page.getByRole("button", { name: "运行任务" }).click();
    await expect(page.getByRole("heading", { name: "需要你的确认" })).toBeVisible();
    await expect(page.getByLabel("AWAITING_INPUT")).toBeVisible();
    await page.getByRole("button", { name: "停止运行" }).click();
    await expect(page.getByLabel("CANCELLED")).toBeVisible();
    await page.getByRole("button", { name: "创建重试任务" }).click();
    await page.getByRole("button", { name: "运行任务" }).click();
    await expect(page.getByLabel("AWAITING_INPUT")).toBeVisible();
    await expect(page.getByRole("heading", { name: "需要你的确认" })).toBeVisible();
    await page.getByLabel(/Approach/).fill("Use the contained approach");
    await page.getByLabel(/Scope/).fill("Only this task");
    await page.getByRole("button", { name: "继续任务" }).click();
    await expect(page.getByLabel("REVIEW")).toBeVisible();
    await expect(page.getByText("staged.txt", { exact: true })).toBeVisible();
    await expect(page.getByText("unstaged.txt", { exact: true })).toBeVisible();
    await expect(page.getByText("untracked.txt", { exact: true })).toBeVisible();
    await expect(page.getByText("基线", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "审查变更" }).getByText("任务分支", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "标记为可合并" }).click();
    await expect(page.getByLabel("MERGE_READY")).toBeVisible();
    await page.getByRole("button", { name: "标记完成" }).click();
    await expect(page.getByLabel("DONE")).toBeVisible();

    const taskId = new URL(page.url()).pathname.split("/").at(-1)!;
    const detail = await page.request.get(`/api/tasks/${taskId}`).then((response) => response.json() as Promise<{ worktree: { worktreePath: string } }>);
    writeFileSync(join(detail.worktree.worktreePath, "dirty.txt"), "must clean first\n");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "清理 Worktree" }).click();
    await expect(page.getByText("worktree has uncommitted changes")).toBeVisible();
    execFileSync("git", ["reset", "--hard"], { cwd: detail.worktree.worktreePath, stdio: "ignore" });
    execFileSync("git", ["clean", "-fd"], { cwd: detail.worktree.worktreePath, stdio: "ignore" });
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "清理 Worktree" }).click();
    await expect(page.getByLabel("CLEANED")).toBeVisible();
  } finally {
    rmSync(fixture, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("非 Git 项目禁用隔离模式，窄屏仍保留任务入口", async ({ page }) => {
  await page.route("**/api/projects/non-git-fixture", (route) => route.fulfill({ json: { id: "non-git-fixture", name: "非 Git 目录", path: "C:\\local\\notes", isGitRepository: false } }));
  await page.route("**/api/tasks?projectId=non-git-fixture", (route) => route.fulfill({ json: [] }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/projects/non-git-fixture");
  await expect(page.getByLabel("隔离 Worktree")).toBeDisabled();
  await expect(page.getByText("仅 Git 项目可创建隔离分支", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "创建任务" })).toBeVisible();
});

test("失败的 Worktree 任务明确显示恢复与清理入口", async ({ page }) => {
  await page.route("**/api/tasks/failed-worktree", (route) => route.fulfill({ json: {
    id: "failed-worktree", projectId: "fixture-project", title: "恢复失败的隔离任务", prompt: "展示失败后的安全下一步。", status: "WORKTREE_FAILED",
    run: { id: "run-failed", status: "FAILED", error: "Worktree 创建未完成" }, changedPaths: [], diff: "", review: null, humanInputRequests: [],
    worktree: { status: "CLEANUP_FAILED", projectPath: "C:\\local\\repo", baselineBranch: "main", baselineSha: "abc123", worktreePath: "C:\\local\\repo\\.agentdeck\\worktrees\\failed", taskBranch: "agentdeck/failed", error: "创建中断", cleanupError: "请检查本地改动后重试" },
  } }));
  await page.goto("/tasks/failed-worktree");
  await expect(page.getByLabel("WORKTREE_FAILED")).toBeVisible();
  await expect(page.getByText("运行失败：Worktree 创建未完成")).toBeVisible();
  await expect(page.getByRole("button", { name: "清理 Worktree" })).toBeVisible();
  await expect(page.getByText("仅清理无未提交改动的隔离目录")).toBeVisible();
});
