# AgentDeck Focus Console UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans to implement this plan task-by-task.

**Goal:** Replace the V2 frontend with a dense, Chinese-localized developer-console experience while preserving backend behavior.

**Architecture:** Build one CSS design-token layer and a shared shell, then refactor project and task UI around the same status, metadata, action, activity, and review primitives. Keep client request payloads unchanged.

**Tech Stack:** Next.js, TypeScript, CSS, existing React components, Vitest, Playwright.

---

### Task 1: Shell, tokens, and reusable display primitives

- [ ] Write failing UI assertions for Chinese labels, status semantics, sidebar navigation, and focusable controls.
- [ ] Implement design tokens, responsive app shell, status badge, metadata row, and priority styles.
- [ ] Verify focused tests, lint, and build.

### Task 2: Project command center

- [ ] Write failing Playwright checks for disabled non-Git worktree mode, segmented control copy, priority task rows, and narrow layout.
- [ ] Refactor project list/workspace/forms into project summary, command center, and dense task table without changing API payloads.
- [ ] Verify Playwright and focused browser screenshots.

### Task 3: Task review surface

- [ ] Write failing Playwright checks for waiting-input priority, Worktree metadata, review panels, failed/cleanup states, and narrow layout.
- [ ] Refactor task detail/actions/activity/diff into the three-panel review surface with Chinese developer copy.
- [ ] Verify full tests, lint, build, Playwright, and screenshot QA.

### Task 4: Final UI audit

- [ ] Review changed files against current Web Interface Guidelines, fix accessibility/focus/content issues, and re-run verification.
