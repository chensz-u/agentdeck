# AgentDeck Focus V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe, Codex-first multi-agent control surface and persisted read-only local process output while preserving every V2 lifecycle boundary.

**Architecture:** A server-only agent registry resolves strict task agent ids to descriptors and adapters. A generic supervisor owns fixed-vector local child process mechanics while `AppServerAdapter` retains Codex JSON-RPC behavior. Existing redacted JSONL and SSE carry output records to a client-only terminal observer.

**Tech Stack:** Next.js 15, TypeScript, React 19, Zod, Node child_process, Vitest, Playwright.

---

### Task 1: Trusted agent registry and persisted selection

**Files:**
- Create: `src/lib/agents/agent-registry.ts`, `src/lib/agents/agent-registry.test.ts`
- Modify: `src/lib/domain/types.ts`, `src/lib/server/local-repository.ts`, `src/lib/api/task-route-handlers.ts`, related tests

- [ ] Write failing registry/API/repository tests for Codex availability, disabled metadata, strict unavailable-agent rejection, and migration defaults.
- [ ] Run focused tests and confirm missing registry/model behavior fails.
- [ ] Add fixed AgentCapability/AgentDescriptor types, registry, strict `agentId`, persisted task/run snapshots, and Codex defaults.
- [ ] Run focused tests green and commit `feat: add trusted agent registry`.

### Task 2: Supervised local process boundary

**Files:**
- Create: `src/lib/runtime/supervised-process.ts`, `src/lib/runtime/supervised-process.test.ts`
- Modify: `src/lib/codex/app-server-adapter.ts`, `src/lib/codex/exec-fallback-adapter.ts`, protocol/adapter tests

- [ ] Write a child-process fixture test for line-buffered stdout/stderr, PID, close/error result, and idempotent stop.
- [ ] Run focused test and confirm absent supervisor fails.
- [ ] Implement supervisor with server-owned vectors only; refactor Codex implementations to consume it without moving JSON-RPC or human-input handling out of the adapter.
- [ ] Run focused test suite green and commit `feat: supervise local agent processes`.

### Task 3: Output event model and RunService coordination

**Files:**
- Modify: `src/lib/services/run-event-store.ts`, `src/lib/services/run-service.ts`, `src/lib/server/composition.ts`, tests

- [ ] Write failing tests that supervisor output is ordered/redacted JSONL, agent snapshots are emitted, and Codex is resolved server-side.
- [ ] Run focused tests and confirm red state.
- [ ] Persist `process/stdout`, `process/stderr`, `process/system`, and safe `codex/event` records through existing event writer/SSE; preserve V2 stop/restart/review behavior.
- [ ] Run focused tests green and commit `feat: stream supervised agent output`.

### Task 4: Strict API/UI task agent selection and terminal observer

**Files:**
- Create: `src/app/api/agents/route.ts`, `src/components/agent-selector.tsx`, `src/components/run-output-panel.tsx`
- Modify: project/task pages, task detail model, CSS, Playwright tests

- [ ] Write failing UI/API tests for disabled unavailable agents, selected Codex task, output stream, pause-follow, copy control, and narrow layout.
- [ ] Run focused tests and confirm red state.
- [ ] Add server-resolved agent listing/selection, project availability summary, task agent context, and warm-white read-only terminal panel using EventSource.
- [ ] Perform browser screenshot inspection, iterate once based on findings, run focused tests green, and commit `feat: add V3 agent output console`.

### Task 5: Documentation and release verification

**Files:**
- Modify: `README.md`, `docs/agentdeck-focus-v3-design.md`, Playwright coverage as needed

- [ ] Document real support (Codex only), unavailable placeholders, JSONL location/redaction, no PTY/custom command boundary, and restart semantics.
- [ ] Run `npm test`, `npm run lint`, `npm run build`, `npx playwright test`, `git diff --check`.
- [ ] Commit docs, push `codex/agentdeck-focus-v3`, open/update the draft PR, and report exact evidence.
