# PRR And Jurisdiction Context Packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build selected-request production resolved context-pack builders and narrow runtime registration for `prr-read-model.v1` and `jurisdiction-pack-summary.v1`.

**Architecture:** Keep pure package builders in `packages/agent/src/prr-context-packs.ts`, fed by authoritative PRR read models, selected request streams, jurisdiction pack artifacts, and bounded workspace metadata. The builders return provider-safe `ResolvedContextPack { ref, payload }` envelopes from the shared operational content-addressed contract; durable ledgers/readiness keep refs only, while production prompt rendering resolves and verifies payload bytes locally. Keep package registration separate from local-runtime assembly, and make the local-runtime task pass only selected request state plus O(1) aggregate omission proof into the builders.

**Tech Stack:** TypeScript, Zod-free plain DTO builders where possible, shared `ResolvedContextPack`/`ContextPackRef`/registry helpers, Vitest, PRR projection/read API contracts, local-runtime SQLite PRR handle, Markdown factory claims.

## Global Constraints

- Use branch `codex/prr-context-pack-design` or a task-scoped child branch/worktree from it.
- Preserve append-only ledger semantics, provenance requirements, and projection rebuildability.
- Preserve human-approved PRR send gates, legal escalation locks, provider-transfer gates, governance locks, and no-effects boundaries.
- `prr-read-model.v1` is selected-request scoped and requires `scope: { kind: "prr-request", id: prrRequestId }`.
- Unrelated PRR request IDs, agencies, subjects, correspondence IDs, evidence IDs, diagnostics, and party data never enter `prr-read-model.v1`.
- Other PRRs are represented only by `{ kind: "all-other-prr-requests", reason: "out-of-scope-selected-request", omittedCount, projectionHighWaterMark }`.
- Request-scoped rendering never needs to materialize unrelated records; only O(1) aggregate count/high-water proof may be supplied.
- `jurisdiction-pack-summary.v1` binds the selected request jurisdiction by pack name, pack version, exact rule IDs, and jurisdiction artifact content hash.
- Active send, legal, and governance gates are non-truncatable; if they cannot fit, the builder fails closed.
- Both PRR builders return resolved envelopes whose `payload` canonical hash and byte size exactly match `ref.contentHash` and `ref.sizeBytes`.
- Ledger events, prompt manifests, readiness DTOs, approval previews, and durable audit records carry refs only; selected PRR payload bytes are local prompt-rendering inputs.
- Production prompt rendering resolves bounded selected-request payloads locally, verifies exact hash and size, and includes those approved bytes before provider invocation.
- Missing payload resolution, payload/ref mismatch, wrong context pack ID/version, wrong selected-request scope, or stale resolver output blocks provider invocation.
- Do not add an arbitrary hash-to-text callback.
- Builders are deterministic for identical injected inputs; callers supply `generatedAt`.
- Builders never send, follow up, appeal, confirm escalation, clear locks, grant approval, or execute domain effects.
- Every task starts with a durable claim, failing tests, a targeted red command, production code, targeted green command, `npm run verify`, commit, and review handoff.
- Stop on legal-gate ambiguity, missing citations/provenance, stale correspondence state, raw sensitive content, schema conflict, unavailable dependency, data-loss risk, or repeated verifier failure after two focused repair attempts.

---

## File Structure

- `packages/agent/src/prr-context-packs.ts`: pure selected-request PRR and jurisdiction pack builders, safe resolved payload contracts, deterministic ordering, O(1) aggregate omission proof, and PRR-specific registration helper.
- `packages/agent/test/prr-context-packs.test.ts`: focused tests for selected-request scoping, resolved payload hash/size verification, provenance, omissions, gate non-truncation, deterministic hashes, jurisdiction artifact hash binding, registration idempotency, and no-effects boundaries.
- `packages/agent/src/index.ts`: exports the PRR context-pack package surface after builders and package registration land.
- `packages/local-runtime/src/agent-prr-context-packs.ts`: narrow local-runtime adapter that assembles selected request inputs and registers only the two PRR context packs.
- `packages/local-runtime/test/agent-prr-context-packs.test.ts`: local-runtime integration tests proving selected-request assembly, no unrelated IDs, no send/escalation effects, resolved payload availability, production rendering after hash verification, and registry availability.
- `docs/agentic/claims/task-1-prr-read-model-context-pack.md`: Task 1 durable claim.
- `docs/agentic/claims/task-2-jurisdiction-pack-summary-context-pack.md`: Task 2 durable claim.
- `docs/agentic/claims/task-3-prr-context-pack-registration.md`: Task 3 durable claim.
- `docs/agentic/claims/task-4-local-runtime-prr-context-pack-registration.md`: Task 4 durable claim.
- `docs/agentic/claims/task-5-prr-context-pack-readiness.md`: Task 5 durable claim.
- `scripts/check-agent-readiness.mjs`: final readiness task adds the approved spec and this plan.
- `docs/agentic/software-factory.md`: final readiness task records targeted and full verification evidence.

## Operational Dependency

The operational lane owns the shared resolved-context contract. Before Task 1 implementation, verify that `packages/agent/src/context-packs.ts` or the operational lane's approved public export provides this exact semantic surface:

```ts
export interface ResolvedContextPack<
  Payload extends AgentContextPackJsonValue = AgentContextPackJsonValue
> {
  readonly ref: ContextPackRef;
  readonly payload: Payload;
}

export interface ContextPackResolver {
  resolve(ref: ContextPackRef): Promise<ResolvedContextPack>;
}

export interface ResolvedContextPackRegistry extends ContextPackRegistry {
  buildResolved(contextPackId: string): Promise<ResolvedContextPack>;
}

export function buildResolvedContextPack(
  input: BuildContextPackRefInput
): ResolvedContextPack;

export function verifyResolvedContextPack(input: ResolvedContextPack): ResolvedContextPack;

export function createContextPackResolver(
  resolvedPacks: readonly ResolvedContextPack[]
): ContextPackResolver;
```

The operational prompt-rendering lane must also expose a provider invocation path that consumes a `ContextPackResolver`, verifies each resolved payload against the requested ref immediately before rendering, and blocks invocation on missing or mismatched payloads. If this shared contract is absent, named differently, or semantically weaker, stop with `schema-conflict` and hand the branch back to the coordinator before implementing PRR code.

Run this preflight before Task 1:

```bash
rg -n "ResolvedContextPack|buildResolvedContextPack|verifyResolvedContextPack|ContextPackResolver|createContextPackResolver|buildResolved" packages/agent/src
```

Expected:

```text
packages/agent/src/context-packs.ts exports the resolved context contract, or an approved operational module re-exports the same contract through packages/agent/src/index.ts.
```

## Shared Interfaces

Task 1 introduces these interfaces in `packages/agent/src/prr-context-packs.ts`:

