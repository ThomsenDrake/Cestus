# PRR And Jurisdiction Context Packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build selected-request production resolved context-pack builders and narrow runtime registration for `prr-read-model.v1` and `jurisdiction-pack-summary.v1`.

**Architecture:** Keep pure package builders in `packages/agent/src/prr-context-packs.ts`, fed by authoritative PRR read models, selected request streams, jurisdiction pack artifacts, and bounded workspace metadata. The builders return provider-safe `ResolvedContextPack { ref, payload }` envelopes from the shared operational content-addressed contract; durable ledgers/readiness keep refs only, while production prompt rendering resolves and verifies payload bytes locally. Keep package registration separate from local-runtime assembly, and make the local-runtime task pass only selected request state plus O(1) aggregate omission proof into the builders.

**Tech Stack:** TypeScript, strict repo-consistent structured schemas, shared `ResolvedContextPack`/`ContextPackRef`/registry/parser helpers, Vitest, PRR projection/read API contracts, local-runtime SQLite PRR handle, Markdown factory claims.

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
- PRR registrations supply strict payload parsers keyed by context pack ID/version; the operational resolver applies them after hash/size verification.
- Ledger events, prompt manifests, readiness DTOs, approval previews, and durable audit records carry refs only; selected PRR payload bytes are local prompt-rendering inputs.
- Production prompt rendering resolves bounded selected-request payloads locally, verifies exact hash and size, applies the exact parser, and includes those approved bytes before provider invocation.
- Missing payload resolution, payload/ref mismatch, parser rejection, wrong context pack ID/version, wrong selected-request scope, or stale resolver output blocks provider invocation.
- Do not add an arbitrary hash-to-text callback.
- Deterministic fake-invoker tests prove prompt construction and pre-provider blocking only; the prompt/orchestrator lane's real Nous sentinel gate is the acceptance proof for live provider execution.
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

## Prerequisites And Rebase Gates

### Package Builder Gate For Tasks 1-3

Tasks 1 through 3 require the landed operational resolved-envelope, registry, and strict payload-parser contract. They do not require prompt-template rendering integration.

Before Task 1 implementation, verify that `packages/agent/src/context-packs.ts` or the operational lane's approved public export provides this exact semantic surface:

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

export interface ContextPackPayloadParser<
  Payload extends AgentContextPackJsonValue = AgentContextPackJsonValue
> {
  readonly contextPackId: string;
  readonly version: number;
  readonly parserId: string;
  parse(payload: AgentContextPackJsonValue): Payload;
}

export interface ResolvedContextPackRegistry extends ContextPackRegistry {
  registerPayloadParser(parser: ContextPackPayloadParser): void;
  buildResolved(contextPackId: string): Promise<ResolvedContextPack>;
}

export function buildResolvedContextPack(
  input: BuildContextPackRefInput
): ResolvedContextPack;

export function verifyResolvedContextPack(input: ResolvedContextPack): ResolvedContextPack;

export function parseResolvedContextPack(
  input: ResolvedContextPack,
  parser: ContextPackPayloadParser
): ResolvedContextPack;

