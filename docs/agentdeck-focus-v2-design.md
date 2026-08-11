# AgentDeck Focus V2 Design

V2 adds optional per-task Git worktrees, baseline-relative review, and auditable app-server human input while retaining AgentDeck Focus as a local, single-user control surface. It does not automate source-control handoff.

## Operating model

Each task chooses one mode:

- **Current workspace** (default): preserves the V1 behavior and runs in the registered project root.
- **Isolated worktree** (optional): requires a registered Git working-tree root with a current branch and `HEAD`, Git worktree support, and write access. AgentDeck creates the task checkout at `<project>/.agentdeck/worktrees/task-<task-id>` on the derived `agentdeck/task-<task-id>` branch.

Before creation, AgentDeck persists the registered project, task, baseline branch, and exact baseline SHA. Review reports changed paths, unified diff, and commits from that saved baseline to the task branch. This protects the review frame from later movement of the main checkout's `HEAD`.

The app's local database is `.agentdeck/data.json` by default, configurable through the absolute `AGENTDECK_DATA_PATH`. It includes task, run, worktree, baseline, and human-input audit records. Run events use `.agentdeck/runs/<run-id>.jsonl`. A project selected for isolation owns the separate `.agentdeck/worktrees/` directory. All are local, Git-ignored data.

## Human input, recovery, and cleanup

Human input is intentionally narrow. Confirmation and permission requests accept only an approval or rejection. Question requests accept only values for the question IDs supplied by app-server; answers must be non-empty and no longer than 4,000 characters. The browser cannot provide app-server thread/turn identifiers or arbitrary protocol data.

Short answer: a reply works only while AgentDeck still owns the live `codex app-server --stdio` connection that raised the request. The JSON fallback (`codex exec --json`) cannot resume interactive input, and an app restart cannot reconnect to a prior session. If delivery fails or the process/app stops, the pending audit entry is marked failed and recoverable; it is never represented as delivered. Restart reconciliation fails in-flight runs, marks isolated tasks `WORKTREE_FAILED`, and preserves their worktree for inspection or explicit cleanup.

Cleanup is never automatic. The user must invoke it after `REVIEW`, `MERGE_READY`, `DONE`, `FAILED`, `CANCELLED`, or `WORKTREE_FAILED`; AgentDeck first refuses a dirty checkout. It removes only the validated managed path and derived task branch. An interrupted cleanup is checked on restart: both absent means cleaned, both present means ready to retry, and any mismatch becomes a recorded recovery failure.

## Safety and handoff boundaries

Server-side services resolve every task through its saved project and derive all paths, branches, baseline SHAs, and Git argument lists. Git is invoked with fixed argument vectors. The system rejects a project root or an out-of-scope/tampered worktree record during cleanup. Prompts, agent output, diffs, and local audit data remain sensitive project data; credential-like event values are redacted, but users should not put secrets in prompts.

`Mark merge ready` is only an explicit review handoff. V2 does not automatically commit, merge, push, create pull requests, contact remotes, manage accounts, or change cloud state. The user remains responsible for reviewing the baseline diff and choosing any integration action.

## Reference and license boundary

The following projects informed the architecture. No third-party source file or substantial code fragment is copied; the notes describe what was borrowed conceptually and what was deliberately not adopted.

| Project | License | Borrowed | Not adopted |
| --- | --- | --- | --- |
| [OpenAI Codex app-server](https://github.com/openai/codex/tree/main/codex-rs/app-server) | [Apache-2.0](https://github.com/openai/codex/blob/main/LICENSE) | Connection, thread/turn lifecycle, JSON-RPC event/request correlation, interrupt model | Copied implementation or browser-supplied protocol control |
| [Conductor OSS](https://github.com/charannyk06/conductor-oss) | [Apache-2.0](https://github.com/charannyk06/conductor-oss/blob/main/LICENSE) | Workspace/session/terminal/diff information hierarchy | Remote relay, previews, multi-workspace operation |
| [cdesktop](https://github.com/cdesktop-ai/cdesktop) | [Apache-2.0](https://github.com/cdesktop-ai/cdesktop/blob/main/LICENSE) | Optional worktree and session/detail-panel separation | Multi-provider scope and interactive-terminal product surface |
| [Cline Kanban](https://github.com/cline/kanban) | [Apache-2.0](https://github.com/cline/kanban/blob/main/LICENSE) | Task-scoped isolation and explicit post-review handling | Automatic commits, merges, pull requests, dependency orchestration, and automatic cleanup |

These references are architectural inspiration, not vendored code. Their licenses are recorded to make the boundary reviewable.