```ts
export interface PrrSelectedRequestScope {
  readonly kind: "prr-request";
  readonly id: string;
}

export interface PrrSelectedRequestStreamProof {
  readonly requestCreatedEventId: string;
  readonly streamHeadEventId: string;
  readonly streamHighWaterMark: number;
  readonly sourceEventIds: readonly string[];
}

export interface PrrOtherRequestsOmissionProof {
  readonly kind: "all-other-prr-requests";
  readonly reason: "out-of-scope-selected-request";
  readonly omittedCount: number;
  readonly projectionHighWaterMark: number;
}

export interface PrrWorkspaceOmissionMetadata {
  readonly totalPrrRequestCount?: number;
  readonly otherRequests?: PrrOtherRequestsOmissionProof;
}

export interface PrrContextPackHashRef {
  readonly id: string;
  readonly contentHash: `sha256:${string}`;
  readonly sourceEventId?: string;
}

export interface PrrContextGateSnapshot {
  readonly gateId: string;
  readonly kind: "send" | "legal-escalation" | "governance";
  readonly ready: boolean;
  readonly locked: boolean;
  readonly checks: readonly {
    readonly id: string;
    readonly ready: boolean;
    readonly locked: boolean;
    readonly detail: string;
    readonly sourceEventIds?: readonly string[];
    readonly evidenceHashes?: readonly `sha256:${string}`[];
  }[];
}

export interface BuildPrrReadModelContextPackInput {
  readonly generatedAt: string;
  readonly policyVersion?: string;
  readonly scope: PrrSelectedRequestScope;
  readonly request: import("../../prr/src/projection.js").PrrRequestReadModel;
  readonly timeline: readonly import("../../prr/src/projection.js").PrrTimelineEntry[];
  readonly requestStream: PrrSelectedRequestStreamProof;
  readonly projectionHighWaterMark: number;
  readonly workspace?: PrrWorkspaceOmissionMetadata;
  readonly correspondenceHashes?: readonly PrrContextPackHashRef[];
  readonly evidenceHashes?: readonly PrrContextPackHashRef[];
  readonly gates: readonly PrrContextGateSnapshot[];
  readonly sizeBudgetBytes?: number;
}

export function buildPrrReadModelContextPack(
  input: BuildPrrReadModelContextPackInput
): import("./context-packs.js").ResolvedContextPack;
```

Task 2 adds:

```ts
export interface BuildJurisdictionPackSummaryContextPackInput {
  readonly generatedAt: string;
  readonly policyVersion?: string;
  readonly scope: PrrSelectedRequestScope;
  readonly selectedRequestEventId: string;
  readonly selectedRequestJurisdictionPack: { readonly name: string; readonly version: string };
  readonly jurisdictionPack: import("../../prr/src/jurisdiction-packs.js").JurisdictionPack;
  readonly jurisdictionArtifactHash: `sha256:${string}`;
  readonly projectionHighWaterMark?: number;
  readonly sizeBudgetBytes?: number;
}

export function buildJurisdictionPackSummaryContextPack(
  input: BuildJurisdictionPackSummaryContextPackInput
): import("./context-packs.js").ResolvedContextPack;
```

Task 3 adds:

```ts
export interface RegisterPrrContextPackBuildersInput {
  readonly registry: import("./context-packs.js").ResolvedContextPackRegistry;
  readonly prrReadModelBuilder: import("./context-packs.js").ContextPackBuilder;
  readonly jurisdictionPackSummaryBuilder: import("./context-packs.js").ContextPackBuilder;
}

export function registerPrrContextPackBuilders(input: RegisterPrrContextPackBuildersInput): void;
```

Task 4 adds:

```ts
export interface RegisterLocalRuntimeSelectedPrrContextPacksInput {
  readonly registry: import("../../agent/src/context-packs.js").ResolvedContextPackRegistry;
  readonly handle: import("./runtime-factory.js").LocalRuntimeHandle;
  readonly prrRequestId: string;
  readonly now: () => string;
  readonly policyVersion?: string;
  readonly sizeBudgetBytes?: number;
}

export function registerLocalRuntimeSelectedPrrContextPacks(
  input: RegisterLocalRuntimeSelectedPrrContextPacksInput
): void;
```

---

### Task 1: Selected Request PRR Read Model Context Pack

**Files:**
- Create: `docs/agentic/claims/task-1-prr-read-model-context-pack.md`
- Create: `packages/agent/src/prr-context-packs.ts`
- Create: `packages/agent/test/prr-context-packs.test.ts`

**Interfaces:**
- Consumes: `buildResolvedContextPack`, `verifyResolvedContextPack`, `hashAgentContextPack`, PRR projection/read-model types.
- Produces: `buildPrrReadModelContextPack(input: BuildPrrReadModelContextPackInput): ResolvedContextPack` and the shared PRR context-pack types.

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-prr-read-model-context-pack.md`:

```markdown
# Task 1: Selected Request PRR Read Model Context Pack

Plan path: `docs/superpowers/plans/2026-07-10-prr-jurisdiction-context-packs-implementation.md`
Task heading: `Task 1: Selected Request PRR Read Model Context Pack`
Worker identity: Codex
Branch: `codex/prr-context-pack-design`
Worktree path: `/home/drake/.codex/worktrees/3076/Cestus`
Claimed at UTC: run `date -u +"%Y-%m-%dT%H:%M:%SZ"` and paste the emitted timestamp
Status: `claimed`

## Owned Files

- `packages/agent/src/prr-context-packs.ts`
- `packages/agent/test/prr-context-packs.test.ts`

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
git add docs/agentic/claims/task-1-prr-read-model-context-pack.md
git commit -m "chore: claim task 1 prr read model context pack"
```

- [ ] **Step 2: Mark the claim in progress**

Change `Status: claimed` to `Status: in-progress`, then run:

```bash
git add docs/agentic/claims/task-1-prr-read-model-context-pack.md
git commit -m "chore: start task 1 prr read model context pack"
```

- [ ] **Step 3: Write failing PRR read model pack tests**

Create `packages/agent/test/prr-context-packs.test.ts` with these Task 1 tests:

```ts
import { describe, expect, it } from "vitest";
import { verifyResolvedContextPack } from "../src/context-packs.js";
import type { PrrRequestReadModel, PrrTimelineEntry } from "../../prr/src/projection.js";
import {
  buildPrrReadModelContextPack,
  type BuildPrrReadModelContextPackInput,
  type PrrContextGateSnapshot
} from "../src/prr-context-packs.js";

const generatedAt = "2026-07-10T12:00:00.000Z";
const bodyHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const renderedBodyHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const evidenceHash = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;

