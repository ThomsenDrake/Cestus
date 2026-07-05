# Durable Local PRR Runtime Design

Date: 2026-07-05

## Purpose

This design covers the next Cestus development slice: a durable local app/runtime bridge for the ledger-backed Public Records Request workspace.

The Requests workspace now renders backend-derived DTOs, and `packages/prr/src/runtime.ts` can load PRR workspace state, seed ledgers explicitly, create draft request events, and replay from `SQLiteEventLedger`. The remaining product gap is that the browser still defaults to an in-process local replay adapter seeded in memory. That is useful for tests and preview, but it does not prove the application can create a draft, restart the app/runtime, and see the draft again from a durable ledger.

This slice should add a small local HTTP host that owns the SQLite-backed PRR runtime and exposes an HTTP-shaped Requests adapter boundary to the browser. The goal is not to build a full desktop shell or team server. The goal is to make the solo-laptop product path durable while keeping a clean path to packaged desktop and team-server deployments.

## Approved Direction

The approved approach is **Small Local HTTP Host With Embedded PRR Runtime**.

A Node local HTTP host should construct `SQLiteEventLedger`, create the existing PRR runtime with `createPrrRuntime`, and expose JSON routes for loading the Requests workspace and creating draft requests. The React app should talk to this host through a browser-safe HTTP implementation of the existing `RequestsWorkspaceAdapter`.

The local replay adapter remains available for focused tests and browser-safe previews, but it is no longer the default product path for the Requests route. The product path should be:

1. Browser adapter calls local HTTP route.
2. HTTP route calls `PrrRuntime`.
3. `PrrRuntime` appends to or reads from `SQLiteEventLedger`.
4. Workspace DTOs are rebuilt from replayed ledger events.
5. Browser receives serializable DTO/result JSON.

The first launch default is an empty repo-local SQLite ledger. Golden PRR workspace seed events are never appended automatically. Seed data requires an explicit dev/test action.

## Goals

- Add a durable local runtime boundary for Requests using a small Node HTTP host.
- Use `SQLiteEventLedger` and `createPrrRuntime` for the product data path.
- Keep browser UI code free of `SQLiteEventLedger`, `node:sqlite`, PRR runtime modules, Node built-ins, and direct file-system access.
- Preserve the existing `RequestsWorkspaceAdapter` interface shape and add an HTTP implementation.
- Prove create draft through HTTP, restart or recreate runtime against the same SQLite database, and reload the draft from replayed events.
- Start with an empty ledger by default.
- Provide explicit dev/test seeding through CLI and a dev-only HTTP endpoint.
- Keep HTTP contracts serializable so a future team server or desktop IPC adapter can satisfy the same UI boundary.
- Preserve append-only ledger semantics, event validation, causation, provenance, projection rebuildability, send gates, and legal escalation locks.
- Keep tailnet and LAN exposure configurable without making the safe loopback default weaker.

## Non-Goals

- No Electron, Tauri, native packaging, auto-update, tray app, installer, or desktop permission model.
- No Postgres, team administration, multi-user conflict resolution, shared inbox routing, or collaboration permissions.
- No live Gmail, IMAP/SMTP, OAuth, credentials, mailbox sync, autonomous sending, or autonomous follow-up.
- No autonomous legal escalation or new legal escalation event semantics.
- No destructive reset endpoint, ledger deletion endpoint, migration system, or storage rewrite.
- No in-app onboarding UI. Onboarding support in this slice is config, environment variables, and CLI only.
- No new PRR event types unless implementation uncovers a concrete schema conflict that requires a separate design amendment.

## Current Context

`packages/prr/src/runtime.ts` already exposes a ledger-injected runtime with:

- `loadWorkspace()`
- `seedIfEmpty(events)`
- `createDraftRequest(input)`
- `readEvents()`

Runtime tests already cover in-memory load, SQLite reopen, explicit idempotent seed, draft creation, causation links, partial failure after request creation, unsupported jurisdiction packs, validation failures, secret-safe diagnostics, and seed causation rewriting.

