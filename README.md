# AgentDeck Focus

AgentDeck Focus is a local, single-user dashboard for organizing Codex tasks in registered Git repositories. It can create tasks, start or stop Codex runs, stream run activity, and show the repository diff for a completed run.

## Requirements

- A supported Node.js installation with npm.
- Git available on `PATH`; only existing Git working trees can be registered.
- The Codex CLI available on `PATH` and authenticated for real task runs. Verify it before starting the app:

  ```powershell
  codex --version
  codex app-server --help
  ```

## Local setup

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The `.env` file is optional: with no `AGENTDECK_DATA_PATH`, AgentDeck stores its local metadata in `.agentdeck/data.json` and its append-only run events in `.agentdeck/runs/<run-id>.jsonl`. Both locations are ignored by Git.

To place metadata somewhere else, set an absolute file path before starting the development server:

```dotenv
AGENTDECK_DATA_PATH=C:/Users/you/AppData/Local/AgentDeck/data.json
```

## Running Codex tasks

For each task, AgentDeck first starts `codex app-server --stdio` in the registered project directory and performs its JSON-RPC startup handshake. If that startup fails or times out, it records a `codex/app-server-fallback` event and starts the supervised fallback command instead:

```text
codex exec --json <task prompt>
```

The fallback is for app-server startup failures; it is not a replacement for an installed, authenticated Codex CLI. Review task events and the displayed Git diff before accepting any changes.

## V2 isolated worktrees and review

Tasks run in the current workspace by default. A task may instead opt into an **isolated worktree**. This is optional, and is available only for a registered Git project whose path is the Git working-tree root, has a current branch and `HEAD`, and is writable by AgentDeck. Git must support `git worktree`.

For an isolated task, AgentDeck records the current branch and exact baseline SHA, creates `agentdeck/task-<task-id>`, and runs Codex in `<registered-project>/.agentdeck/worktrees/task-<task-id>`. The task detail shows the branch, baseline, changed paths, unified diff, and commits reachable from the task branch but not the baseline. Review is therefore relative to the saved SHA, not whatever `HEAD` becomes later.

Local task metadata, worktree records, and human-input audit entries are stored in `.agentdeck/data.json` by default (or at `AGENTDECK_DATA_PATH` when configured). Append-only run events remain at the app's `.agentdeck/runs/<run-id>.jsonl`; an isolated repository's `.agentdeck/worktrees/` directory contains its task checkout. These locations are local data and are Git-ignored.

### Human input and recovery

Short answer: interactive approval, rejection, and question replies need the live `codex app-server --stdio` connection that issued the request. The `codex exec --json` startup fallback does not provide this continuation channel, and AgentDeck cannot reconnect to an old app-server session after a restart. A question reply must answer exactly the server-issued question fields; each non-empty answer is limited to 4,000 characters. Approval and permission prompts accept only **Approve** or **Reject**.

If the process exits, AgentDeck restarts, or delivery fails, it records the failed pending input and marks the run as failed rather than claiming that the reply was delivered. Isolated tasks become `WORKTREE_FAILED` so their worktree can be inspected, retried, or explicitly cleaned. An interrupted cleanup is reconciled conservatively on the next start: AgentDeck checks the expected managed path and branch, marks it clean only when both are gone, and otherwise records a recovery error.

### Explicit handoff and cleanup

**Mark merge ready** is a review handoff only. AgentDeck never automatically commits, merges, pushes, opens a pull request, or changes remote/cloud/account state. Review the baseline-relative diff and make any commit or integration decision yourself.

**Clean worktree** is also explicit. It is offered only after a terminal/review state (`REVIEW`, `MERGE_READY`, `DONE`, `FAILED`, `CANCELLED`, or `WORKTREE_FAILED`) and refuses a worktree with uncommitted changes. A clean removal deletes only the managed task worktree and its derived `agentdeck/task-<task-id>` branch. If cleanup is partial or fails, AgentDeck preserves a `CLEANUP_FAILED` recovery record instead of silently deleting more state.

## Local security boundaries

This MVP deliberately has a narrow local trust boundary:

- Projects must be existing, absolute paths that resolve to Git working trees. The resolved registered path, rather than a browser-provided working directory, is used for Codex and Git.
- The browser cannot submit arbitrary shell commands or a `cwd`. Git calls use fixed argument lists, and run/stop/retry operations resolve through the saved task and project.
- Run-event records redact common credential-shaped keys and values before they are stored or streamed. Treat task prompts, agent output, and diffs as local project data nevertheless; do not put secrets in them.
- This is a local single-user app, not a sandbox. A Codex task can modify files in the repository you register. Register only repositories you intend to authorize for that task.
- Isolated paths and branches are derived server-side from the registered project and task ID. The browser does not choose a worktree path, baseline SHA, branch, Git arguments, app-server thread identifier, or shell command.
- Cleanup refuses a project root, a persisted path outside the managed `.agentdeck/worktrees/` location, or a branch name that is not the managed task branch.

## Manual acceptance check

1. Run `npm run dev` and open the root page; its browser title is **AgentDeck Focus**.
2. On **Projects**, register a disposable local Git repository using its absolute path.
3. Create a task from that project and start it. Confirm that the task becomes `RUNNING` and activity appears without a page refresh.
4. Stop a running task and confirm it becomes `CANCELLED`; use **Retry task** to create a separate TODO retry.
5. Run a harmless task that changes a tracked file, then inspect the changed-file list and `git diff --no-color` output when the task reaches `REVIEW`.
6. Restart the development server and confirm projects, tasks, runs, and event history remain available from the configured local store.
7. For an isolated Git task, choose **Isolated worktree**, start it, inspect the saved baseline review, mark it merge ready, then verify **Clean worktree** refuses a dirty checkout and succeeds only after you clean it.
8. With a live app-server-controlled run that asks for input, approve/reject or submit the server-issued short answer; restart the app while a request is pending and confirm it is recorded as failed/recoverable rather than delivered.

For the automated version of this flow, run:

```powershell
npm test
npm run lint
npm run build
npx playwright test
```

## Prisma status

`prisma/schema.prisma` and the Prisma packages are retained as a future data-model sketch, but Prisma is not active in the current runtime. No Prisma client is generated, no migration or `prisma db push` workflow is run, and `src/lib/db.ts` exports `null`. The application currently persists through the JSON files described above. `DATABASE_URL` in `.env.example` is reserved for an intentional future Prisma migration and is not read by the running app.