describe("selected request PRR read model context pack", () => {
  it("builds prr-read-model.v1 for only the selected request with stream proof and O(1) unrelated omission", () => {
    const resolved = buildPrrReadModelContextPack(basePrrInput({
      workspace: {
        totalPrrRequestCount: 10001,
        otherRequests: {
          kind: "all-other-prr-requests",
          reason: "out-of-scope-selected-request",
          omittedCount: 10000,
          projectionHighWaterMark: 77
        }
      }
    }));
    const ref = resolved.ref;

    expect(ref).toMatchObject({
      contextPackId: "prr-read-model.v1",
      version: 1,
      projectionHighWaterMark: 77,
      scope: { kind: "prr-request", id: "prr_req_selected" }
    });
    expect(ref.sourceEventIds).toEqual(expect.arrayContaining([
      "evt_prr_selected_created",
      "evt_prr_selected_deadline",
      "evt_prr_selected_followup"
    ]));
    expect(ref.artifactHashes).toEqual(expect.arrayContaining([bodyHash, renderedBodyHash, evidenceHash]));
    expect(ref.stalenessInputs).toEqual(expect.arrayContaining([
      { kind: "prr-request-stream-head", ref: "prr_req_selected", value: "evt_prr_selected_followup" },
      { kind: "prr-request-stream-high-water-mark", ref: "prr_req_selected", value: "9" },
      { kind: "prr-projection-high-water-mark", ref: "prr.projection", value: "77" }
    ]));
    expect(verifyResolvedContextPack(resolved).ref).toEqual(ref);
    expect(JSON.stringify(resolved.payload)).toContain("2026-08-07");
    expect(ref.safeSummary).not.toContain("2026-08-07");
    expect(JSON.stringify(ref)).not.toMatch(/prr_unrelated|Agency Not Selected|corr_unrelated|ev_unrelated/);
    expect(JSON.stringify(resolved.payload)).not.toMatch(/prr_unrelated|Agency Not Selected|corr_unrelated|ev_unrelated/);
  });

  it("keeps pack size independent of unrelated request count except aggregate proof digits", () => {
    const one = buildPrrReadModelContextPack(basePrrInput({
      workspace: {
        totalPrrRequestCount: 2,
        otherRequests: {
          kind: "all-other-prr-requests",
          reason: "out-of-scope-selected-request",
          omittedCount: 1,
          projectionHighWaterMark: 77
        }
      }
    }));
    const many = buildPrrReadModelContextPack(basePrrInput({
      workspace: {
        totalPrrRequestCount: 10002,
        otherRequests: {
          kind: "all-other-prr-requests",
          reason: "out-of-scope-selected-request",
          omittedCount: 10001,
          projectionHighWaterMark: 77
        }
      }
    }));

    expect(many.ref.sizeBytes - one.ref.sizeBytes).toBeLessThanOrEqual(8);
  });

  it("fails when other requests are known but aggregate omission proof is missing", () => {
    expect(() =>
      buildPrrReadModelContextPack(basePrrInput({
        workspace: { totalPrrRequestCount: 3 }
      }))
    ).toThrow(/missing-provenance|other PRR requests/i);
  });

  it("rejects wrong scope, unrelated request IDs, raw bodies, provider refs, and truncatable active gates", () => {
    expect(() =>
      buildPrrReadModelContextPack({
        ...basePrrInput(),
        scope: { kind: "workspace", id: "ws_case" } as never
      })
    ).toThrow(/prr-request/i);

    expect(() =>
      buildPrrReadModelContextPack({
        ...basePrrInput(),
        workspace: {
          totalPrrRequestCount: 2,
          otherRequests: {
            kind: "all-other-prr-requests",
            reason: "out-of-scope-selected-request",
            omittedCount: 1,
            projectionHighWaterMark: 77
          },
          otherRequestIds: ["prr_unrelated"] as never
        } as never
      })
    ).toThrow(/unsupported|unrelated/i);

    expect(() =>
      buildPrrReadModelContextPack({
        ...basePrrInput(),
        request: {
          ...selectedRequest(),
          latestOutboundCorrespondence: {
            ...selectedRequest().latestOutboundCorrespondence!,
            rawMetadata: { delivery: "provider accepted", providerMessageId: "msg_private" }
          }
        }
      })
    ).toThrow(/raw metadata|provider/i);

    expect(() =>
      buildPrrReadModelContextPack(basePrrInput({
        sizeBudgetBytes: 256
      }))
    ).toThrow(/context-budget-exceeded|gate/i);
  });
});

function basePrrInput(
  overrides: Partial<BuildPrrReadModelContextPackInput> = {}
): BuildPrrReadModelContextPackInput {
  return {
    generatedAt,
    policyVersion: "agent-policy-v1",
    scope: { kind: "prr-request", id: "prr_req_selected" },
    request: selectedRequest(),
    timeline: selectedTimeline(),
    requestStream: {
      requestCreatedEventId: "evt_prr_selected_created",
      streamHeadEventId: "evt_prr_selected_followup",
      streamHighWaterMark: 9,
      sourceEventIds: [
        "evt_prr_selected_created",
        "evt_prr_selected_deadline",
        "evt_prr_selected_followup"
      ]
    },
    projectionHighWaterMark: 77,
    workspace: {
      totalPrrRequestCount: 1
    },
    correspondenceHashes: [
      { id: "corr_selected_followup_body", contentHash: bodyHash, sourceEventId: "evt_prr_selected_followup" },
      { id: "corr_selected_followup_rendered", contentHash: renderedBodyHash, sourceEventId: "evt_prr_selected_followup" }
    ],
    evidenceHashes: [
      { id: "ev_selected_attachment", contentHash: evidenceHash, sourceEventId: "evt_prr_selected_followup" }
    ],
    gates: selectedGates(),
    sizeBudgetBytes: 32_768,
    ...overrides
  };
}

function selectedRequest(): PrrRequestReadModel {
  return {
    prrRequestId: "prr_req_selected",
    status: "sent",
    agencyName: "Selected Agency",
    jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
    agency: { name: "Selected Agency", email: "foia@example.gov" },
    requester: { name: "Investigator", email: "investigator@example.org" },
    requestText: "Safe request summary for selected records.",
    activeDeadline: {
      deadlineDate: "2026-08-07",
      source: "estimated",
      confidence: "statutory",
      explanation: "20 working day estimate.",
      citedRules: [{
        jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
        label: "20 working days",
        citation: "5 U.S.C. 552(a)(6)(A)(i)",
        url: "https://www.justice.gov/oip/freedom-information-act-5-usc-552"
      }]
    },
    latestOutboundCorrespondence: {
      correspondenceId: "corr_selected_followup",
      provider: "gmail",
      providerMessageId: "msg_selected",
      subject: "Selected PRR follow-up",
      occurredAt: "2026-07-10T12:00:00.000Z",
      bodyHash,
      evidenceIds: ["ev_selected_attachment"],
      attachmentEvidenceIds: ["ev_selected_attachment"],
      approvedBy: "actor_investigator"
    },
    productionBatches: [],
    productionEvidenceIds: [],
    exemptions: [],
    possibleStalling: false,
    confirmedStalling: false,
    stallingSignals: []
  };
}

