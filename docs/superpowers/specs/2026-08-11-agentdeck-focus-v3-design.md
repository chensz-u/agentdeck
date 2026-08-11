# AgentDeck Focus V3 Design

## Baseline and goal

V3 starts from `feature/agentdeck-focus-v2`, not `master`: V2 owns the persisted Worktree, baseline-review, human-input, cleanup, and restart-recovery behavior. V3 adds a restricted multi-agent selection model and dependable read-only process observation without changing those safety boundaries.

## Agent model

`AgentAdapter` is a server-owned registry entry with a stable id, display metadata, capability set, availability result, and launch/stop boundary. Codex is the only enabled adapter. Claude Code, OpenCode, Cline, and Custom CLI are metadata-only disabled entries; no executable lookup, installation, launch, command template, cwd, environment, or Git arguments can originate from the browser.

Task creation accepts only a strict `agentId` enum. The server resolves it from the registry, rejects unavailable entries, and persists the selected id. Each run snapshots the selected agent id, version/availability description, start/end timestamps, PID, exit result, and error. Existing data migrates to Codex.

## Process and event model

`SupervisedProcess` owns safe child-process lifecycle mechanics only: a server-created executable/argument vector, server-resolved cwd, PID, line-buffered stdout/stderr callbacks, close/error handling, and idempotent stop. Adapters supply the fixed process spec and retain protocol behavior. In particular, `CodexAdapter` retains app-server JSON-RPC initialization, thread/turn state, human confirmation responses, and interrupt.

The supervisor translates output into redacted, ordered JSONL events through the existing `RunEventStore`; its existing SSE route replays and streams the same sequence. No WebSocket or PTY is introduced. Event payloads never contain environment dumps or a client-selected command.

## Console experience

Project workspaces show a compact Agent availability strip and task agent column. The task page gains a read-only run-output panel alongside human input, Worktree, activity, and review. It distinguishes stdout, stderr, system and Codex records, follows the newest line by default, lets the user pause follow and copy visible output, and remains readable at narrow widths.

The visual tokens move to the established warm-white developer-tool treatment: paper-like canvas, warm neutral panels, restrained blue/teal status accents, clear monospace output, low-radius borders, no marketing hero or chat layout.

## Safety, failure, and recovery

Stopping and process errors remain coordinated by `RunService`; no adapter may mutate tasks directly. On restart, the existing local repository marks active processes unrecoverable rather than pretending to reattach. Output persists as redacted JSONL and remains inspectable. V3 does not add cloud state, interactive terminals, arbitrary Custom CLI, automatic Git handoff, or execution for non-Codex agents.

## Validation

TDD covers registry availability and rejection, persisted agent snapshots/migration, supervised stdout/stderr/stop handling, event ordering/redaction, RunService adapter selection, and API strictness. Playwright covers disabled adapters, running-output visibility/pause, Worktree review, human input, failure/cleanup, and narrow-screen layout. Full checks remain `npm test`, `npm run lint`, `npm run build`, and `npx playwright test`.