`packages/ui/src/requests/request-adapter.ts` currently defines the browser-facing Requests adapter and includes a `localReplayRequestsAdapter` that stores events in an in-memory array. `App.tsx` defaults to that local replay adapter. This means a browser-created draft is replayable inside the running page, but not durable across app/runtime restart.

`packages/ui/test/request-data-boundary.test.ts` already prevents product UI files from importing Node-only runtime modules, `SQLiteEventLedger`, `node:*` modules, and local card fixtures. The durable bridge should strengthen this boundary rather than bypass it.

## Architecture

The slice should add a new local runtime package or module that owns host concerns. The preferred location is `packages/local-runtime` because it describes the deployment role without implying a full packaged desktop app.

Layer responsibilities:

1. **Ontology ledger:** `SQLiteEventLedger` remains the durable solo-laptop event store.
2. **PRR runtime:** `createPrrRuntime` remains ledger-injected and storage-agnostic.
3. **Local runtime host:** constructs SQLite-backed runtime, resolves config, handles HTTP, applies auth policy, and exposes dev-only seed actions.
4. **UI HTTP adapter:** implements `RequestsWorkspaceAdapter` with `fetch` calls and serializable DTO/result handling.
5. **React app:** renders Requests from adapter-provided DTOs and submits draft input through the adapter.

The host should expose the minimum useful route set:

- `GET /api/health`
- `GET /api/requests/workspace`
- `POST /api/requests/drafts`
- `POST /api/dev/seed-prr`

`GET /api/health` returns safe runtime readiness and configuration diagnostics such as storage mode, bind mode, auth-required status, and whether dev endpoints are enabled. It must not expose secrets or absolute paths unless explicitly needed for local debugging and safe under the auth policy.

`GET /api/requests/workspace` calls `runtime.loadWorkspace()` and returns `PrrWorkspaceDto`.

`POST /api/requests/drafts` accepts the existing serializable draft input shape used by the UI adapter, calls `runtime.createDraftRequest(input)`, and returns a serializable result. On success, it includes committed event IDs, the new request ID when available, and the rebuilt workspace. On failure, it includes `failedStep`, committed event IDs, a safe diagnostic, and the rebuilt workspace.

`POST /api/dev/seed-prr` is disabled unless dev seed support is explicitly configured. When enabled, it calls `runtime.seedIfEmpty(prrWorkspaceSeedEvents)` and returns the seed result plus a rebuilt workspace. It must be idempotent and must not overwrite existing events.

## Local Storage

The default storage target for this slice is repo-local ignored state, such as:

```text
.cestus/local/prr-ledger.sqlite
```

The exact file name can be chosen during implementation, but the path should live under an ignored `.cestus/local/` directory and should be resolved through a small config module rather than hard-coded across routes or tests.

The config module should support a storage strategy value:

- `repo-local`: default for this slice.
- `explicit-path`: path supplied by env or CLI.
- `app-data`: reserved strategy for packaged desktop builds.

The `app-data` strategy should be represented in the config contract now so future desktop packaging does not require changing PRR runtime semantics. It does not need to create a complete packaged-app storage implementation in this slice.

No storage resolver may delete, truncate, compact, or rewrite the ledger. If a storage path cannot be created or opened safely, the host should fail closed with a diagnostic rather than falling back to an unexpected path.

## Configuration And Onboarding

Onboarding support in this slice is config, environment variables, and CLI commands only. There is no in-app onboarding screen.

Configuration should cover:

- SQLite storage strategy and path.
- HTTP host and port.
- Bind mode: loopback, tailnet, or LAN.
- Whether dev seed endpoints are enabled.
- Whether auth is required.
- Location of generated local auth secret or session material.

Loopback is the safe default. Tailnet or LAN exposure must be explicitly configured by environment variables, config file, or CLI.

CLI support should include at least:

- Start the local runtime host.
- Seed the local PRR ledger explicitly.
- Print safe config/health diagnostics.