function selectedTimeline(): readonly PrrTimelineEntry[] {
  return [
    { eventId: "evt_prr_selected_created", type: "prr.request.created", occurredAt: "2026-07-01T12:00:00.000Z", payload: { prrRequestId: "prr_req_selected" } as never },
    { eventId: "evt_prr_selected_deadline", type: "prr.deadline.estimated", occurredAt: "2026-07-01T12:01:00.000Z", payload: { prrRequestId: "prr_req_selected" } as never },
    { eventId: "evt_prr_selected_followup", type: "prr.followup.drafted", occurredAt: "2026-07-10T12:00:00.000Z", payload: { prrRequestId: "prr_req_selected", correspondenceId: "corr_selected_followup" } as never }
  ];
}

function selectedGates(): readonly PrrContextGateSnapshot[] {
  return [{
    gateId: "send-gate",
    kind: "send",
    ready: false,
    locked: true,
    checks: [{
      id: "human-send-approval",
      ready: false,
      locked: true,
      detail: "Human send approval is required.",
      sourceEventIds: ["evt_prr_selected_followup"],
      evidenceHashes: [evidenceHash]
    }]
  }, {
    gateId: "legal-gate",
    kind: "legal-escalation",
    ready: false,
    locked: true,
    checks: [{
      id: "user-confirmed-escalation",
      ready: false,
      locked: true,
      detail: "Legal escalation requires an explicit confirmation event."
    }]
  }];
}
```

- [ ] **Step 4: Run targeted red command**

Run:

```bash
npm test -- packages/agent/test/prr-context-packs.test.ts
```

Expected before production code:

```text
Failed to resolve import "../src/prr-context-packs.js"
```

- [ ] **Step 5: Implement minimal PRR read model builder**

Create `packages/agent/src/prr-context-packs.ts` with the shared interfaces and `buildPrrReadModelContextPack()`.

Implementation requirements:

- Validate scope kind and selected request ID match `request.prrRequestId`.
- Reject unsupported own keys on `workspace` such as `otherRequestIds`.
- If `workspace.totalPrrRequestCount` is greater than `1`, require `workspace.otherRequests` with `omittedCount === totalPrrRequestCount - 1`.
- Build a payload with selected request status, jurisdiction pack ref, deadline posture, fee/narrowing posture, correspondence IDs and hashes, production/exemption/denial/appeal/stalling/escalation posture, diagnostics from selected input only, gates, source refs, and omissions.
- Keep deadline/gate/correspondence facts in `resolved.payload`; keep `resolved.ref.safeSummary` as a short audit summary that does not carry the selected deadline sentinel.
- Exclude raw body fields, raw rendered bodies, unrestricted recipients, raw provider metadata, provider message/thread IDs, raw provider errors, credential refs, local paths, and unrelated request IDs.
- Put `gates` into the payload before optional material and fail with `context-budget-exceeded: non-truncatable gates exceed size budget` if the gate-only payload would exceed the budget.
- Use `buildResolvedContextPack()` with `contextPackId: "prr-read-model.v1"`, `version: 1`, `payload`, `scope`, `sourceEventIds`, `artifactHashes`, `projectionHighWaterMark`, `policyVersion`, `sizeBudgetBytes`, and staleness inputs.
- Return the verified `ResolvedContextPack`; do not return a bare `ContextPackRef`.
- Canonically sort event refs, correspondence refs, evidence hashes, diagnostics, and omissions.
- Throw safe errors only.

- [ ] **Step 6: Run targeted green command**

Run:

```bash
npm test -- packages/agent/test/prr-context-packs.test.ts
```

Expected:

```text
Test Files  1 passed
```

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [ ] **Step 8: Commit**

Run:

```bash
git add docs/agentic/claims/task-1-prr-read-model-context-pack.md packages/agent/src/prr-context-packs.ts packages/agent/test/prr-context-packs.test.ts
git commit -m "feat: build selected prr read model context pack"
```

- [ ] **Step 9: Review gate**

Hand off Task 1 for spec and code-quality review. Reviewers must confirm selected-request scoping, no unrelated IDs, O(1) aggregate omission proof, non-truncatable gates, deterministic output, and no-effects behavior.

---

### Task 2: Jurisdiction Pack Summary Context Pack

**Files:**
- Create: `docs/agentic/claims/task-2-jurisdiction-pack-summary-context-pack.md`
- Modify: `packages/agent/src/prr-context-packs.ts`
- Modify: `packages/agent/test/prr-context-packs.test.ts`

**Interfaces:**
- Consumes: Task 1 `PrrSelectedRequestScope`, shared `ResolvedContextPack`, PRR `JurisdictionPack`.
- Produces: `buildJurisdictionPackSummaryContextPack(input: BuildJurisdictionPackSummaryContextPackInput): ResolvedContextPack`.

- [ ] **Step 1: Claim and start the task**

Create `docs/agentic/claims/task-2-jurisdiction-pack-summary-context-pack.md` with the same claim shape as Task 1, owned files for this task, and status `claimed`. Commit it, then change status to `in-progress` and commit that transition.

- [ ] **Step 2: Write failing jurisdiction pack tests**

Extend the existing top-level import from `../src/prr-context-packs.js` to include `buildJurisdictionPackSummaryContextPack`, then append these tests to `packages/agent/test/prr-context-packs.test.ts`:

```ts
const jurisdictionArtifactHash = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const;