export function createContextPackResolver(
  resolvedPacks: readonly ResolvedContextPack[],
  parsers: readonly ContextPackPayloadParser[]
): ContextPackResolver;
```

The resolver contract must verify hash and size before applying the parser for the exact `contextPackId` and `version`. A payload that is generic safe JSON and has a matching ref hash still fails when the registered parser rejects its shape.

If this shared package contract is absent, named differently, or semantically weaker, stop with `schema-conflict` and hand the branch back to the coordinator before implementing Tasks 1 through 3.

Run this package preflight before Task 1:

```bash
rg -n "ResolvedContextPack|buildResolvedContextPack|verifyResolvedContextPack|ContextPackResolver|ContextPackPayloadParser|registerPayloadParser|parseResolvedContextPack|createContextPackResolver|buildResolved" packages/agent/src
```

Expected:

```text
packages/agent/src/context-packs.ts exports the resolved context and parser contract, or an approved operational module re-exports the same contract through packages/agent/src/index.ts.
```

### Prompt Rendering Gate For Task 4

Task 4's production rendering regression additionally requires the landed prompt-template/resolved-payload rendering lane. That lane must expose:

- a provider invocation preparation path that consumes a `ContextPackResolver`;
- local prompt rendering that verifies hash, size, parser, and selected scope before including payload bytes;
- an approved complete `prr-negotiation` resolved-context fixture helper for every required context pack, including `governance-locks.v1`, `evidence-summary.v1`, `agent-memory-summary.v1`, `task-run-history.v1`, and `workspace-runtime-status.v1`, or an equivalent public fixture registration helper;
- the final selected-PRR task/run applicability contract.

The plan expects the prompt lane to expose this helper shape, or an equivalent approved helper with the same semantics:

```ts
export function buildCompletePrrNegotiationResolvedContextFixture(input: {
  readonly selectedPrrReadModel: import("../../src/context-packs.js").ResolvedContextPack;
  readonly selectedJurisdictionPackSummary: import("../../src/context-packs.js").ResolvedContextPack;
  readonly selectedPrrScope: { readonly kind: "prr-request"; readonly id: string };
  readonly generatedAt: string;
  readonly omitContextPackIds?: readonly string[];
}): {
  readonly selectedPrrRunScope: import("../../src/runtime.js").AgentRunScopeInput;
  readonly contextPackResolver: import("../../src/context-packs.js").ContextPackResolver;
  readonly resolvedPacks: readonly import("../../src/context-packs.js").ResolvedContextPack[];
  registerFixtureBuilders(registry: import("../../src/context-packs.js").ResolvedContextPackRegistry): void;
};
```

The helper must assert that `specialistWorkflowDescriptorFor("prr-negotiation").contextPacks` is fully represented except for IDs explicitly listed in `omitContextPackIds`, and it must use the final selected-PRR applicability contract for `selectedPrrRunScope`.

Do not block Tasks 1 through 3 on this prompt-rendering gate. If this gate is missing when Task 4 begins, stop Task 4 with `schema-conflict` and hand off to the prompt/orchestrator owner.

### Runtime Adapter Rebase Gate For Task 4

Task 4 edits in `packages/local-runtime` must rebase after the lifecycle and shared-runtime owners land their selected-PRR runtime scope and adapter contract changes. If the selected-PRR task/run scope, PRR lifecycle projections, or shared runtime registration APIs differ from this plan, update the Task 4 test to the landed contract before writing production code and record the rebase in the task claim.

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

export type PrrReadModelContextPackPayload = import("./context-packs.js").AgentContextPackJsonValue & {
  readonly schemaVersion: "prr-read-model-context.v1";
  readonly scope: PrrSelectedRequestScope;
  readonly lifecycle: import("./context-packs.js").AgentContextPackJsonValue;
  readonly requestStream: PrrSelectedRequestStreamProof;
  readonly deadline: import("./context-packs.js").AgentContextPackJsonValue;
  readonly fee: import("./context-packs.js").AgentContextPackJsonValue;
  readonly narrowing: import("./context-packs.js").AgentContextPackJsonValue;
  readonly correspondence: import("./context-packs.js").AgentContextPackJsonValue;
  readonly production: import("./context-packs.js").AgentContextPackJsonValue;
  readonly diagnostics: readonly import("./context-packs.js").AgentContextPackJsonValue[];
  readonly gates: readonly PrrContextGateSnapshot[];
  readonly omissions: readonly import("./context-packs.js").AgentContextPackJsonValue[];
};

export function buildPrrReadModelContextPack(
  input: BuildPrrReadModelContextPackInput
): import("./context-packs.js").ResolvedContextPack;

export const prrReadModelPayloadParser:
  import("./context-packs.js").ContextPackPayloadParser<PrrReadModelContextPackPayload>;
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

export type JurisdictionPackSummaryContextPackPayload = import("./context-packs.js").AgentContextPackJsonValue & {
  readonly schemaVersion: "jurisdiction-pack-summary-context.v1";
  readonly scope: PrrSelectedRequestScope;
  readonly packName: string;
  readonly packVersion: string;
  readonly jurisdiction: string;
  readonly jurisdictionArtifactHash: `sha256:${string}`;
  readonly citedRules: readonly import("./context-packs.js").AgentContextPackJsonValue[];
  readonly advisoryPosture: import("./context-packs.js").AgentContextPackJsonValue;
  readonly omissions: readonly import("./context-packs.js").AgentContextPackJsonValue[];
};

export function buildJurisdictionPackSummaryContextPack(
  input: BuildJurisdictionPackSummaryContextPackInput
): import("./context-packs.js").ResolvedContextPack;

export const jurisdictionPackSummaryPayloadParser:
  import("./context-packs.js").ContextPackPayloadParser<JurisdictionPackSummaryContextPackPayload>;
```

