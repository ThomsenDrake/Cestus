# Durable Local PRR Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small local HTTP host that uses `SQLiteEventLedger` and `createPrrRuntime` as the durable Requests product path, with explicit seed actions, browser-safe HTTP adapter wiring, and restart/replay proof.

**Architecture:** Keep PRR domain logic in `packages/prr` and browser rendering in `packages/ui`. Add `packages/local-runtime` as the Node-only host boundary that resolves local config, constructs the SQLite-backed runtime, exposes HTTP JSON routes, serves the built UI, and enforces auth for non-loopback exposure. The UI keeps its adapter seam but defaults product use to an HTTP adapter instead of in-browser replay seed state.

**Tech Stack:** TypeScript, Node.js 26, built-in `node:http`, built-in `node:sqlite`, npm, Vitest, React, Vite, Zod event contracts, `tsx` for local TypeScript CLI execution, Markdown factory task claims.

---

## Research Basis

Local Cestus patterns to preserve:

- `docs/superpowers/plans/2026-07-03-ledger-backed-prr-workspace-implementation.md` split backend/DTO/runtime/UI work into task claims, exact targeted red/green commands, `npm run verify`, review checkpoints, and final factory readiness.
- `docs/agentic/claims/task-3-prr-runtime.md` shows the right shape for runtime/storage tasks: focused runtime tests, SQLite reopen coverage, partial failure coverage, red/green command evidence, review-fix evidence, and no recorded concerns after fixes.
- `docs/agentic/claims/task-4-ui-reads-prr-dtos.md` records a sequencing deviation where an `in-progress` claim transition was not committed separately. This plan makes claim transitions explicit to avoid repeating that mistake.
- `docs/agentic/claims/task-5-builder-draft-append.md` shows the expected standard for adapter write behavior: duplicate stream protection, fixed safe diagnostics, builder validation before submit, targeted red/green tests, and full verification.
- `docs/superpowers/plans/2026-07-04-requests-detail-modal-implementation.md` and `docs/agentic/claims/final-review-request-modal-fixes.md` show the UI thread pattern: keep product UI off Node-only imports, preserve injection points for tests, record preview reachability, and treat final review fixes as first-class work.

External AI software-factory patterns applied:

- Peter Steinberger's [Just Talk To It](https://steipete.me/posts/just-talk-to-it) emphasizes having agents read more context before acting, pushing back on weak requests, and using discussion/approval before larger changes.
- Peter Steinberger's [My Current AI Dev Workflow](https://steipete.me/posts/2025/optimal-ai-development-workflow) favors plan iteration for bigger changes, tests for larger changes, and small custom CLIs that make agents faster.
- Factory's [How Missions Work](https://factory.ai/news/missions-architecture) argues for focused worker units, shared state, explicit validation, and fresh validators because broad contexts and self-review bias degrade agent reliability.
- Factory's [Planning & Validation](https://docs.factory.ai/features/missions/planning) says upfront planning, milestone validation, and scriptable app exercise commands determine execution quality. It specifically recommends one command to start the app stack, filesystem-readable logs, modest local resource usage, and programmatic ways to drive the app.

## Required Reading

Every worker must read these files before editing:

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
- `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
- `docs/superpowers/specs/2026-07-03-ledger-backed-prr-workspace-design.md`
- `docs/superpowers/plans/2026-07-03-ledger-backed-prr-workspace-implementation.md`
- `docs/superpowers/specs/2026-07-05-durable-local-prr-runtime-design.md`
- This implementation plan

Workers must also read every source and test file listed in their task before editing.

## Factory Rules

- Start each task by creating a durable claim file under `docs/agentic/claims/`, commit the claim, then update status to `in-progress` and commit that transition before editing task files.
- Write or update failing tests before production code.
- Run the exact targeted red command in the task and record the failure in the claim.
- Change only files listed in the task unless a verifier exposes a narrow supporting edit. Record supporting edits in the claim before committing.
- Run the targeted green command, then `npm run verify`, before setting the claim to `ready-for-review`.
- Commit after each completed task.
- Do not import `SQLiteEventLedger`, PRR runtime modules, Node built-ins, or local-runtime server/config modules into product UI.
- Do not add live email credentials, live mailbox access, autonomous sending, autonomous follow-up, autonomous legal escalation, reset endpoints, delete endpoints, or ledger rewrite behavior.
- Stop and escalate on data-loss risk, schema conflict, unauthenticated non-loopback write exposure, browser import of Node-only code, unavailable dependency, or repeated verifier failure after two focused repair attempts.

## File Map

Local runtime package:

- `packages/local-runtime/src/config.ts`: resolves storage, bind, auth, dev seed, static UI, and log configuration from deterministic config files plus env/CLI input.
- `packages/local-runtime/src/config-file.ts`: reads and writes ignored local runtime config files, generates local auth tokens, and redacts secret material for diagnostics.
- `packages/local-runtime/src/runtime-factory.ts`: constructs `SQLiteEventLedger` and `createPrrRuntime` from resolved local runtime config.
- `packages/local-runtime/src/http-handler.ts`: testable HTTP-like request handler for `/api/health`, `/api/requests/workspace`, `/api/requests/drafts`, and `/api/dev/seed-prr`.
- `packages/local-runtime/src/static-files.ts`: safe static file response helpers for serving the built Vite UI from `dist`.
- `packages/local-runtime/src/server.ts`: Node `http` server wrapper around the handler and static file helpers.
- `packages/local-runtime/src/cli.ts`: `serve`, `seed-prr`, `health`, `config`, and `configure` commands for local runtime operation and onboarding.
- `packages/local-runtime/test/config.test.ts`: config defaults, repo-local storage, explicit path, app-data strategy, tailnet/LAN auth, and dev seed tests.
- `packages/local-runtime/test/config-file.test.ts`: deterministic config path, generated auth token, file permissions, config-file loading, and env override tests.
- `packages/local-runtime/test/http-handler.test.ts`: route contract, empty workspace, create draft, SQLite reopen, safe diagnostics, and partial failure tests.
- `packages/local-runtime/test/auth-and-seed.test.ts`: auth enforcement and explicit seed endpoint tests.
- `packages/local-runtime/test/cli.test.ts`: CLI command dispatch, generated config onboarding, and script contract tests.
- `packages/local-runtime/test/static-files.test.ts`: built UI serving and path traversal protection tests.

PRR runtime compatibility:

- `packages/prr/src/runtime.ts`: add `prrRequestId` to successful create-draft runtime results.
- `packages/prr/test/runtime.test.ts`: verify successful runtime create-draft results expose the created request ID.

Requests UI:

- `packages/ui/src/requests/request-adapter.ts`: add browser-safe `createHttpRequestsAdapter` and keep static/local replay helpers for tests.
- `packages/ui/src/App.tsx`: default Requests product path to the HTTP adapter.
- `packages/ui/test/request-http-adapter.test.ts`: mock `fetch` and verify HTTP adapter mapping and safe diagnostics.
- `packages/ui/test/request-test-utils.ts`: shared test helpers that build PRR DTO-backed static adapters.
- `packages/ui/test/app-smoke.test.tsx`: app-level HTTP default, injected adapter behavior, builder submit, reload, and error-state coverage.
- `packages/ui/test/request-builder.test.tsx`: keep builder submit and failure coverage after HTTP default.
- `packages/ui/test/request-board.test.tsx`: keep card/detail behavior after HTTP default.
- `packages/ui/test/request-shell.test.tsx`: keep Requests route loading behavior after HTTP default.
- `packages/ui/test/right-rail.test.tsx`: preserve Command and Requests rail smoke coverage.
- `packages/ui/test/request-data-boundary.test.ts`: broaden boundary checks to include local-runtime drift and new plan readiness.
- `packages/ui/test/visual-contract.test.ts`: update adapter contract expectations for HTTP default plus retained local replay helper.

Package and readiness:

- `.gitignore`: ignore `.cestus/` local runtime state.
- `package.json`: add local runtime scripts and `tsx` dev dependency.
- `package-lock.json`: lock the `tsx` dependency.
- `scripts/check-agent-readiness.mjs`: require this spec and implementation plan during final readiness.
- `docs/agentic/software-factory.md`: record durable local PRR runtime plan readiness and final verification evidence.

---

## Task 1: Local Runtime Config Contract

**Outcome:** `packages/local-runtime` resolves safe defaults and explicit operator choices for storage, binding, auth, dev seed, static UI serving, and logs. Repo-local state is ignored.

**Files:**

- Create: `docs/agentic/claims/task-1-local-runtime-config.md`
- Create: `packages/local-runtime/src/config.ts`
- Create: `packages/local-runtime/test/config.test.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-local-runtime-config.md` with:

```markdown
# Task 1: Local Runtime Config Contract

Plan path: `docs/superpowers/plans/2026-07-05-durable-local-prr-runtime-implementation.md`
Task heading: `Task 1: Local Runtime Config Contract`
Worker identity: Codex
Branch: `codex/durable-local-runtime-design`
Worktree path: `/home/drake/.codex/worktrees/ea09/Cestus`
Claimed at UTC: run `date -u +"%Y-%m-%dT%H:%M:%SZ"` and paste the emitted timestamp
Status: `claimed`

## Owned Files

- `packages/local-runtime/src/config.ts`
- `packages/local-runtime/test/config.test.ts`
- `.gitignore`

## Evidence

- Red command: pending
- Green command: pending
- Full verification: pending

## Review

- Review status: pending
- Concerns: none recorded
```

Run:

```bash
git add docs/agentic/claims/task-1-local-runtime-config.md
git commit -m "chore: claim task 1 local runtime config"
```

Expected: commit succeeds.

- [ ] **Step 2: Mark the claim in progress**

Change `Status: claimed` to `Status: in-progress`, then run:

```bash
git add docs/agentic/claims/task-1-local-runtime-config.md
git commit -m "chore: start task 1 local runtime config"
```

Expected: commit succeeds.

- [ ] **Step 3: Write the failing config tests**

Create `packages/local-runtime/test/config.test.ts`:

```ts
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLocalRuntimeConfig } from "../src/config.js";

const cwd = "/tmp/cestus-runtime-test";

