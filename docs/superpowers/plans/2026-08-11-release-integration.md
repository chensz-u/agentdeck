# AgentDeck Focus Release Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the complete V2 and V3 delivery into `master` without importing the obsolete warm-UI branch.

**Architecture:** `codex/agentdeck-focus-v3` is a descendant of `feature/agentdeck-focus-v2`; merge it once into a release branch based on current `master`, then fast-forward `master` only after full verification. PR #2 stays out because it lacks the V2/V3 runtime and duplicates an older UI direction.

**Tech Stack:** Git, GitHub CLI, Next.js, Vitest, Playwright, Codex CLI.

---

### Task 1: Create the release integration commit

**Files:**
- Create: `docs/superpowers/plans/2026-08-11-release-integration.md`
- Merge source: `codex/agentdeck-focus-v3`

- [ ] **Step 1: Confirm ancestry and clean branches**

Run: `git merge-base feature/agentdeck-focus-v2 codex/agentdeck-focus-v3 && git status --short --branch`

Expected: the merge base equals the V2 tip and the release branch is clean.

- [ ] **Step 2: Merge only V3**

Run: `git merge --no-ff codex/agentdeck-focus-v3 -m "merge: integrate AgentDeck Focus V2 and V3"`

Expected: V2 Worktree/human-input/review services and V3 Agent/output services enter the release branch. Do not merge `codex/warm-workspace-ui`.

- [ ] **Step 3: Resolve a conflict only if Git reports one**

Keep the V3 implementation for `src/`, `e2e/`, `README.md`, and V2/V3 design documents; preserve unrelated `master` history only when no behavior is duplicated. Run `git diff --check` before continuing.

### Task 2: Verify behavior from the merged release branch

**Files:**
- Test: `e2e/projects.spec.ts`
- Test: `e2e/task-run.spec.ts`
- Test: `e2e/worktree-v2.spec.ts`

- [ ] **Step 1: Run unit and browser verification**

Run: `npm test`, `npm run lint`, `npm run build`, `npx playwright test`, `codex --version`, and `codex app-server --help`.

Expected: every command exits zero. Repair any integration regression with a focused test first, then rerun all six commands.

- [ ] **Step 2: Perform visual acceptance**

Run the local Next server with the controlled E2E adapter, inspect `/projects/[id]` and `/tasks/[id]`, and save screenshots under `output/playwright/`.

Expected: Codex is available; unsupported agents are disabled; output, Worktree review, human input, cleanup states, and narrow layout remain accessible.

### Task 3: Publish the verified release

**Files:**
- Modify: Git refs and pull-request metadata only

- [ ] **Step 1: Push the integration branch**

Run: `git push -u origin codex/release-agentdeck-focus-v3`.

- [ ] **Step 2: Merge to master without force push**

Run a normal GitHub merge of the release PR, then `git fetch origin` and verify `master` and `origin/master` resolve to the same commit.

- [ ] **Step 3: Retire superseded drafts**

Close PR #1 and PR #2 with comments pointing to the release merge. Keep the V3 source branch for traceability unless GitHub automatically retains it.