Task 3 adds:

```ts
export interface PrrContextPackRegistrationEntry {
  readonly descriptor: import("./context-packs.js").ContextPackDescriptor;
  readonly builder: import("./context-packs.js").ContextPackBuilder;
  readonly payloadParser: import("./context-packs.js").ContextPackPayloadParser;
  readonly registrationIdentity: string;
}

export interface RegisterPrrContextPackBuildersInput {
  readonly registry: import("./context-packs.js").ResolvedContextPackRegistry;
  readonly prrReadModel: PrrContextPackRegistrationEntry;
  readonly jurisdictionPackSummary: PrrContextPackRegistrationEntry;
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
import {
  buildResolvedContextPack,
  parseResolvedContextPack,
  verifyResolvedContextPack
} from "../src/context-packs.js";
import type { PrrRequestReadModel, PrrTimelineEntry } from "../../prr/src/projection.js";
import {
  buildPrrReadModelContextPack,
  prrReadModelPayloadParser,
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

  it("rejects a matching-ref attacker payload that is generic JSON but not the PRR payload shape", () => {
    const attackerResolved = buildResolvedContextPack({
      contextPackId: "prr-read-model.v1",
      version: 1,
      generatedAt,
      payload: {
        schemaVersion: "attacker-controlled-json.v1",
        scope: { kind: "prr-request", id: "prr_req_selected" },
        deadline: "2026-08-07"
      },
      safeSummary: "Attacker-built safe JSON with a matching ref hash.",
      provenanceRefs: ["evt_prr_selected_created"],
      sourceEventIds: ["evt_prr_selected_created"],
      projectionHighWaterMark: 77,
      scope: { kind: "prr-request", id: "prr_req_selected" },
      sizeBudgetBytes: 16_384
    });

    expect(() => verifyResolvedContextPack(attackerResolved)).not.toThrow();
    expect(() => parseResolvedContextPack(attackerResolved, prrReadModelPayloadParser))
      .toThrow(/prr-read-model|payload|schema/i);
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
- Define and export `prrReadModelPayloadParser` with a strict repo-consistent structured schema for `PrrReadModelContextPackPayload`.
- The parser must reject missing required sections, unknown top-level fields, mismatched `schemaVersion`, wrong selected-request scope, unrelated request ID fields, raw body/provider metadata fields, and unsafe omission shapes.
- Keep deadline/gate/correspondence facts in `resolved.payload`; keep `resolved.ref.safeSummary` as a short audit summary that does not carry the selected deadline sentinel.
- Exclude raw body fields, raw rendered bodies, unrestricted recipients, raw provider metadata, provider message/thread IDs, raw provider errors, credential refs, local paths, and unrelated request IDs.
- Put `gates` into the payload before optional material and fail with `context-budget-exceeded: non-truncatable gates exceed size budget` if the gate-only payload would exceed the budget.
- Use `buildResolvedContextPack()` with `contextPackId: "prr-read-model.v1"`, `version: 1`, `payload`, `scope`, `sourceEventIds`, `artifactHashes`, `projectionHighWaterMark`, `policyVersion`, `sizeBudgetBytes`, and staleness inputs.
- Return the verified and parsed `ResolvedContextPack`; do not return a bare `ContextPackRef`.
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

Extend the existing top-level import from `../src/prr-context-packs.js` to include `buildJurisdictionPackSummaryContextPack` and `jurisdictionPackSummaryPayloadParser`, then append these tests to `packages/agent/test/prr-context-packs.test.ts`:

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

  it("rejects a matching-ref attacker payload that is generic JSON but not the jurisdiction payload shape", () => {
    const attackerResolved = buildResolvedContextPack({
      contextPackId: "jurisdiction-pack-summary.v1",
      version: 1,
      generatedAt,
      payload: {
        schemaVersion: "attacker-controlled-json.v1",
        scope: { kind: "prr-request", id: "prr_req_selected" },
        ruleIds: ["federal-determination-20-working-days"]
      },
      safeSummary: "Attacker-built safe JSON with a matching jurisdiction ref hash.",
      provenanceRefs: ["evt_prr_selected_created", jurisdictionArtifactHash],
      sourceEventIds: ["evt_prr_selected_created"],
      artifactHashes: [jurisdictionArtifactHash],
      projectionHighWaterMark: 77,
      scope: { kind: "prr-request", id: "prr_req_selected" },
      sizeBudgetBytes: 16_384
    });

    expect(() => verifyResolvedContextPack(attackerResolved)).not.toThrow();
    expect(() => parseResolvedContextPack(attackerResolved, jurisdictionPackSummaryPayloadParser))
      .toThrow(/jurisdiction-pack-summary|payload|schema/i);
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
- Define and export `jurisdictionPackSummaryPayloadParser` with a strict repo-consistent structured schema for `JurisdictionPackSummaryContextPackPayload`.
- The parser must reject missing pack binding fields, unknown top-level fields, mismatched `schemaVersion`, absent artifact hash, uncited rules, definitive legal conclusions, and rule entries without exact rule IDs.
- Build payload with pack name, pack version, jurisdiction label, artifact hash, cited rules sorted by category and rule ID, advisory posture, and omissions for absent categories among `deadline`, `fee`, `exemption`, `appeal`, and `enforcement`.
- Keep exact rule IDs, citations, and advisory legal posture in `resolved.payload`; keep `resolved.ref.safeSummary` short enough that rule sentinels are not required there.
- Include provenance refs for selected request event ID, artifact hash, and each rule ref in the form `jurisdiction-rule:<pack>@<version>:<ruleId>`.
- Include staleness inputs for artifact hash and selected request pack binding.
- Exclude definitive legal conclusions.
- Use `buildResolvedContextPack()` and return the verified and parsed `ResolvedContextPack`; do not return a bare `ContextPackRef`.

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
- Consumes: Task 1 and Task 2 builders and parsers, `ResolvedContextPackRegistry`.
- Produces: `registerPrrContextPackBuilders(input: RegisterPrrContextPackBuildersInput): void` and public package exports.

- [ ] **Step 1: Claim and start the task**

Create `docs/agentic/claims/task-3-prr-context-pack-registration.md`, commit it as `claimed`, then mark `in-progress` and commit.

- [ ] **Step 2: Write failing registration tests**

Extend the existing top-level import from `../src/context-packs.js` to include `createContextPackRegistry` and `type ContextPackPayloadParser`. Extend the existing top-level import from `../src/prr-context-packs.js` to include `registerPrrContextPackBuilders`, `prrReadModelPayloadParser`, `jurisdictionPackSummaryPayloadParser`, and `type PrrContextPackRegistrationEntry`, then append these tests to `packages/agent/test/prr-context-packs.test.ts`:

```ts
describe("PRR context pack registration", () => {
  it("registers builders and parsers using stable descriptor/parser registration identity", async () => {
    const registry = createContextPackRegistry();

    registerPrrContextPackBuilders({
      registry,
      prrReadModel: prrRegistrationForTest(),
      jurisdictionPackSummary: jurisdictionRegistrationForTest()
    });
    registerPrrContextPackBuilders({
      registry,
      prrReadModel: prrRegistrationForTest(),
      jurisdictionPackSummary: jurisdictionRegistrationForTest()
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

  it("conflicts on duplicate ID and version with a different parser identity", () => {
    const registry = createContextPackRegistry();

    registerPrrContextPackBuilders({
      registry,
      prrReadModel: prrRegistrationForTest(),
      jurisdictionPackSummary: jurisdictionRegistrationForTest()
    });

    expect(() =>
      registerPrrContextPackBuilders({
        registry,
        prrReadModel: prrRegistrationForTest({ parserId: "prr-read-model-payload-parser.fork" }),
        jurisdictionPackSummary: jurisdictionRegistrationForTest()
      })
    ).toThrow(/parser|conflict|already registered/i);
  });

  it("conflicts on duplicate ID and version with a descriptor mismatch", () => {
    const registry = createContextPackRegistry();

    registerPrrContextPackBuilders({
      registry,
      prrReadModel: prrRegistrationForTest(),
      jurisdictionPackSummary: jurisdictionRegistrationForTest()
    });

    expect(() =>
      registerPrrContextPackBuilders({
        registry,
        prrReadModel: prrRegistrationForTest({ maxBytes: 65_536 }),
        jurisdictionPackSummary: jurisdictionRegistrationForTest()
      })
    ).toThrow(/descriptor|conflict|already registered/i);
  });
});

function prrRegistrationForTest(
  overrides: { readonly parserId?: string; readonly maxBytes?: number } = {}
): PrrContextPackRegistrationEntry {
  const descriptor = {
    contextPackId: "prr-read-model.v1",
    version: 1,
    label: "Selected request PRR read model",
    maxBytes: overrides.maxBytes ?? 32_768,
    requiredProvenanceKinds: ["event-id", "content-hash"],
    redactionPolicy: "safe-normalized-summary",
    sourceProjection: "prr.projection.selected-request"
  };
  const payloadParser = parserWithId(prrReadModelPayloadParser, overrides.parserId);
  return {
    descriptor,
    payloadParser,
    registrationIdentity: "packages/agent/prr-context-packs:prr-read-model.v1@1",
    builder: {
      descriptor,
      build: () => buildPrrReadModelContextPack(basePrrInput())
    }
  };
}

function jurisdictionRegistrationForTest(): PrrContextPackRegistrationEntry {
  const descriptor = {
    contextPackId: "jurisdiction-pack-summary.v1",
    version: 1,
    label: "Selected request jurisdiction pack summary",
    maxBytes: 16_384,
    requiredProvenanceKinds: ["event-id", "content-hash"],
    redactionPolicy: "safe-normalized-summary",
    sourceProjection: "prr.jurisdiction-pack.selected-request"
  };
  return {
    descriptor,
    payloadParser: jurisdictionPackSummaryPayloadParser,
    registrationIdentity: "packages/agent/prr-context-packs:jurisdiction-pack-summary.v1@1",
    builder: {
      descriptor,
      build: () => buildJurisdictionPackSummaryContextPack(jurisdictionInput())
    }
  };
}

function parserWithId(
  parser: ContextPackPayloadParser,
  parserId: string | undefined
): ContextPackPayloadParser {
  if (parserId === undefined) {
    return parser;
  }
  return {
    contextPackId: parser.contextPackId,
    version: parser.version,
    parserId,
    parse: (payload) => parser.parse(payload)
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

- Add module-local `WeakMap<ResolvedContextPackRegistry, Map<string, { descriptorHash: string; parserId: string; registrationIdentity: string }>>`.
- Use key `"<contextPackId>@<version>"`.
- Compute `descriptorHash` from the canonical descriptor fields, not from object identity.
- Treat registration as idempotent only when `descriptorHash`, `payloadParser.parserId`, and `registrationIdentity` match the prior registration.
- If any of those stable identities differ for the same ID/version, throw a safe conflict error.
- If `registry.getDescriptor(contextPackId)` exists but the helper has no matching stable descriptor/parser registration identity, throw a safe conflict error.
- Require the shared registry to expose `buildResolved(contextPackId)`; if only bare refs are available, stop on `schema-conflict`.
- Register the payload parser before the builder for each pack.
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
  prepareSpecialistRun,
  verifyResolvedContextPack,
  type SpecialistRunnerModelInvoker
} from "../../agent/src/index.js";
import { createAgentRuntime } from "../../agent/src/runtime.js";
import { buildCompletePrrNegotiationResolvedContextFixture } from "../../agent/test/fixtures/resolved-context-packs.js";
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
      const completeContext = buildCompletePrrNegotiationResolvedContextFixture({
        selectedPrrReadModel: prrResolved,
        selectedJurisdictionPackSummary: jurisdictionResolved,
        selectedPrrScope: { kind: "prr-request", id: "prr_req_selected" },
        generatedAt: now()
      });
      completeContext.registerFixtureBuilders(registry);

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
        scope: completeContext.selectedPrrRunScope
      });

      const runtime = fakeInvoker();
      const prepared = await prepareSpecialistRun({
        ledger: handle.ledger,
        actor,
        now,
        contextPacks: registry,
        contextPackResolver: completeContext.contextPackResolver,
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
      expect(() => buildCompletePrrNegotiationResolvedContextFixture({
        selectedPrrReadModel: forgedPrr,
        selectedJurisdictionPackSummary: jurisdictionResolved,
        selectedPrrScope: { kind: "prr-request", id: "prr_req_selected" },
        generatedAt: now()
      }))
        .toThrow(/context pack payload.*hash|size|mismatch/i);
      expect(runtime.invokeModel).not.toHaveBeenCalled();

      const missingPrrContext = buildCompletePrrNegotiationResolvedContextFixture({
        selectedPrrReadModel: prrResolved,
        selectedJurisdictionPackSummary: jurisdictionResolved,
        selectedPrrScope: { kind: "prr-request", id: "prr_req_selected" },
        generatedAt: now(),
        omitContextPackIds: ["prr-read-model.v1"]
      });
      missingPrrContext.registerFixtureBuilders(registry);
      await expect(prepareSpecialistRun({
        ledger: handle.ledger,
        actor,
        now,
        contextPacks: registry,
        contextPackResolver: missingPrrContext.contextPackResolver,
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
- In the prompt regression, use the prompt lane's complete `prr-negotiation` resolved-context fixture helper so every required pack is represented; do not register only the two PRR packs.
- Bind the run with the final selected-PRR applicability scope from that helper, not the older workspace-only scope.
- Keep `fakeInvoker()` deterministic and credential-free. Record that this test proves prompt construction and pre-provider blocking only; live provider execution remains covered by the prompt/orchestrator real Nous sentinel gate.
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

Hand off Task 4 for review. Reviewers must confirm the runtime adapter is a narrow registration helper, passes only selected request plus aggregate proof into package builders, produces resolved envelopes, uses complete `prr-negotiation` required-pack fixtures, binds the final selected-PRR run scope, exercises production prompt rendering through the operational resolver contract, blocks missing/mismatched payloads before provider invocation, does not touch shared workflow orchestration, and has no external effects. Reviewers should treat the fake invoker as deterministic pre-provider coverage only; live execution confidence remains with the prompt/orchestrator real Nous sentinel gate.

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

The context-pack builders remain selected-request scoped and return verified `ResolvedContextPack { ref, payload }` envelopes. Unrelated PRR request IDs never enter `prr-read-model.v1`; only aggregate omitted count and projection high-water proof are recorded. Jurisdiction staleness is bound by pack name, version, exact rule IDs, and jurisdiction artifact content hash. Production prompt rendering includes selected deadline and rule payload sentinels only after local hash, size, strict parser, and selected-scope verification, while ledger/events/readiness surfaces keep refs only. The deterministic fake invoker proves prompt construction and pre-provider blocking only; live provider execution is covered by the prompt/orchestrator real Nous sentinel gate. Active send, legal, and governance gates remain non-truncatable, and the builders have no path to send, follow up, appeal, confirm escalation, clear locks, grant approval, or execute domain effects.
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
- Both PRR builders supply strict payload parsers keyed by context pack ID/version, and attacker-built matching-ref invalid payload shapes are rejected by those parsers.
- Unrelated request IDs never enter context, safe summaries, provenance refs, staleness inputs, errors, diagnostics, or tests.
- Pack size is independent of unrelated request count except for O(1) aggregate omitted count/high-water proof.
- `jurisdiction-pack-summary.v1` binds jurisdiction pack name, version, exact rule IDs, citations, and artifact content hash.
- Selected deadline and jurisdiction-rule sentinels are absent from `safeSummary`, present in verified payloads, and included in production prompt rendering after resolver and parser verification.
- Missing, mismatched, or parser-invalid payload resolution blocks provider invocation before the model invoker is called.
- Active send, legal, and governance gates are included or the builder fails closed.
- Builders and registration are deterministic and reject hostile DTO structures.
- Package registration is idempotent for the same stable descriptor/parser/producer registration identity and conflicts for duplicate ID/version with different descriptor or parser identity.
- Local runtime registration is narrow and does not change specialist prompt templates, handoffs, runners, orchestration, or domain execution adapters.
- Deterministic fake-invoker tests are not treated as live provider execution proof; the prompt/orchestrator real Nous sentinel gate remains the live provider acceptance gate.
- Targeted tests, `npm run verify`, `git diff --check`, and `npm run factory:check` pass.