describe("resolveLocalRuntimeConfig", () => {
  it("defaults to repo-local SQLite storage and loopback bind", () => {
    const config = resolveLocalRuntimeConfig({ cwd, env: {} });

    expect(config.storage).toEqual({
      strategy: "repo-local",
      sqlitePath: resolve(cwd, ".cestus/local/prr-ledger.sqlite")
    });
    expect(config.http).toMatchObject({
      host: "127.0.0.1",
      port: 8787,
      bindMode: "loopback",
      authRequired: false,
      devSeedEnabled: false
    });
    expect(config.staticUi.distDir).toBe(resolve(cwd, "dist"));
    expect(config.logs.dir).toBe(resolve(cwd, ".cestus/local/logs"));
  });

  it("resolves explicit SQLite paths without changing bind defaults", () => {
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "explicit-path",
        CESTUS_LOCAL_SQLITE_PATH: "state/custom.sqlite"
      }
    });

    expect(config.storage).toEqual({
      strategy: "explicit-path",
      sqlitePath: resolve(cwd, "state/custom.sqlite")
    });
    expect(config.http.bindMode).toBe("loopback");
    expect(config.http.authRequired).toBe(false);
  });

  it("represents app-data storage for packaged desktop builds", () => {
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "app-data",
        CESTUS_APP_DATA_DIR: "/home/avery/.local/share/cestus"
      }
    });

    expect(config.storage).toEqual({
      strategy: "app-data",
      sqlitePath: join("/home/avery/.local/share/cestus", "prr-ledger.sqlite")
    });
  });

  it("rejects tailnet exposure without auth", () => {
    expect(() =>
      resolveLocalRuntimeConfig({
        cwd,
        env: {
          CESTUS_LOCAL_BIND: "tailnet",
          CESTUS_LOCAL_HOST: "100.126.143.105"
        }
      })
    ).toThrow("Auth is required for non-loopback local runtime exposure");
  });

  it("allows authenticated tailnet exposure without enabling dev seed", () => {
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_BIND: "tailnet",
        CESTUS_LOCAL_HOST: "100.126.143.105",
        CESTUS_LOCAL_AUTH_TOKEN: "local-secret"
      }
    });

    expect(config.http).toMatchObject({
      host: "100.126.143.105",
      bindMode: "tailnet",
      authRequired: true,
      authToken: "local-secret",
      devSeedEnabled: false
    });
  });

  it("keeps dev seed enablement separate from exposure mode", () => {
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_DEV_SEED_PRR: "true"
      }
    });

    expect(config.http.bindMode).toBe("loopback");
    expect(config.http.authRequired).toBe(false);
    expect(config.http.devSeedEnabled).toBe(true);
  });
});
```

Modify `.gitignore` by adding:

```gitignore
.cestus/
```

- [ ] **Step 4: Run the targeted red command**

Run:

```bash
npm test -- packages/local-runtime/test/config.test.ts
```

Expected: Vitest fails because `../src/config.js` cannot be resolved.

- [ ] **Step 5: Implement config resolution**

Create `packages/local-runtime/src/config.ts`:

```ts
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export type LocalRuntimeStorageStrategy = "repo-local" | "explicit-path" | "app-data";
export type LocalRuntimeBindMode = "loopback" | "tailnet" | "lan";

export interface LocalRuntimeConfigInput {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
}

export interface ResolvedLocalRuntimeConfig {
  readonly cwd: string;
  readonly storage: {
    readonly strategy: LocalRuntimeStorageStrategy;
    readonly sqlitePath: string;
  };
  readonly http: {
    readonly host: string;
    readonly port: number;
    readonly bindMode: LocalRuntimeBindMode;
    readonly authRequired: boolean;
    readonly authToken?: string;
    readonly devSeedEnabled: boolean;
  };
  readonly staticUi: {
    readonly distDir: string;
  };
  readonly logs: {
    readonly dir: string;
  };
}

export function resolveLocalRuntimeConfig(
  input: LocalRuntimeConfigInput = {}
): ResolvedLocalRuntimeConfig {
  const cwd = resolve(input.cwd ?? process.cwd());
  const env = input.env ?? process.env;
  const bindMode = parseBindMode(env.CESTUS_LOCAL_BIND);
  const authToken = normalizeOptional(env.CESTUS_LOCAL_AUTH_TOKEN);
  const authRequired = bindMode !== "loopback";

  if (authRequired && authToken === undefined) {
    throw new Error("Auth is required for non-loopback local runtime exposure");
  }

  const config = {
    cwd,
    storage: resolveStorage(cwd, env),
    http: {
      host: resolveHost(bindMode, env),
      port: parsePort(env.CESTUS_LOCAL_PORT),
      bindMode,
      authRequired,
      ...(authToken === undefined ? {} : { authToken }),
      devSeedEnabled: env.CESTUS_DEV_SEED_PRR === "true"
    },
    staticUi: {
      distDir: resolvePath(cwd, env.CESTUS_UI_DIST_DIR ?? "dist")
    },
    logs: {
      dir: resolvePath(cwd, env.CESTUS_LOCAL_LOG_DIR ?? ".cestus/local/logs")
    }
  } satisfies ResolvedLocalRuntimeConfig;

  return Object.freeze(config);
}

function resolveStorage(
  cwd: string,
  env: Record<string, string | undefined>
): ResolvedLocalRuntimeConfig["storage"] {
  const strategy = parseStorageStrategy(env.CESTUS_LOCAL_STORAGE);

  if (strategy === "repo-local") {
    return Object.freeze({
      strategy,
      sqlitePath: resolvePath(cwd, ".cestus/local/prr-ledger.sqlite")
    });
  }

  if (strategy === "explicit-path") {
    const sqlitePath = normalizeOptional(env.CESTUS_LOCAL_SQLITE_PATH);
    if (sqlitePath === undefined) {
      throw new Error("CESTUS_LOCAL_SQLITE_PATH is required for explicit-path storage");
    }
    return Object.freeze({
      strategy,
      sqlitePath: resolvePath(cwd, sqlitePath)
    });
  }

  const appDataDir = normalizeOptional(env.CESTUS_APP_DATA_DIR) ?? join(homedir(), ".local/share/cestus");
  return Object.freeze({
    strategy,
    sqlitePath: join(appDataDir, "prr-ledger.sqlite")
  });
}

function parseStorageStrategy(value: string | undefined): LocalRuntimeStorageStrategy {
  if (value === undefined || value === "repo-local") {
    return "repo-local";
  }
  if (value === "explicit-path" || value === "app-data") {
    return value;
  }
  throw new Error(`Unsupported local runtime storage strategy: ${value}`);
}

function parseBindMode(value: string | undefined): LocalRuntimeBindMode {
  if (value === undefined || value === "loopback") {
    return "loopback";
  }
  if (value === "tailnet" || value === "lan") {
    return value;
  }
  throw new Error(`Unsupported local runtime bind mode: ${value}`);
}

function resolveHost(
  bindMode: LocalRuntimeBindMode,
  env: Record<string, string | undefined>
): string {
  const explicitHost = normalizeOptional(env.CESTUS_LOCAL_HOST);
  if (explicitHost !== undefined) {
    return explicitHost;
  }
  return bindMode === "loopback" ? "127.0.0.1" : "0.0.0.0";
}

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return 8787;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid local runtime port: ${value}`);
  }
  return parsed;
}

function resolvePath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

function normalizeOptional(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
```

- [ ] **Step 6: Run the targeted green command**

Run:

```bash
npm test -- packages/local-runtime/test/config.test.ts
```

Expected: `packages/local-runtime/test/config.test.ts` passes.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, all tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit the task**

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-1-local-runtime-config.md packages/local-runtime/src/config.ts packages/local-runtime/test/config.test.ts .gitignore
git commit -m "feat: add local runtime config"
```

Expected: commit succeeds.

**Rollback:** Revert this task commit. No product runtime behavior depends on the config module yet.

**Escalate:** Stop if a storage path choice risks deleting, truncating, or rewriting existing ledger files.

---

## Task 2: PRR Runtime Returns Created Request ID

**Outcome:** Successful `PrrRuntime.createDraftRequest()` results include the created `prrRequestId`, allowing HTTP and UI adapters to select the durable draft after reload without inferring it from DTO diffs.

**Files:**

- Create: `docs/agentic/claims/task-2-prr-runtime-request-id.md`
- Modify: `packages/prr/test/runtime.test.ts`
- Modify: `packages/prr/src/runtime.ts`

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-2-prr-runtime-request-id.md` with:

```markdown
# Task 2: PRR Runtime Returns Created Request ID

Plan path: `docs/superpowers/plans/2026-07-05-durable-local-prr-runtime-implementation.md`
Task heading: `Task 2: PRR Runtime Returns Created Request ID`
Worker identity: Codex
Branch: `codex/durable-local-runtime-design`
Worktree path: `/home/drake/.codex/worktrees/ea09/Cestus`
Claimed at UTC: run `date -u +"%Y-%m-%dT%H:%M:%SZ"` and paste the emitted timestamp
Status: `claimed`

## Owned Files

- `packages/prr/test/runtime.test.ts`
- `packages/prr/src/runtime.ts`

## Evidence

- Red command: pending
- Green command: pending
- Full verification: pending

## Review

- Review status: pending
- Concerns: none recorded
```

Run:

```bash
git add docs/agentic/claims/task-2-prr-runtime-request-id.md
git commit -m "chore: claim task 2 prr runtime request id"
```

Expected: commit succeeds.

- [ ] **Step 2: Mark the claim in progress**

Change `Status: claimed` to `Status: in-progress`, then run:

```bash
git add docs/agentic/claims/task-2-prr-runtime-request-id.md
git commit -m "chore: start task 2 prr runtime request id"
```

Expected: commit succeeds.

- [ ] **Step 3: Write the failing runtime assertion**

In `packages/prr/test/runtime.test.ts`, update the `"creates a draft request and causally linked estimated deadline"` test by adding:

```ts
expect(result.prrRequestId).toBe("prr_new_city_budget");
```

Place it after the `if (!result.ok)` guard so TypeScript narrows the result to the success variant.

- [ ] **Step 4: Run the targeted red command**

Run:

```bash
npm test -- packages/prr/test/runtime.test.ts
```

Expected: Vitest or TypeScript fails because the success result does not expose `prrRequestId`.

- [ ] **Step 5: Update the runtime result type and return value**

In `packages/prr/src/runtime.ts`, update the successful `CreateDraftRequestResult` variant:

```ts
  | {
      readonly ok: true;
      readonly prrRequestId: string;
      readonly committedEventIds: readonly string[];
      readonly workspace: PrrWorkspaceDto;
    }
```

In the success return inside `createDraftRequest`, add `prrRequestId`:

```ts
      return {
        ok: true,
        prrRequestId,
        committedEventIds: Object.freeze([committedCreated.id, committedDeadline.id]),
        workspace: await loadWorkspace()
      };
```

- [ ] **Step 6: Run the targeted green command**

Run:

```bash
npm test -- packages/prr/test/runtime.test.ts
```

Expected: `packages/prr/test/runtime.test.ts` passes.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, all tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit the task**

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-2-prr-runtime-request-id.md packages/prr/test/runtime.test.ts packages/prr/src/runtime.ts
git commit -m "feat: return prr runtime draft id"
```

Expected: commit succeeds.

**Rollback:** Revert this task commit. The old runtime contract remains usable by existing runtime tests, but later HTTP/UI tasks must not start without this field.

**Escalate:** Stop if adding the field reveals a schema conflict or forces a change to PRR event contracts.

---

## Task 3: Local HTTP Handler And SQLite Runtime Factory

**Outcome:** A Node-only local-runtime handler loads empty workspaces, creates durable draft requests through SQLite-backed PRR runtime, and proves draft visibility after runtime reopen.

**Files:**

- Create: `docs/agentic/claims/task-3-local-http-handler.md`
- Create: `packages/local-runtime/src/runtime-factory.ts`
- Create: `packages/local-runtime/src/http-handler.ts`
- Create: `packages/local-runtime/test/http-handler.test.ts`

- [ ] **Step 1: Claim and start the task**

Create and commit `docs/agentic/claims/task-3-local-http-handler.md` with status `claimed`, then update it to `in-progress` and commit that transition before editing source files.

Use commit messages:

```bash
git commit -m "chore: claim task 3 local http handler"
git commit -m "chore: start task 3 local http handler"
```

Expected: both commits succeed.

- [ ] **Step 2: Write the failing HTTP handler tests**

Create `packages/local-runtime/test/http-handler.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createLocalRuntimeHttpHandler } from "../src/http-handler.js";

const actor = {
  id: "actor_local_runtime_test",
  kind: "human",
  label: "Local Runtime Test"
} as const;
const fixedNow = () => "2026-07-05T12:00:00.000Z";
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("createLocalRuntimeHttpHandler", () => {
  it("loads an empty workspace from an empty SQLite ledger", async () => {
    const cwd = tempDir();
    const handler = createLocalRuntimeHttpHandler({
      config: resolveLocalRuntimeConfig({ cwd, env: {} }),
      actor,
      now: fixedNow
    });

    const response = await handler({ method: "GET", url: "/api/requests/workspace" });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      generatedAt: "2026-07-05T12:00:00.000Z",
      cards: [],
      requestDetails: []
    });
    handler.close();
  });

  it("creates a draft through HTTP and replays it after SQLite reopen", async () => {
    const cwd = tempDir();
    const config = resolveLocalRuntimeConfig({ cwd, env: {} });
    const first = createLocalRuntimeHttpHandler({
      config,
      actor,
      now: fixedNow,
      requestIdFactory: () => "prr_http_city_budget"
    });

    const created = await first({
      method: "POST",
      url: "/api/requests/drafts",
      body: JSON.stringify({
        jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
        agency: { name: "City Clerk", email: "clerk@example.gov" },
        requester: { name: "Avery Investigator", email: "avery@example.org" },
        requestText: "All budget amendment memos from January 2026.",
        receivedAt: "2026-07-05T12:00:00.000Z"
      })
    });

    expect(created.status).toBe(200);
    const createdBody = JSON.parse(created.body);
    expect(createdBody).toMatchObject({
      ok: true,
      prrRequestId: "prr_http_city_budget"
    });
    expect(createdBody.workspace.cards.some((card: { prrRequestId: string }) => card.prrRequestId === "prr_http_city_budget")).toBe(true);
    first.close();

    const second = createLocalRuntimeHttpHandler({ config, actor, now: fixedNow });
    const reloaded = await second({ method: "GET", url: "/api/requests/workspace" });
    expect(JSON.parse(reloaded.body).cards.map((card: { prrRequestId: string }) => card.prrRequestId)).toContain(
      "prr_http_city_budget"
    );
    second.close();
  });

  it("returns safe JSON for invalid request bodies", async () => {
    const handler = createLocalRuntimeHttpHandler({
      config: resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} }),
      actor,
      now: fixedNow
    });

    const response = await handler({
      method: "POST",
      url: "/api/requests/drafts",
      body: "{not json"
    });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      ok: false,
      diagnostic: {
        message: "Request body must be valid JSON.",
        allowedRepairActions: ["send a valid JSON request body"]
      }
    });
    handler.close();
  });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-local-runtime-"));
  tempDirs.push(dir);
  return dir;
}
```

- [ ] **Step 3: Run the targeted red command**

Run:

```bash
npm test -- packages/local-runtime/test/http-handler.test.ts
```

Expected: Vitest fails because `../src/http-handler.js` cannot be resolved.

- [ ] **Step 4: Implement the SQLite runtime factory**

Create `packages/local-runtime/src/runtime-factory.ts`:

```ts
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import {
  createPrrRuntime,
  type PrrRuntime,
  type PrrRuntimeDependencies
} from "../../prr/src/runtime.js";
import type { ResolvedLocalRuntimeConfig } from "./config.js";

export interface LocalRuntimeFactoryDependencies
  extends Omit<PrrRuntimeDependencies, "ledger"> {
  readonly config: ResolvedLocalRuntimeConfig;
}

export interface LocalRuntimeHandle {
  readonly runtime: PrrRuntime;
  close(): void;
}

export function createSqlitePrrRuntime(
  dependencies: LocalRuntimeFactoryDependencies
): LocalRuntimeHandle {
  const ledger = new SQLiteEventLedger(dependencies.config.storage.sqlitePath);
  const runtime = createPrrRuntime({
    ledger,
    actor: dependencies.actor,
    now: dependencies.now,
    requestIdFactory: dependencies.requestIdFactory,
    deadlineCalculator: dependencies.deadlineCalculator
  });

  return Object.freeze({
    runtime,
    close() {
      ledger.close();
    }
  });
}
```

- [ ] **Step 5: Implement the HTTP handler**

Create `packages/local-runtime/src/http-handler.ts`:

```ts
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import type { ActorRef, CreateDraftRequestInput } from "../../prr/src/draft-events.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import type { PrrRuntimeNow, PrrRuntimeDependencies } from "../../prr/src/runtime.js";
import type { ResolvedLocalRuntimeConfig } from "./config.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "./runtime-factory.js";

export interface LocalRuntimeRequest {
  readonly method: string;
  readonly url: string;
  readonly headers?: Record<string, string | undefined>;
  readonly body?: string;
}

export interface LocalRuntimeResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

export interface LocalRuntimeHttpHandler {
  (request: LocalRuntimeRequest): Promise<LocalRuntimeResponse>;
  close(): void;
}

export interface CreateLocalRuntimeHttpHandlerInput {
  readonly config: ResolvedLocalRuntimeConfig;
  readonly actor: ActorRef;
  readonly now?: PrrRuntimeNow;
  readonly requestIdFactory?: () => string;
  readonly deadlineCalculator?: PrrRuntimeDependencies["deadlineCalculator"];
  readonly seedEvents?: readonly KnowledgeEvent[];
}

export function createLocalRuntimeHttpHandler(
  input: CreateLocalRuntimeHttpHandlerInput
): LocalRuntimeHttpHandler {
  const handle = createSqlitePrrRuntime(input);
  const seedEvents = input.seedEvents ?? prrWorkspaceSeedEvents;

  const handler = (async (request: LocalRuntimeRequest): Promise<LocalRuntimeResponse> => {
    const path = new URL(request.url, "http://localhost").pathname;

    if (request.method === "GET" && path === "/api/health") {
      return json(200, {
        ok: true,
        storageStrategy: input.config.storage.strategy,
        bindMode: input.config.http.bindMode,
        authRequired: input.config.http.authRequired,
        devSeedEnabled: input.config.http.devSeedEnabled
      });
    }

    if (path.startsWith("/api/") && !authorized(input.config, request)) {
      return json(401, safeDiagnostic("Authentication is required for this local runtime route.", [
        "provide the configured local runtime auth token"
      ]));
    }

    if (request.method === "GET" && path === "/api/requests/workspace") {
      return json(200, await handle.runtime.loadWorkspace());
    }

    if (request.method === "POST" && path === "/api/requests/drafts") {
      const parsed = parseJsonBody(request.body);
      if (!parsed.ok) {
        return json(400, parsed.body);
      }
      return json(200, await handle.runtime.createDraftRequest(parsed.value as CreateDraftRequestInput));
    }

    if (request.method === "POST" && path === "/api/dev/seed-prr") {
      if (!input.config.http.devSeedEnabled) {
        return json(404, safeDiagnostic("PRR seed endpoint is disabled.", [
          "enable CESTUS_DEV_SEED_PRR for local development"
        ]));
      }
      const seedResult = await handle.runtime.seedIfEmpty(seedEvents);
      return json(200, {
        ok: true,
        seed: seedResult,
        workspace: await handle.runtime.loadWorkspace()
      });
    }

    return json(404, safeDiagnostic("Local runtime route was not found.", ["check the request path and method"]));
  }) as LocalRuntimeHttpHandler;

  handler.close = () => handle.close();
  return handler;
}

function parseJsonBody(body: string | undefined):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly body: unknown } {
  try {
    return { ok: true, value: body === undefined || body.trim() === "" ? {} : JSON.parse(body) };
  } catch {
    return {
      ok: false,
      body: safeDiagnostic("Request body must be valid JSON.", ["send a valid JSON request body"])
    };
  }
}

function authorized(config: ResolvedLocalRuntimeConfig, request: LocalRuntimeRequest): boolean {
  if (!config.http.authRequired) {
    return true;
  }
  const expected = config.http.authToken;
  const header = request.headers?.authorization ?? request.headers?.Authorization;
  return expected !== undefined && header === `Bearer ${expected}`;
}

function safeDiagnostic(message: string, allowedRepairActions: readonly string[]) {
  return Object.freeze({
    ok: false,
    diagnostic: Object.freeze({
      message,
      allowedRepairActions: Object.freeze([...allowedRepairActions])
    })
  });
}

