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

## Local security boundaries

This MVP deliberately has a narrow local trust boundary:

- Projects must be existing, absolute paths that resolve to Git working trees. The resolved registered path, rather than a browser-provided working directory, is used for Codex and Git.
- The browser cannot submit arbitrary shell commands or a `cwd`. Git calls use fixed argument lists, and run/stop/retry operations resolve through the saved task and project.
- Run-event records redact common credential-shaped keys and values before they are stored or streamed. Treat task prompts, agent output, and diffs as local project data nevertheless; do not put secrets in them.
- This is a local single-user app, not a sandbox. A Codex task can modify files in the repository you register. Register only repositories you intend to authorize for that task.

## Manual acceptance check

1. Run `npm run dev` and open the root page; its browser title is **AgentDeck Focus**.
2. On **Projects**, register a disposable local Git repository using its absolute path.
3. Create a task from that project and start it. Confirm that the task becomes `RUNNING` and activity appears without a page refresh.
4. Stop a running task and confirm it becomes `CANCELLED`; use **Retry task** to create a separate TODO retry.
5. Run a harmless task that changes a tracked file, then inspect the changed-file list and `git diff --no-color` output when the task reaches `REVIEW`.
6. Restart the development server and confirm projects, tasks, runs, and event history remain available from the configured local store.

For the automated version of this flow, run:

```powershell
npm test
npm run lint
npm run build
npx playwright test
```

## Prisma status

`prisma/schema.prisma` and the Prisma packages are retained as a future data-model sketch, but Prisma is not active in the current runtime. No Prisma client is generated, no migration or `prisma db push` workflow is run, and `src/lib/db.ts` exports `null`. The application currently persists through the JSON files described above. `DATABASE_URL` in `.env.example` is reserved for an intentional future Prisma migration and is not read by the running app.
