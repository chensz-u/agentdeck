# Codex app-server smoke test

Run on 2026-08-09 in the local development environment using `codex-cli 0.142.0`.

## Availability

`codex app-server --help` exited with status 0. The command is available and reports the experimental `generate-json-schema` subcommand alongside `daemon`, `proxy`, and `generate-ts`.

## Schema generation

The following command exited with status 0:

```powershell
codex app-server generate-json-schema --out <temporary-directory>
```

It generated 267 JSON Schema files in a temporary directory outside this repository. Representative output includes:

- `JSONRPCNotification.json`, describing notification objects with a required string `method` and optional `params`.
- `ServerNotification.json`.
- `v2/ThreadStartedNotification.json`.

The generated schema bundle was intentionally not added to the repository. `src/lib/codex/protocol.ts` keeps the first adapter boundary deliberately small: it accepts object notifications, validates a method, and normalizes it to `{ type, params }`.

## Runtime behavior in this MVP

AgentDeck starts `codex app-server --stdio` from the registered project's stored path and waits up to two seconds for the JSON-RPC initialization, `thread/start`, and `turn/start` handshake. When that startup cannot be established, it emits a `codex/app-server-fallback` event and uses the supervised `codex exec --json <prompt>` adapter instead. The fallback still requires an installed and authenticated `codex` CLI.

This smoke result records CLI availability only. It does not prove that an authenticated account can complete a real task, so follow the manual acceptance flow in the root README before treating a local installation as ready.

## Current persistence note

The Prisma schema and packages remain in the repository, but Prisma is intentionally unused by the running MVP: no client has been generated, no migration/database-push workflow is active, and `src/lib/db.ts` exports `null`. Runtime state currently uses `.agentdeck/data.json` plus `.agentdeck/runs/<run-id>.jsonl` (or the configured `AGENTDECK_DATA_PATH` for the data file). `DATABASE_URL` is therefore only a future-migration placeholder in `.env.example`, not a runtime requirement.