function json(status: number, body: unknown): LocalRuntimeResponse {
  return Object.freeze({
    status,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(body)
  });
}
```

- [ ] **Step 6: Run the targeted green command**

Run:

```bash
npm test -- packages/local-runtime/test/http-handler.test.ts
```

Expected: `packages/local-runtime/test/http-handler.test.ts` passes.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, all tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit the task**

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-3-local-http-handler.md packages/local-runtime/src/runtime-factory.ts packages/local-runtime/src/http-handler.ts packages/local-runtime/test/http-handler.test.ts
git commit -m "feat: add local prr http handler"
```

Expected: commit succeeds.

**Rollback:** Revert this task commit. Config from Task 1 and runtime result compatibility from Task 2 remain independently useful.

**Escalate:** Stop if HTTP create-draft behavior requires changing PRR event schemas, deleting failed events, or weakening runtime partial failure semantics.

---

## Task 4: Auth Enforcement And Explicit Seed Contract

**Outcome:** The local HTTP handler enforces auth on exposed configurations and exposes PRR seed only as an explicit, disabled-by-default dev action.

**Files:**

- Create: `docs/agentic/claims/task-4-local-auth-seed.md`
- Create: `packages/local-runtime/test/auth-and-seed.test.ts`
- Modify: `packages/local-runtime/src/http-handler.ts`

- [ ] **Step 1: Claim and start the task**

Create and commit `docs/agentic/claims/task-4-local-auth-seed.md` with status `claimed`, then update it to `in-progress` and commit that transition before editing source files.

Use commit messages:

```bash
git commit -m "chore: claim task 4 local auth seed"
git commit -m "chore: start task 4 local auth seed"
```

Expected: both commits succeed.

- [ ] **Step 2: Write the failing auth and seed tests**

Create `packages/local-runtime/test/auth-and-seed.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createLocalRuntimeHttpHandler } from "../src/http-handler.js";

const actor = {
  id: "actor_auth_seed_test",
  kind: "human",
  label: "Auth Seed Test"
} as const;
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("local runtime auth and explicit seed", () => {
  it("requires bearer auth for non-loopback Requests routes", async () => {
    const handler = createLocalRuntimeHttpHandler({
      config: resolveLocalRuntimeConfig({
        cwd: tempDir(),
        env: {
          CESTUS_LOCAL_BIND: "tailnet",
          CESTUS_LOCAL_HOST: "100.126.143.105",
          CESTUS_LOCAL_AUTH_TOKEN: "secret-local-token"
        }
      }),
      actor,
      now: "2026-07-05T13:00:00.000Z"
    });

    const rejected = await handler({ method: "GET", url: "/api/requests/workspace" });
    expect(rejected.status).toBe(401);

    const accepted = await handler({
      method: "GET",
      url: "/api/requests/workspace",
      headers: { authorization: "Bearer secret-local-token" }
    });
    expect(accepted.status).toBe(200);
    handler.close();
  });

  it("keeps the seed endpoint disabled until explicitly configured", async () => {
    const handler = createLocalRuntimeHttpHandler({
      config: resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} }),
      actor,
      now: "2026-07-05T13:00:00.000Z"
    });

    const response = await handler({ method: "POST", url: "/api/dev/seed-prr" });

    expect(response.status).toBe(404);
    expect(JSON.parse(response.body).diagnostic.message).toBe("PRR seed endpoint is disabled.");
    handler.close();
  });

  it("seeds golden PRR events only when explicitly enabled and the ledger is empty", async () => {
    const handler = createLocalRuntimeHttpHandler({
      config: resolveLocalRuntimeConfig({
        cwd: tempDir(),
        env: { CESTUS_DEV_SEED_PRR: "true" }
      }),
      actor,
      now: "2026-07-05T13:00:00.000Z"
    });

    const first = await handler({ method: "POST", url: "/api/dev/seed-prr" });
    const second = await handler({ method: "POST", url: "/api/dev/seed-prr" });

    expect(first.status).toBe(200);
    expect(JSON.parse(first.body).seed.appendedCount).toBeGreaterThan(1);
    expect(JSON.parse(first.body).workspace.cards.length).toBeGreaterThan(1);
    expect(second.status).toBe(200);
    expect(JSON.parse(second.body).seed).toEqual({ appendedCount: 0, skipped: true });
    handler.close();
  });

  it("does not expose destructive ledger routes", async () => {
    const handler = createLocalRuntimeHttpHandler({
      config: resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} }),
      actor,
      now: "2026-07-05T13:00:00.000Z"
    });

    for (const url of ["/api/dev/reset", "/api/requests/delete", "/api/ledger/truncate"]) {
      const response = await handler({ method: "POST", url });
      expect(response.status).toBe(404);
    }
    handler.close();
  });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-local-auth-seed-"));
  tempDirs.push(dir);
  return dir;
}
```

- [ ] **Step 3: Run the targeted red command**

Run:

```bash
npm test -- packages/local-runtime/test/auth-and-seed.test.ts
```

Expected: at least one test fails until auth and seed behavior exactly match the contract.

- [ ] **Step 4: Tighten handler behavior**

Update `packages/local-runtime/src/http-handler.ts` so the handler has these exact behaviors:

- `GET /api/health` remains available without exposing secrets.
- `/api/requests/*` and `/api/dev/*` require `Authorization: Bearer <token>` when `config.http.authRequired` is true.
- `POST /api/dev/seed-prr` returns 404 while disabled.
- `POST /api/dev/seed-prr` calls `runtime.seedIfEmpty(seedEvents)` only while enabled.
- Unknown destructive-looking routes return 404 and do not touch the runtime.

The existing helper functions can stay private. Do not add delete, reset, truncate, compact, send, or legal escalation routes.

- [ ] **Step 5: Run the targeted green command**

Run:

```bash
npm test -- packages/local-runtime/test/auth-and-seed.test.ts packages/local-runtime/test/http-handler.test.ts
```

Expected: both local-runtime route test files pass.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, all tests, UI build, and factory readiness pass.

- [ ] **Step 7: Commit the task**

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-4-local-auth-seed.md packages/local-runtime/test/auth-and-seed.test.ts packages/local-runtime/src/http-handler.ts
git commit -m "test: lock local runtime auth and seed"
```

Expected: commit succeeds.

**Rollback:** Revert this task commit. Task 3 remains a loopback-focused HTTP handler.

**Escalate:** Stop immediately if a route allows unauthenticated non-loopback writes or if seed behavior overwrites a non-empty ledger.

---

## Task 5: Server, Static UI Serving, And CLI Scripts

**Outcome:** The local runtime can be started from npm, can serve the built Vite UI plus API routes, can seed explicitly from CLI, and has testable command dispatch.

**Files:**

- Create: `docs/agentic/claims/task-5-local-runtime-cli.md`
- Create: `packages/local-runtime/src/static-files.ts`
- Create: `packages/local-runtime/src/server.ts`
- Create: `packages/local-runtime/src/cli.ts`
- Create: `packages/local-runtime/test/static-files.test.ts`
- Create: `packages/local-runtime/test/cli.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Claim and start the task**

Create and commit `docs/agentic/claims/task-5-local-runtime-cli.md` with status `claimed`, then update it to `in-progress` and commit that transition before editing source files.

Use commit messages:

```bash
git commit -m "chore: claim task 5 local runtime cli"
git commit -m "chore: start task 5 local runtime cli"
```

Expected: both commits succeed.

- [ ] **Step 2: Add the TypeScript CLI runner dependency**

Run:

```bash
npm install --save-dev tsx@^4.23.0
```

Expected: `package.json` and `package-lock.json` update with `tsx`.

- [ ] **Step 3: Write failing static and CLI tests**

Create `packages/local-runtime/test/static-files.test.ts`:

```ts
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readStaticUiFile } from "../src/static-files.js";

let dir: string | undefined;

afterEach(() => {
  if (dir !== undefined) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

describe("readStaticUiFile", () => {
  it("serves index.html for the app root", () => {
    dir = mkdtempSync(join(tmpdir(), "cestus-static-"));
    writeFileSync(join(dir, "index.html"), "<main>Cestus</main>");

    const response = readStaticUiFile(dir, "/");

    expect(response).toEqual({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: Buffer.from("<main>Cestus</main>")
    });
  });

  it("serves asset files with stable content types", () => {
    dir = mkdtempSync(join(tmpdir(), "cestus-static-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets/app.js"), "console.log('ok');");

    const response = readStaticUiFile(dir, "/assets/app.js");

    expect(response.status).toBe(200);
    expect(response.contentType).toBe("text/javascript; charset=utf-8");
    expect(response.body.toString("utf8")).toBe("console.log('ok');");
  });

  it("blocks path traversal", () => {
    dir = mkdtempSync(join(tmpdir(), "cestus-static-"));
    writeFileSync(join(dir, "index.html"), "<main>Cestus</main>");

    expect(readStaticUiFile(dir, "/../package.json")).toEqual({
      status: 404,
      contentType: "text/plain; charset=utf-8",
      body: Buffer.from("Not found")
    });
  });
});
```

Create `packages/local-runtime/test/cli.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runLocalRuntimeCli } from "../src/cli.js";

describe("runLocalRuntimeCli", () => {
  it("prints resolved config without secrets", async () => {
    const stdout: string[] = [];

    const exitCode = await runLocalRuntimeCli(["config"], {
      cwd: "/tmp/cestus-cli-test",
      env: {
        CESTUS_LOCAL_AUTH_TOKEN: "secret-token"
      },
      stdout: (line) => stdout.push(line),
      stderr: () => undefined
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain('"host": "127.0.0.1"');
    expect(stdout.join("\n")).not.toContain("secret-token");
  });

  it("dispatches explicit seed through an injected seed action", async () => {
    const stdout: string[] = [];
    const calls: string[] = [];

    const exitCode = await runLocalRuntimeCli(["seed-prr"], {
      cwd: "/tmp/cestus-cli-test",
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
      seedPrr: async () => {
        calls.push("seed");
        return { appendedCount: 9 };
      }
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual(["seed"]);
    expect(stdout.join("\n")).toContain('"appendedCount": 9');
  });

  it("dispatches serve through an injected server action", async () => {
    const calls: string[] = [];

    const exitCode = await runLocalRuntimeCli(["serve"], {
      cwd: "/tmp/cestus-cli-test",
      env: {},
      stdout: () => undefined,
      stderr: () => undefined,
      serve: async () => {
        calls.push("serve");
      }
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual(["serve"]);
  });
});
```

- [ ] **Step 4: Run the targeted red command**

Run:

```bash
npm test -- packages/local-runtime/test/static-files.test.ts packages/local-runtime/test/cli.test.ts
```