describe("selected request jurisdiction pack summary context pack", () => {
  it("binds pack name, version, artifact hash, exact rule IDs, and advisory legal posture", () => {
    const resolved = buildJurisdictionPackSummaryContextPack({
      generatedAt,
      policyVersion: "agent-policy-v1",
      scope: { kind: "prr-request", id: "prr_req_selected" },
      selectedRequestEventId: "evt_prr_selected_created",
      selectedRequestJurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      jurisdictionPack: {
        name: "us-federal-foia",
        version: "0.1.0",
        jurisdiction: "US Federal",
        description: "Federal FOIA starter jurisdiction pack for selected request context.",
        agentGuidance: "Use cited rules as advisory workflow guidance, not legal advice.",
        rules: [{
          id: "federal-determination-20-working-days",
          label: "20 working days determination estimate",
          kind: "deadline",
          description: "Federal FOIA determination timing guidance for selected request context.",
          citations: [{
            label: "5 U.S.C. 552(a)(6)(A)(i)",
            citation: "5 U.S.C. 552(a)(6)(A)(i)",
            url: "https://www.justice.gov/oip/freedom-information-act-5-usc-552"
          }],
          agentWarning: "Confirm tolling and receipt facts before legal escalation language."
        }]
      },
      jurisdictionArtifactHash,
      projectionHighWaterMark: 77,
      sizeBudgetBytes: 16_384
    });
    const ref = resolved.ref;

    expect(ref).toMatchObject({
      contextPackId: "jurisdiction-pack-summary.v1",
      version: 1,
      scope: { kind: "prr-request", id: "prr_req_selected" },
      projectionHighWaterMark: 77
    });
    expect(ref.provenanceRefs).toEqual(expect.arrayContaining([
      "evt_prr_selected_created",
      jurisdictionArtifactHash,
      "jurisdiction-rule:us-federal-foia@0.1.0:federal-determination-20-working-days"
    ]));
    expect(ref.artifactHashes).toEqual([jurisdictionArtifactHash]);
    expect(ref.stalenessInputs).toEqual(expect.arrayContaining([
      { kind: "jurisdiction-pack-artifact-hash", ref: "us-federal-foia@0.1.0", value: jurisdictionArtifactHash },
      { kind: "selected-request-jurisdiction-pack", ref: "prr_req_selected", value: "us-federal-foia@0.1.0" }
    ]));
    expect(verifyResolvedContextPack(resolved).ref).toEqual(ref);
    expect(JSON.stringify(resolved.payload)).toContain("federal-determination-20-working-days");
    expect(ref.safeSummary).not.toContain("federal-determination-20-working-days");
  });

  it("fails without artifact hash, mismatched selected request pack, or uncited legal category", () => {
    expect(() =>
      buildJurisdictionPackSummaryContextPack({
        ...jurisdictionInput(),
        jurisdictionArtifactHash: undefined as never
      })
    ).toThrow(/artifact hash/i);

    expect(() =>
      buildJurisdictionPackSummaryContextPack({
        ...jurisdictionInput(),
        selectedRequestJurisdictionPack: { name: "florida-public-records", version: "0.1.0" }
      })
    ).toThrow(/selected request jurisdiction/i);

    expect(() =>
      buildJurisdictionPackSummaryContextPack({
        ...jurisdictionInput(),
        jurisdictionPack: {
          ...jurisdictionInput().jurisdictionPack,
          rules: [{
            ...jurisdictionInput().jurisdictionPack.rules[0]!,
            kind: "deadline",
            citations: []
          }]
        }
      })
    ).toThrow(/citation|rule/i);
  });

  it("records machine-readable omissions for missing rule categories", () => {
    const resolved = buildJurisdictionPackSummaryContextPack(jurisdictionInput());
    const ref = resolved.ref;

    expect(ref.safeSummary).toMatch(/advisory/i);
    expect(JSON.stringify(ref)).not.toMatch(/legal advice|definitive/i);
    expect(ref.sizeBytes).toBeGreaterThan(0);
  });
});

function jurisdictionInput(): Parameters<typeof buildJurisdictionPackSummaryContextPack>[0] {
  return {
    generatedAt,
    policyVersion: "agent-policy-v1",
    scope: { kind: "prr-request", id: "prr_req_selected" },
    selectedRequestEventId: "evt_prr_selected_created",
    selectedRequestJurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
    jurisdictionPack: {
      name: "us-federal-foia",
      version: "0.1.0",
      jurisdiction: "US Federal",
      description: "Federal FOIA starter jurisdiction pack for selected request context.",
      agentGuidance: "Use cited rules as advisory workflow guidance, not legal advice.",
      rules: [{
        id: "federal-determination-20-working-days",
        label: "20 working days determination estimate",
        kind: "deadline",
        description: "Federal FOIA determination timing guidance for selected request context.",
        citations: [{
          label: "5 U.S.C. 552(a)(6)(A)(i)",
          citation: "5 U.S.C. 552(a)(6)(A)(i)",
          url: "https://www.justice.gov/oip/freedom-information-act-5-usc-552"
        }],
        agentWarning: "Confirm tolling and receipt facts before legal escalation language."
      }]
    },
    jurisdictionArtifactHash,
    projectionHighWaterMark: 77,
    sizeBudgetBytes: 16_384
  };
}
```

- [ ] **Step 3: Run targeted red command**

Run:

```bash
npm test -- packages/agent/test/prr-context-packs.test.ts
```

Expected before production changes:

```text
buildJurisdictionPackSummaryContextPack is not a function
```

- [ ] **Step 4: Implement jurisdiction summary builder**

Modify `packages/agent/src/prr-context-packs.ts`:

- Validate selected request scope.
- Validate selected request jurisdiction pack name/version matches the supplied jurisdiction pack.
- Require `jurisdictionArtifactHash`.
- Require every included rule to have at least one citation.
- Build payload with pack name, pack version, jurisdiction label, artifact hash, cited rules sorted by category and rule ID, advisory posture, and omissions for absent categories among `deadline`, `fee`, `exemption`, `appeal`, and `enforcement`.
- Keep exact rule IDs, citations, and advisory legal posture in `resolved.payload`; keep `resolved.ref.safeSummary` short enough that rule sentinels are not required there.
- Include provenance refs for selected request event ID, artifact hash, and each rule ref in the form `jurisdiction-rule:<pack>@<version>:<ruleId>`.
- Include staleness inputs for artifact hash and selected request pack binding.
- Exclude definitive legal conclusions.
- Use `buildResolvedContextPack()` and return the verified `ResolvedContextPack`; do not return a bare `ContextPackRef`.

- [ ] **Step 5: Run targeted green command**

Run:

```bash
npm test -- packages/agent/test/prr-context-packs.test.ts
```

Expected:

```text
Test Files  1 passed
```

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/agentic/claims/task-2-jurisdiction-pack-summary-context-pack.md packages/agent/src/prr-context-packs.ts packages/agent/test/prr-context-packs.test.ts
git commit -m "feat: build jurisdiction pack summary context pack"
```

- [ ] **Step 8: Review gate**

Hand off Task 2 for spec and code-quality review. Reviewers must confirm artifact-hash staleness proof, advisory-only legal posture, exact rule ID/citation binding, omissions for missing categories, and no raw legal conclusions.

---

### Task 3: Package Registration Helper And Exports

**Files:**
- Create: `docs/agentic/claims/task-3-prr-context-pack-registration.md`
- Modify: `packages/agent/src/prr-context-packs.ts`
- Modify: `packages/agent/test/prr-context-packs.test.ts`
- Modify: `packages/agent/src/index.ts`

**Interfaces:**
- Consumes: Task 1 and Task 2 builders, `ContextPackRegistry`.
- Produces: `registerPrrContextPackBuilders(input: RegisterPrrContextPackBuildersInput): void` and public package exports.

- [ ] **Step 1: Claim and start the task**

Create `docs/agentic/claims/task-3-prr-context-pack-registration.md`, commit it as `claimed`, then mark `in-progress` and commit.

- [ ] **Step 2: Write failing registration tests**

Extend the existing top-level import from `../src/context-packs.js` to include `createContextPackRegistry` and `type ContextPackBuilder`, extend the existing top-level import from `../src/prr-context-packs.js` to include `registerPrrContextPackBuilders`, then append these tests to `packages/agent/test/prr-context-packs.test.ts`:

```ts
describe("PRR context pack registration", () => {
  it("registers the two PRR builders and allows same-builder idempotent registration", async () => {
    const registry = createContextPackRegistry();
    const prrBuilder = prrBuilderForTest();
    const jurisdictionBuilder = jurisdictionBuilderForTest();

    registerPrrContextPackBuilders({
      registry,
      prrReadModelBuilder: prrBuilder,
      jurisdictionPackSummaryBuilder: jurisdictionBuilder
    });
    registerPrrContextPackBuilders({
      registry,
      prrReadModelBuilder: prrBuilder,
      jurisdictionPackSummaryBuilder: jurisdictionBuilder
    });

    expect(registry.snapshot().contextPackIds).toEqual([
      "prr-read-model.v1",
      "jurisdiction-pack-summary.v1"
    ]);
    await expect(registry.buildResolved("prr-read-model.v1")).resolves.toMatchObject({
      ref: { contextPackId: "prr-read-model.v1" }
    });
    await expect(registry.buildResolved("jurisdiction-pack-summary.v1")).resolves.toMatchObject({
      ref: { contextPackId: "jurisdiction-pack-summary.v1" }
    });
  });

  it("conflicts on duplicate ID and version with a different builder", () => {
    const registry = createContextPackRegistry();
    const prrBuilder = prrBuilderForTest();
    const jurisdictionBuilder = jurisdictionBuilderForTest();

    registerPrrContextPackBuilders({
      registry,
      prrReadModelBuilder: prrBuilder,
      jurisdictionPackSummaryBuilder: jurisdictionBuilder
    });

    expect(() =>
      registerPrrContextPackBuilders({
        registry,
        prrReadModelBuilder: prrBuilderForTest(),
        jurisdictionPackSummaryBuilder: jurisdictionBuilder
      })
    ).toThrow(/conflict|already registered/i);
  });
});

function prrBuilderForTest(): ContextPackBuilder {
  return {
    descriptor: {
      contextPackId: "prr-read-model.v1",
      version: 1,
      label: "Selected request PRR read model",
      maxBytes: 32_768,
      requiredProvenanceKinds: ["event-id", "content-hash"],
      redactionPolicy: "safe-normalized-summary",
      sourceProjection: "prr.projection.selected-request"
    },
    build: () => buildPrrReadModelContextPack(basePrrInput())
  };
}

function jurisdictionBuilderForTest(): ContextPackBuilder {
  return {
    descriptor: {
      contextPackId: "jurisdiction-pack-summary.v1",
      version: 1,
      label: "Selected request jurisdiction pack summary",
      maxBytes: 16_384,
      requiredProvenanceKinds: ["event-id", "content-hash"],
      redactionPolicy: "safe-normalized-summary",
      sourceProjection: "prr.jurisdiction-pack.selected-request"
    },
    build: () => buildJurisdictionPackSummaryContextPack(jurisdictionInput())
  };
}
```

- [ ] **Step 3: Run targeted red command**

Run:

```bash
npm test -- packages/agent/test/prr-context-packs.test.ts
```

Expected before production changes:

```text
registerPrrContextPackBuilders is not a function
```

- [ ] **Step 4: Implement registration helper and exports**

Modify `packages/agent/src/prr-context-packs.ts`:

- Add module-local `WeakMap<ResolvedContextPackRegistry, Map<string, ContextPackBuilder>>`.
- Use key `"<contextPackId>@<version>"`.
- If the key was registered through this helper with the same builder object, return without calling `registry.register()`.
- If the key was registered through this helper with a different builder object, throw a safe conflict error.
- If `registry.getDescriptor(contextPackId)` exists but the helper has no matching builder identity, throw a safe conflict error.
- Require the shared registry to expose `buildResolved(contextPackId)`; if only bare refs are available, stop on `schema-conflict`.
- Register `prr-read-model.v1` before `jurisdiction-pack-summary.v1`.

Modify `packages/agent/src/index.ts`:

```ts
export * from "./prr-context-packs.js";
```

- [ ] **Step 5: Run targeted green command**

Run:

```bash
npm test -- packages/agent/test/prr-context-packs.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/prr-negotiation-workflow.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/agentic/claims/task-3-prr-context-pack-registration.md packages/agent/src/prr-context-packs.ts packages/agent/src/index.ts packages/agent/test/prr-context-packs.test.ts
git commit -m "feat: register prr context pack builders"
```

- [ ] **Step 8: Review gate**

Hand off Task 3 for review. Reviewers must confirm package-level idempotency, duplicate conflict behavior, no weakening of the generic registry, and no workflow/orchestrator changes.

---

### Task 4: Narrow Local Runtime Selected PRR Registration Adapter

**Files:**
- Create: `docs/agentic/claims/task-4-local-runtime-prr-context-pack-registration.md`
- Create: `packages/local-runtime/src/agent-prr-context-packs.ts`
- Create: `packages/local-runtime/test/agent-prr-context-packs.test.ts`

**Interfaces:**
- Consumes: Task 3 registration helper, local-runtime `LocalRuntimeHandle`, PRR runtime read events, PRR projection/read API.
- Produces: `registerLocalRuntimeSelectedPrrContextPacks(input: RegisterLocalRuntimeSelectedPrrContextPacksInput): void`.

- [ ] **Step 1: Claim and start the task**

Create `docs/agentic/claims/task-4-local-runtime-prr-context-pack-registration.md`, commit it as `claimed`, then mark `in-progress` and commit.

- [ ] **Step 2: Write failing local-runtime registration tests**

