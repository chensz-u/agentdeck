# AgentDeck Focus V2 Design

## Goal

Add optional per-task Git worktrees, app-server-mediated human input, and baseline-based review preparation without changing V1's local-first, single-agent boundary or automating commits, merges, pushes, pull requests, accounts, or cloud state.

## Research and license boundary

- [OpenAI Codex app-server](https://github.com/openai/codex/tree/main/codex-rs/app-server) (Apache-2.0): use its documented connection → thread → turn lifecycle, versionless JSON-RPC notification handling, `turn/interrupt`, and request/response correlation. The implementation will not copy source files.
- [Conductor OSS](https://github.com/charannyk06/conductor-oss) (Apache-2.0): borrow the information hierarchy of workspace, session, terminal activity, and diff; do not adopt its remote relay, preview, or multi-workspace facilities.
- [cdesktop](https://github.com/cdesktop-ai/cdesktop) (Apache-2.0): borrow optional-worktree and session/detail-panel separation; do not adopt its multi-provider or interactive terminal product scope.
- [Cline Kanban](https://github.com/cline/kanban) (Apache-2.0): borrow task-scoped isolation and explicit post-review handling; do not adopt automatic commit, merge, PR, dependency orchestration, or cleanup.

No third-party source file or substantial code fragment is copied. These licenses are recorded because the work uses architectural inspiration only; no attribution notice is required in the runtime UI.

## Persistent model

`Task` gains `executionMode` (`CURRENT_WORKSPACE` or `ISOLATED_WORKTREE`), `worktreeId`, and expanded state. `AgentRun` gains `threadId`, `turnId`, and a resumable input state. `Worktree` records its task and project ids, absolute validated worktree path, task branch, baseline branch and SHA, creation time, status, error, and cleanup time. `HumanInput` records a run id, monotonically ordered action (`REQUEST`, `APPROVE`, `REJECT`, `TEXT`), redacted payload, timestamp, and request id for idempotency.

Task states add `CREATING_WORKTREE`, `AWAITING_INPUT`, `MERGE_READY`, `CLEANED`, and `WORKTREE_FAILED`. A run stopped, failed, or lost to restart cannot remain `RUNNING`; a task awaiting user input stays awaiting input until a single reply or stop wins the serialized transition.

## Server services

- `WorktreeService` verifies the stored project is Git-enabled, resolves only its registered root, gets a baseline SHA, makes an AgentDeck branch, creates an external worktree under `.agentdeck/worktrees/<task-id>`, and rolls back branch/directory creation on failure. Cleanup is explicit, requires a terminal/review task state, and refuses a dirty worktree.
- `HumanInputService` validates bounded text and action schemas, de-duplicates by request id, appends auditable events, then calls the existing Codex adapter continuation method. It never accepts a browser-supplied thread, turn, path, or command.
- `ReviewService` uses the persisted worktree and baseline SHA to request changed paths, unified diff, and `git log <baseline>..HEAD --oneline`. For current-workspace tasks it preserves V1 review behavior.
- `RunService` coordinates these services but does not assemble Git arguments. It selects the execution cwd from stored task/worktree state, persists thread/turn ids supplied by the adapter, and serializes stop/reply/final notification state transitions.

## Codex adapter

The adapter owns JSON-RPC state only: initialization, `thread/start` with server-selected cwd, `turn/start`, event normalization, request correlation, `turn/interrupt`, and continuation. When app-server emits an approval/question event, it exposes a normalized input request and keeps the live connection keyed by run id. A user response is sent to the same thread as a new turn or steering request only when the adapter reports it is accepted. If the process is unavailable after restart, the repository records failure/recovery guidance instead of pretending the thread remains connected.

## UI and review

The project task form offers both execution modes. The isolated choice is disabled with an explanation when the registered project is not Git-enabled. Task detail has compact Worktree, Human Input, and Review cards alongside activity: paths/branch/baseline, an input request with Approve/Reject/text controls, and baseline diff/change/commit summary. “Mark merge ready”, “mark done”, and “clean worktree” are explicit actions. Cleanup never runs automatically.

## Safety and verification

Every Git call uses `execFile` and fixed arguments. Browser requests contain ids and typed user input only; server composition resolves all project/worktree paths, branches, baseline SHAs, and app-server identifiers. Tests use temporary Git repositories for creation, branch isolation, baseline review, dirty-cleanup rejection, and NUL paths; controlled adapters cover human input/stop races/restarts. Playwright covers the V2 acceptance flow without starting a real Codex process.