Expected: Vitest fails because `static-files.js` and `cli.js` cannot be resolved.

- [ ] **Step 5: Implement safe static file serving**

Create `packages/local-runtime/src/static-files.ts`:

```ts
import { readFileSync } from "node:fs";
import { extname, normalize, resolve, sep } from "node:path";

export interface StaticFileResponse {
  readonly status: number;
  readonly contentType: string;
  readonly body: Buffer;
}

export function readStaticUiFile(distDir: string, requestPath: string): StaticFileResponse {
  const root = resolve(distDir);
  const relativePath = requestPath === "/" ? "index.html" : decodeURIComponent(requestPath.slice(1));
  const normalized = normalize(relativePath);
  if (normalized.startsWith("..") || normalized.includes(`${sep}..${sep}`)) {
    return notFound();
  }

  const filePath = resolve(root, normalized);
  if (!filePath.startsWith(`${root}${sep}`) && filePath !== root) {
    return notFound();
  }

  try {
    return {
      status: 200,
      contentType: contentTypeFor(filePath),
      body: readFileSync(filePath)
    };
  } catch {
    return notFound();
  }
}

function contentTypeFor(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

function notFound(): StaticFileResponse {
  return {
    status: 404,
    contentType: "text/plain; charset=utf-8",
    body: Buffer.from("Not found")
  };
}
```

- [ ] **Step 6: Implement the Node server wrapper**

Create `packages/local-runtime/src/server.ts`:

```ts
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ActorRef } from "../../prr/src/draft-events.js";
import { resolveLocalRuntimeConfig, type ResolvedLocalRuntimeConfig } from "./config.js";
import { createLocalRuntimeHttpHandler } from "./http-handler.js";
import { readStaticUiFile } from "./static-files.js";

export interface StartLocalRuntimeServerInput {
  readonly config?: ResolvedLocalRuntimeConfig;
  readonly actor?: ActorRef;
  readonly env?: Record<string, string | undefined>;
  readonly cwd?: string;
}

export async function startLocalRuntimeServer(input: StartLocalRuntimeServerInput = {}) {
  const config = input.config ?? resolveLocalRuntimeConfig({ cwd: input.cwd, env: input.env });
  const actor =
    input.actor ??
    ({
      id: "actor_local_runtime",
      kind: "human",
      label: "Local Runtime User"
    } as const);
  const handler = createLocalRuntimeHttpHandler({ config, actor });
  mkdirSync(config.logs.dir, { recursive: true });

  const server = createServer(async (request, response) => {
    try {
      if (request.url?.startsWith("/api/") === true) {
        const handled = await handler({
          method: request.method ?? "GET",
          url: request.url,
          headers: headersFrom(request),
          body: await readRequestBody(request)
        });
        writeResponse(response, handled.status, handled.headers["content-type"], Buffer.from(handled.body));
        return;
      }

      const staticResponse = readStaticUiFile(config.staticUi.distDir, request.url ?? "/");
      writeResponse(response, staticResponse.status, staticResponse.contentType, staticResponse.body);
    } catch (error) {
      appendFileSync(join(config.logs.dir, "runtime.log"), `${new Date().toISOString()} ${safeLogMessage(error)}\n`);
      writeResponse(response, 500, "application/json; charset=utf-8", Buffer.from(JSON.stringify({
        ok: false,
        diagnostic: {
          message: "Local runtime request failed.",
          allowedRepairActions: ["inspect local runtime logs", "restart the local runtime"]
        }
      })));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.http.port, config.http.host, resolve);
  });

  return Object.freeze({
    config,
    server,
    close() {
      handler.close();
      server.close();
    }
  });
}

function headersFrom(request: IncomingMessage): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    headers[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return headers;
}

async function readRequestBody(request: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length === 0 ? undefined : Buffer.concat(chunks).toString("utf8");
}

function writeResponse(response: ServerResponse, status: number, contentType: string | undefined, body: Buffer): void {
  response.statusCode = status;
  response.setHeader("content-type", contentType ?? "application/octet-stream");
  response.end(body);
}

function safeLogMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(/token|secret|password|authorization|bearer|api_key/gi, "[redacted]");
}
```

- [ ] **Step 7: Implement CLI dispatch and scripts**

Create `packages/local-runtime/src/cli.ts`:

```ts
import { resolveLocalRuntimeConfig } from "./config.js";
import { createLocalRuntimeHttpHandler } from "./http-handler.js";
import { startLocalRuntimeServer } from "./server.js";

export interface LocalRuntimeCliDependencies {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  readonly stdout?: (line: string) => void;
  readonly stderr?: (line: string) => void;
  readonly serve?: () => Promise<void>;
  readonly seedPrr?: () => Promise<unknown>;
}

export async function runLocalRuntimeCli(
  argv: readonly string[],
  dependencies: LocalRuntimeCliDependencies = {}
): Promise<number> {
  const command = argv[0] ?? "serve";
  const stdout = dependencies.stdout ?? console.log;
  const stderr = dependencies.stderr ?? console.error;

  try {
    if (command === "config") {
      stdout(JSON.stringify(redactedConfig(dependencies), null, 2));
      return 0;
    }

    if (command === "seed-prr") {
      const result = dependencies.seedPrr === undefined ? await seedLocalPrr(dependencies) : await dependencies.seedPrr();
      stdout(JSON.stringify(result, null, 2));
      return 0;
    }

    if (command === "health") {
      const config = redactedConfig(dependencies);
      stdout(JSON.stringify({
        ok: true,
        host: config.http.host,
        port: config.http.port,
        bindMode: config.http.bindMode,
        authRequired: config.http.authRequired
      }, null, 2));
      return 0;
    }

    if (command === "serve") {
      if (dependencies.serve !== undefined) {
        await dependencies.serve();
        return 0;
      }
      const started = await startLocalRuntimeServer({
        cwd: dependencies.cwd,
        env: dependencies.env
      });
      stdout(`Cestus local runtime listening on http://${started.config.http.host}:${started.config.http.port}`);
      return 0;
    }

    stderr(`Unknown local runtime command: ${command}`);
    return 1;
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function seedLocalPrr(dependencies: LocalRuntimeCliDependencies): Promise<unknown> {
  const config = resolveLocalRuntimeConfig({
    cwd: dependencies.cwd,
    env: {
      ...(dependencies.env ?? process.env),
      CESTUS_DEV_SEED_PRR: "true"
    }
  });
  const handler = createLocalRuntimeHttpHandler({
    config,
    actor: { id: "actor_local_seed", kind: "system", label: "Local Seed CLI" }
  });
  try {
    const response = await handler({ method: "POST", url: "/api/dev/seed-prr" });
    return JSON.parse(response.body);
  } finally {
    handler.close();
  }
}