The CLI should make tailnet/LAN setup low-friction by generating any needed local auth secret and writing config in a deterministic local location. The user should not need to hand-copy a bearer token for ordinary local use after onboarding config is created.

## Binding And Auth Policy

The binding policy is a hard invariant:

- Loopback-only bind can be unauthenticated in local development.
- Any non-loopback bind requires auth.
- Tailnet and LAN exposure are explicit opt-ins.
- Dev endpoints are never enabled by exposure alone; they require separate explicit dev configuration.

Auth should be simple and local for this slice. A generated local secret or session token is enough. The server must not accept unauthenticated writes when bound beyond loopback. The browser adapter may receive auth through config injected at page load, a same-origin session endpoint, or another low-friction local mechanism chosen during implementation planning.

The design does not require user accounts, password login, OAuth, remote identity, or team permissions. It only requires that write-capable local runtime routes are not silently exposed on tailnet/LAN without auth.

## UI Adapter Boundary

`packages/ui/src/requests/request-adapter.ts` should keep browser-safe static and local replay helpers for tests. It should add an HTTP adapter shaped like:

```ts
createHttpRequestsAdapter({
  baseUrl,
  authToken
})
```

The implementation details can vary, but the adapter should satisfy the existing `RequestsWorkspaceAdapter` contract:

- `loadRequestsWorkspace(): Promise<PrrWorkspaceDto>`
- `createDraftRequest(input): Promise<RequestsCreateDraftResult>`

The adapter should convert HTTP and JSON errors into safe UI diagnostics. It should not import `packages/prr/src/runtime.ts`, `SQLiteEventLedger`, `node:*` modules, or server-only config modules.

`App.tsx` should default to the HTTP adapter for normal product use. Tests should still be able to inject `createStaticRequestsAdapter` or local replay adapters. The loading copy should no longer describe in-browser seed replay on the product path.

## Data Flow

### Load Workspace

1. Browser calls `GET /api/requests/workspace`.
2. Local host calls `runtime.loadWorkspace()`.
3. Runtime reads all SQLite events.
4. PRR projection and read API rebuild `PrrWorkspaceDto`.
5. Browser renders the DTO.

If the ledger is empty, the workspace DTO should render empty professional states. Seed data is not appended automatically.

### Create Draft

1. User completes the guided request builder.
2. Browser posts draft input to `POST /api/requests/drafts`.
3. Local host calls `runtime.createDraftRequest(input)`.
4. Runtime appends `prr.request.created` with expected sequence `1`.
5. Runtime calculates and appends `prr.deadline.estimated` with expected sequence `2` and causation pointing to the created event.
6. Runtime reloads the workspace from replayed events.
7. Browser receives the rebuilt workspace and updates UI state.

The builder closes only on `ok: true`. If deadline estimation or deadline append fails after request creation, the returned workspace still contains the draft from replayed events, and the UI keeps an inspectable diagnostic visible.

### Explicit Seed

1. Developer runs the seed CLI command or calls the dev-only seed endpoint.
2. Host calls `runtime.seedIfEmpty(prrWorkspaceSeedEvents)`.
3. Runtime appends seed events only if the ledger has no events.
4. Seed causation IDs are rewritten to committed event IDs by the runtime.
5. Existing ledgers are not changed.

## Error Handling

Errors should be returned as safe JSON diagnostics with stable categories where possible:

- Storage open failure.
- Auth missing or invalid.
- Unsupported route or method.
- Invalid JSON body.
- Invalid draft input.
- Unsupported jurisdiction pack.
- Runtime append conflict.
- Partial failure after request creation.
- Seed disabled.
- Seed skipped because ledger is not empty.

Diagnostics must not include secrets, auth tokens, OAuth material, passwords, raw email bodies, credential paths, or private keys. Where raw errors might contain sensitive material, the server should redact or replace the message with a safe generic diagnostic.

The host must not recover from storage errors by silently creating a different ledger path. It should fail closed and tell the operator how to inspect configuration.

## Testing Requirements

Implementation should be test-driven and split into small factory tasks.

Config tests should verify:

- Repo-local SQLite storage is the default.
- Loopback bind is the default.
- Tailnet/LAN bind requires auth.
- Explicit storage paths are resolved deterministically.
- The packaged-app storage strategy is represented without changing current behavior.
- Dev seed endpoint enablement is separate from bind mode.

HTTP contract tests should verify:

- Empty SQLite ledger returns an empty workspace DTO without seeding.
- Explicit seed appends golden events only when empty and is idempotent.
- `POST /api/requests/drafts` appends through `PrrRuntime`.
- Create draft, close/recreate host or runtime against the same SQLite DB, then reload workspace shows the draft.
- Partial runtime failures return safe JSON and preserve already committed events.
- Non-loopback bind without auth is rejected at startup or route access.
- Auth is required for write-capable routes when exposed beyond loopback.
- No endpoint deletes, resets, rewrites, sends email, or triggers legal escalation.

UI adapter tests should verify:

- HTTP adapter maps workspace and create-draft JSON into existing UI result types.
- HTTP failures become safe diagnostics.
- UI adapter imports remain browser-safe.
- Static and local replay adapters remain available for focused tests.

App and boundary tests should verify:

- Requests defaults to the HTTP adapter product path.
- Tests can still inject a static adapter.
- Product UI source imports no `request-fixtures`, `node:*`, `SQLiteEventLedger`, `sqlite-event-ledger`, or PRR runtime module.
- The builder submit flow renders a new draft after HTTP-backed reload.
- Loading and error states no longer claim in-browser seed replay for the product path.

Every implementation task should run a focused targeted command and then `npm run verify` before commit.

## Factory Execution Expectations

The implementation plan should split this design into small work orders with:

- one measurable outcome per task
- explicit allowed files
- required reading
- failing test first
- exact targeted failing command
- production change
- exact targeted passing command
- `npm run verify`
- commit
- review handoff
- rollback and escalation criteria

Autonomous execution must stop on:

- data-loss risk
- schema conflict with ontology or PRR event contracts
- browser import of Node-only runtime code
- unauthenticated non-loopback write exposure
- live credential requirements
- live mailbox requirements
- legal language or behavior that unlocks escalation without explicit human confirmation
- repeated verifier failure after two focused repair attempts

## Invariants

- The ledger is append-only.
- Corrections are new events, never mutations.
- SQLite durability is the default product path for local Requests.
- Browser code never imports SQLite or Node-only runtime code.
- Empty ledger stays empty until an explicit user/dev action appends events.
- Seed actions are idempotent and never overwrite existing events.
- Draft creation is durable before the UI treats the draft as product state.
- Runtime restart/reopen must preserve draft visibility through replay.
- Send gates remain locked without event-backed readiness.
- Legal escalation remains locked without explicit human confirmation events.
- Non-loopback write exposure requires auth.
- Diagnostics are inspectable and secret-safe.

## Risks

- A local HTTP host adds a real attack surface. The bind/auth policy must be covered by tests, not only documented.
- If server config is scattered across scripts, packaged desktop migration will be harder. Config resolution should be centralized.
- If UI tests overuse the local replay adapter, regressions could miss the durable product path. App smoke tests should exercise the HTTP adapter shape through mocks or local host tests.
- If the seed endpoint is too convenient, it could drift into product behavior. It must remain dev-only, explicit, and idempotent.
- If the host tries to serve both Vite dev and production build in one large abstraction too early, the slice could sprawl. The design should keep serving static files and API routing simple.

## Approval Record

The approved choices were:

- Use a small local HTTP host with embedded PRR runtime.
- Start with an empty ledger by default.
- Require explicit dev/test seed actions.
- Provide both CLI seed support and a dev-only HTTP seed endpoint.
- Use repo-local ignored SQLite storage for this slice.
- Represent a future packaged desktop app-data storage strategy in config.
- Bind to loopback by default.
- Allow tailnet/LAN defaults through explicit onboarding config.
- Require auth automatically for any non-loopback bind.
- Keep onboarding to config, environment variables, and CLI support in this slice.
