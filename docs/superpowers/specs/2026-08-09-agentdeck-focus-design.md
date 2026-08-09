# AgentDeck Focus Design

## Scope

Build the product-brief MVP: a local, single-user dashboard for registered Git projects and Codex tasks. The app has one supported agent, Codex. It stores project/task/run metadata locally, streams read-only run activity to the browser, and shows the project diff after a run ends.

## Chosen approach

Use one Next.js App Router application with TypeScript. Route handlers form the local API; a small server-side domain layer owns persistence, project authorization, Git access, process supervision, event storage, and SSE fan-out. Prisma/SQLite stores queryable metadata; one JSONL file per run stores the append-only event audit trail.

The Codex integration starts with an adapter boundary. The primary adapter launches `codex app-server --stdio`, parses JSON-RPC notifications, and translates recognised messages into internal run events. A short-lived, supervised `codex exec --json` fallback is selected only when app-server initialization cannot be established. Neither adapter accepts a browser-supplied command or working directory.

## Product structure

- `/` shows counts for running, failed, and review-needed tasks plus recent tasks.
- `/projects` registers absolute local project paths after server-side validation and lists them.
- `/projects/[id]` lists a project's tasks, filters them by status, and creates tasks.
- `/tasks/[id]` shows task/run metadata, event feed, stop and retry actions, changed files, and unified Git diff.

The interface is dark, compact, keyboard-legible, and status-first. Task creation is a form, not a chat transcript.

## Data and state

`Project` owns an approved absolute path and Git capability flag. `Task` owns user intent, current status, and optional parent task for retry provenance. `AgentRun` is one execution attempt and records agent, PID, exit code, error, timestamps, and a JSONL log path. Internal `RunEvent` objects have a monotonic sequence number, ISO timestamp, type, and redacted payload.

Allowed task transitions are `TODO -> RUNNING`, `RUNNING -> REVIEW | FAILED | CANCELLED`, and `REVIEW -> DONE`. Retry creates a new `TODO` task with the original prompt and `parentTaskId`; it never overwrites a prior run.

## Server boundaries

- `ProjectService` validates registration and resolves every operation through `taskId -> projectId -> Project.path`.
- `TaskService` applies state transitions and creates retry tasks.
- `RunService` orchestrates process execution, persistence, event append, broadcast, and final state.
- `CodexAdapter` provides `start`, `stop`, and normalized event callbacks without database knowledge.
- `GitService` calls fixed Git arguments only and returns changed paths plus `git diff --no-color`.
- `RunEventStore` redacts secret-shaped values before append/display.
- The SSE route is read-only and subscribes to one persisted run identifier.

## Safety and failure behavior

All mutating routes validate request shapes and use registered project IDs. Paths are checked with `realpath`, must exist, and must be absolute. Git commands receive only the validated project path and fixed argument vectors. Stop uses the stored PID/process handle; a stopped process is always `CANCELLED`. Startup, JSON parsing, process, Git, and persistence errors become readable run error events and `FAILED` task state.

## Verification strategy

Unit tests cover validation, state transitions, redaction, event persistence, Git output parsing, and JSON-RPC normalization. Route tests cover rejection of unregistered paths and task actions. A Playwright smoke flow registers a fixture Git repository, creates a task, runs a stub adapter, observes SSE activity, stops/retries, and opens diff review. A manual Phase 0 command proves this machine exposes `codex app-server` and generated protocol artifacts.