function redactedConfig(dependencies: LocalRuntimeCliDependencies) {
  const config = resolveLocalRuntimeConfig({
    cwd: dependencies.cwd,
    env: dependencies.env
  });
  return {
    ...config,
    http: {
      ...config.http,
      authToken: config.http.authToken === undefined ? undefined : "[redacted]"
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await runLocalRuntimeCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
```

Modify `package.json` scripts:

```json
"local:runtime": "tsx packages/local-runtime/src/cli.ts serve",
"local:runtime:config": "tsx packages/local-runtime/src/cli.ts config",
"local:runtime:health": "tsx packages/local-runtime/src/cli.ts health",
"prr:seed-local": "tsx packages/local-runtime/src/cli.ts seed-prr"
```

Keep existing scripts unchanged.

- [ ] **Step 8: Run the targeted green command**

Run:

```bash
npm test -- packages/local-runtime/test/static-files.test.ts packages/local-runtime/test/cli.test.ts
```

Expected: both test files pass.

- [ ] **Step 9: Run the local runtime script smoke checks**

Run:

```bash
npm run local:runtime:config
```

Expected: command prints redacted JSON config and does not print any auth token value.

Run:

```bash
npm run prr:seed-local
```

Expected: command prints JSON seed result. It may append seed events to the repo-local ignored `.cestus/` ledger. Do not commit `.cestus/`.

- [ ] **Step 10: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, all tests, UI build, and factory readiness pass.

- [ ] **Step 11: Commit the task**

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-5-local-runtime-cli.md packages/local-runtime/src/static-files.ts packages/local-runtime/src/server.ts packages/local-runtime/src/cli.ts packages/local-runtime/test/static-files.test.ts packages/local-runtime/test/cli.test.ts package.json package-lock.json
git commit -m "feat: add local runtime server cli"
```

Expected: commit succeeds.

**Rollback:** Revert this task commit. Remove any untracked `.cestus/` state created by the smoke check only after confirming it is ignored and local to this worktree.

**Escalate:** Stop if `tsx` cannot be installed, if static serving can read outside `dist`, or if logs expose secrets.

---

## Task 5A: Config File And Auth Onboarding

**Outcome:** Tailnet and LAN defaults can be created through a deterministic ignored local config file, the CLI generates local auth material when exposure requires it, env vars override config-file defaults, and safe diagnostics never print the token.

**Files:**

- Create: `docs/agentic/claims/task-5a-local-runtime-onboarding-config.md`
- Create: `packages/local-runtime/src/config-file.ts`
- Create: `packages/local-runtime/test/config-file.test.ts`
- Modify: `packages/local-runtime/src/config.ts`
- Modify: `packages/local-runtime/src/cli.ts`
- Modify: `packages/local-runtime/test/config.test.ts`
- Modify: `packages/local-runtime/test/cli.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Claim and start the task**

Create and commit `docs/agentic/claims/task-5a-local-runtime-onboarding-config.md` with status `claimed`, then update it to `in-progress` and commit that transition before editing source files.

Use commit messages:

```bash
git commit -m "chore: claim task 5a local runtime onboarding config"
git commit -m "chore: start task 5a local runtime onboarding config"
```

Expected: both commits succeed.

- [ ] **Step 2: Write failing config-file tests**

Create `packages/local-runtime/test/config-file.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import {
  readLocalRuntimeConfigFile,
  redactLocalRuntimeConfigFile,
  resolveLocalRuntimeConfigFilePath,
  writeLocalRuntimeOnboardingConfig
} from "../src/config-file.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("local runtime config files", () => {
  it("writes deterministic ignored config with generated tailnet auth", () => {
    const cwd = tempDir();

    const written = writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "tailnet",
      host: "100.126.143.105",
      port: 8790
    });

    expect(written.path).toBe(join(cwd, ".cestus/local/runtime.config.json"));
    expect(existsSync(written.path)).toBe(true);
    expect(statSync(written.path).mode & 0o777).toBe(0o600);

    const file = JSON.parse(readFileSync(written.path, "utf8")) as {
      readonly http: { readonly bindMode: string; readonly host: string; readonly port: number; readonly authToken: string };
    };
    expect(file.http).toMatchObject({
      bindMode: "tailnet",
      host: "100.126.143.105",
      port: 8790
    });
    expect(file.http.authToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const resolved = resolveLocalRuntimeConfig({ cwd, env: {} });
    expect(resolved.http).toMatchObject({
      bindMode: "tailnet",
      host: "100.126.143.105",
      port: 8790,
      authRequired: true,
      authToken: file.http.authToken
    });
  });

  it("preserves existing generated auth unless rotation is requested", () => {
    const cwd = tempDir();

    const first = writeLocalRuntimeOnboardingConfig({ cwd, env: {}, bindMode: "lan" });
    const second = writeLocalRuntimeOnboardingConfig({ cwd, env: {}, bindMode: "lan" });
    const rotated = writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "lan",
      rotateAuthToken: true
    });

    expect(second.config.http?.authToken).toBe(first.config.http?.authToken);
    expect(rotated.config.http?.authToken).not.toBe(first.config.http?.authToken);
  });

  it("lets env vars override config-file defaults", () => {
    const cwd = tempDir();
    writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "tailnet",
      host: "100.126.143.105",
      port: 8790
    });

    const resolved = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_BIND: "lan",
        CESTUS_LOCAL_HOST: "0.0.0.0",
        CESTUS_LOCAL_PORT: "8791",
        CESTUS_LOCAL_AUTH_TOKEN: "env-token"
      }
    });

    expect(resolved.http).toMatchObject({
      bindMode: "lan",
      host: "0.0.0.0",
      port: 8791,
      authRequired: true,
      authToken: "env-token"
    });
  });

  it("supports explicit config path overrides and redacts auth material", () => {
    const cwd = tempDir();
    const configPath = join(cwd, "custom-runtime.json");

    const written = writeLocalRuntimeOnboardingConfig({
      cwd,
      env: { CESTUS_LOCAL_CONFIG_PATH: configPath },
      bindMode: "tailnet"
    });
    const file = readLocalRuntimeConfigFile({ cwd, env: { CESTUS_LOCAL_CONFIG_PATH: configPath } });
    const redacted = redactLocalRuntimeConfigFile(file);

    expect(resolveLocalRuntimeConfigFilePath({ cwd, env: { CESTUS_LOCAL_CONFIG_PATH: configPath } })).toBe(configPath);
    expect(written.path).toBe(configPath);
    expect(JSON.stringify(redacted)).not.toContain(file?.http?.authToken ?? "missing-token");
    expect(redacted?.http?.authToken).toBe("[redacted]");
  });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-local-config-file-"));
  tempDirs.push(dir);
  return dir;
}
```

- [ ] **Step 3: Add failing CLI onboarding tests**

Add these tests to `packages/local-runtime/test/cli.test.ts`:

```ts
  it("writes generated tailnet config without printing the auth token", async () => {
    const stdout: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));

    const exitCode = await runLocalRuntimeCli(
      ["configure", "--bind", "tailnet", "--host", "100.126.143.105", "--port", "8790"],
      {
        cwd: tempDir,
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: () => undefined
      }
    );

    const file = JSON.parse(readFileSync(join(tempDir, ".cestus/local/runtime.config.json"), "utf8")) as {
      readonly http: { readonly bindMode: string; readonly host: string; readonly port: number; readonly authToken: string };
    };
    const output = stdout.join("\n");

    expect(exitCode).toBe(0);
    expect(file.http.bindMode).toBe("tailnet");
    expect(file.http.host).toBe("100.126.143.105");
    expect(file.http.port).toBe(8790);
    expect(file.http.authToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(output).toContain('"authToken": "[redacted]"');
    expect(output).not.toContain(file.http.authToken);
  });

  it("uses written config for later config diagnostics", async () => {
    const stdout: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));

    expect(
      await runLocalRuntimeCli(["configure", "--bind", "lan"], {
        cwd: tempDir,
        env: {},
        stdout: () => undefined,
        stderr: () => undefined
      })
    ).toBe(0);

    const exitCode = await runLocalRuntimeCli(["config"], {
      cwd: tempDir,
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: () => undefined
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain('"bindMode": "lan"');
    expect(stdout.join("\n")).toContain('"authRequired": true');
    expect(stdout.join("\n")).toContain('"authToken": "[redacted]"');
  });
```

Update the `node:fs` import at the top of `packages/local-runtime/test/cli.test.ts` so it includes `readFileSync`.

- [ ] **Step 4: Run the targeted red command**

Run:

```bash
npm test -- packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/config.test.ts packages/local-runtime/test/cli.test.ts
```

Expected: Vitest fails because `../src/config-file.js` cannot be resolved and `runLocalRuntimeCli(["configure", ...])` is not implemented.

- [ ] **Step 5: Implement the config-file module**

Create `packages/local-runtime/src/config-file.ts` with these exported contracts:

```ts
export interface LocalRuntimeConfigFile {
  readonly storage?: {
    readonly strategy?: "repo-local" | "explicit-path" | "app-data";
    readonly sqlitePath?: string;
    readonly appDataDir?: string;
  };
  readonly http?: {
    readonly host?: string;
    readonly port?: number;
    readonly bindMode?: "loopback" | "tailnet" | "lan";
    readonly authToken?: string;
    readonly devSeedEnabled?: boolean;
  };
  readonly staticUi?: {
    readonly distDir?: string;
  };
  readonly logs?: {
    readonly dir?: string;
  };
}

export interface WriteLocalRuntimeOnboardingConfigInput {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  readonly bindMode: "loopback" | "tailnet" | "lan";
  readonly host?: string;
  readonly port?: number;
  readonly storageStrategy?: "repo-local" | "explicit-path" | "app-data";
  readonly sqlitePath?: string;
  readonly appDataDir?: string;
  readonly distDir?: string;
  readonly logDir?: string;
  readonly devSeedEnabled?: boolean;
  readonly rotateAuthToken?: boolean;
}
```

Implement these functions:

- `resolveLocalRuntimeConfigFilePath({ cwd, env })`: return `CESTUS_LOCAL_CONFIG_PATH` when set, otherwise `<cwd>/.cestus/local/runtime.config.json`.
- `readLocalRuntimeConfigFile({ cwd, env })`: return `undefined` when the file does not exist; otherwise parse JSON and validate only the fields from `LocalRuntimeConfigFile`. Reject invalid JSON, invalid bind modes, invalid storage strategies, invalid port values, and non-string token/path fields with clear local errors.
- `writeLocalRuntimeOnboardingConfig(input)`: merge existing file settings with the new input, generate `randomBytes(32).toString("base64url")` when `bindMode` is `tailnet` or `lan` and no token exists, preserve the existing token unless `rotateAuthToken` is true, remove `authToken` for `loopback`, create the parent directory recursively, and write pretty JSON with mode `0o600`.
- `redactLocalRuntimeConfigFile(config)`: return a copy with `http.authToken` replaced by `"[redacted]"` when present.

Do not print or log the generated auth token from this module.

- [ ] **Step 6: Wire config-file defaults into config resolution**

Modify `packages/local-runtime/src/config.ts` so `resolveLocalRuntimeConfig()` reads `readLocalRuntimeConfigFile({ cwd, env })` and uses config-file values as defaults before environment variables:

- Env always wins over config file.
- Config file wins over hard-coded defaults.
- `CESTUS_LOCAL_STORAGE` overrides `storage.strategy`.
- `CESTUS_LOCAL_SQLITE_PATH` overrides `storage.sqlitePath`.
- `CESTUS_APP_DATA_DIR` overrides `storage.appDataDir`.
- `CESTUS_LOCAL_BIND`, `CESTUS_LOCAL_HOST`, `CESTUS_LOCAL_PORT`, `CESTUS_LOCAL_AUTH_TOKEN`, `CESTUS_DEV_SEED_PRR`, `CESTUS_UI_DIST_DIR`, and `CESTUS_LOCAL_LOG_DIR` override matching config-file values.
- `devSeedEnabled` is true only when the env var is exactly `"true"` or the config file value is `true`; non-loopback exposure alone must not enable dev seed.
- Non-loopback bind without a token from either env or config file must still throw `Auth is required for non-loopback local runtime exposure`.

- [ ] **Step 7: Implement CLI configure command and script**

Modify `packages/local-runtime/src/cli.ts`:

- Add a `configure` command.
- Parse only these flags: `--bind`, `--host`, `--port`, `--storage`, `--sqlite-path`, `--app-data-dir`, `--ui-dist-dir`, `--log-dir`, `--dev-seed`, `--no-dev-seed`, and `--rotate-auth-token`.
- Reject unknown flags with exit code `1`.
- Require `--bind` to be one of `loopback`, `tailnet`, or `lan`; default to `loopback` when omitted.
- Call `writeLocalRuntimeOnboardingConfig()` and print JSON containing `ok: true`, `configPath`, and the redacted config file.
- Do not print the generated raw auth token.

Modify `package.json` scripts:

```json
"local:runtime:configure": "tsx packages/local-runtime/src/cli.ts configure"
```

Keep the existing local runtime scripts unchanged.

- [ ] **Step 8: Run the targeted green command**

Run:

```bash
npm test -- packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/config.test.ts packages/local-runtime/test/cli.test.ts
```

Expected: listed tests pass.

- [ ] **Step 9: Run onboarding smoke checks**

Run:

```bash
npm run --silent local:runtime:configure -- --bind tailnet --host 100.126.143.105 --port 8790
```

Expected: command prints redacted JSON and creates `.cestus/local/runtime.config.json` under the current repo-local worktree. Do not commit `.cestus/`.

Run:

```bash
npm run local:runtime:config
```

Expected: command prints redacted config and does not print any raw auth token.

Run:

```bash
git status --ignored --short .cestus
rm -rf .cestus
```

Expected: status prints `!! .cestus/` before removal. Only remove `.cestus/` after confirming it is ignored and local to this worktree.

- [ ] **Step 10: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, all tests, UI build, and factory readiness pass.

- [ ] **Step 11: Commit the task**

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-5a-local-runtime-onboarding-config.md packages/local-runtime/src/config-file.ts packages/local-runtime/test/config-file.test.ts packages/local-runtime/src/config.ts packages/local-runtime/src/cli.ts packages/local-runtime/test/config.test.ts packages/local-runtime/test/cli.test.ts package.json
git commit -m "feat: add local runtime onboarding config"
```

