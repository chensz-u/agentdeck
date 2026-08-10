# AgentDeck Focus V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add isolated task worktrees, auditable human input, baseline review, and safe recovery to AgentDeck Focus.

**Architecture:** Extend the JSON-backed local repository with Worktree and HumanInput records. Server-only services own fixed Git commands and app-server continuation; routes expose typed actions resolved only through task ids. The current dark Next.js interface renders the added state in compact cards.

**Tech Stack:** Next.js, TypeScript, Node.js `child_process.execFile`, local JSON storage, Vitest, Playwright.

---

### Task 1: Extend domain persistence and state transitions

**Files:** `src/lib/domain/types.ts`, `src/lib/domain/task-state.ts`, `src/lib/server/local-repository.ts`, corresponding unit tests.

- [ ] Write failing tests for execution mode, Worktree metadata round-trip, HumanInput audit ordering, and terminal/recoverable V2 transitions.
- [ ] Run focused Vitest and observe missing V2 fields/transitions.
- [ ] Add minimal serializable types, JSON migration defaults, repository methods, restart reconciliation, and state guards.
- [ ] Run focused tests and commit.

### Task 2: Implement WorktreeService

**Files:** `src/lib/services/worktree-service.ts`, `src/lib/services/worktree-service.test.ts`.

- [ ] Write real temporary-Git-fixture tests for Git-only creation, task branch/baseline metadata, isolated path, rollback, dirty cleanup rejection, and clean explicit cleanup.
- [ ] Run focused tests and observe failure.
- [ ] Implement fixed-argument Git verification, `worktree add`, status inspection, and explicit cleanup.
- [ ] Run focused tests and commit.

### Task 3: Implement baseline ReviewService

**Files:** `src/lib/services/review-service.ts`, `src/lib/services/review-service.test.ts`, `src/lib/services/git-service.ts`.

- [ ] Write fixture tests for baseline-relative staged/unstaged/untracked diff and branch-only commit summary.
- [ ] Run focused tests and observe failure.
- [ ] Implement fixed-argument baseline diff, untracked aggregation, and `git log baseline..branch` summary.
- [ ] Run focused tests and commit.

### Task 4: Add app-server human input protocol and service

**Files:** `src/lib/codex/codex-adapter.ts`, `src/lib/codex/app-server-adapter.ts`, `src/lib/services/human-input-service.ts`, tests.

- [ ] Write failing adapter/service tests for normalized confirmation requests, same-thread continuation, idempotent approve/reject/text input, and stop/input ordering.
- [ ] Run focused tests and observe failure.
- [ ] Add adapter continuation/input request interfaces, request correlation, bounded input validation, persisted audit events, and serialized handling.
- [ ] Run focused tests and commit.

### Task 5: Coordinate V2 task/run lifecycle and routes

**Files:** `src/lib/services/run-service.ts`, `src/lib/server/composition.ts`, `src/lib/api/*`, V2 API routes and tests.

- [ ] Write failing tests for isolated run cwd, worktree creation failure, awaiting-input state, mark-ready/done, recovery, and cleanup authorization.
- [ ] Run focused tests and observe failure.
- [ ] Integrate Worktree/HumanInput/Review services through server-side task ids; add typed API endpoints without exposing cwd, Git args, thread ids, or shell input.
- [ ] Run focused tests and commit.

### Task 6: Add project/task V2 UI and Playwright coverage

**Files:** task/project forms and pages, task-detail components, `e2e/worktree-v2.spec.ts`.

- [ ] Write a failing controlled-adapter Playwright flow for isolated task creation, human response, baseline review, stop/retry/restart, and clean/dirty cleanup.
- [ ] Run the targeted E2E test and observe failure.
- [ ] Implement compact execution-mode picker, Worktree/Human Input/Review cards, state-prioritized actions, and disabled non-Git explanation.
- [ ] Run E2E, full unit tests, lint, and build; commit.

### Task 7: Document and release V2

**Files:** `README.md`, `docs/agentdeck-focus-v2-design.md`.

- [ ] Write a failing root/detail smoke assertion if the V2 controls are absent.
- [ ] Implement/update requirements, storage, cleanup, handoff limitation, reference/license, safety, and manual acceptance docs.
- [ ] Run `npm test`, `npm run lint`, `npm run build`, `npx playwright test`, and `git diff --check`; commit and push the verified branch.
