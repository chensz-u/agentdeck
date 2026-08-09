# AgentDeck Focus MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a local Next.js dashboard that registers Git projects, supervises Codex task runs, streams activity, and reviews Git changes.

**Architecture:** A Next.js App Router application exposes typed local route handlers backed by Prisma/SQLite. Server-only services enforce project-path authorization, launch a Codex adapter, append redacted JSONL events, and publish run events over SSE. Client pages read and mutate data through those handlers.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, Prisma, SQLite, Zod, Vitest, Playwright, Node.js child processes.

---

### Task 1: Initialize the application and prove the Codex runtime

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `src/lib/codex/protocol.ts`, `src/lib/codex/protocol.test.ts`
- Create: `docs/runtime/codex-app-server-smoke.md`

- [ ] Write a failing test that accepts a JSON-RPC notification and rejects a non-object input.
- [ ] Run `npm test -- src/lib/codex/protocol.test.ts` and confirm the module-missing failure.
- [ ] Scaffold the Next.js app, define the normalised event type/parser, and record `codex app-server --help` plus generated-schema output in the runtime note.
- [ ] Re-run the targeted test and `npm run build`; both must exit 0.

### Task 2: Add a tested SQLite domain model

**Files:**
- Create: `prisma/schema.prisma`, `src/lib/db.ts`
- Create: `src/lib/domain/types.ts`, `src/lib/domain/task-state.ts`, `src/lib/domain/task-state.test.ts`
- Create: `src/lib/services/task-service.ts`, `src/lib/services/task-service.test.ts`

- [ ] Write failing tests for legal transitions (`TODO -> RUNNING`, `RUNNING -> REVIEW`, `RUNNING -> FAILED`, `RUNNING -> CANCELLED`, `REVIEW -> DONE`) and retry provenance.
- [ ] Run the targeted Vitest command and confirm the expected missing-module failure.
- [ ] Define Prisma models for Project, Task, AgentRun, and their indexes; implement the smallest transition/retry service that passes the tests.
- [ ] Run `npx prisma generate`, `npx prisma db push`, and the targeted test successfully.

### Task 3: Secure project registration and Git review services

**Files:**
- Create: `src/lib/services/project-service.ts`, `src/lib/services/project-service.test.ts`
- Create: `src/lib/services/git-service.ts`, `src/lib/services/git-service.test.ts`
- Create: `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`

- [ ] Write failing tests using a temporary Git fixture for nonexistent/relative path rejection, valid absolute repository registration, changed-file collection, and no-color diff retrieval.
- [ ] Run the targeted tests and confirm failing assertions before implementation.
- [ ] Implement path canonicalization, Git repository detection, fixed-argument Git execution, and project routes validated with Zod.
- [ ] Re-run the service tests successfully; verify requests cannot submit a cwd or shell command.

### Task 4: Persist and broadcast redacted run events

**Files:**
- Create: `src/lib/services/run-event-store.ts`, `src/lib/services/run-event-store.test.ts`
- Create: `src/lib/services/run-event-bus.ts`
- Create: `src/app/api/runs/[id]/events/route.ts`

- [ ] Write failing tests that redact bearer/token-like values, append ordered JSONL records, and replay persisted events.
- [ ] Run the event-store test and confirm it fails because the store does not exist.
- [ ] Implement redaction, atomic append-directory creation, replay, in-memory subscription, and a read-only SSE route with `text/event-stream` framing.
- [ ] Run the event-store test successfully and smoke-test the SSE endpoint with a seeded run.

### Task 5: Implement the supervised Codex adapter and run lifecycle

**Files:**
- Create: `src/lib/codex/codex-adapter.ts`, `src/lib/codex/app-server-adapter.ts`, `src/lib/codex/exec-fallback-adapter.ts`
- Create: `src/lib/services/run-service.ts`, `src/lib/services/run-service.test.ts`
- Create: `src/app/api/tasks/[id]/run/route.ts`, `src/app/api/tasks/[id]/stop/route.ts`, `src/app/api/tasks/[id]/retry/route.ts`

- [ ] Write failing lifecycle tests with an injected fake adapter for launch, structured event persistence, successful exit to `REVIEW`, failure to `FAILED`, and cancellation to `CANCELLED`.
- [ ] Run the lifecycle test and confirm it fails before implementation.
- [ ] Implement an adapter interface, JSON-RPC stdio process management, bounded startup fallback to `codex exec --json`, PID storage, stop, error capture, diff collection on success, and action routes.
- [ ] Run lifecycle tests successfully; manually invoke a harmless real Codex task in a temporary registered Git fixture.

### Task 6: Build project and task APIs

**Files:**
- Create: `src/app/api/tasks/route.ts`, `src/app/api/tasks/[id]/route.ts`, `src/app/api/dashboard/route.ts`
- Modify: `src/lib/services/task-service.ts`
- Create: `src/app/api/tasks/route.test.ts`

- [ ] Write failing route tests for project-scoped task creation, task fetch, invalid payload rejection, and dashboard status counts.
- [ ] Run the route test and confirm it fails before creating handlers.
- [ ] Add Zod schemas and route handlers that return only the requested serialized domain data.
- [ ] Re-run the route test successfully.

### Task 7: Create the dashboard and project workspace UI

**Files:**
- Create: `src/components/status-badge.tsx`, `src/components/task-list.tsx`, `src/components/project-form.tsx`, `src/components/task-form.tsx`
- Create: `src/app/projects/page.tsx`, `src/app/projects/[id]/page.tsx`
- Modify: `src/app/page.tsx`, `src/app/globals.css`
- Create: `e2e/projects.spec.ts`

- [ ] Write a failing Playwright test that registers a fixture repository and creates a TODO task from its project page.
- [ ] Run `npx playwright test e2e/projects.spec.ts` and confirm the missing-page failure.
- [ ] Implement a dark, compact dashboard, registration form, project task list, status filter, and task creation form using the local APIs.
- [ ] Re-run the Playwright scenario successfully.

### Task 8: Create real-time task detail and review UI

**Files:**
- Create: `src/components/event-feed.tsx`, `src/components/diff-viewer.tsx`, `src/components/task-actions.tsx`
- Create: `src/app/tasks/[id]/page.tsx`, `src/app/tasks/[id]/task-detail-client.tsx`
- Create: `e2e/task-run.spec.ts`

- [ ] Write a failing Playwright test that starts a stub-backed task, observes its activity/status without refresh, stops or retries it, and sees changed files plus diff.
- [ ] Run `npx playwright test e2e/task-run.spec.ts` and confirm it fails before the detail UI exists.
- [ ] Implement EventSource subscription with replay, activity feed, status-aware actions, retry navigation, changed-file list, and escaped unified diff rendering.
- [ ] Re-run the end-to-end scenario successfully.

### Task 9: Final quality and delivery documentation

**Files:**
- Create: `README.md`, `.env.example`
- Modify: `docs/runtime/codex-app-server-smoke.md`

- [ ] Write a failing smoke assertion that the app's root page identifies AgentDeck Focus.
- [ ] Run the smoke test and confirm it fails if the title is absent.
- [ ] Document setup, database location, `codex` prerequisite, adapter fallback, security constraints, and manual acceptance flow; add the title assertion.
- [ ] Run `npm test`, `npx playwright test`, `npm run lint`, and `npm run build` successfully; capture any unavailable browser prerequisite precisely.
