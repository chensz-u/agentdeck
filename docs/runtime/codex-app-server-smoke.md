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
