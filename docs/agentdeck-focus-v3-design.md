# AgentDeck Focus V3: 多 Agent 控制台与只读运行观察

V3 extends the V2 local task console without changing its Worktree, human-input, baseline-review, cleanup, or restart-recovery contracts. It introduces only the smallest useful abstraction for selecting a trusted local Agent and observing its run.

## Supported Agents

| Agent | Status | Scope |
| --- | --- | --- |
| Codex | Available when `codex --version` succeeds | Real `app-server` lifecycle, human input, interrupt, Worktree execution, read-only output |
| Claude Code | Unavailable placeholder | Metadata only; never downloaded or launched |
| OpenCode | Unavailable placeholder | Metadata only; never downloaded or launched |
| Cline | Unavailable placeholder | Metadata only; never downloaded or launched |
| Custom CLI | Unavailable placeholder | No browser-supplied command templates, cwd, environment, or arguments |

The `AgentRegistry` is server-owned. Task creation submits only an Agent ID from the strict allow-list; the server rejects unavailable entries. A run snapshots the selected Agent ID, verified version, availability, PID, start/end times, exit result, and error state in local metadata.

## Runtime boundary

`SupervisedProcess` owns fixed command-vector process launch, PID capture, line-oriented stdout/stderr collection, completion, and idempotent stop. It does not implement Git policy or app-server protocol.

`CodexAdapter` retains the Codex-specific responsibilities: JSON-RPC initialization, thread/turn lifecycle, server notifications, human confirmation delivery, and interrupt. `RunService` only coordinates already-validated task/project state, Worktree selection, review completion, and event persistence. No browser route accepts a command, cwd, environment variable, Git argument, path, branch, thread ID, or turn ID.

## Output and interface

Run output is stored in the existing append-only `.agentdeck/runs/<run-id>.jsonl` files and delivered over the existing SSE endpoint. The task view distinguishes system events, Codex events, standard output, and error output in a read-only terminal panel. It can follow new output, pause following, and copy the captured content. V3 deliberately does not add WebSocket transport, an interactive PTY, a shell prompt, or command composition.

The UI uses a warm white developer-tool palette: graphite text, parchment surfaces, thin neutral dividers, compact spacing, low-radius containers, monospaced paths and versions, and stable status colors. Project pages expose Agent availability and task-level Agent choice; details place status/actions, human handoff, output, Worktree metadata, and baseline review in a dense working layout.

## Data and recovery

The default local store remains `.agentdeck/data.json`; run events remain `.agentdeck/runs/<run-id>.jsonl`; managed task worktrees remain `<project>/.agentdeck/worktrees/`. These locations stay local and Git-ignored. Restart recovery does not resurrect processes. It preserves the V2 rule: failed/incomplete runs and pending human input become explicit recoverable states, never silently-running work.

## Deliberately not included

V3 does not add cloud sync, accounts, multi-user coordination, Agent installation, actual Claude/OpenCode/Cline execution, cost/token analytics, interactive terminal access, automatic commit/merge/push/PR, or arbitrary local command execution.