Create `packages/local-runtime/test/agent-prr-context-packs.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createContextPackRegistry,
  createContextPackResolver,
  prepareSpecialistRun,
  verifyResolvedContextPack,
  type SpecialistRunnerModelInvoker
} from "../../agent/src/index.js";
import { createAgentRuntime } from "../../agent/src/runtime.js";
import { PrrLifecycleService } from "../../prr/src/lifecycle.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createSqlitePrrRuntime } from "../src/runtime-factory.js";
import { registerLocalRuntimeSelectedPrrContextPacks } from "../src/agent-prr-context-packs.js";

const tempDirs: string[] = [];
const now = () => "2026-07-10T12:00:00.000Z";
const actor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("local runtime selected PRR context pack registration", () => {
  it("registers only selected-request PRR packs without leaking unrelated request IDs", async () => {
    const handle = createTestHandle();
    try {
      const lifecycle = new PrrLifecycleService({ ledger: handle.ledger, actor });
      await lifecycle.createRequest({
        prrRequestId: "prr_req_selected",
        jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
        agency: { name: "Selected Agency", email: "foia@example.gov" },
        requester: { name: "Investigator", email: "investigator@example.org" },
        requestText: "Safe selected request summary.",
        receivedAt: now()
      });
      await lifecycle.createRequest({
        prrRequestId: "prr_unrelated_sensitive",
        jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
        agency: { name: "Agency Not Selected", email: "other@example.gov" },
        requester: { name: "Investigator", email: "investigator@example.org" },
        requestText: "Unrelated sensitive request.",
        receivedAt: now()
      });

      const registry = createContextPackRegistry();
      registerLocalRuntimeSelectedPrrContextPacks({
        registry,
        handle,
        prrRequestId: "prr_req_selected",
        now,
        policyVersion: "agent-policy-v1"
      });

      const prrResolved = await registry.buildResolved("prr-read-model.v1");
      const jurisdictionResolved = await registry.buildResolved("jurisdiction-pack-summary.v1");
      const prrRef = verifyResolvedContextPack(prrResolved).ref;
      const jurisdictionRef = verifyResolvedContextPack(jurisdictionResolved).ref;

      expect(prrRef.scope).toEqual({ kind: "prr-request", id: "prr_req_selected" });
      expect(jurisdictionRef.scope).toEqual({ kind: "prr-request", id: "prr_req_selected" });
      expect(JSON.stringify([prrResolved, jurisdictionResolved])).not.toMatch(/prr_unrelated_sensitive|Agency Not Selected|Unrelated sensitive/);
      expect((await handle.runtime.readEvents()).map((event) => event.type)).not.toEqual(expect.arrayContaining([
        "prr.request.sent",
        "prr.followup.sent",
        "prr.legal-escalation.confirmed",
        "agent.tool.requested"
      ]));
    } finally {
      handle.close();
    }
  });

  it("fails closed when the selected request is absent", async () => {
    const handle = createTestHandle();
    try {
      const registry = createContextPackRegistry();
      registerLocalRuntimeSelectedPrrContextPacks({
        registry,
        handle,
        prrRequestId: "prr_req_missing",
        now
      });

      await expect(registry.buildResolved("prr-read-model.v1")).rejects.toThrow(/prr-request-missing|missing/i);
      await expect(registry.buildResolved("jurisdiction-pack-summary.v1")).rejects.toThrow(/prr-request-missing|missing/i);
    } finally {
      handle.close();
    }
  });

  it("renders selected payload sentinels after hash verification and blocks missing or mismatched resolution before provider invocation", async () => {
    const handle = createTestHandle(["prr_req_selected"]);
    try {
      const created = await handle.runtime.createDraftRequest({
        jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
        agency: { name: "Selected Agency", email: "foia@example.gov" },
        requester: { name: "Investigator", email: "investigator@example.org" },
        requestText: "Safe selected request summary.",
        receivedAt: now()
      });
      expect(created.ok).toBe(true);

      const registry = createContextPackRegistry();
      registerLocalRuntimeSelectedPrrContextPacks({
        registry,
        handle,
        prrRequestId: "prr_req_selected",
        now,
        policyVersion: "agent-policy-v1"
      });

      const prrResolved = await registry.buildResolved("prr-read-model.v1");
      const jurisdictionResolved = await registry.buildResolved("jurisdiction-pack-summary.v1");
      expect(prrResolved.ref.safeSummary).not.toContain("2026-08-07");
      expect(jurisdictionResolved.ref.safeSummary).not.toContain("federal-determination-20-working-days");

      const agentRuntime = createAgentRuntime({ ledger: handle.ledger, actor, now });
      await agentRuntime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
      await agentRuntime.createTask({
        taskId: "task_prr_negotiation",
        title: "Negotiate selected PRR",
        requestedBy: actor.id,
        priority: "normal"
      });
      await agentRuntime.startRun({
        runId: "run_prr_negotiation",
        taskId: "task_prr_negotiation",
        runType: "prr-negotiation",
        scope: { kind: "workspace", refs: ["ws_case_001"] }
      });

      const runtime = fakeInvoker();
      const prepared = await prepareSpecialistRun({
        ledger: handle.ledger,
        actor,
        now,
        contextPacks: registry,
        contextPackResolver: createContextPackResolver([prrResolved, jurisdictionResolved]),
        runId: "run_prr_negotiation",
        taskId: "task_prr_negotiation",
        providerId: "provider_fake_local",
        modelFamily: "fake-local",
        credentialRef: {
          credentialRefId: "agent_credref_fake",
          providerId: "provider_fake_local",
          kind: "local-no-secret",
          safeLabel: "Fake local"
        },
        runtime,
        providerReadiness: { cards: [readyProviderCard()] }
      }, "prr-negotiation");

      expect(prepared.promptArtifact.text).toContain("2026-08-07");
      expect(prepared.promptArtifact.text).toContain("federal-determination-20-working-days");

      const forgedPrr = {
        ref: prrResolved.ref,
        payload: { ...prrResolved.payload, forgedDeadline: "2099-01-01" }
      };
      expect(() => createContextPackResolver([forgedPrr, jurisdictionResolved]))
        .toThrow(/context pack payload.*hash|size|mismatch/i);
      expect(runtime.invokeModel).not.toHaveBeenCalled();

      await expect(prepareSpecialistRun({
        ledger: handle.ledger,
        actor,
        now,
        contextPacks: registry,
        contextPackResolver: createContextPackResolver([jurisdictionResolved]),
        runId: "run_prr_negotiation",
        taskId: "task_prr_negotiation",
        providerId: "provider_fake_local",
        modelFamily: "fake-local",
        credentialRef: {
          credentialRefId: "agent_credref_fake",
          providerId: "provider_fake_local",
          kind: "local-no-secret",
          safeLabel: "Fake local"
        },
        runtime,
        providerReadiness: { cards: [readyProviderCard()] }
      }, "prr-negotiation")).rejects.toThrow(/context pack.*not found|missing resolution/i);
      expect(runtime.invokeModel).not.toHaveBeenCalled();
    } finally {
      handle.close();
    }
  });
});

function createTestHandle(requestIds: readonly string[] = []) {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-local-prr-context-"));
  tempDirs.push(cwd);
  let requestIndex = 0;
  return createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({ cwd, env: {} }),
    actor,
    now,
    requestIdFactory: () => requestIds[requestIndex++] ?? `prr_generated_${requestIndex}`
  });
}

function readyProviderCard() {
  return {
    providerId: "provider_fake_local",
    label: "Fake local",
    backendKind: "local-engine" as const,
    capabilitySummary: ["Deterministic local test provider"],
    credentialKindSummary: ["local-no-secret" as const],
    state: "ready" as const,
    requiredApprovalClass: "none" as const,
    credentialHealth: "local-binding-healthy" as const,
    dataHandlingPosture: "local-only" as const,
    credentialRefId: "agent_credref_fake",
    safeActionIds: []
  };
}

function fakeInvoker(): SpecialistRunnerModelInvoker & { readonly invokeModel: ReturnType<typeof vi.fn> } {
  return {
    invokeModel: vi.fn(async () => ({
      ok: true,
      outputText: "{\"summary\":\"ok\"}",
      outputArtifactHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      eventIds: ["evt_model_invocation"]
    }))
  };
}
```

- [ ] **Step 3: Run targeted red command**

Run:

```bash
npm test -- packages/local-runtime/test/agent-prr-context-packs.test.ts
```

Expected before production changes:

```text
Failed to resolve import "../src/agent-prr-context-packs.js"
```

- [ ] **Step 4: Implement local-runtime adapter**

Create `packages/local-runtime/src/agent-prr-context-packs.ts`.

Implementation requirements:

- Read events from `handle.runtime.readEvents()` inside each resolved builder's `build()` function.
- Rebuild `buildPrrProjection(events)` and select only `prrRequestId`.
- Use `projection.requests.size` only to compute `totalPrrRequestCount`; do not enumerate unrelated request records.
- Build selected timeline with `projection.timelineForRequest(prrRequestId)`.
- Derive selected request stream proof from selected timeline order: creation event ID, stream head event ID, source event IDs, and high-water mark equal to selected timeline length.
- Build selected gates from `buildPrrWorkspaceDto(projection, { now: input.now() })` and filter to the selected request's `send` and `legal-escalation` gate summaries only.
- Compute jurisdiction artifact hash with `hashAgentContextPack(jurisdictionPack)` for the selected request pack.
- Register package builders through `registerPrrContextPackBuilders()` so `registry.buildResolved()` returns verified `ResolvedContextPack` envelopes.
- Use the operational `createContextPackResolver()`/provider rendering path only through its approved public exports; do not implement a local hash-to-text callback.
- If production rendering does not yet accept `contextPackResolver` or does not verify hash/size before prompt rendering, stop on `schema-conflict` and hand off to the operational lane.
- Do not import or modify specialist runner/orchestrator/prompt template files in this PRR task.
- Do not append ledger events, request tool approvals, send correspondence, or clear locks.

- [ ] **Step 5: Run targeted green command**

Run:

```bash
npm test -- packages/local-runtime/test/agent-prr-context-packs.test.ts packages/agent/test/prr-context-packs.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/agentic/claims/task-4-local-runtime-prr-context-pack-registration.md packages/local-runtime/src/agent-prr-context-packs.ts packages/local-runtime/test/agent-prr-context-packs.test.ts
git commit -m "feat: register local runtime prr context packs"
```

- [ ] **Step 8: Review gate**

Hand off Task 4 for review. Reviewers must confirm the runtime adapter is a narrow registration helper, passes only selected request plus aggregate proof into package builders, produces resolved envelopes, exercises production prompt rendering through the operational resolver contract, blocks missing/mismatched payloads before provider invocation, does not touch shared workflow orchestration, and has no external effects.

---

### Task 5: Factory Readiness And Durable Evidence

**Files:**
- Create: `docs/agentic/claims/task-5-prr-context-pack-readiness.md`
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`

**Interfaces:**
- Consumes: completed Tasks 1 through 4 and their verification evidence.
- Produces: durable readiness evidence and factory-readiness tracking for the approved spec/plan.

- [ ] **Step 1: Claim and start the task**

Create `docs/agentic/claims/task-5-prr-context-pack-readiness.md`, commit it as `claimed`, then mark `in-progress` and commit.

- [ ] **Step 2: Run focused verification**

Run:

```bash
npm test -- packages/agent/test/prr-context-packs.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/local-runtime/test/agent-prr-context-packs.test.ts
```

Expected:

```text
Test Files  4 passed
```

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [ ] **Step 4: Track the approved files in factory readiness**

Modify `scripts/check-agent-readiness.mjs` by adding these exact entries to `requiredFiles` near the other July 10 resident-agent context items:

```js
  "docs/superpowers/specs/2026-07-10-prr-jurisdiction-context-packs-design.md",
  "docs/superpowers/plans/2026-07-10-prr-jurisdiction-context-packs-implementation.md"
```

- [ ] **Step 5: Record readiness evidence**

Append this section to `docs/agentic/software-factory.md` with the actual commit IDs and fresh command output counts from Tasks 1 through 4:

```markdown
## PRR And Jurisdiction Context Packs Plan Readiness

The selected-request PRR and jurisdiction context-pack implementation completed from the approved design spec on 2026-07-10.

Required design and plan files:

- `docs/superpowers/specs/2026-07-10-prr-jurisdiction-context-packs-design.md`
- `docs/superpowers/plans/2026-07-10-prr-jurisdiction-context-packs-implementation.md`

Recorded targeted command evidence:

```text
npm test -- packages/agent/test/prr-context-packs.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/local-runtime/test/agent-prr-context-packs.test.ts
<paste fresh passing summary>
```

Recorded full verification:

```text
npm run verify
<paste fresh passing summary>
```

The context-pack builders remain selected-request scoped and return verified `ResolvedContextPack { ref, payload }` envelopes. Unrelated PRR request IDs never enter `prr-read-model.v1`; only aggregate omitted count and projection high-water proof are recorded. Jurisdiction staleness is bound by pack name, version, exact rule IDs, and jurisdiction artifact content hash. Production prompt rendering includes selected deadline and rule payload sentinels only after local hash/size verification, while ledger/events/readiness surfaces keep refs only. Active send, legal, and governance gates remain non-truncatable, and the builders have no path to send, follow up, appeal, confirm escalation, clear locks, grant approval, or execute domain effects.
```

- [ ] **Step 6: Run documentation gates**

Run:

```bash
git diff --check
npm run factory:check
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 7: Run full verification after readiness updates**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [ ] **Step 8: Commit**

Run:

```bash
git add docs/agentic/claims/task-5-prr-context-pack-readiness.md scripts/check-agent-readiness.mjs docs/agentic/software-factory.md
git commit -m "docs: record prr context pack readiness"
```

- [ ] **Step 9: Final review gate**

Hand off the whole branch for spec-compliance review and code-quality review. Reviewers must verify all claims, commits, targeted commands, full verification, no unrelated file edits, and preservation of append-only, provenance, no-effects, legal-gate, and selected-request privacy guarantees.

## Completion Criteria

- `prr-read-model.v1` builds from selected request inputs only.
- Both PRR builders return resolved envelopes whose payload hash and byte size exactly match the ref.
- Unrelated request IDs never enter context, safe summaries, provenance refs, staleness inputs, errors, diagnostics, or tests.
- Pack size is independent of unrelated request count except for O(1) aggregate omitted count/high-water proof.
- `jurisdiction-pack-summary.v1` binds jurisdiction pack name, version, exact rule IDs, citations, and artifact content hash.
- Selected deadline and jurisdiction-rule sentinels are absent from `safeSummary`, present in verified payloads, and included in production prompt rendering after resolver verification.
- Missing or mismatched payload resolution blocks provider invocation before the model invoker is called.
- Active send, legal, and governance gates are included or the builder fails closed.
- Builders and registration are deterministic and reject hostile DTO structures.
- Package registration is idempotent for same builders and conflicts for duplicate ID/version with a different builder.
- Local runtime registration is narrow and does not change specialist prompt templates, handoffs, runners, orchestration, or domain execution adapters.
- Targeted tests, `npm run verify`, `git diff --check`, and `npm run factory:check` pass.
