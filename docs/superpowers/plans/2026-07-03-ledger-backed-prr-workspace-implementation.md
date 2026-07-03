# Ledger-Backed PRR Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Requests workspace fixture product path with replayable PRR ledger DTOs, a durable local PRR runtime, and a builder flow that appends draft request and deadline estimate events.

**Architecture:** Keep the append-only ontology ledger as source of truth. Expand PRR projection state, map it to serializable `PrrWorkspaceDto` read models, wrap ledger access in a Node-only PRR runtime, and connect React through a small adapter that can be backed by durable runtime or local replay seed data without importing SQLite into the browser.

**Tech Stack:** TypeScript, React, Vite, Vitest, Zod, existing `EventLedger`, `InMemoryEventLedger`, `SQLiteEventLedger`, PRR jurisdiction packs, PRR deadline helpers, and Markdown factory task claims.

---

## Research Inputs

Local Cestus patterns to preserve:

- The PRR backend thread used durable claim files, exact red and green commands, `npm run verify`, review-fix evidence, and small commits per task. The best examples are `docs/agentic/claims/task-5-legal-escalation-gate.md`, `docs/agentic/claims/task-10-prr-projection.md`, `docs/agentic/claims/task-11-prr-read-api.md`, and `docs/agentic/claims/final-review-prr-completion-fixes.md`.
- The PRR workspace UI thread used a controller branch, fresh workers per task, spec review, code-quality review, focused regression fixes, full verification after each accepted task, and a tailnet human review gate. This was visible in the sibling Codex thread `019f1de2-2dd1-7f93-a4ae-c5bdc2d51013` and in `docs/superpowers/plans/2026-07-03-public-records-request-workspace-ui-implementation.md`.

External agentic-development references to apply:

- Steipete, [Just Talk To It](https://steipete.me/posts/just-talk-to-it): start by reading code and discussing the shape, keep docs current, use tests to expose issues after feature work, and reserve refactor effort for keeping agent-produced code maintainable.
- Steipete, [My Current AI Dev Workflow](https://steipete.me/posts/2025/optimal-ai-development-workflow): use plan mode for larger work, keep tasks small, add tests for bigger changes, and use review from a separate context when risk rises.
- Factory AI, [Factory 2.0](https://factory.ai/news/software-factory): treat the work as a loop from signal to planned change, build, test, review, ship, and observe, with durable context owned by the project.
- Factory AI, [How Missions Work](https://factory.ai/news/missions-architecture): split broad work into focused worker tasks with shared state, explicit validation, and separate reviewer incentives.
- Factory AI, [Planning & Validation](https://docs.factory.ai/features/missions/planning): invest in the plan, define milestones and validation frequency, and keep app exercise commands reliable for autonomous QA.

## Required Reading

Every worker must read these files before editing:

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
- `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
- `docs/superpowers/specs/2026-07-01-public-records-request-workflow-design.md`
- `docs/superpowers/plans/2026-07-01-public-records-request-workflow-implementation.md`
- `docs/superpowers/specs/2026-07-03-public-records-request-workspace-ui-design.md`
- `docs/superpowers/plans/2026-07-03-public-records-request-workspace-ui-implementation.md`
- `docs/superpowers/specs/2026-07-03-ledger-backed-prr-workspace-design.md`
- This implementation plan

Workers must also read the source and test files listed in their task before editing.

## Factory Rules

- Start each task by creating and committing a durable claim file at `docs/agentic/claims/task-<number>-<slug>.md`.
- The claim must record the plan path, task heading, worker identity, branch, worktree path, claimed-at UTC timestamp, owned files, status, red command/result, green command/result, full verification result, review status, and concerns.
- Use statuses from `docs/agentic/software-factory.md`: `claimed`, `in-progress`, `blocked`, `ready-for-review`, `released`, `merged`.
- Do not edit files outside the task allowed file list unless a verifier exposes a narrow supporting edit. Record any supporting edit in the claim before committing.
- Write or update the failing test before production code for tasks that change runtime behavior.
- Run the targeted command exactly as written for the task. Record the expected red failure and green pass in the claim.
- Run `npm run verify` before each implementation commit.
- Commit after each task with a focused message.
- Stop and escalate on data-loss risk, schema conflict, live credential needs, browser import of Node-only runtime code, autonomous send/escalation behavior, or repeated verifier failure after two focused repair attempts.

## File Map

PRR backend and runtime:

- `packages/prr/src/projection.ts`: replay PRR events into immutable request read models.
- `packages/prr/src/read-api.ts`: expose `PrrWorkspaceDto` and deterministic DTO builders for the UI boundary.
- `packages/prr/src/draft-events.ts`: pure draft-request event construction shared by runtime and browser-safe replay adapters.
- `packages/prr/src/runtime.ts`: Node-only local runtime around `EventLedger` for load, seed, and create-draft operations.
- `packages/prr/src/workspace-seed.ts`: browser-safe golden PRR seed events used by local preview and runtime seed tests.
- `packages/prr/src/index.ts`: exports new backend contracts.
- `packages/prr/test/fixtures/golden-prr-ledger.ts`: test fixture facade for golden ledger seed events.
- `packages/prr/test/projection.test.ts`: projection replay and immutability coverage.
- `packages/prr/test/read-api.test.ts`: DTO derivation coverage.
- `packages/prr/test/runtime.test.ts`: runtime, SQLite replay, seeding, and partial failure coverage.

Requests UI:

- `packages/ui/src/requests/request-types.ts`: React-facing DTO aliases and local view-model types.
- `packages/ui/src/requests/request-model.ts`: saved-view filtering, lane grouping, selected request, and signal-map filtering over backend DTOs.
- `packages/ui/src/requests/request-adapter.ts`: UI adapter interface and browser-safe local replay adapter.
- `packages/ui/src/requests/RequestWorkspace.tsx`: renders loaded workspace DTOs.
- `packages/ui/src/requests/RequestBuilder.tsx`: captures builder input and calls the adapter submit callback.
- `packages/ui/src/App.tsx`: loads the Requests workspace through the adapter and reloads after draft creation.
- `packages/ui/src/requests/request-fixtures.ts`: retained only for tests that explicitly need visual seed data, or removed when unused.
- `packages/ui/test/request-model.test.ts`: view model coverage with backend DTOs.
- `packages/ui/test/request-board.test.tsx`: board rendering coverage with backend DTOs.
- `packages/ui/test/request-detail-rail.test.tsx`: detail rail coverage with backend DTOs.
- `packages/ui/test/request-signal-map.test.tsx`: signal map sparse-edge coverage.
- `packages/ui/test/request-builder.test.tsx`: builder form, submit, focus, and error coverage.
- `packages/ui/test/app-smoke.test.tsx`: end-to-end App coverage for Requests route and builder reload.
- `packages/ui/test/request-data-boundary.test.ts`: static import guard for fixture and Node-only boundary drift.
- `packages/ui/test/visual-contract.test.ts`: visual contract updates when UI structure changes.
- `packages/ui/test/ui-picker.test.tsx`: picker cleanup contract updates when fixture usage changes.

Factory readiness:

- `docs/agentic/claims/*.md`: task claims and review evidence.
- `docs/agentic/software-factory.md`: final readiness evidence update.
- `scripts/check-agent-readiness.mjs`: include this spec and plan in readiness checks after implementation begins.

---

## Task 1: Rich PRR Projection And Ledger Seed

**Outcome:** Golden PRR seed events cover the UI states, and `buildPrrProjection` rebuilds rich immutable request state from replay.

**Allowed files:**

- `docs/agentic/claims/task-1-rich-prr-projection.md`
- `packages/prr/src/workspace-seed.ts`
- `packages/prr/test/fixtures/golden-prr-ledger.ts`
- `packages/prr/test/projection.test.ts`
- `packages/prr/src/projection.ts`
- `packages/prr/src/index.ts`

**Steps:**

- [ ] Claim the task in `docs/agentic/claims/task-1-rich-prr-projection.md`, commit the claim, then set status to `in-progress`.
- [ ] Expand the golden PRR ledger seed into `packages/prr/src/workspace-seed.ts`. Keep `packages/prr/test/fixtures/golden-prr-ledger.ts` as a test facade that re-exports the seed as `goldenPrrLedgerEvents`.
- [ ] Cover these request IDs in the seed:
  - `prr_req_001`: production arrived with evidence IDs, preserving current test continuity.
  - `prr_draft_city_budget`: created draft with estimated deadline.
  - `prr_sent_police_logs`: sent request with outbound correspondence metadata.
  - `prr_ack_florida_records`: acknowledged request with inbound correspondence.
  - `prr_fee_building_permits`: fee estimate and fee challenge.
  - `prr_scope_vendor_contracts`: scope narrowing proposed and accepted.
  - `prr_denial_personnel`: denial recorded.
  - `prr_appeal_personnel`: appeal created after denial.
  - `prr_stalling_vendor_emails`: possible and confirmed stalling plus legal escalation confirmation.
- [ ] Add projection tests before production changes. Include assertions shaped like:

```ts
it("rebuilds rich request state from golden PRR seed events", () => {
  const projection = buildPrrProjection(goldenPrrLedgerEvents);

  expect([...projection.requests.keys()].sort()).toEqual([
    "prr_ack_florida_records",
    "prr_appeal_personnel",
    "prr_denial_personnel",
    "prr_draft_city_budget",
    "prr_fee_building_permits",
    "prr_req_001",
    "prr_scope_vendor_contracts",
    "prr_sent_police_logs",
    "prr_stalling_vendor_emails"
  ]);

  expect(projection.requests.get("prr_fee_building_permits")).toMatchObject({
    prrRequestId: "prr_fee_building_permits",
    status: "inNegotiation",
    agencyName: "Building Services Department",
    feeEstimate: {
      amountCents: 185000,
      currency: "USD",
      challenged: true,
      challengeId: "fee_challenge_building_permits"
    }
  });

  expect(projection.requests.get("prr_scope_vendor_contracts")).toMatchObject({
    scopeNarrowing: {
      narrowingId: "narrow_vendor_contracts",
      proposedScope: "Contracts active between 2024-01-01 and 2026-06-30",
      acceptedScope: "Contracts active between 2025-01-01 and 2026-06-30"
    }
  });

  expect(projection.requests.get("prr_stalling_vendor_emails")).toMatchObject({
    possibleStalling: true,
    confirmedStalling: true,
    legalEscalation: {
      confirmedBy: "investigator@example.org"
    }
  });
});
```

- [ ] Add mutation-protection tests for nested fields: contacts, deadline cited rules, correspondence metadata, fee estimate, scope narrowing, production batches, denial, appeal, stalling signals, legal escalation, and timeline entries.
- [ ] Run the targeted red command:

```bash
npm test -- packages/prr/test/projection.test.ts
```

Expected red result: Vitest fails in `projection.test.ts` because `workspace-seed.ts` or the rich projected fields do not exist yet.

- [ ] Extend `PrrRequestReadModel` and the internal mutable model in `packages/prr/src/projection.ts`. Add exported nested interfaces for contacts, jurisdiction pack references, cited rules, correspondence summaries, fee estimates, scope narrowing, production batches, denial, appeal, stalling signals, and legal escalation.
- [ ] Update `applyPrrEvent` for:
  - `prr.request.created`
  - `prr.request.sent`
  - `prr.correspondence.received`
  - `prr.deadline.estimated`
  - `prr.deadline.confirmed`
  - `prr.fee.estimated`
  - `prr.fee.challenged`
  - `prr.scope.narrowing.proposed`
  - `prr.scope.narrowing.accepted`
  - `prr.production.received`
  - `prr.exemption.claimed`
  - `prr.denial.recorded`
  - `prr.appeal.created`
  - `prr.stalling.detected`
  - `prr.stalling.confirmed`
  - `prr.legal-escalation.confirmed`
  - `prr.request.closed`
- [ ] Preserve current behavior where confirmed deadlines override estimates and later estimates do not override confirmed deadlines.
- [ ] Deep-clone and freeze all returned nested arrays and objects.
- [ ] Export the seed file from `packages/prr/src/index.ts`.
- [ ] Run the targeted green command:

```bash
npm test -- packages/prr/test/projection.test.ts
```

Expected green result: the projection test file passes and includes the rich-state and mutation-protection cases.

- [ ] Run full verification:

```bash
npm run verify
```

Expected output includes `typecheck passed`, Vitest pass output, `tests passed`, Vite build success, and `factory-readiness passed`.

- [ ] Update the claim with command evidence and set status to `ready-for-review`. Commit the task.

**Rollback:** Revert the task commit and release the claim. The prior thin projection must still pass existing tests.

**Escalate:** Stop if a desired UI state requires a new event contract rather than an existing PRR event, or if seed causation cannot be represented without weakening event validation.

---

## Task 2: Workspace DTO Read API

**Outcome:** `packages/prr/src/read-api.ts` exposes a serializable `PrrWorkspaceDto` that drives board lanes, saved views, details, sparse signal map, builder steps, diagnostics, and queue rows from projection replay.

**Allowed files:**

- `docs/agentic/claims/task-2-prr-workspace-dto.md`
- `packages/prr/test/read-api.test.ts`
- `packages/prr/src/read-api.ts`
- `packages/prr/src/index.ts`

**Steps:**

- [ ] Claim the task, commit the claim, then set status to `in-progress`.
- [ ] Add failing DTO tests before production changes. Include assertions shaped like:

```ts
it("builds a rich workspace DTO from the golden projection", () => {
  const workspace = buildPrrWorkspaceDto(buildPrrProjection(goldenPrrLedgerEvents), {
    now: "2026-07-20T12:00:00.000Z"
  });

  expect(workspace.savedViews.map((view) => view.id)).toEqual([
    "all-active",
    "overdue",
    "florida-fees",
    "productions-arrived"
  ]);
  expect(workspace.laneOrder).toEqual([
    "drafting",
    "ready-to-send",
    "awaiting-agency",
    "needs-follow-up",
    "review-fee-scope",
    "production-arrived",
    "appeal-escalation"
  ]);
  expect(workspace.cards.map((card) => card.prrRequestId)).toContain("prr_fee_building_permits");
  expect(workspace.requestDetails.map((detail) => detail.prrRequestId)).toContain("prr_req_001");
  expect(workspace.signalMap.edges).toEqual([]);
  expect(workspace.builder.steps.every((step) => step.suggestedFills.length === 0)).toBe(true);
});

it("derives deterministic lane and gate posture from replayed events", () => {
  const workspace = buildPrrWorkspaceDto(buildPrrProjection(goldenPrrLedgerEvents), {
    now: "2026-07-20T12:00:00.000Z"
  });

  expect(cardById(workspace, "prr_draft_city_budget")).toMatchObject({
    laneId: "drafting",
    severity: "low",
    deadlineSource: "estimated"
  });
  expect(cardById(workspace, "prr_fee_building_permits")).toMatchObject({
    laneId: "review-fee-scope",
    severity: "high",
    feeSignal: "$1,850.00 challenged"
  });
  expect(cardById(workspace, "prr_stalling_vendor_emails")).toMatchObject({
    laneId: "appeal-escalation",
    severity: "critical"
  });

  const stallingDetail = detailById(workspace, "prr_stalling_vendor_emails");
  expect(stallingDetail.escalationGate.some((check) => check.id === "user-confirmed-escalation")).toBe(true);
  expect(stallingDetail.escalationGate.every((check) => typeof check.detail === "string")).toBe(true);
});
```

- [ ] Keep the existing `buildRequestQueueRows` tests, updating expected values only where the richer projection changes status or production counts.
- [ ] Run the targeted red command:

```bash
npm test -- packages/prr/test/read-api.test.ts
```

Expected red result: Vitest fails because `buildPrrWorkspaceDto` and DTO fields are absent.

- [ ] Implement DTO types in `read-api.ts` with stable exported names rooted at `PrrWorkspaceDto`, including saved views, cards, details, gates, action packets, evidence packets, diagnostics, timeline, signal map, and builder model.
- [ ] Implement `buildPrrWorkspaceDto(projection, options)` with deterministic derivation rules from the approved design:
  - Saved views: `all-active`, `overdue`, `florida-fees`, `productions-arrived`.
  - Lane IDs: `drafting`, `ready-to-send`, `awaiting-agency`, `needs-follow-up`, `review-fee-scope`, `production-arrived`, `appeal-escalation`.
  - Signal-map nodes from visible agencies; signal-map edges empty unless backed by replayed relationship evidence.
  - Builder steps from jurisdiction packs and shipped workflow structure; learned suggestions empty.
  - Send gates locked unless event-backed readiness exists.
  - Legal escalation gates never ready from estimates alone.
- [ ] Sort DTO arrays deterministically by lane order, agency name, severity rank, deadline date, then request ID.
- [ ] Preserve `buildRequestQueueRows` as a compatibility helper backed by the richer read models.
- [ ] Export new read API types from `packages/prr/src/index.ts`.
- [ ] Run the targeted green command:

```bash
npm test -- packages/prr/test/read-api.test.ts
```

Expected green result: the read API test file passes and proves sparse unsupported fields are empty rather than fabricated.

- [ ] Run full verification:

```bash
npm run verify
```

Expected output includes `typecheck passed`, Vitest pass output, `tests passed`, Vite build success, and `factory-readiness passed`.

- [ ] Update the claim with command evidence and set status to `ready-for-review`. Commit the task.

**Rollback:** Revert the task commit. The projection from Task 1 remains useful without the DTO boundary.

**Escalate:** Stop if DTO derivation needs request facts that are not in PRR events or jurisdiction packs. Use sparse fields rather than inventing state.

---

## Task 3: Local PRR Runtime And Draft Event Builder

**Outcome:** `packages/prr` exposes a Node-only runtime that loads workspace DTOs, seeds empty ledgers idempotently, appends builder-created draft and deadline events, proves SQLite reopen replay, and returns inspectable partial failures without deleting events.

**Allowed files:**

- `docs/agentic/claims/task-3-prr-runtime.md`
- `packages/prr/test/runtime.test.ts`
- `packages/prr/src/draft-events.ts`
- `packages/prr/src/runtime.ts`
- `packages/prr/src/index.ts`

**Steps:**

- [ ] Claim the task, commit the claim, then set status to `in-progress`.
- [ ] Add failing runtime tests before production changes. Include coverage shaped like:

```ts
it("loads a workspace from an in-memory ledger seeded with golden events", async () => {
  const ledger = new InMemoryEventLedger();
  const runtime = createPrrRuntime({ ledger, actor: investigatorActor, now: fixedNow });

  const seedResult = await runtime.seedIfEmpty(goldenPrrLedgerEvents);
  expect(seedResult.appendedCount).toBe(goldenPrrLedgerEvents.length);
  expect((await runtime.loadWorkspace()).cards.length).toBeGreaterThan(1);

  const secondSeed = await runtime.seedIfEmpty(goldenPrrLedgerEvents);
  expect(secondSeed).toEqual({ appendedCount: 0, skipped: true });
});

it("replays the same workspace after SQLite close and reopen", async () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "cestus-prr-")), "ledger.sqlite");
  const firstLedger = new SQLiteEventLedger(dbPath);
  const firstRuntime = createPrrRuntime({ ledger: firstLedger, actor: investigatorActor, now: fixedNow });
  await firstRuntime.seedIfEmpty(goldenPrrLedgerEvents);
  const firstWorkspace = await firstRuntime.loadWorkspace();
  firstLedger.close();

  const secondLedger = new SQLiteEventLedger(dbPath);
  const secondRuntime = createPrrRuntime({ ledger: secondLedger, actor: investigatorActor, now: fixedNow });
  expect(await secondRuntime.loadWorkspace()).toEqual(firstWorkspace);
  secondLedger.close();
});

it("creates a draft request and causally linked estimated deadline", async () => {
  const ledger = new InMemoryEventLedger();
  const runtime = createPrrRuntime({
    ledger,
    actor: investigatorActor,
    now: fixedNow,
    requestIdFactory: () => "prr_new_city_budget"
  });

  const result = await runtime.createDraftRequest({
    jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
    agency: { name: "City Clerk", email: "clerk@example.gov" },
    requester: { name: "Avery Investigator", email: "avery@example.org" },
    requestText: "All budget amendment memos from January 2026.",
    receivedAt: "2026-07-03T12:00:00.000Z"
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.diagnostic.message);
  }
  expect(result.committedEventIds).toHaveLength(2);

  const events = await ledger.readStream("prr_new_city_budget");
  expect(events.map((event) => [event.type, event.sequence])).toEqual([
    ["prr.request.created", 1],
    ["prr.deadline.estimated", 2]
  ]);
  expect(events[1]?.context.causationId).toBe(events[0]?.id);
  expect(result.workspace.cards.some((card) => card.prrRequestId === "prr_new_city_budget")).toBe(true);
});
```

- [ ] Add partial failure coverage with an injected deadline calculator that throws after `prr.request.created` is committed. The expected result has `ok: false`, `failedStep: "estimate-deadline"`, one committed event ID, a rebuilt workspace containing the draft, and no deletion attempt.
- [ ] Add seed causation rewrite coverage: when seeding full `KnowledgeEvent` fixtures through `EventLedger.append`, generated event IDs replace any fixture causation IDs that referenced earlier fixture events.
- [ ] Run the targeted red command:

```bash
npm test -- packages/prr/test/runtime.test.ts
```

Expected red result: Vitest fails because `runtime.ts` and `draft-events.ts` are absent.

- [ ] Implement `draft-events.ts` as a browser-safe pure module. It must not import `node:crypto`, `node:fs`, `node:path`, `node:sqlite`, or `SQLiteEventLedger`.
- [ ] Export a pure helper shaped like:

```ts
export interface BuildDraftRequestEventsInput {
  readonly prrRequestId: string;
  readonly jurisdictionPack: JurisdictionPackRef;
  readonly agency: ContactRef;
  readonly requester: ContactRef;
  readonly requestText: string;
  readonly receivedAt: string;
  readonly actor: ActorRef;
  readonly occurredAt: string;
  readonly deadlineEstimateKind?: DeadlineEstimateKind;
}
```

The helper returns appendable `prr.request.created` and `prr.deadline.estimated` events with a shared correlation ID. Export browser-safe command/input types from this pure module. The runtime fills deadline causation with the committed created event ID before appending the deadline.

- [ ] Implement `runtime.ts` with:
  - `createPrrRuntime(dependencies)`
  - `PrrRuntime.loadWorkspace()`
  - `PrrRuntime.seedIfEmpty(events)`
  - `PrrRuntime.createDraftRequest(input)`
  - `PrrRuntime.readEvents()`
  - `CreateDraftRequestResult` as a discriminated union with `ok: true` and `ok: false` variants
- [ ] Keep SQLite construction outside the browser boundary. `runtime.ts` may import `EventLedger` types and use injected ledgers, but any helper that constructs `SQLiteEventLedger` must stay Node-only and must not be imported by UI files.
- [ ] Use expected stream sequences `1` and `2` for create-draft appends.
- [ ] Ensure validation failures before `prr.request.created` return `ok: false` with no appended event. Ensure failures after creation preserve the created event and return the rebuilt workspace.
- [ ] Export runtime and draft-event contracts from `packages/prr/src/index.ts`.
- [ ] Run the targeted green command:

```bash
npm test -- packages/prr/test/runtime.test.ts
```

Expected green result: runtime tests pass, including in-memory load, SQLite reopen, idempotent seed, draft creation, causation, and partial failure behavior.

- [ ] Run full verification:

```bash
npm run verify
```

Expected output includes `typecheck passed`, Vitest pass output, `tests passed`, Vite build success, and `factory-readiness passed`.

- [ ] Update the claim with command evidence and set status to `ready-for-review`. Commit the task.

**Rollback:** Revert this task commit. DTOs from Task 2 remain pure and usable without the runtime wrapper.

**Escalate:** Stop on any required schema change, data-loss migration, SQLite corruption risk, or need to preserve fixture event IDs in storage contrary to the existing ledger append contract.

---

## Task 4: Requests UI Reads Backend DTOs

**Outcome:** The Requests route renders from backend-derived `PrrWorkspaceDto` data through a UI adapter, and product code no longer imports local request card fixtures.

**Allowed files:**

- `docs/agentic/claims/task-4-ui-reads-prr-dtos.md`
- `packages/ui/src/requests/request-types.ts`
- `packages/ui/src/requests/request-model.ts`
- `packages/ui/src/requests/request-adapter.ts`
- `packages/ui/src/requests/RequestWorkspace.tsx`
- `packages/ui/src/App.tsx`
- `packages/ui/test/request-model.test.ts`
- `packages/ui/test/request-board.test.tsx`
- `packages/ui/test/request-detail-rail.test.tsx`
- `packages/ui/test/request-signal-map.test.tsx`
- `packages/ui/test/app-smoke.test.tsx`
- `packages/ui/test/request-data-boundary.test.ts`
- `packages/ui/test/visual-contract.test.ts`
- `packages/ui/test/ui-picker.test.tsx`

**Steps:**

- [ ] Claim the task, commit the claim, then set status to `in-progress`.
- [ ] Add a test helper inside the edited test files that builds a Requests workspace DTO from `localPrrWorkspaceSeedEvents`, `buildPrrProjection`, and `buildPrrWorkspaceDto`. Do not hand-author request cards in UI tests.
- [ ] Add or update tests before production changes:

```ts
it("renders Requests from backend-derived PRR DTOs", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("link", { name: "Requests" }));

  expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
  expect(screen.getByText("Building Services Department")).toBeInTheDocument();
  expect(screen.getByText("$1,850.00 challenged")).toBeInTheDocument();
});

it("keeps product Requests code off local card fixtures and Node-only runtime imports", () => {
  const productFiles = [
    "packages/ui/src/App.tsx",
    "packages/ui/src/requests/request-model.ts",
    "packages/ui/src/requests/request-adapter.ts",
    "packages/ui/src/requests/RequestWorkspace.tsx"
  ];

  for (const file of productFiles) {
    const source = readFileSync(file, "utf8");
    expect(source).not.toContain("request-fixtures");
    expect(source).not.toContain("node:sqlite");
    expect(source).not.toContain("SQLiteEventLedger");
    expect(source).not.toContain("../../../prr/src/runtime");
  }
});
```

- [ ] Run the targeted red command:

```bash
npm test -- packages/ui/test/request-model.test.ts packages/ui/test/request-board.test.tsx packages/ui/test/request-detail-rail.test.tsx packages/ui/test/request-signal-map.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/request-data-boundary.test.ts
```

Expected red result: tests fail because App and RequestWorkspace still consume `prrWorkspaceFixture`.

- [ ] Update `request-types.ts` so React-facing types align with `PrrWorkspaceDto`. Prefer type aliases imported from `../../../prr/src/read-api.js` when the shape is identical. Keep UI-only view-model types in UI.
- [ ] Update `request-model.ts` to accept backend DTO data instead of `PrrWorkspaceFixture`. Keep saved-view filtering, lane grouping, selected request lookup, signal-map filtering, `sendGateArmed`, and `unresolvedEscalationPrerequisites`.
- [ ] Add `request-adapter.ts` with:
  - `RequestsWorkspaceAdapter`
  - `loadRequestsWorkspace(): Promise<PrrWorkspaceDto>`
  - `createLocalReplayRequestsAdapter(seedEvents)` for browser-safe local preview
  - `createStaticRequestsAdapter(workspace)` for focused component tests
- [ ] The local replay adapter may use PRR projection/read-api code and seed events. It must not import `runtime.ts`, `SQLiteEventLedger`, or any Node-only module.
- [ ] Update `App.tsx` to load the Requests workspace through the adapter when the Requests route is active. Add professional loading and error states inside the Requests main area.
- [ ] Update `RequestWorkspace.tsx` to receive `workspace` instead of `fixture`.
- [ ] Keep `request-fixtures.ts` only if tests still need visual seed data. No production import may reference it.
- [ ] Update visual contract and picker cleanup tests so they scan the new adapter file and keep the Requests component set covered.
- [ ] Run the targeted green command:

```bash
npm test -- packages/ui/test/request-model.test.ts packages/ui/test/request-board.test.tsx packages/ui/test/request-detail-rail.test.tsx packages/ui/test/request-signal-map.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/request-data-boundary.test.ts
```

Expected green result: listed UI tests pass and prove product code reads backend-derived DTOs without fixture imports or Node-only runtime imports.

- [ ] Run full verification:

```bash
npm run verify
```

Expected output includes `typecheck passed`, Vitest pass output, `tests passed`, Vite build success, and `factory-readiness passed`.

- [ ] Update the claim with command evidence and set status to `ready-for-review`. Commit the task.

**Rollback:** Revert this task commit. Backend runtime and DTO work remain intact.

**Escalate:** Stop if Vite cannot bundle the browser-safe PRR projection/read API because of a Node-only import. Move that import behind the runtime boundary before proceeding.

---

## Task 5: Builder Submit Appends Replayable Draft Events

**Outcome:** The guided builder collects request input, calls the Requests adapter, appends `prr.request.created` and `prr.deadline.estimated`, reloads from replayed DTOs, and renders the new draft.

**Allowed files:**

- `docs/agentic/claims/task-5-builder-draft-append.md`
- `packages/ui/src/requests/request-types.ts`
- `packages/ui/src/requests/request-adapter.ts`
- `packages/ui/src/requests/RequestBuilder.tsx`
- `packages/ui/src/App.tsx`
- `packages/ui/test/request-builder.test.tsx`
- `packages/ui/test/app-smoke.test.tsx`
- `packages/ui/test/request-data-boundary.test.ts`

**Steps:**

- [ ] Claim the task, commit the claim, then set status to `in-progress`.
- [ ] Add failing builder and App tests before production changes. Include coverage shaped like:

```ts
it("submits a builder draft through the Requests adapter and reloads the board", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("link", { name: "Requests" }));
  fireEvent.click(await screen.findByRole("button", { name: "New request" }));

  fireEvent.change(screen.getByLabelText("Agency name"), { target: { value: "City Clerk" } });
  fireEvent.change(screen.getByLabelText("Agency email"), { target: { value: "clerk@example.gov" } });
  fireEvent.change(screen.getByLabelText("Requester name"), { target: { value: "Avery Investigator" } });
  fireEvent.change(screen.getByLabelText("Requester email"), { target: { value: "avery@example.org" } });
  fireEvent.change(screen.getByLabelText("Request text"), {
    target: { value: "All budget amendment memos from January 2026." }
  });

  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));

  expect(await screen.findByText("City Clerk")).toBeInTheDocument();
  expect(screen.getByText(/budget amendment memos/i)).toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "Guided request builder" })).not.toBeInTheDocument();
});

it("keeps the builder open and displays a safe diagnostic when draft creation fails", async () => {
  const adapter = createStaticRequestsAdapter(testWorkspace, {
    createDraftResult: {
      ok: false,
      failedStep: "estimate-deadline",
      committedEventIds: ["evt_created"],
      diagnostic: {
        message: "Could not estimate the deadline for the selected jurisdiction pack.",
        allowedRepairActions: ["select a supported jurisdiction pack"]
      },
      workspace: testWorkspace
    }
  });

  render(<App requestsAdapter={adapter} />);
  fireEvent.click(screen.getByRole("link", { name: "Requests" }));
  fireEvent.click(await screen.findByRole("button", { name: "New request" }));
  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));

  expect(screen.getByRole("dialog", { name: "Guided request builder" })).toBeInTheDocument();
  expect(screen.getByText("Could not estimate the deadline for the selected jurisdiction pack.")).toBeInTheDocument();
});
```

- [ ] Add an adapter test or App smoke assertion that the local replay adapter stores two new events for a successful builder submit and rebuilds cards from those events. If the test inspects event count, expose a test-only read method from the adapter factory result rather than leaking it into component props.
- [ ] Run the targeted red command:

```bash
npm test -- packages/ui/test/request-builder.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/request-data-boundary.test.ts
```

Expected red result: tests fail because `RequestBuilder` does not expose form fields or submit through the adapter.

- [ ] Extend `RequestBuilder` props with a submit callback, submitting flag, and optional diagnostic message.
- [ ] Add accessible form controls:
  - `Jurisdiction pack`
  - `Agency name`
  - `Agency email`
  - `Agency phone`
  - `Requester name`
  - `Requester email`
  - `Requester phone`
  - `Request text`
  - `Received timestamp`
- [ ] Provide safe defaults from the builder DTO:
  - Jurisdiction defaults to the first available jurisdiction pack step value or `florida-public-records@0.1.0`.
  - Received timestamp defaults to the adapter/runtime `now` value when the app submits, not a hard-coded calendar date.
  - Learned suggestions remain empty unless supplied by DTO.
- [ ] Add UI-facing create-draft input and result types in `request-adapter.ts`. Import only browser-safe PRR types from `../../../prr/src/draft-events.js` and `../../../prr/src/read-api.js`. Do not import `../../../prr/src/runtime.js` from any UI source or test file.
- [ ] Extend `request-adapter.ts` local replay adapter so successful `createDraftRequest`:
  - Builds appendable draft events through the pure PRR helper.
  - Assigns browser-safe event IDs with `globalThis.crypto.randomUUID()` or a deterministic injected ID factory in tests.
  - Assigns stream sequences from the adapter event array.
  - Rewrites deadline causation to the generated created event ID.
  - Validates committed events through `validateKnowledgeEvent`.
  - Rebuilds the workspace from `buildPrrProjection` and `buildPrrWorkspaceDto`.
- [ ] Update `App.tsx` so submit waits for the adapter result. On success, replace workspace state with `result.workspace`, select the new draft request, and close the builder. On failure, keep the builder open and display the safe diagnostic.
- [ ] Preserve focus restoration and Tab trapping behavior from the existing builder tests.
- [ ] Run the targeted green command:

```bash
npm test -- packages/ui/test/request-builder.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/request-data-boundary.test.ts
```

Expected green result: builder submit tests pass, the new draft appears after replay, failure diagnostics stay visible, and the data boundary test still prevents product fixture and Node-only imports.

- [ ] Run full verification:

```bash
npm run verify
```

Expected output includes `typecheck passed`, Vitest pass output, `tests passed`, Vite build success, and `factory-readiness passed`.

- [ ] Update the claim with command evidence and set status to `ready-for-review`. Commit the task.

**Rollback:** Revert this task commit. The UI read path from Task 4 remains intact.

**Escalate:** Stop if builder submit would require autonomous sending, legal escalation, live mailbox access, or a new UI-only event type.

---

## Task 6: Final Contracts, Readiness, And Preview Gate

**Outcome:** The slice has final contract coverage, factory readiness records include the new spec and plan, full verification passes, and the Requests workspace is exposed for human preview.

**Allowed files:**

- `docs/agentic/claims/task-6-ledger-backed-prr-readiness.md`
- `docs/agentic/software-factory.md`
- `scripts/check-agent-readiness.mjs`
- `packages/ui/test/visual-contract.test.ts`
- `packages/ui/test/ui-picker.test.tsx`
- `packages/ui/test/request-data-boundary.test.ts`
- `packages/ui/test/app-smoke.test.tsx`

**Steps:**

- [ ] Claim the task, commit the claim, then set status to `in-progress`.
- [ ] Add or tighten final contract tests:
  - `visual-contract.test.ts` scans `request-adapter.ts`, `RequestWorkspace.tsx`, and `RequestBuilder.tsx` for stable dimensions, no nested card pattern regressions, and no one-hue palette drift.
  - `ui-picker.test.tsx` confirms the Requests workspace remains first-class in the shell and no rejected picker scaffolding returns.
  - `request-data-boundary.test.ts` confirms product UI imports no `request-fixtures`, `node:sqlite`, `SQLiteEventLedger`, or Node runtime module.
  - `app-smoke.test.tsx` exercises route to Requests, saved view switch, signal map, builder open, builder submit, and detail rail update through `App`.
- [ ] Run the targeted red command before contract changes:

```bash
npm test -- packages/ui/test/visual-contract.test.ts packages/ui/test/ui-picker.test.tsx packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx
```

Expected red result: at least one final contract assertion fails until the tests and readiness files know about the ledger-backed boundary.

- [ ] Update `scripts/check-agent-readiness.mjs` so factory readiness requires:
  - `docs/superpowers/specs/2026-07-03-ledger-backed-prr-workspace-design.md`
  - `docs/superpowers/plans/2026-07-03-ledger-backed-prr-workspace-implementation.md`
- [ ] Update `docs/agentic/software-factory.md` with a `Ledger-Backed PRR Workspace Plan Readiness` section that records the spec path, plan path, and final verification evidence after the command passes.
- [ ] Run the targeted green command:

```bash
npm test -- packages/ui/test/visual-contract.test.ts packages/ui/test/ui-picker.test.tsx packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx
```

Expected green result: the final contract and smoke tests pass.

- [ ] Run the factory readiness command:

```bash
npm run factory:check
```

Expected output: `factory-readiness passed`.

- [ ] Run full verification:

```bash
npm run verify
```

Expected output includes `typecheck passed`, Vitest pass output, `tests passed`, Vite build success, and `factory-readiness passed`.

- [ ] Commit the final contract/readiness changes.
- [ ] Start the Vite preview server for human review:

```bash
npm run dev -- --port 5174 --strictPort
```

Expected output includes the local and network Vite URLs.

- [ ] Verify local reachability from another terminal:

```bash
curl -I http://127.0.0.1:5174/
```

Expected output includes `HTTP/1.1 200 OK`.

- [ ] If a tailnet DNS name is available in the environment, verify that URL too and record it in the claim. Do not block the task if the tailnet name is unavailable; record local preview evidence instead.
- [ ] Ask the user for human review of the ledger-backed Requests workspace. Do not merge or mark the slice complete until the user approves the preview or explicitly skips visual review.
- [ ] Update the claim with command evidence, preview URL evidence, and set status to `ready-for-review`.

**Rollback:** Revert only this task commit. Earlier functional tasks remain reviewable.

**Escalate:** Stop if `npm run verify` fails after two focused repair attempts, if the dev server cannot start because of a bundling error, or if the UI visibly overlaps or hides ledger-backed fields in a way that cannot be fixed inside this task.

---

## Milestone Review Gates

- After Task 2, request a backend contract review focused on append-only semantics, DTO determinism, sparse unsupported fields, and projection rebuildability.
- After Task 3, request a runtime/storage review focused on SQLite reopen, seed causation rewrite, partial failure, and no data deletion.
- After Task 5, request a UI/data-boundary review focused on fixture removal, browser-safe imports, builder submit behavior, and no autonomous send/escalation behavior.
- After Task 6, request final factory readiness review and user preview approval.

## Completion Criteria

- Requests product code no longer imports `request-fixtures.ts`.
- `PrrWorkspaceDto` is built from PRR projection replay.
- Golden PRR seed events validate through ontology event contracts.
- Runtime load, idempotent seed, SQLite reopen, and create-draft behavior are covered by tests.
- Builder submit appends exactly `prr.request.created` and `prr.deadline.estimated` in the durable runtime tests.
- Builder submit in the UI reloads from replayed DTOs and renders the new draft.
- Unsupported learned suggestions and signal-map edges render sparse states.
- Legal escalation and send gates remain locked unless event-backed human approval requirements are met.
- `npm run verify` passes.
- Factory readiness includes the new spec and plan.
- Human preview gate is satisfied or explicitly skipped by the user.

## Execution Handoff

Run this plan task-by-task. Use `superpowers:subagent-driven-development` when available so implementation workers and reviewers have separate context. Use `superpowers:executing-plans` for inline execution if subagents are unavailable. Do not start Task 2 until Task 1 is committed and reviewed, and continue that sequencing through Task 6.
