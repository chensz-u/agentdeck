# Warm Workspace UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark futuristic AgentDeck interface with a warm light, dense developer workspace without changing application behaviour.

**Architecture:** Keep API calls and task state unchanged. Add a client-side shell that loads registered projects only for navigation context, then refactor page/component markup and the shared stylesheet around semantic sections, existing accessible controls and responsive CSS.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS, Vitest, Playwright.

---

### Task 1: Establish the warm workspace shell

**Files:**
- Create: `src/components/console-shell.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/page.tsx`
- Test: `e2e/projects.spec.ts`

- [ ] **Step 1: Add a failing visual assertion for Chinese project navigation**

```ts
await page.goto("/");
await expect(page.getByRole("complementary", { name: "项目导航" })).toBeVisible();
await expect(page.getByRole("link", { name: "项目" })).toBeVisible();
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx playwright test e2e/projects.spec.ts`
Expected: FAIL because the existing page has only English top navigation.

- [ ] **Step 3: Add the shell and warm CSS tokens**

```tsx
export function ConsoleShell({ children }: { children: ReactNode }) {
  return <div className="console-frame"><aside aria-label="项目导航">…</aside><main id="main-content">{children}</main></div>;
}
```

Use `#f5f3ef` canvas, `#ffffff` surfaces, `#25262a` text, low-radius borders, and visible `:focus-visible` styles. Set `<html lang="zh-CN">`.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx playwright test e2e/projects.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit and push the shell**

```powershell
git add src/components/console-shell.tsx src/app/layout.tsx src/app/globals.css src/app/page.tsx e2e/projects.spec.ts
git commit -m "feat: add warm workspace shell"
git push
```

### Task 2: Refactor project registration and task queue

**Files:**
- Modify: `src/app/projects/page.tsx`
- Modify: `src/app/projects/[id]/page.tsx`
- Modify: `src/components/project-create-form.tsx`
- Modify: `src/components/task-create-form.tsx`
- Modify: `src/components/status-badge.tsx`
- Test: `e2e/projects.spec.ts`

- [ ] **Step 1: Add failing Chinese-control assertions**

```ts
await expect(page.getByLabel("项目名称")).toBeVisible();
await expect(page.getByLabel("本地项目路径")).toBeVisible();
await expect(page.getByRole("button", { name: "登记项目" })).toBeVisible();
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx playwright test e2e/projects.spec.ts`
Expected: FAIL because current form labels are English.

- [ ] **Step 3: Implement the project command center and dense queue**

```tsx
<section className="command-center" aria-labelledby="create-task-heading">
  <h2 id="create-task-heading">创建任务</h2>
  <TaskCreateForm projectId={project.id} onCreated={appendTask} />
</section>
<table><thead>…</thead><tbody>{tasks.map(renderTaskRow)}</tbody></table>
```

Preserve the existing POST bodies (`name`, `path`, `projectId`, `title`, `prompt`) and only translate display labels. Make paths `code` text and status labels Chinese while retaining a raw status `aria-label` for testability.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx playwright test e2e/projects.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit and push the project workspace**

```powershell
git add src/app/projects src/components/project-create-form.tsx src/components/task-create-form.tsx src/components/status-badge.tsx e2e/projects.spec.ts
git commit -m "feat: refine warm project workspace"
git push
```

### Task 3: Refactor task detail and review panels

**Files:**
- Modify: `src/app/tasks/[id]/task-detail-client.tsx`
- Modify: `src/components/task-actions.tsx`
- Modify: `src/components/event-feed.tsx`
- Modify: `src/components/diff-viewer.tsx`
- Test: `e2e/task-run.spec.ts`

- [ ] **Step 1: Add a failing task-detail layout assertion**

```ts
await expect(page.getByRole("region", { name: "审查变更" })).toBeVisible();
await expect(page.getByRole("heading", { name: "活动流" })).toBeVisible();
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx playwright test e2e/task-run.spec.ts`
Expected: FAIL because current review and activity headings are English.

- [ ] **Step 3: Implement compact review panels**

```tsx
<div className="task-panels">
  <section className="review-panel" aria-label="审查变更">…</section>
  <aside><EventFeed events={events} /></aside>
</div>
```

Keep the existing action endpoint paths and request body `{ runId }`; translate labels and add a browser confirmation before the existing destructive clean action only if that action is present in the current runtime.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx playwright test e2e/task-run.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit and push the task review**

```powershell
git add src/app/tasks src/components/task-actions.tsx src/components/event-feed.tsx src/components/diff-viewer.tsx e2e/task-run.spec.ts
git commit -m "feat: refine warm task review"
git push
```

### Task 4: Browser audit and final verification

**Files:**
- Modify: `e2e/projects.spec.ts`
- Modify: `e2e/task-run.spec.ts`

- [ ] **Step 1: Add a narrow-screen assertion**

```ts
await page.setViewportSize({ width: 390, height: 844 });
await expect(page.getByRole("heading", { name: "创建任务" })).toBeVisible();
```

- [ ] **Step 2: Run the full browser suite**

Run: `npx playwright test`
Expected: PASS.

- [ ] **Step 3: Inspect real browser pages**

Open `/`, `/projects`, a registered project, and a task detail at desktop and 390px widths; capture screenshots and fix visual regressions without changing server files.

- [ ] **Step 4: Run final verification**

Run: `npm test; npm run lint; npm run build; npx playwright test; git diff --check`
Expected: all commands exit 0.

- [ ] **Step 5: Commit, push and open a draft PR**

```powershell
git add e2e
git commit -m "test: cover warm workspace UI"
git push -u origin codex/warm-workspace-ui
gh pr create --draft --fill
```