Expected: commit succeeds.

**Rollback:** Revert this task commit. Remove any `.cestus/` smoke state only after confirming it is ignored and belongs to this worktree.

**Escalate:** Stop if config-file parsing can silently accept invalid exposure modes, if a non-loopback config can start without auth, if the CLI prints raw auth tokens, or if config-file defaults make dev seed enabled without explicit config.

---

## Task 6: Browser-Safe HTTP Requests Adapter

**Outcome:** The UI has a browser-safe HTTP `RequestsWorkspaceAdapter` implementation that maps local runtime JSON to existing Requests UI result types without importing Node-only modules.

**Files:**

- Create: `docs/agentic/claims/task-6-http-requests-adapter.md`
- Create: `packages/ui/test/request-http-adapter.test.ts`
- Modify: `packages/ui/src/requests/request-adapter.ts`
- Modify: `packages/ui/test/request-data-boundary.test.ts`
- Modify: `packages/ui/test/visual-contract.test.ts`

- [ ] **Step 1: Claim and start the task**

Create and commit `docs/agentic/claims/task-6-http-requests-adapter.md` with status `claimed`, then update it to `in-progress` and commit that transition before editing source files.

Use commit messages:

```bash
git commit -m "chore: claim task 6 http requests adapter"
git commit -m "chore: start task 6 http requests adapter"
```

Expected: both commits succeed.

- [ ] **Step 2: Write the failing HTTP adapter tests**

Create `packages/ui/test/request-http-adapter.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildPrrWorkspaceDto } from "../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import { createHttpRequestsAdapter } from "../src/requests/request-adapter.js";

const workspace = buildPrrWorkspaceDto(buildPrrProjection(prrWorkspaceSeedEvents), {
  now: "2026-07-20T12:00:00.000Z"
});

describe("createHttpRequestsAdapter", () => {
  it("loads workspace DTOs from the local runtime API", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, workspace));
    const adapter = createHttpRequestsAdapter({
      baseUrl: "http://127.0.0.1:8787",
      fetcher
    });

    await expect(adapter.loadRequestsWorkspace()).resolves.toEqual(workspace);
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8787/api/requests/workspace", {
      headers: {},
      method: "GET"
    });
  });

  it("submits draft creation JSON and maps the runtime result", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, {
        ok: true,
        prrRequestId: "prr_http_city_budget",
        committedEventIds: ["evt_created", "evt_deadline"],
        workspace
      })
    );
    const adapter = createHttpRequestsAdapter({
      baseUrl: "",
      authToken: "secret-token",
      fetcher
    });

    const result = await adapter.createDraftRequest({
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "City Clerk" },
      requester: { name: "Avery Investigator" },
      requestText: "All budget amendment memos from January 2026."
    });

    expect(result).toEqual({
      ok: true,
      prrRequestId: "prr_http_city_budget",
      committedEventIds: ["evt_created", "evt_deadline"],
      workspace
    });
    expect(fetcher).toHaveBeenCalledWith("/api/requests/drafts", {
      body: expect.stringContaining("City Clerk"),
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json"
      },
      method: "POST"
    });
  });

  it("turns HTTP failures into safe diagnostics", async () => {
    const fetcher = vi.fn(async () => jsonResponse(503, { message: "Bearer raw-token" }));
    const adapter = createHttpRequestsAdapter({ fetcher });

    const result = await adapter.createDraftRequest({
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "City Clerk" },
      requester: { name: "Avery Investigator" },
      requestText: "All budget amendment memos from January 2026."
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedStep).toBe("append-request");
      expect(result.diagnostic.message).toBe("Requests runtime returned HTTP 503.");
      expect(result.diagnostic.message).not.toContain("raw-token");
    }
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
```

- [ ] **Step 3: Run the targeted red command**

Run:

```bash
npm test -- packages/ui/test/request-http-adapter.test.ts packages/ui/test/request-data-boundary.test.ts packages/ui/test/visual-contract.test.ts
```

Expected: `request-http-adapter.test.ts` fails because `createHttpRequestsAdapter` does not exist.

- [ ] **Step 4: Implement the HTTP adapter**

In `packages/ui/src/requests/request-adapter.ts`, add:

```ts
export interface HttpRequestsAdapterOptions {
  readonly baseUrl?: string;
  readonly authToken?: string;
  readonly fetcher?: typeof fetch;
}

export function createHttpRequestsAdapter(
  options: HttpRequestsAdapterOptions = {}
): RequestsWorkspaceAdapter {
  const baseUrl = options.baseUrl ?? "";
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);

  return Object.freeze({
    async loadRequestsWorkspace() {
      const response = await fetcher(`${baseUrl}/api/requests/workspace`, {
        method: "GET",
        headers: authHeaders(options.authToken)
      });
      if (!response.ok) {
        throw new Error(`Requests runtime returned HTTP ${response.status}.`);
      }
      return (await response.json()) as PrrWorkspaceDto;
    },
    async createDraftRequest(input: RequestsCreateDraftInput) {
      const response = await fetcher(`${baseUrl}/api/requests/drafts`, {
        method: "POST",
        headers: {
          ...authHeaders(options.authToken),
          "content-type": "application/json"
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        return httpFailure(response.status, await safeWorkspaceFallback());
      }

      return (await response.json()) as RequestsCreateDraftResult;
    }
  });
}

export const httpRequestsAdapter = createHttpRequestsAdapter();

function authHeaders(authToken: string | undefined): Record<string, string> {
  return authToken === undefined ? {} : { authorization: `Bearer ${authToken}` };
}

async function safeWorkspaceFallback(): Promise<PrrWorkspaceDto> {
  return buildPrrWorkspaceDto(buildPrrProjection([]), { now: new Date().toISOString() });
}

async function httpFailure(status: number, workspace: PrrWorkspaceDto): Promise<RequestsCreateDraftResult> {
  return Object.freeze({
    ok: false,
    failedStep: "append-request",
    committedEventIds: Object.freeze([]),
    diagnostic: Object.freeze({
      message: `Requests runtime returned HTTP ${status}.`,
      allowedRepairActions: Object.freeze(["reload Requests", "check the local runtime"])
    }),
    workspace
  });
}
```

If TypeScript reports duplicate helper names or ordering issues, adapt the names while keeping the exported `createHttpRequestsAdapter` and `httpRequestsAdapter` stable.

- [ ] **Step 5: Tighten boundary and visual contract tests**

Update `packages/ui/test/request-data-boundary.test.ts` so product UI source remains forbidden from importing:

- `node:*`
- `SQLiteEventLedger`
- `sqlite-event-ledger`
- `packages/prr/src/runtime`
- `packages/local-runtime/src/config`
- `packages/local-runtime/src/server`
- `packages/local-runtime/src/http-handler`
- `packages/local-runtime/src/runtime-factory`

Update `packages/ui/test/visual-contract.test.ts` so the adapter contract expects:

```ts
expect(adapterSource).toContain("createHttpRequestsAdapter");
expect(adapterSource).toContain("httpRequestsAdapter");
expect(adapterSource).toContain("createLocalReplayRequestsAdapter");
expect(adapterSource).not.toContain("className=");
```

- [ ] **Step 6: Run the targeted green command**

Run:

```bash
npm test -- packages/ui/test/request-http-adapter.test.ts packages/ui/test/request-data-boundary.test.ts packages/ui/test/visual-contract.test.ts
```

Expected: listed tests pass.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, all tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit the task**

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-6-http-requests-adapter.md packages/ui/test/request-http-adapter.test.ts packages/ui/src/requests/request-adapter.ts packages/ui/test/request-data-boundary.test.ts packages/ui/test/visual-contract.test.ts
git commit -m "feat: add http requests adapter"
```

Expected: commit succeeds.

**Rollback:** Revert this task commit. The local runtime host remains testable through local-runtime package tests.

**Escalate:** Stop if the UI adapter needs to import runtime, SQLite, Node modules, or local-runtime server/config files.

---

## Task 7: App Defaults To Durable HTTP Runtime

**Outcome:** `App` defaults to the HTTP Requests adapter, tests inject static adapters where they need deterministic data, and existing Requests UI behavior remains covered.

**Files:**

- Create: `docs/agentic/claims/task-7-app-http-default.md`
- Create: `packages/ui/test/request-test-utils.ts`
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/test/app-smoke.test.tsx`
- Modify: `packages/ui/test/request-builder.test.tsx`
- Modify: `packages/ui/test/request-board.test.tsx`
- Modify: `packages/ui/test/request-shell.test.tsx`
- Modify: `packages/ui/test/right-rail.test.tsx`
- Modify: `packages/ui/test/request-data-boundary.test.ts`

- [ ] **Step 1: Claim and start the task**

Create and commit `docs/agentic/claims/task-7-app-http-default.md` with status `claimed`, then update it to `in-progress` and commit that transition before editing source files.

Use commit messages:

```bash
git commit -m "chore: claim task 7 app http default"
git commit -m "chore: start task 7 app http default"
```

Expected: both commits succeed.

- [ ] **Step 2: Add test helper and failing App default coverage**

Create `packages/ui/test/request-test-utils.ts`:

```ts
import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildPrrWorkspaceDto } from "../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import { createStaticRequestsAdapter } from "../src/requests/request-adapter.js";

export function buildTestRequestsWorkspace() {
  return buildPrrWorkspaceDto(buildPrrProjection(prrWorkspaceSeedEvents), {
    now: "2026-07-20T12:00:00.000Z"
  });
}

export function createTestRequestsAdapter() {
  return createStaticRequestsAdapter(buildTestRequestsWorkspace());
}
```

In `packages/ui/test/app-smoke.test.tsx`, add a test:

```ts
it("uses the HTTP Requests adapter as the product default", async () => {
  const workspace = buildTestRequestsWorkspace();
  const fetchCalls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    fetchCalls.push(String(url));
    return new Response(JSON.stringify(workspace), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  try {
    render(<App />);
    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    expect(await screen.findByText("Building Services Department")).toBeInTheDocument();
    expect(fetchCalls).toEqual(["/api/requests/workspace"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

Update existing App tests that need seeded data to render:

```tsx
render(<App requestsAdapter={createTestRequestsAdapter()} />);
```

Keep one default `<App />` test for the HTTP adapter default.

- [ ] **Step 3: Run the targeted red command**

Run:

```bash
npm test -- packages/ui/test/app-smoke.test.tsx packages/ui/test/request-builder.test.tsx packages/ui/test/request-board.test.tsx packages/ui/test/request-shell.test.tsx packages/ui/test/right-rail.test.tsx packages/ui/test/request-data-boundary.test.ts
```

Expected: tests fail because `App` still defaults to `localReplayRequestsAdapter` and some tests still assume seeded default data.

- [ ] **Step 4: Update App default adapter**

In `packages/ui/src/App.tsx`, change the imports from `request-adapter.ts` so `App` uses `httpRequestsAdapter`:

```ts
import {
  httpRequestsAdapter,
  type RequestsCreateDraftInput,
  type RequestsWorkspaceAdapter
} from "./requests/request-adapter.js";
```

Change the component default:

```ts
export function App({ requestsAdapter = httpRequestsAdapter }: AppProps = {}) {
```

Update the Requests loading copy in `renderRequestsMain` to describe the local runtime:

```tsx
Replaying the durable local PRR ledger into the workspace DTO.
```

Do not remove `createLocalReplayRequestsAdapter`; it remains useful for tests and browser-safe preview support.

- [ ] **Step 5: Update App tests to use injected adapters**

In `packages/ui/test/app-smoke.test.tsx`, `packages/ui/test/request-builder.test.tsx`, `packages/ui/test/request-board.test.tsx`, `packages/ui/test/request-shell.test.tsx`, and `packages/ui/test/right-rail.test.tsx`, use `createTestRequestsAdapter()` for tests that navigate into seeded Requests data.

Keep behavior assertions unchanged unless they refer to the old in-browser replay loading copy. Replace that copy expectation with:

```ts
expect(screen.getByText("Replaying the durable local PRR ledger into the workspace DTO.")).toBeInTheDocument();
```

Update `packages/ui/test/request-data-boundary.test.ts` to assert that `App.tsx` imports `httpRequestsAdapter` and does not import `localReplayRequestsAdapter`.

- [ ] **Step 6: Run the targeted green command**

Run:

```bash
npm test -- packages/ui/test/app-smoke.test.tsx packages/ui/test/request-builder.test.tsx packages/ui/test/request-board.test.tsx packages/ui/test/request-shell.test.tsx packages/ui/test/right-rail.test.tsx packages/ui/test/request-data-boundary.test.ts
```

Expected: listed tests pass.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, all tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit the task**

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-7-app-http-default.md packages/ui/test/request-test-utils.ts packages/ui/src/App.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/request-builder.test.tsx packages/ui/test/request-board.test.tsx packages/ui/test/request-shell.test.tsx packages/ui/test/right-rail.test.tsx packages/ui/test/request-data-boundary.test.ts
git commit -m "feat: default requests to http runtime"
```

Expected: commit succeeds.

**Rollback:** Revert this task commit. The HTTP adapter remains available but the app returns to local replay default.

**Escalate:** Stop if App defaulting to HTTP forces product UI to import Node-only modules or breaks test injection of static adapters.

---

## Task 8: Readiness, Factory Evidence, And Local Runtime Preview

**Outcome:** Factory readiness requires the new spec and plan, full verification passes, and the local HTTP host can serve the built UI and PRR API for human review.

**Files:**

- Create: `docs/agentic/claims/task-8-durable-runtime-readiness.md`
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`
- Modify: `packages/ui/test/request-data-boundary.test.ts`
- Modify: `packages/ui/test/app-smoke.test.tsx`

- [ ] **Step 1: Claim and start the task**

Create and commit `docs/agentic/claims/task-8-durable-runtime-readiness.md` with status `claimed`, then update it to `in-progress` and commit that transition before editing source files.

Use commit messages:

```bash
git commit -m "chore: claim task 8 durable runtime readiness"
git commit -m "chore: start task 8 durable runtime readiness"
```

Expected: both commits succeed.

- [ ] **Step 2: Add failing readiness expectations**

Update `packages/ui/test/request-data-boundary.test.ts` so the readiness test expects:

```ts
const durableRuntimeSpecPath = "docs/superpowers/specs/2026-07-05-durable-local-prr-runtime-design.md";
const durableRuntimePlanPath = "docs/superpowers/plans/2026-07-05-durable-local-prr-runtime-implementation.md";
expect(requiredFiles).toEqual(expect.arrayContaining([durableRuntimeSpecPath, durableRuntimePlanPath]));
```

Add or update an app smoke assertion that the default HTTP path still handles a local runtime error:

```ts
it("shows a safe Requests runtime error when the default HTTP adapter cannot load", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: false }), {
      status: 503,
      headers: { "content-type": "application/json" }
    })) as typeof fetch;

  try {
    render(<App />);
    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    const errorRegion = await screen.findByRole("region", { name: "Requests load error" });
    expect(errorRegion).toHaveTextContent("Requests runtime returned HTTP 503.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 3: Run the targeted red command**

Run:

```bash
npm test -- packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx
```

Expected: readiness expectation fails because `scripts/check-agent-readiness.mjs` does not yet require the new durable runtime spec and plan.

- [ ] **Step 4: Update factory readiness**

In `scripts/check-agent-readiness.mjs`, add:

```js
  "docs/superpowers/specs/2026-07-05-durable-local-prr-runtime-design.md",
  "docs/superpowers/plans/2026-07-05-durable-local-prr-runtime-implementation.md"
```

to `requiredFiles`.

Append this section to `docs/agentic/software-factory.md` after the Requests Detail Modal readiness section:

````markdown
## Durable Local PRR Runtime Plan Readiness

The durable local PRR runtime plan was prepared from the approved design spec on 2026-07-05.

Required design and plan files:

- `docs/superpowers/specs/2026-07-05-durable-local-prr-runtime-design.md`
- `docs/superpowers/plans/2026-07-05-durable-local-prr-runtime-implementation.md`

Factory readiness now checks both files through `scripts/check-agent-readiness.mjs`.

Recorded command evidence:

```text
npm test -- packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx
Test Files  2 passed (2)

npm run factory:check
factory-readiness passed

npm run verify
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

Preview evidence: pending local runtime preview gate.
````

- [ ] **Step 5: Run the targeted green command**

Run:

```bash
npm test -- packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx
```

Expected: listed tests pass.

- [ ] **Step 6: Run factory readiness and full verification**

Run:

```bash
npm run factory:check
npm run verify
```

Expected: factory readiness passes, then full verification passes.

- [ ] **Step 7: Build UI and start local runtime preview**

Run:

```bash
npm run ui:build
```

Expected: Vite build succeeds.

Start the local runtime host:

```bash
CESTUS_LOCAL_PORT=8788 npm run local:runtime
```

Expected: the server prints `Cestus local runtime listening on http://127.0.0.1:8788`.

In another terminal, run:

```bash
curl -I http://127.0.0.1:8788/
curl -s http://127.0.0.1:8788/api/health
curl -s http://127.0.0.1:8788/api/requests/workspace
```

Expected:

- `/` returns `HTTP/1.1 200 OK`.
- `/api/health` returns JSON with `"ok":true`, `"bindMode":"loopback"`, and `"authRequired":false`.
- `/api/requests/workspace` returns JSON with `"cards":[]` unless the repo-local ignored ledger has already been explicitly seeded.

Record the preview URLs and command evidence in the claim. Stop the local runtime server before ending the task.

- [ ] **Step 8: Commit readiness changes**

Update the claim with command evidence, preview evidence, and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-8-durable-runtime-readiness.md scripts/check-agent-readiness.mjs docs/agentic/software-factory.md packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx
git commit -m "test: finalize durable runtime readiness"
```

Expected: commit succeeds.

**Rollback:** Revert this task commit. Earlier runtime and UI tasks remain reviewable.

**Escalate:** Stop if the local runtime cannot serve the built UI, if `/api/health` exposes secrets, if `/api/requests/workspace` seeds automatically, or if `npm run verify` fails after two focused repair attempts.

---

## Milestone Review Gates

- After Task 3, request a runtime/storage review focused on append-only SQLite behavior, restart/reopen proof, safe JSON diagnostics, and no browser exposure.
- After Task 4, request a security review focused on non-loopback auth, dev seed disabled-by-default behavior, and absence of destructive routes.
- After Task 7, request a UI/data-boundary review focused on HTTP adapter default, test injection, no Node imports in UI, and builder reload behavior.
- After Task 8, request final factory readiness review and human preview approval.

## Completion Criteria

- `packages/local-runtime` resolves repo-local storage, explicit path storage, app-data strategy, loopback default, non-loopback auth, dev seed, static UI, and logs.
- `.cestus/` local state is ignored.
- Deterministic local config files under `.cestus/local/` can store repo-local runtime defaults without being committed.
- Tailnet/LAN onboarding through CLI/config file generates local auth material, redacts it from diagnostics, and preserves it unless explicitly rotated.
- Env vars override config-file defaults so dev/test and packaged hosts can inject settings without rewriting local files.
- `PrrRuntime.createDraftRequest()` success results include `prrRequestId`.
- Local HTTP `GET /api/requests/workspace` returns an empty workspace from an empty SQLite ledger without seeding.
- Local HTTP `POST /api/requests/drafts` appends draft and deadline events through `createPrrRuntime`.
- Recreating the local runtime against the same SQLite file shows the newly created draft from replay.
- `POST /api/dev/seed-prr` is disabled by default, explicit when enabled, idempotent, and never overwrites existing ledgers.
- Non-loopback bind requires auth.
- No route deletes, resets, truncates, compacts, sends email, or triggers legal escalation.
- Local runtime can serve the built Vite UI and the PRR API from one host.
- The UI default Requests adapter is HTTP-backed.
- Product UI imports no `request-fixtures`, `node:*`, `SQLiteEventLedger`, `sqlite-event-ledger`, PRR runtime module, or local-runtime server/config modules.
- Static and local replay adapters remain available for focused tests.
- `npm run verify` passes.
- Factory readiness includes the durable local runtime spec and plan.
- Human preview gate is satisfied or explicitly skipped by the user.

## Execution Handoff

Run this plan task-by-task. Use `superpowers:subagent-driven-development` when available so implementation workers and reviewers have separate context. Use `superpowers:executing-plans` for inline execution if subagents are unavailable. Do not start Task 2 until Task 1 is committed and reviewed, and continue that sequencing through Task 5, Task 5A, Task 6, Task 7, and Task 8.
