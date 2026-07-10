# Investigative Context Packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build package-owned investigative context-pack builders and registration for `evidence-summary.v1`, `accepted-graph-projection.v1`, and `governance-locks.v1` with bounded selection, exact provenance, aggregate omissions, and hash-verified resolved payloads.

**Architecture:** The operational generic resolved-context contract lands first and owns `ResolvedContextPack { ref, payload }`, content-addressed payload verification, pack-specific payload parser dispatch keyed by `contextPackId/version`, and provider prompt rendering. This package lane adds investigative builders in `packages/agent` that consume scope-aware selection and bounded reader capabilities, produce provider-safe resolved envelopes, supply strict payload parsers for all three schemas, and register only through an exported helper. Local-runtime, orchestrator, cockpit, PRR packs, operational packs, specialist prompt definitions, and handoff projections are out of scope.

**Tech Stack:** TypeScript, Vitest, Zod, Node `crypto`, existing `packages/agent` context-pack APIs, operational resolved-context APIs, injected ontology/ingestion/governance/agent projection readers.

## Global Constraints

- This plan starts only after the operational generic resolved-context contract is merged into this branch.
- Required shared exports before Task 1: `ResolvedContextPack`, `ResolvedContextPackBuilder`, `ResolvedContextPackPayloadParser`, `ResolvedContextPackRegistry`, `createResolvedContextPackRegistry`, `buildResolvedContextPack`, `verifyResolvedContextPack`, `createContextPackPayloadResolver`, and `renderResolvedContextPacksForPrompt` from `packages/agent/src/context-packs.ts` or a re-exported package-owned module.
- Required operational registry shape before Task 1: `ResolvedContextPackPayloadParser<Payload>.contextPackId: string`, `ResolvedContextPackPayloadParser<Payload>.version: number`, `ResolvedContextPackPayloadParser<Payload>.parserIdentity: object`, `ResolvedContextPackPayloadParser<Payload>.parsePayload(payload: unknown): Payload`, `ResolvedContextPackBuilder<BuildRequest, Payload>.payloadParser: ResolvedContextPackPayloadParser<Payload>`, `ResolvedContextPackBuilder<BuildRequest, Payload>.buildResolved(input: BuildRequest): ResolvedContextPack<Payload> | Promise<ResolvedContextPack<Payload>>`, `ResolvedContextPackRegistry.registerResolved<BuildRequest, Payload>(builder: ResolvedContextPackBuilder<BuildRequest, Payload>): void`, and `ResolvedContextPackRegistry.buildResolved<BuildRequest>(contextPackId: string, input: BuildRequest): Promise<ResolvedContextPack>`.
- Operational resolution must verify hash and size first, then dispatch the exact parser registered for `contextPackId/version`; a matching hash with an invalid parsed shape must fail before prompt rendering.
- If those shared exports are missing or their signatures do not match this plan, stop before claiming Task 1 and ask the coordinator to rebase this lane after the operational context lane.
- Do not edit local-runtime, orchestrator, scheduler, cockpit, browser UI, operational packs, PRR packs, specialist workflow prompt definitions, handoff projections, or resident-agent runtime wiring in this lane.
- Do not introduce SQLite, filesystem mount, local-runtime, or portable-workspace imports into `packages/agent/src/investigative-context-packs.ts`.
- Builders receive only injected bounded capabilities: selection, accepted-graph reader, evidence reader, governance posture reader, resident-agent lock reader, event reader, and source-posture checker.
- Builders never accept `events: readonly KnowledgeEvent[]` or whole-workspace graph, ingestion, governance, or agent projections as production dependencies.
- Workspace scope requires a deterministic page/window or explicit bounded selection manifest; one pack is never an unbounded workspace dump.
- Default pack budgets: `evidence-summary.v1` = 65,536 bytes, `accepted-graph-projection.v1` = 65,536 bytes, `governance-locks.v1` = 32,768 bytes.
- Default selection window limit: 100 included refs. Default reader batch size: 50 IDs. Default omission sample limit: 3 refs per aggregate bucket.
- Active resident-agent locks, active governance-derived restrictions, exact included-row provenance, scope, high-water marks, source-byte/archive-child staleness inputs, and aggregate omission metadata are mandatory and fail with `context-budget-exceeded` if they do not fit.
- `InvestigativeSelectionManifest.manifestHash` is the SHA-256 of the canonical manifest body with `manifestHash` omitted.
- Stable failure and omission reason codes are machine-readable; UI prose is outside this lane.
- Evidence summaries reject raw document text, unrestricted excerpts, parse-output text, provider payloads, raw provider errors, credentials, hidden local paths, and raw executable action fields.
- Safe narrative fields may discuss commands only when schema-labeled as narrative, authority-labeled, secret-safe, and raw-content-free.
- Accepted graph context is read-only reviewed projection truth and must never infer accepted edges.
- Governance restrictions are non-authoritative safety posture: they can block or warn but never grant approval, clear a lock, or alter evidence/graph state.
- Every task must claim first, write RED tests before production code, run the targeted failing command, implement the smallest change, run targeted passing commands, run `npm run verify`, commit, and request fresh review.

---

## File Structure

- Create `packages/agent/src/investigative-context-packs.ts`: public investigative pack IDs, descriptors, bounded dependency interfaces, DTO types, strict payload parsers, error codes, manifest body hashing/verification, pack builders, and `registerInvestigativeContextPacks`.
- Create `packages/agent/test/investigative-context-packs.test.ts`: focused tests for descriptors, manifest hashing, bounded selection/readers, each pack builder, registration, readiness, stale-source rejection, omission aggregation, payload resolution, and sentinel rendering.
- Modify `packages/agent/src/index.ts`: export `./investigative-context-packs.js`.
- Read but do not modify unless the operational lane already changed them and a compile fix is required: `packages/agent/src/context-packs.ts`, `packages/agent/src/specialist-readiness.ts`, `packages/agent/src/specialist-workflows.ts`, `packages/agent/src/prompt-artifacts.ts`.

## Shared Interfaces To Implement In `investigative-context-packs.ts`

The implementation tasks below must converge on these public signatures:

```ts
export type InvestigativeContextPackId =
  | "evidence-summary.v1"
  | "accepted-graph-projection.v1"
  | "governance-locks.v1";

export type InvestigativeContextPackFailureCode =
  | "missing-provenance"
  | "projection-lag"
  | "stale-source"
  | "source-byte-hash-mismatch"
  | "archive-container-hash-mismatch"
  | "archive-child-hash-mismatch"
  | "source-posture-unavailable"
  | "context-budget-exceeded"
  | "secret-detected"
  | "raw-content-forbidden"
  | "provider-payload-forbidden"
  | "accepted-truth-mutation-forbidden"
  | "accepted-relationship-not-authoritative"
  | "selection-window-required"
  | "selection-manifest-stale"
  | "selection-manifest-hash-mismatch"
  | "selection-row-mismatch"
  | "selection-cursor-invalid"
  | "context-payload-missing"
  | "context-payload-hash-mismatch"
  | "context-payload-size-mismatch"
  | "duplicate-context-pack-registration"
  | "conflicting-context-pack-registration"
  | "invalid-context-pack-scope";

export class InvestigativeContextPackError extends Error {
  readonly code: InvestigativeContextPackFailureCode;
  constructor(code: InvestigativeContextPackFailureCode, message: string);
}

export interface InvestigativeContextPackDependencies {
  readonly now: () => string;
  readonly policyVersion: string;
  readonly ontologyCoreVersion: string;
  readonly packVersions: Readonly<Record<string, string>>;
  readonly registrationIdentity: InvestigativeRegistrationIdentity;
  readonly selection: InvestigativeSelectionCapability;
  readonly evidenceReader: InvestigativeEvidenceReader;
  readonly graphReader: AcceptedGraphProjectionReader;
  readonly governanceReader: GovernancePostureReader;
  readonly agentLockReader: ResidentAgentLockReader;
  readonly eventReader: KnowledgeEventReader;
  readonly evidenceSourcePosture: EvidenceSourcePostureCapability;
  readonly budgets?: Partial<Record<InvestigativeContextPackId, number>>;
}

export interface InvestigativeRegistrationIdentity {
  readonly moduleId: "packages/agent/src/investigative-context-packs";
  readonly descriptorSchemaVersion: "investigative-context-pack-descriptor.v1";
  readonly parserSchemaVersion: "investigative-context-pack-payload-parser.v1";
  readonly builderDescriptorHash: `sha256:${string}`;
  readonly payloadParserHash: `sha256:${string}`;
}

export interface InvestigativeContextPackScope {
  readonly kind: "workspace" | "investigation" | "task" | "selection";
  readonly id: string;
}

export interface InvestigativeProjectionHighWaterMarks {
  readonly graph?: number;
  readonly ingestion?: number;
  readonly governance?: number;
  readonly agent?: number;
}

export interface InvestigativeSelectionWindow {
  readonly cursor: string;
  readonly offset: number;
  readonly limit: number;
  readonly stableSort: "ref-kind-ref-id-content-hash-v1";
}

export interface InvestigativeSelectionRequest {
  readonly contextPackId: InvestigativeContextPackId;
  readonly scope: InvestigativeContextPackScope;
  readonly sizeBudgetBytes: number;
  readonly window?: InvestigativeSelectionWindow;
}

export interface InvestigativeSelectionIncludedRef {
  readonly refKind: "evidence" | "assertion" | "entity" | "relationship" | "governance-restriction" | "resident-agent-lock";
  readonly refId: string;
  readonly sortKey: string;
  readonly contentHash?: `sha256:${string}`;
  readonly rowHash?: `sha256:${string}`;
  readonly sourceEventIds: readonly string[];
  readonly mandatory: boolean;
}

export interface InvestigativeOmissionSampleRef {
  readonly refKind: string;
  readonly refId: string;
  readonly contentHash?: `sha256:${string}`;
}

export interface InvestigativeContextOmissionAggregate {
  readonly reasonCode: string;
  readonly refKind: string;
  readonly aggregateKey: string;
  readonly count: number;
  readonly sampleRefs?: readonly InvestigativeOmissionSampleRef[];
}

export interface InvestigativeSelectionManifestBody {
  readonly manifestVersion: "investigative-selection-manifest.v1";
  readonly scope: InvestigativeContextPackScope;
  readonly sourceProjectionHighWaterMarks: InvestigativeProjectionHighWaterMarks;
  readonly ordering: "ref-kind-ref-id-content-hash-v1";
  readonly window: InvestigativeSelectionWindow;
  readonly totalEligibleCount: number;
  readonly includedRefs: readonly InvestigativeSelectionIncludedRef[];
  readonly aggregateOmissions: readonly InvestigativeContextOmissionAggregate[];
}

export interface InvestigativeSelectionManifest extends InvestigativeSelectionManifestBody {
  readonly manifestHash: `sha256:${string}`;
}

export interface InvestigativeSelectionCapability {
  readonly capabilityVersion: "investigative-selection.v1";
  select(input: InvestigativeSelectionRequest): Promise<InvestigativeSelectionManifest> | InvestigativeSelectionManifest;
}

export interface KnowledgeEventSummary {
  readonly eventId: string;
  readonly type: string;
  readonly contentHash?: `sha256:${string}`;
  readonly ontologyCoreVersion?: string;
  readonly packVersions?: Readonly<Record<string, string>>;
}

export interface KnowledgeEventReader {
  readEventsByIds(input: { readonly eventIds: readonly string[]; readonly limit: number }): Promise<readonly KnowledgeEventSummary[]> | readonly KnowledgeEventSummary[];
}

export interface EvidenceSourcePostureCheckInput {
  readonly evidenceId: string;
  readonly contentHash: `sha256:${string}`;
}

export type EvidenceSourcePostureResult =
  | {
      readonly ok: true;
      readonly stalenessInputs: readonly { readonly kind: string; readonly ref: string; readonly value: string }[];
    }
  | {
      readonly ok: false;
      readonly code:
        | "source-posture-unavailable"
        | "stale-source"
        | "source-byte-hash-mismatch"
        | "archive-container-hash-mismatch"
        | "archive-child-hash-mismatch";
      readonly stalenessInputs: readonly { readonly kind: string; readonly ref: string; readonly value: string }[];
    };

export interface EvidenceSourcePostureCapability {
  readonly postureVersion: "ingestion-current-source-posture.v1";
  checkEvidence(input: EvidenceSourcePostureCheckInput): Promise<EvidenceSourcePostureResult> | EvidenceSourcePostureResult;
}
```

The same file must export strict payload parsers with stable identity:

```ts
export interface InvestigativeContextPackPayloadBase {
  readonly schemaVersion: string;
  readonly contextPackId: InvestigativeContextPackId;
  readonly scope: InvestigativeContextPackScope;
  readonly truthBoundary: Readonly<Record<string, AgentContextPackJsonValue>>;
  readonly selectionManifest: InvestigativeSelectionManifest;
  readonly projectionHighWaterMarks: InvestigativeProjectionHighWaterMarks;
  readonly packVersions: Readonly<Record<string, string>>;
  readonly items: AgentContextPackJsonValue;
  readonly omissions: readonly InvestigativeContextOmissionAggregate[];
  readonly stalenessInputs: readonly { readonly kind: string; readonly ref: string; readonly value: string }[];
}

export interface InvestigativePayloadParserIdentity {
  readonly contextPackId: InvestigativeContextPackId;
  readonly version: 1;
  readonly parserSchemaVersion: "investigative-context-pack-payload-parser.v1";
  readonly parserHash: `sha256:${string}`;
}

export interface AcceptedGraphProjectionPayload extends InvestigativeContextPackPayloadBase {
  readonly schemaVersion: "accepted-graph-projection.context.v1";
  readonly contextPackId: "accepted-graph-projection.v1";
  readonly truthBoundary: {
    readonly authoritativeForAcceptedGraph: true;
    readonly readOnlyProjectionTruth: true;
    readonly canInferNewAcceptedEdges: false;
    readonly graphMutationRequiresReviewedOntologyEvent: true;
  };
  readonly items: {
    readonly assertions: readonly AgentContextPackJsonValue[];
    readonly entities: readonly AgentContextPackJsonValue[];
    readonly relationships: readonly AgentContextPackJsonValue[];
  };
}

export interface EvidenceSummaryPayload extends InvestigativeContextPackPayloadBase {
  readonly schemaVersion: "evidence-summary.context.v1";
  readonly contextPackId: "evidence-summary.v1";
  readonly items: readonly AgentContextPackJsonValue[];
}

export interface GovernanceLocksPayload extends InvestigativeContextPackPayloadBase {
  readonly schemaVersion: "governance-locks.context.v1";
  readonly contextPackId: "governance-locks.v1";
  readonly truthBoundary: {
    readonly authoritativeForApproval: false;
    readonly grantsApproval: false;
    readonly clearsApprovalOrLocks: false;
    readonly mutatesEvidenceOrGraph: false;
    readonly postureKind: "non-authoritative-safety-posture";
  };
  readonly items: {
    readonly activeLocks: readonly AgentContextPackJsonValue[];
    readonly governanceRestrictions: readonly AgentContextPackJsonValue[];
  };
}

export const acceptedGraphProjectionPayloadParser: ResolvedContextPackPayloadParser<AcceptedGraphProjectionPayload>;
export const evidenceSummaryPayloadParser: ResolvedContextPackPayloadParser<EvidenceSummaryPayload>;
export const governanceLocksPayloadParser: ResolvedContextPackPayloadParser<GovernanceLocksPayload>;
export const investigativeContextPackPayloadParsers: readonly ResolvedContextPackPayloadParser<InvestigativeContextPackPayloadBase>[];
```

The parser registered for a descriptor must be keyed by exact `contextPackId/version`. It must run after the operational resolver verifies `ref.contentHash` and `ref.sizeBytes`, and it must reject payloads whose hash matches the ref but whose shape violates the pack-specific schema.

Reader row interfaces should be added in the task that first uses them and kept in the same file. All reader methods must accept exact included IDs and `limit: 50`; no method may accept a whole projection object.

---

## Task 0: Operational Resolved-Context Gate

**Files:**
- Read: `packages/agent/src/context-packs.ts`
- Read: `packages/agent/test/context-packs.test.ts`
- Read: `packages/agent/src/prompt-artifacts.ts`

**Interfaces:**
- Consumes: Operational lane exports `ResolvedContextPack`, `ResolvedContextPackBuilder`, `ResolvedContextPackPayloadParser`, `ResolvedContextPackRegistry`, `createResolvedContextPackRegistry`, `buildResolvedContextPack`, `verifyResolvedContextPack`, `createContextPackPayloadResolver`, and `renderResolvedContextPacksForPrompt`.
- Produces: A yes/no gate for Task 1.

- [ ] **Step 1: Verify the dependency landed**

Run:

```bash
rg -n "ResolvedContextPack|ResolvedContextPackBuilder|ResolvedContextPackPayloadParser|ResolvedContextPackRegistry|createResolvedContextPackRegistry|buildResolvedContextPack|verifyResolvedContextPack|createContextPackPayloadResolver|renderResolvedContextPacksForPrompt" packages/agent/src packages/agent/test
```

Expected: output includes all required symbols in `packages/agent/src/context-packs.ts` or a re-exported operational context module.

- [ ] **Step 2: Verify current package tests pass before this lane begins**

Run:

```bash
npm test -- packages/agent/test/context-packs.test.ts packages/agent/test/prompt-artifacts.test.ts
```

Expected: both test files pass.

- [ ] **Step 3: Stop if the dependency is absent**

If Step 1 does not find all symbols, do not create a claim and do not edit files. Report: `Blocked: operational resolved-context contract has not landed on this branch.`

---

## Task 1: Investigative Contracts, Descriptors, And Manifest Hashing

**Files:**
- Create: `docs/agentic/claims/task-1-investigative-context-contracts.md`
- Create: `packages/agent/src/investigative-context-packs.ts`
- Create: `packages/agent/test/investigative-context-packs.test.ts`
- Modify: `packages/agent/src/index.ts`

**Interfaces:**
- Consumes: Shared resolved-context exports from Task 0.
- Produces: Public investigative types, error class, descriptors, body-only manifest hashing, manifest verification, and package export.

- [ ] **Step 1: Claim Task 1**

Create `docs/agentic/claims/task-1-investigative-context-contracts.md` with status `claimed`, the current branch, the current worktree, the UTC timestamp, and owned files from this task. Commit it:

```bash
git add docs/agentic/claims/task-1-investigative-context-contracts.md
git commit -m "chore: claim investigative context contracts"
```

- [ ] **Step 2: Mark the claim in progress**

Update the claim status to `in-progress` before editing source or tests.

- [ ] **Step 3: Write RED descriptor and manifest-hash tests**

Create `packages/agent/test/investigative-context-packs.test.ts` with tests named:

```ts
import { describe, expect, it } from "vitest";
import {
  assertSelectionManifestHash,
  buildSelectionManifestHash,
  investigativeContextPackDescriptors,
  investigativeContextPackPayloadParsers,
  type InvestigativeSelectionManifestBody
} from "../src/investigative-context-packs.js";

describe("investigative context packs", () => {
  it("declares exactly the three investigative descriptors", () => {
    expect(investigativeContextPackDescriptors.map((descriptor) => descriptor.contextPackId)).toEqual([
      "accepted-graph-projection.v1",
      "evidence-summary.v1",
      "governance-locks.v1"
    ]);
    expect(investigativeContextPackDescriptors.map((descriptor) => descriptor.version)).toEqual([1, 1, 1]);
    expect(investigativeContextPackDescriptors.map((descriptor) => descriptor.requiredProvenanceKinds)).toEqual([
      ["event-id", "content-hash"],
      ["event-id", "content-hash", "evidence-id"],
      ["event-id"]
    ]);
  });

  it("declares exact payload parsers for the three investigative pack schemas", () => {
    expect(investigativeContextPackPayloadParsers.map((parser) => `${parser.contextPackId}@${parser.version}`)).toEqual([
      "accepted-graph-projection.v1@1",
      "evidence-summary.v1@1",
      "governance-locks.v1@1"
    ]);
    expect(investigativeContextPackPayloadParsers.map((parser) => parser.parserIdentity.parserSchemaVersion)).toEqual([
      "investigative-context-pack-payload-parser.v1",
      "investigative-context-pack-payload-parser.v1",
      "investigative-context-pack-payload-parser.v1"
    ]);
  });

  it("computes manifestHash from the canonical manifest body without manifestHash", () => {
    const body = selectionBody();
    const hash = buildSelectionManifestHash(body);
    const manifest = { ...body, manifestHash: hash };

    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() => assertSelectionManifestHash(manifest)).not.toThrow();
  });

  it("rejects a no-fixed-point manifest hash computed over manifestHash itself", () => {
    const body = selectionBody();
    const bodyHash = buildSelectionManifestHash(body);
    const selfIncludingHash = buildSelectionManifestHash({ ...body, manifestHash: bodyHash });

    expect(() => assertSelectionManifestHash({ ...body, manifestHash: selfIncludingHash })).toThrow(/selection-manifest-hash-mismatch/);
  });
});

function selectionBody(): InvestigativeSelectionManifestBody {
  return {
    manifestVersion: "investigative-selection-manifest.v1",
    scope: { kind: "task", id: "task_investigative_context" },
    sourceProjectionHighWaterMarks: { graph: 12, ingestion: 13, governance: 14, agent: 15 },
    ordering: "ref-kind-ref-id-content-hash-v1",
    window: {
      cursor: "cursor_task_investigative_context_0001",
      offset: 0,
      limit: 100,
      stableSort: "ref-kind-ref-id-content-hash-v1"
    },
    totalEligibleCount: 1,
    includedRefs: [{
      refKind: "evidence",
      refId: "ev_contract_001",
      sortKey: "evidence/ev_contract_001/sha256:1111111111111111111111111111111111111111111111111111111111111111",
      contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      sourceEventIds: ["evt_evidence_ingested_001"],
      mandatory: true
    }],
    aggregateOmissions: []
  };
}

function selectionManifest() {
  const body = selectionBody();
  return { ...body, manifestHash: buildSelectionManifestHash(body) };
}
```

- [ ] **Step 4: Run RED tests**

Run:

```bash
npm test -- packages/agent/test/investigative-context-packs.test.ts
```

Expected: fail because `../src/investigative-context-packs.js` does not exist.

- [ ] **Step 5: Implement contracts and descriptor constants**

Create `packages/agent/src/investigative-context-packs.ts` with the shared interfaces listed above, plus:

```ts
import {
  hashAgentContextPack,
  type AgentContextPackJsonValue,
  type ContextPackDescriptor,
  type ResolvedContextPackPayloadParser
} from "./context-packs.js";

export const INVESTIGATIVE_CONTEXT_PACK_IDS = Object.freeze([
  "accepted-graph-projection.v1",
  "evidence-summary.v1",
  "governance-locks.v1"
] as const);

export const investigativeContextPackDescriptors = Object.freeze([
  Object.freeze({
    contextPackId: "accepted-graph-projection.v1",
    version: 1,
    label: "Accepted graph projection",
    maxBytes: 65_536,
    requiredProvenanceKinds: Object.freeze(["event-id", "content-hash"]),
    redactionPolicy: "provider-safe-resolved-payload",
    sourceProjection: "ontology.accepted-graph"
  }),
  Object.freeze({
    contextPackId: "evidence-summary.v1",
    version: 1,
    label: "Evidence summary",
    maxBytes: 65_536,
    requiredProvenanceKinds: Object.freeze(["event-id", "content-hash", "evidence-id"]),
    redactionPolicy: "provider-safe-resolved-payload",
    sourceProjection: "ingestion.evidence"
  }),
  Object.freeze({
    contextPackId: "governance-locks.v1",
    version: 1,
    label: "Governance locks",
    maxBytes: 32_768,
    requiredProvenanceKinds: Object.freeze(["event-id"]),
    redactionPolicy: "provider-safe-resolved-payload",
    sourceProjection: "governance-and-agent-locks"
  })
] satisfies readonly ContextPackDescriptor[]);

export const investigativePayloadParserIdentities = Object.freeze({
  "accepted-graph-projection.v1": parserIdentity("accepted-graph-projection.v1", ["assertions", "entities", "relationships"]),
  "evidence-summary.v1": parserIdentity("evidence-summary.v1", ["evidence", "sourcePosture", "governanceTags"]),
  "governance-locks.v1": parserIdentity("governance-locks.v1", ["activeLocks", "governanceRestrictions", "truthBoundary"])
} satisfies Readonly<Record<InvestigativeContextPackId, InvestigativePayloadParserIdentity>>);

function parserIdentity(
  contextPackId: InvestigativeContextPackId,
  requiredPayloadSections: readonly string[]
): InvestigativePayloadParserIdentity {
  const parserSchemaVersion = "investigative-context-pack-payload-parser.v1";
  return Object.freeze({
    contextPackId,
    version: 1,
    parserSchemaVersion,
    parserHash: hashAgentContextPack({
      contextPackId,
      version: 1,
      parserSchemaVersion,
      requiredPayloadSections
    }) as `sha256:${string}`
  });
}

export function buildSelectionManifestHash(body: InvestigativeSelectionManifestBody | InvestigativeSelectionManifest): `sha256:${string}` {
  const canonicalBody = canonicalSelectionManifestBody(body);
  return hashAgentContextPack(canonicalBody) as `sha256:${string}`;
}

export function assertSelectionManifestHash(manifest: InvestigativeSelectionManifest): void {
  const expected = buildSelectionManifestHash(manifest);
  if (manifest.manifestHash !== expected) {
    throw new InvestigativeContextPackError("selection-manifest-hash-mismatch", "selection-manifest-hash-mismatch");
  }
}

function canonicalSelectionManifestBody(manifest: InvestigativeSelectionManifestBody | InvestigativeSelectionManifest): InvestigativeSelectionManifestBody {
  return Object.freeze({
    manifestVersion: manifest.manifestVersion,
    scope: Object.freeze({ ...manifest.scope }),
    sourceProjectionHighWaterMarks: Object.freeze({ ...manifest.sourceProjectionHighWaterMarks }),
    ordering: manifest.ordering,
    window: Object.freeze({ ...manifest.window }),
    totalEligibleCount: manifest.totalEligibleCount,
    includedRefs: Object.freeze([...manifest.includedRefs].map((ref) => Object.freeze({
      refKind: ref.refKind,
      refId: ref.refId,
      sortKey: ref.sortKey,
      ...(ref.contentHash === undefined ? {} : { contentHash: ref.contentHash }),
      ...(ref.rowHash === undefined ? {} : { rowHash: ref.rowHash }),
      sourceEventIds: Object.freeze([...ref.sourceEventIds]),
      mandatory: ref.mandatory
    }))),
    aggregateOmissions: Object.freeze([...manifest.aggregateOmissions].map((omission) => Object.freeze({
      reasonCode: omission.reasonCode,
      refKind: omission.refKind,
      aggregateKey: omission.aggregateKey,
      count: omission.count,
      ...(omission.sampleRefs === undefined ? {} : { sampleRefs: Object.freeze([...omission.sampleRefs].map((sample) => Object.freeze({ ...sample }))) })
    })))
  });
}
```

Add `export * from "./investigative-context-packs.js";` to `packages/agent/src/index.ts`.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/investigative-context-packs.test.ts
```

Expected: descriptor and manifest-hash tests pass.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit and request review**

Run:

```bash
git add docs/agentic/claims/task-1-investigative-context-contracts.md packages/agent/src/investigative-context-packs.ts packages/agent/test/investigative-context-packs.test.ts packages/agent/src/index.ts
git commit -m "feat: add investigative context pack contracts"
```

Request a fresh review for Task 1 before Task 2 starts.

---

## Task 2: Bounded Selection And Reader Pipeline

**Files:**
- Create: `docs/agentic/claims/task-2-investigative-bounded-selection.md`
- Modify: `packages/agent/src/investigative-context-packs.ts`
- Modify: `packages/agent/test/investigative-context-packs.test.ts`

**Interfaces:**
- Consumes: Task 1 manifest hashing and descriptors.
- Produces: `selectForPack`, ID partitioning, reader call accounting helpers, common payload assembly, stale cursor propagation, and bounded-growth tests.

- [ ] **Step 1: Claim Task 2**

Create and commit `docs/agentic/claims/task-2-investigative-bounded-selection.md` with status `claimed`, then update it to `in-progress`.

- [ ] **Step 2: Write RED bounded-selection tests**

Append tests:

```ts
it("requires workspace scope to provide a deterministic window", async () => {
  const deps = createInvestigativeDeps({
    selection: {
      capabilityVersion: "investigative-selection.v1",
      select() {
        throw new Error("selection should not be called without a window");
      }
    }
  });

  await expect(buildEvidenceSummaryContextPack({
    deps,
    scope: { kind: "workspace", id: "ws_main" }
  })).rejects.toMatchObject({ code: "selection-window-required" });
});

it("propagates stale cursor failures before reading projection rows", async () => {
  const counters = createReaderCounters();
  const deps = createInvestigativeDeps({
    counters,
    selection: {
      capabilityVersion: "investigative-selection.v1",
      select() {
        throw new InvestigativeContextPackError("selection-cursor-invalid", "selection-cursor-invalid");
      }
    }
  });

  await expect(buildEvidenceSummaryContextPack({
    deps,
    scope: { kind: "workspace", id: "ws_main" },
    window: windowFor("cursor_stale", 0, 100)
  })).rejects.toMatchObject({ code: "selection-cursor-invalid" });
  expect(counters.evidenceReads).toBe(0);
  expect(counters.eventReads).toBe(0);
});

it("keeps query work bounded as unrelated evidence rows grow", async () => {
  const counters = createReaderCounters();
  const deps = createInvestigativeDeps({
    counters,
    unrelatedEvidenceRows: 10_000
  });

  const resolved = await buildEvidenceSummaryContextPack({
    deps,
    scope: { kind: "workspace", id: "ws_main" },
    window: windowFor("cursor_ws_main_0001", 0, 100)
  });

  expect(resolved.payload.items).toHaveLength(1);
  expect(counters.evidenceReads).toBe(1);
  expect(counters.evidenceIdsRead).toEqual(["ev_contract_001"]);
  expect(counters.unrelatedRowsScanned).toBe(0);
  expect(JSON.stringify(resolved.payload).length).toBeLessThan(65_536);
});
```

The helper `createInvestigativeDeps` must create one manifest with one included evidence ref and many unrelated rows stored only in the fake reader's private arrays. The builder must never ask for those unrelated rows.

Add these shared test helpers to `packages/agent/test/investigative-context-packs.test.ts` before the RED run:

```ts
interface ReaderCounters {
  evidenceReads: number;
  graphReads: number;
  governanceReads: number;
  agentLockReads: number;
  eventReads: number;
  unrelatedRowsScanned: number;
  evidenceIdsRead: string[];
  assertionIdsRead: string[];
}

function createReaderCounters(): ReaderCounters {
  return {
    evidenceReads: 0,
    graphReads: 0,
    governanceReads: 0,
    agentLockReads: 0,
    eventReads: 0,
    unrelatedRowsScanned: 0,
    evidenceIdsRead: [],
    assertionIdsRead: []
  };
}

function windowFor(cursor: string, offset: number, limit: number) {
  return {
    cursor,
    offset,
    limit,
    stableSort: "ref-kind-ref-id-content-hash-v1"
  } as const;
}

function createInvestigativeDeps(input: {
  readonly counters?: ReaderCounters;
  readonly selection?: InvestigativeSelectionCapability;
  readonly unrelatedEvidenceRows?: number;
  readonly unrelatedGraphRows?: number;
  readonly unrelatedGovernanceRows?: number;
  readonly postureResult?: EvidenceSourcePostureResult;
  readonly safeNarrative?: string;
  readonly rawActionField?: string;
  readonly acceptedAssertionWithoutEvidenceHash?: boolean;
  readonly relationshipProjectionUnavailable?: boolean;
  readonly graphSentinel?: string;
  readonly budgets?: Partial<Record<InvestigativeContextPackId, number>>;
  readonly registrationIdentity?: InvestigativeRegistrationIdentity;
} = {}): InvestigativeContextPackDependencies {
  const counters = input.counters ?? createReaderCounters();
  const body = selectionBody();
  const manifest = { ...body, manifestHash: buildSelectionManifestHash(body) };
  return createFakeInvestigativeDeps({
    counters,
    manifest,
    selection: input.selection,
    unrelatedEvidenceRows: input.unrelatedEvidenceRows ?? 0,
    unrelatedGraphRows: input.unrelatedGraphRows ?? 0,
    unrelatedGovernanceRows: input.unrelatedGovernanceRows ?? 0,
    postureResult: input.postureResult,
    safeNarrative: input.safeNarrative,
    rawActionField: input.rawActionField,
    acceptedAssertionWithoutEvidenceHash: input.acceptedAssertionWithoutEvidenceHash ?? false,
    relationshipProjectionUnavailable: input.relationshipProjectionUnavailable ?? false,
    graphSentinel: input.graphSentinel,
    budgets: input.budgets,
    registrationIdentity: input.registrationIdentity
  });
}
```

Implement `createFakeInvestigativeDeps` in the test file as a local fake that returns exact rows only when the builder asks by included IDs. The fake must increment `unrelatedRowsScanned` if any reader method touches unrelated private rows, so bounded-growth tests fail when the implementation scans.

- [ ] **Step 3: Run RED tests**

Run:

```bash
npm test -- packages/agent/test/investigative-context-packs.test.ts -t "workspace scope|stale cursor|bounded"
```

Expected: fail because build functions and reader pipeline do not exist.

- [ ] **Step 4: Implement selection pipeline**

Add:

```ts
export interface InvestigativeContextPackBuildRequest {
  readonly scope: InvestigativeContextPackScope;
  readonly window?: InvestigativeSelectionWindow;
  readonly sizeBudgetBytes?: number;
}

export interface BuildInvestigativeContextPackInput extends InvestigativeContextPackBuildRequest {
  readonly deps: InvestigativeContextPackDependencies;
}

const defaultBudgets: Readonly<Record<InvestigativeContextPackId, number>> = Object.freeze({
  "accepted-graph-projection.v1": 65_536,
  "evidence-summary.v1": 65_536,
  "governance-locks.v1": 32_768
});

const readerBatchSize = 50;

async function selectForPack(
  contextPackId: InvestigativeContextPackId,
  input: BuildInvestigativeContextPackInput
): Promise<InvestigativeSelectionManifest> {
  if (input.scope.kind === "workspace" && input.window === undefined) {
    throw new InvestigativeContextPackError("selection-window-required", "selection-window-required");
  }
  const sizeBudgetBytes = input.sizeBudgetBytes ?? input.deps.budgets?.[contextPackId] ?? defaultBudgets[contextPackId];
  const manifest = await input.deps.selection.select({
    contextPackId,
    scope: input.scope,
    sizeBudgetBytes,
    ...(input.window === undefined ? {} : { window: input.window })
  });
  assertSelectionManifestHash(manifest);
  if (manifest.scope.kind !== input.scope.kind || manifest.scope.id !== input.scope.id) {
    throw new InvestigativeContextPackError("invalid-context-pack-scope", "invalid-context-pack-scope");
  }
  return manifest;
}

function includedIds(manifest: InvestigativeSelectionManifest, refKind: InvestigativeSelectionIncludedRef["refKind"]): readonly string[] {
  return Object.freeze(manifest.includedRefs.filter((ref) => ref.refKind === refKind).map((ref) => ref.refId));
}
```

Add stub builders that call `selectForPack`, read evidence IDs in one bounded batch, and return a minimal resolved evidence payload through `buildResolvedContextPack`. The accepted graph and governance builders can return valid empty payloads in this task as long as Task 3-5 replace them with complete behavior.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/investigative-context-packs.test.ts -t "workspace scope|stale cursor|bounded"
```

Expected: selected tests pass.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: verification passes.

- [ ] **Step 7: Commit and request review**

Run:

```bash
git add docs/agentic/claims/task-2-investigative-bounded-selection.md packages/agent/src/investigative-context-packs.ts packages/agent/test/investigative-context-packs.test.ts
git commit -m "feat: add bounded investigative selection"
```

Request a fresh review for bounded-query behavior before Task 3 starts.

---

## Task 3: Evidence Summary Builder

**Files:**
- Create: `docs/agentic/claims/task-3-evidence-summary-context-pack.md`
- Modify: `packages/agent/src/investigative-context-packs.ts`
- Modify: `packages/agent/test/investigative-context-packs.test.ts`

**Interfaces:**
- Consumes: Task 2 selection pipeline.
- Produces: Complete `buildEvidenceSummaryContextPack`.

- [ ] **Step 1: Claim Task 3**

Create and commit the claim file with status `claimed`, then update it to `in-progress`.

- [ ] **Step 2: Write RED evidence tests**

Update the test import from `../src/investigative-context-packs.js` to include `buildEvidenceSummaryContextPack`, `InvestigativeContextPackError`, and `evidenceSummaryPayloadParser`.

Append tests that verify:

```ts
it("builds evidence-summary.v1 with exact event, hash, source, staleness, and aggregate omission provenance", async () => {
  const deps = createInvestigativeDeps();
  const resolved = await buildEvidenceSummaryContextPack({
    deps,
    scope: { kind: "workspace", id: "ws_main" },
    window: windowFor("cursor_ws_main_0001", 0, 100)
  });

  expect(resolved.ref.contextPackId).toBe("evidence-summary.v1");
  expect(resolved.ref.provenanceRefs).toEqual(expect.arrayContaining([
    "evt_evidence_ingested_001",
    "ev_contract_001",
    "sha256:1111111111111111111111111111111111111111111111111111111111111111"
  ]));
  expect(resolved.payload.items[0]).toMatchObject({
    evidenceId: "ev_contract_001",
    contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    ingestionEventId: "evt_evidence_ingested_001"
  });
  expect(resolved.payload.omissions).toEqual([{
    reasonCode: "budget-row-omitted",
    refKind: "parse-job",
    aggregateKey: "optional-parse-detail",
    count: 50,
    sampleRefs: [{
      refKind: "parse-job",
      refId: "parse_job_001"
    }]
  }]);
  expect(resolved.payload.stalenessInputs).toEqual(expect.arrayContaining([
    { kind: "source-byte-current-hash", ref: "ev_contract_001", value: "sha256:1111111111111111111111111111111111111111111111111111111111111111" }
  ]));
});

it("rejects stale current-byte posture instead of using latest scan state", async () => {
  const deps = createInvestigativeDeps({
    postureResult: {
      ok: false,
      code: "source-byte-hash-mismatch",
      stalenessInputs: [{
        kind: "source-byte-current-hash",
        ref: "ev_contract_001",
        value: "sha256:2222222222222222222222222222222222222222222222222222222222222222"
      }]
    }
  });

  await expect(buildEvidenceSummaryContextPack({
    deps,
    scope: { kind: "workspace", id: "ws_main" },
    window: windowFor("cursor_ws_main_0001", 0, 100)
  })).rejects.toMatchObject({ code: "source-byte-hash-mismatch" });
});

it("allows safe narrative command discussion but rejects raw executable action fields", async () => {
  const safeDeps = createInvestigativeDeps({
    safeNarrative: "The record describes a script named collect-public-records.sh without providing runnable action fields."
  });
  const safeResolved = await buildEvidenceSummaryContextPack({
    deps: safeDeps,
    scope: { kind: "workspace", id: "ws_main" },
    window: windowFor("cursor_ws_main_0001", 0, 100)
  });
  expect(safeResolved.payload.items[0].safeNarrative).toContain("collect-public-records.sh");

  const unsafeDeps = createInvestigativeDeps({
    rawActionField: "curl https://example.test --header Authorization:Bearer-value"
  });
  await expect(buildEvidenceSummaryContextPack({
    deps: unsafeDeps,
    scope: { kind: "workspace", id: "ws_main" },
    window: windowFor("cursor_ws_main_0001", 0, 100)
  })).rejects.toMatchObject({ code: "raw-content-forbidden" });
});

it("parses evidence-summary payloads strictly by schema", async () => {
  const resolved = await buildEvidenceSummaryContextPack({
    deps: createInvestigativeDeps(),
    scope: { kind: "workspace", id: "ws_main" },
    window: windowFor("cursor_ws_main_0001", 0, 100)
  });

  expect(() => evidenceSummaryPayloadParser.parsePayload(resolved.payload)).not.toThrow();
  expect(() => evidenceSummaryPayloadParser.parsePayload({
    ...resolved.payload,
    items: { evidence: [] }
  })).toThrow(/evidence-summary payload/i);
});
```

- [ ] **Step 3: Run RED tests**

Run:

```bash
npm test -- packages/agent/test/investigative-context-packs.test.ts -t "evidence-summary|current-byte|narrative"
```

Expected: fail because evidence payload fields and safety checks are incomplete.

- [ ] **Step 4: Implement evidence builder**

Add `InvestigativeEvidenceReader`:

```ts
export interface InvestigativeEvidenceRow {
  readonly evidenceId: string;
  readonly ingestionEventId: string;
  readonly contentHash: `sha256:${string}`;
  readonly mediaType?: string;
  readonly sizeBytes?: number;
  readonly sourceCollectionId?: string;
  readonly scanBatchId?: string;
  readonly importBatchId?: string;
  readonly occurrenceIds: readonly string[];
  readonly parseJobs: readonly {
    readonly parseJobId: string;
    readonly lane: string;
    readonly parserName: string;
    readonly parserVersion: string;
    readonly state: string;
    readonly outputHash?: `sha256:${string}`;
    readonly outputMediaType?: string;
    readonly terminalEventId?: string;
    readonly retryable?: boolean;
  }[];
  readonly governanceTags: readonly {
    readonly tag: string;
    readonly source: "ai" | "human";
    readonly state: "active" | "removed";
    readonly confidence?: number;
    readonly safeRationale?: string;
    readonly eventId: string;
  }[];
  readonly duplicateGroup?: { readonly groupId: string; readonly memberCount: number };
  readonly safeNarrative?: string;
  readonly rawActionField?: string;
}

export interface InvestigativeEvidenceReader {
  readEvidenceByIds(input: {
    readonly evidenceIds: readonly string[];
    readonly contentHashes: readonly `sha256:${string}`[];
    readonly highWaterMarks: InvestigativeProjectionHighWaterMarks;
    readonly limit: number;
  }): Promise<readonly InvestigativeEvidenceRow[]> | readonly InvestigativeEvidenceRow[];
}
```

Implement `buildEvidenceSummaryContextPack` so it:
- selects manifest
- reads only included evidence IDs and content hashes
- validates row IDs and content hashes against manifest
- checks source posture for every included evidence row
- rejects unsafe raw/action fields
- includes safe narrative fields only as narrative
- aggregates omissions from manifest and budget trimming
- builds `ResolvedContextPack` through `buildResolvedContextPack`
- exports `evidenceSummaryPayloadParser` with strict required sections, exact `contextPackId: "evidence-summary.v1"`, version `1`, and no unknown top-level keys

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/investigative-context-packs.test.ts -t "evidence-summary|current-byte|narrative"
```

Expected: selected tests pass.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: verification passes.

- [ ] **Step 7: Commit and request review**

Run:

```bash
git add docs/agentic/claims/task-3-evidence-summary-context-pack.md packages/agent/src/investigative-context-packs.ts packages/agent/test/investigative-context-packs.test.ts
git commit -m "feat: build investigative evidence summaries"
```

Request a fresh review focused on raw-content safety, source-posture binding, and bounded query work.

---

## Task 4: Accepted Graph Projection Builder

**Files:**
- Create: `docs/agentic/claims/task-4-accepted-graph-context-pack.md`
- Modify: `packages/agent/src/investigative-context-packs.ts`
- Modify: `packages/agent/test/investigative-context-packs.test.ts`

**Interfaces:**
- Consumes: Task 2 selection pipeline.
- Produces: Complete `buildAcceptedGraphProjectionContextPack`.

- [ ] **Step 1: Claim Task 4**

Create and commit the claim file with status `claimed`, then update it to `in-progress`.

- [ ] **Step 2: Write RED accepted-graph tests**

Update the test import from `../src/investigative-context-packs.js` to include `buildAcceptedGraphProjectionContextPack` and `acceptedGraphProjectionPayloadParser`.

Append tests that verify:

```ts
it("builds accepted graph context from reviewed projection rows with exact assertion provenance", async () => {
  const deps = createInvestigativeDeps();
  const resolved = await buildAcceptedGraphProjectionContextPack({
    deps,
    scope: { kind: "task", id: "task_graph" },
    window: windowFor("cursor_task_graph_0001", 0, 100)
  });

  expect(resolved.ref.contextPackId).toBe("accepted-graph-projection.v1");
  expect(resolved.payload.truthBoundary).toMatchObject({
    authoritativeForAcceptedGraph: true,
    readOnlyProjectionTruth: true,
    canInferNewAcceptedEdges: false,
    graphMutationRequiresReviewedOntologyEvent: true
  });
  expect(resolved.payload.items.assertions[0]).toMatchObject({
    assertionId: "assertion_contract_vendor_001",
    evidenceId: "ev_contract_001",
    evidenceContentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    proposedByEventId: "evt_assertion_proposed_001",
    acceptedByEventId: "evt_assertion_accepted_001"
  });
});

it("rejects accepted assertions missing reviewed event or evidence hash provenance", async () => {
  const deps = createInvestigativeDeps({ acceptedAssertionWithoutEvidenceHash: true });

  await expect(buildAcceptedGraphProjectionContextPack({
    deps,
    scope: { kind: "task", id: "task_graph" },
    window: windowFor("cursor_task_graph_0001", 0, 100)
  })).rejects.toMatchObject({ code: "missing-provenance" });
});

it("does not infer accepted relationships when relationship projection is unavailable", async () => {
  const deps = createInvestigativeDeps({ relationshipProjectionUnavailable: true });
  const resolved = await buildAcceptedGraphProjectionContextPack({
    deps,
    scope: { kind: "task", id: "task_graph" },
    window: windowFor("cursor_task_graph_0001", 0, 100)
  });

  expect(resolved.payload.items.relationships).toEqual([]);
  expect(resolved.payload.omissions).toEqual(expect.arrayContaining([expect.objectContaining({
    reasonCode: "relationship-projection-unavailable",
    refKind: "relationship"
  })]));
});

it("keeps accepted graph query work bounded as unrelated graph rows grow", async () => {
  const counters = createReaderCounters();
  const deps = createInvestigativeDeps({ counters, unrelatedGraphRows: 25_000 });

  await buildAcceptedGraphProjectionContextPack({
    deps,
    scope: { kind: "task", id: "task_graph" },
    window: windowFor("cursor_task_graph_0001", 0, 100)
  });

  expect(counters.graphReads).toBe(1);
  expect(counters.assertionIdsRead).toEqual(["assertion_contract_vendor_001"]);
  expect(counters.unrelatedRowsScanned).toBe(0);
});

it("parses accepted-graph payloads strictly by schema", async () => {
  const resolved = await buildAcceptedGraphProjectionContextPack({
    deps: createInvestigativeDeps(),
    scope: { kind: "task", id: "task_graph" },
    window: windowFor("cursor_task_graph_0001", 0, 100)
  });

  expect(() => acceptedGraphProjectionPayloadParser.parsePayload(resolved.payload)).not.toThrow();
  expect(() => acceptedGraphProjectionPayloadParser.parsePayload({
    ...resolved.payload,
    truthBoundary: {
      authoritativeForAcceptedGraph: true,
      readOnlyProjectionTruth: true,
      canInferNewAcceptedEdges: true,
      graphMutationRequiresReviewedOntologyEvent: true
    }
  })).toThrow(/accepted-graph payload/i);
});
```

- [ ] **Step 3: Run RED tests**

Run:

```bash
npm test -- packages/agent/test/investigative-context-packs.test.ts -t "accepted graph|relationships|unrelated graph"
```

Expected: fail because accepted graph reader behavior is incomplete.

- [ ] **Step 4: Implement accepted graph builder**

Add:

```ts
export interface AcceptedGraphAssertionRow {
  readonly assertionId: string;
  readonly evidenceId: string;
  readonly evidenceContentHash: `sha256:${string}`;
  readonly proposedByEventId: string;
  readonly acceptedByEventId: string;
  readonly sourceEventIds: readonly string[];
  readonly rowHash: `sha256:${string}`;
  readonly safeStatement: string;
}

export interface AcceptedGraphEntityRow {
  readonly entityId: string;
  readonly rowHash: `sha256:${string}`;
  readonly safeLabel: string;
  readonly sourceEventIds: readonly string[];
}

export interface AcceptedGraphRelationshipRow {
  readonly relationshipId: string;
  readonly acceptedByEventId: string;
  readonly evidenceId: string;
  readonly evidenceContentHash: `sha256:${string}`;
  readonly sourceEventIds: readonly string[];
  readonly rowHash: `sha256:${string}`;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly relationshipType: string;
}

export interface AcceptedGraphProjectionReader {
  readAcceptedGraphByIds(input: {
    readonly assertionIds: readonly string[];
    readonly entityIds: readonly string[];
    readonly relationshipIds: readonly string[];
    readonly highWaterMarks: InvestigativeProjectionHighWaterMarks;
    readonly limit: number;
  }): Promise<{
    readonly assertions: readonly AcceptedGraphAssertionRow[];
    readonly entities: readonly AcceptedGraphEntityRow[];
    readonly relationships: readonly AcceptedGraphRelationshipRow[];
    readonly relationshipProjectionAvailable: boolean;
  }> | {
    readonly assertions: readonly AcceptedGraphAssertionRow[];
    readonly entities: readonly AcceptedGraphEntityRow[];
    readonly relationships: readonly AcceptedGraphRelationshipRow[];
    readonly relationshipProjectionAvailable: boolean;
  };
}
```

Implement exact row/hash/provenance validation, authoritative relationship checks, no-inference omissions, deterministic sorting, and resolved payload generation.
Export `acceptedGraphProjectionPayloadParser` with strict required sections, exact `contextPackId: "accepted-graph-projection.v1"`, version `1`, and no unknown top-level keys.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/investigative-context-packs.test.ts -t "accepted graph|relationships|unrelated graph"
```

Expected: selected tests pass.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: verification passes.

- [ ] **Step 7: Commit and request review**

Run:

```bash
git add docs/agentic/claims/task-4-accepted-graph-context-pack.md packages/agent/src/investigative-context-packs.ts packages/agent/test/investigative-context-packs.test.ts
git commit -m "feat: build accepted graph context pack"
```

Request a fresh review focused on accepted-truth provenance and no-inference behavior.

---

## Task 5: Governance Locks Builder

**Files:**
- Create: `docs/agentic/claims/task-5-governance-locks-context-pack.md`
- Modify: `packages/agent/src/investigative-context-packs.ts`
- Modify: `packages/agent/test/investigative-context-packs.test.ts`

**Interfaces:**
- Consumes: Task 2 selection pipeline.
- Produces: Complete `buildGovernanceLocksContextPack`.

- [ ] **Step 1: Claim Task 5**

Create and commit the claim file with status `claimed`, then update it to `in-progress`.

- [ ] **Step 2: Write RED governance tests**

Update the test import from `../src/investigative-context-packs.js` to include `buildGovernanceLocksContextPack` and `governanceLocksPayloadParser`.

Append tests:

```ts
it("separates active resident-agent locks from governance-derived restrictions", async () => {
  const resolved = await buildGovernanceLocksContextPack({
    deps: createInvestigativeDeps(),
    scope: { kind: "task", id: "task_governance" },
    window: windowFor("cursor_task_governance_0001", 0, 100)
  });

  expect(resolved.payload.truthBoundary).toMatchObject({
    authoritativeForApproval: false,
    grantsApproval: false,
    clearsApprovalOrLocks: false,
    mutatesEvidenceOrGraph: false,
    postureKind: "non-authoritative-safety-posture"
  });
  expect(resolved.payload.items.activeLocks[0]).toMatchObject({
    sourceLabel: "resident-agent-lock",
    lockId: "lock_sensitive_export_001"
  });
  expect(resolved.payload.items.governanceRestrictions[0]).toMatchObject({
    sourceLabel: "governance-derived-restriction",
    restrictionId: "restriction_quarantine_ev_contract_001"
  });
});

it("fails instead of truncating active locks or restrictions out of budget", async () => {
  await expect(buildGovernanceLocksContextPack({
    deps: createInvestigativeDeps({ budgets: { "governance-locks.v1": 128 } }),
    scope: { kind: "task", id: "task_governance" },
    window: windowFor("cursor_task_governance_0001", 0, 100)
  })).rejects.toMatchObject({ code: "context-budget-exceeded" });
});

it("keeps governance query work bounded as unrelated governance history grows", async () => {
  const counters = createReaderCounters();
  await buildGovernanceLocksContextPack({
    deps: createInvestigativeDeps({ counters, unrelatedGovernanceRows: 50_000 }),
    scope: { kind: "task", id: "task_governance" },
    window: windowFor("cursor_task_governance_0001", 0, 100)
  });

  expect(counters.agentLockReads).toBe(1);
  expect(counters.governanceReads).toBe(1);
  expect(counters.unrelatedRowsScanned).toBe(0);
});

it("parses governance-locks payloads strictly by schema", async () => {
  const resolved = await buildGovernanceLocksContextPack({
    deps: createInvestigativeDeps(),
    scope: { kind: "task", id: "task_governance" },
    window: windowFor("cursor_task_governance_0001", 0, 100)
  });

  expect(() => governanceLocksPayloadParser.parsePayload(resolved.payload)).not.toThrow();
  expect(() => governanceLocksPayloadParser.parsePayload({
    ...resolved.payload,
    truthBoundary: {
      authoritativeForApproval: true,
      grantsApproval: true,
      clearsApprovalOrLocks: false,
      mutatesEvidenceOrGraph: false,
      postureKind: "non-authoritative-safety-posture"
    }
  })).toThrow(/governance-locks payload/i);
});
```

- [ ] **Step 3: Run RED tests**

Run:

```bash
npm test -- packages/agent/test/investigative-context-packs.test.ts -t "resident-agent locks|truncating active locks|governance query"
```

Expected: fail because governance builder behavior is incomplete.

- [ ] **Step 4: Implement governance builder**

Add:

```ts
export interface ResidentAgentLockReader {
  readActiveLocksByIds(input: {
    readonly lockIds: readonly string[];
    readonly highWaterMarks: InvestigativeProjectionHighWaterMarks;
    readonly limit: number;
  }): Promise<readonly ResidentAgentLockRow[]> | readonly ResidentAgentLockRow[];
}

export interface ResidentAgentLockRow {
  readonly sourceLabel: "resident-agent-lock";
  readonly lockId: string;
  readonly lockKind: string;
  readonly safeReason: string;
  readonly activatedBy: string;
  readonly activatedAt: string;
  readonly relatedEventIds: readonly string[];
  readonly projectionEventIds: readonly string[];
}

export interface GovernancePostureReader {
  readActiveRestrictionsByIds(input: {
    readonly restrictionIds: readonly string[];
    readonly highWaterMarks: InvestigativeProjectionHighWaterMarks;
    readonly limit: number;
  }): Promise<readonly GovernanceRestrictionRow[]> | readonly GovernanceRestrictionRow[];
}

export interface GovernanceRestrictionRow {
  readonly sourceLabel: "governance-derived-restriction";
  readonly restrictionId: string;
  readonly restrictionKind: string;
  readonly affectedRef: string;
  readonly sourceEventIds: readonly string[];
  readonly projectionProvenanceRefs: readonly string[];
  readonly policyVersion: string;
  readonly safeReasonCode: string;
}
```

Implement mandatory active lock/restriction inclusion, non-active history aggregation, no approval grant/clear fields, and budget failure when mandatory safety posture cannot fit.
Export `governanceLocksPayloadParser` with strict required sections, exact `contextPackId: "governance-locks.v1"`, version `1`, and no unknown top-level keys.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/investigative-context-packs.test.ts -t "resident-agent locks|truncating active locks|governance query"
```

Expected: selected tests pass.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: verification passes.

- [ ] **Step 7: Commit and request review**

Run:

```bash
git add docs/agentic/claims/task-5-governance-locks-context-pack.md packages/agent/src/investigative-context-packs.ts packages/agent/test/investigative-context-packs.test.ts
git commit -m "feat: build governance locks context pack"
```

Request a fresh review focused on governance non-authoritativeness and non-truncatable active safety posture.

---

## Task 6: Registration, Readiness, And Resolved Payload Rendering

**Files:**
- Create: `docs/agentic/claims/task-6-investigative-registration-readiness.md`
- Modify: `packages/agent/src/investigative-context-packs.ts`
- Modify: `packages/agent/test/investigative-context-packs.test.ts`

**Interfaces:**
- Consumes: Completed builders and strict payload parsers from Tasks 3-5 plus operational resolved-context renderer from Task 0.
- Produces: `registerInvestigativeContextPacks`, idempotent stable descriptor/parser registration, readiness proof with refs, payload parser dispatch proof, and payload sentinel rendering proof.

- [ ] **Step 1: Claim Task 6**

Create and commit the claim file with status `claimed`, then update it to `in-progress`.

- [ ] **Step 2: Write RED registration and renderer tests**

Update imports to include `registerInvestigativeContextPacks`, `createResolvedContextPackRegistry`, `createContextPackPayloadResolver`, `renderResolvedContextPacksForPrompt`, `buildResolvedContextPack`, and all three investigative payload parsers.

Append tests:

```ts
it("registers investigative context packs idempotently by stable descriptor identity", async () => {
  const registry = createResolvedContextPackRegistry();
  const deps = createInvestigativeDeps();

  registerInvestigativeContextPacks(registry, deps);
  registerInvestigativeContextPacks(registry, createInvestigativeDeps());

  expect(registry.listDescriptors().map((descriptor) => descriptor.contextPackId)).toEqual([
    "accepted-graph-projection.v1",
    "evidence-summary.v1",
    "governance-locks.v1"
  ]);
});

it("rejects conflicting duplicate investigative registration", () => {
  const registry = createResolvedContextPackRegistry();
  registerInvestigativeContextPacks(registry, createInvestigativeDeps());

  expect(() => registerInvestigativeContextPacks(registry, createInvestigativeDeps({
    registrationIdentity: {
      moduleId: "packages/agent/src/investigative-context-packs",
      descriptorSchemaVersion: "investigative-context-pack-descriptor.v1",
      parserSchemaVersion: "investigative-context-pack-payload-parser.v1",
      builderDescriptorHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      payloadParserHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    }
  }))).toThrow(/conflicting-context-pack-registration/);
});

it("satisfies specialist readiness through injected investigative refs", async () => {
  const registry = createResolvedContextPackRegistry();
  registerInvestigativeContextPacks(registry, createInvestigativeDeps());

  const request = {
    scope: { kind: "workspace", id: "ws_main" },
    window: windowFor("cursor_ws_main_0001", 0, 100)
  };
  const resolved = await Promise.all([
    registry.buildResolved("accepted-graph-projection.v1", request),
    registry.buildResolved("evidence-summary.v1", request),
    registry.buildResolved("governance-locks.v1", request)
  ]);
  const refs = resolved.map((pack) => pack.ref);

  const readiness = projectSpecialistWorkflowReadiness(createReadinessInput({ refs }));
  expect(readiness.missingContextPackIds).not.toContain("accepted-graph-projection.v1");
  expect(readiness.missingContextPackIds).not.toContain("evidence-summary.v1");
  expect(readiness.missingContextPackIds).not.toContain("governance-locks.v1");
});

function createReadinessInput(input: { readonly refs: readonly ContextPackRef[] }) {
  return {
    runType: "evidence-triage",
    contextPackRefs: input.refs,
    currentProjectionHighWaterMarks: {
      "accepted-graph-projection.v1": 12,
      "evidence-summary.v1": 13,
      "governance-locks.v1": 15
    },
    activeLocks: [],
    providerReadiness: { state: "ready" },
    registeredPromptTemplates: [{
      promptTemplateId: "evidence-triage.v1",
      promptTemplateVersion: 1
    }],
    registeredAdapterFamilies: ["evidence-triage"]
  };
}

it("renders a payload-only investigative fact after exact hash verification", async () => {
  const resolved = await buildAcceptedGraphProjectionContextPack({
    deps: createInvestigativeDeps({
      graphSentinel: "payload-only-sentinel-contract-fact-314159"
    }),
    scope: { kind: "task", id: "task_graph" },
    window: windowFor("cursor_task_graph_0001", 0, 100)
  });

  expect(resolved.ref.safeSummary).not.toContain("payload-only-sentinel-contract-fact-314159");

  const resolver = createContextPackPayloadResolver([resolved]);
  const promptText = await renderResolvedContextPacksForPrompt({
    runType: "evidence-triage",
    contextPackRefs: [resolved.ref],
    resolver
  });

  expect(promptText).toContain("payload-only-sentinel-contract-fact-314159");
});

it("rejects prompt rendering when resolved payload hash does not match the ref", async () => {
  const resolved = await buildAcceptedGraphProjectionContextPack({
    deps: createInvestigativeDeps(),
    scope: { kind: "task", id: "task_graph" },
    window: windowFor("cursor_task_graph_0001", 0, 100)
  });
  const tampered = {
    ref: resolved.ref,
    payload: { ...resolved.payload, items: { assertions: [], entities: [], relationships: [] } }
  };

  const resolver = createContextPackPayloadResolver([tampered]);
  await expect(renderResolvedContextPacksForPrompt({
    runType: "evidence-triage",
    contextPackRefs: [resolved.ref],
    resolver
  })).rejects.toMatchObject({ code: "context-payload-hash-mismatch" });
});

it("rejects matching-hash resolved payloads whose pack-specific shape is invalid", async () => {
  const invalidResolved = buildResolvedContextPack({
    contextPackId: "accepted-graph-projection.v1",
    version: 1,
    generatedAt: "2026-07-10T12:00:00.000Z",
    payload: {
      schemaVersion: "accepted-graph-projection.context.v1",
      contextPackId: "accepted-graph-projection.v1",
      scope: { kind: "task", id: "task_graph" },
      truthBoundary: {
        authoritativeForAcceptedGraph: true,
        readOnlyProjectionTruth: true,
        canInferNewAcceptedEdges: true,
        graphMutationRequiresReviewedOntologyEvent: true
      },
      selectionManifest: selectionManifest(),
      projectionHighWaterMarks: { graph: 12 },
      packVersions: { core: "0.1.0" },
      items: { assertions: [], entities: [], relationships: [] },
      omissions: [],
      stalenessInputs: []
    },
    safeSummary: "One accepted graph payload.",
    provenanceRefs: ["evt_assertion_accepted_001", "sha256:1111111111111111111111111111111111111111111111111111111111111111"],
    sourceEventIds: ["evt_assertion_accepted_001"],
    artifactHashes: ["sha256:1111111111111111111111111111111111111111111111111111111111111111"],
    scope: { kind: "task", id: "task_graph" }
  });
  const resolver = createContextPackPayloadResolver([invalidResolved]);

  await expect(renderResolvedContextPacksForPrompt({
    runType: "evidence-triage",
    contextPackRefs: [invalidResolved.ref],
    resolver
  })).rejects.toThrow(/accepted-graph payload/);
});
```

- [ ] **Step 3: Run RED tests**

Run:

```bash
npm test -- packages/agent/test/investigative-context-packs.test.ts -t "registers investigative|conflicting duplicate|specialist readiness|payload-only|payload hash|invalid shape"
```

Expected: fail because registration and renderer integration are incomplete.

- [ ] **Step 4: Implement registration helper**

Implement:

```ts
const registeredRegistries = new WeakMap<object, string>();

export function registerInvestigativeContextPacks(
  registry: ResolvedContextPackRegistry,
  deps: InvestigativeContextPackDependencies
): void {
  const identityKey = [
    deps.registrationIdentity.builderDescriptorHash,
    deps.registrationIdentity.parserSchemaVersion,
    deps.registrationIdentity.payloadParserHash
  ].join(":");
  const existing = registeredRegistries.get(registry);
  if (existing !== undefined) {
    if (existing !== identityKey) {
      throw new InvestigativeContextPackError("conflicting-context-pack-registration", "conflicting-context-pack-registration");
    }
    return;
  }

  for (const descriptor of investigativeContextPackDescriptors) {
    const existingDescriptor = registry.getDescriptor(descriptor.contextPackId);
    if (existingDescriptor !== undefined) {
      throw new InvestigativeContextPackError("duplicate-context-pack-registration", "duplicate-context-pack-registration");
    }
  }

  registry.registerResolved({
    descriptor: investigativeContextPackDescriptors[0],
    payloadParser: acceptedGraphProjectionPayloadParser,
    buildResolved: (request: InvestigativeContextPackBuildRequest) => buildAcceptedGraphProjectionContextPack({ ...request, deps })
  });
  registry.registerResolved({
    descriptor: investigativeContextPackDescriptors[1],
    payloadParser: evidenceSummaryPayloadParser,
    buildResolved: (request: InvestigativeContextPackBuildRequest) => buildEvidenceSummaryContextPack({ ...request, deps })
  });
  registry.registerResolved({
    descriptor: investigativeContextPackDescriptors[2],
    payloadParser: governanceLocksPayloadParser,
    buildResolved: (request: InvestigativeContextPackBuildRequest) => buildGovernanceLocksContextPack({ ...request, deps })
  });
  registeredRegistries.set(registry, identityKey);
}
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/investigative-context-packs.test.ts -t "registers investigative|conflicting duplicate|specialist readiness|payload-only|payload hash|invalid shape"
```

Expected: selected tests pass.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: verification passes.

- [ ] **Step 7: Commit and request review**

Run:

```bash
git add docs/agentic/claims/task-6-investigative-registration-readiness.md packages/agent/src/investigative-context-packs.ts packages/agent/test/investigative-context-packs.test.ts
git commit -m "feat: register investigative context packs"
```

Request a fresh review focused on stable registration identity, readiness with refs, and hash-verified payload rendering.

---

## Task 7: Final Factory Verification And Readiness Handoff

**Files:**
- Create: `docs/agentic/claims/task-7-investigative-context-final-readiness.md`
- Modify: `docs/agentic/software-factory.md`

**Interfaces:**
- Consumes: All previous task commits and reviews.
- Produces: Durable readiness evidence and a clean final branch handoff.

- [ ] **Step 1: Claim Task 7**

Create and commit the claim file with status `claimed`, then update it to `in-progress`.

- [ ] **Step 2: Run targeted package tests**

Run:

```bash
npm test -- packages/agent/test/investigative-context-packs.test.ts
```

Expected: all investigative context-pack tests pass.

- [ ] **Step 3: Run cross-package readiness tests**

Run:

```bash
npm test -- packages/agent/test/investigative-context-packs.test.ts packages/agent/test/specialist-readiness.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/prompt-artifacts.test.ts
```

Expected: all listed test files pass.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, test suite, UI build, and factory readiness pass.

- [ ] **Step 5: Record readiness evidence**

Append a dated readiness note to `docs/agentic/software-factory.md` naming:
- branch
- final commit
- targeted command output summary
- `npm run verify` output summary
- review status for Tasks 1-6
- explicit note that runtime/orchestrator integration is deferred to a narrow later task

- [ ] **Step 6: Commit readiness evidence**

Run:

```bash
git add docs/agentic/claims/task-7-investigative-context-final-readiness.md docs/agentic/software-factory.md
git commit -m "docs: record investigative context pack readiness"
```

- [ ] **Step 7: Final review**

Request a final fresh review against:
- `docs/superpowers/specs/2026-07-10-investigative-context-packs-design.md`
- `docs/superpowers/plans/2026-07-10-investigative-context-packs-implementation.md`
- `packages/agent/src/investigative-context-packs.ts`
- `packages/agent/test/investigative-context-packs.test.ts`
- `packages/agent/src/index.ts`
- readiness evidence in `docs/agentic/software-factory.md`

Stop for coordinator merge direction after review.

---

## Stop Conditions

- Operational resolved-context shared contract is absent, renamed without coordinator approval, or lacks payload hash verification.
- Operational resolved-context resolution does not dispatch strict pack-specific payload parsers by exact `contextPackId/version` after hash and size verification.
- Investigative registration cannot supply stable descriptor/parser identity independent of dependency object identity.
- Any implementation tries to accept whole-workspace projections or whole event lists as production dependencies.
- Any builder scans unrelated rows to build one pack.
- Accepted graph code infers relationships or mutates graph/evidence/governance state.
- Evidence builder includes raw document text, parse text, provider payloads, raw provider errors, credentials, hidden paths, or raw executable action fields.
- Governance pack grants approval, clears a lock, releases quarantine, or mutates evidence/graph state.
- Active locks, active restrictions, exact included provenance, source-byte/archive-child staleness inputs, high-water marks, or aggregate omission metadata cannot fit the mandatory envelope.
- Manifest hash verification includes `manifestHash` in its own hash input.
- Prompt rendering uses only `safeSummary` or skips resolved payload hash/size verification.
- A resolved payload has a matching ref hash but invalid pack-specific shape and still reaches prompt rendering.
- A targeted verifier fails after two focused repair attempts.
- `npm run verify` fails after two focused repair attempts.
- A schema conflict appears with the approved ontology, ingestion, governance, resident-agent, or operational resolved-context contract.

## Self-Review Checklist

- Spec coverage: Tasks 1-6 cover descriptors, strict payload parsers, bounded dependencies, selection manifests, non-circular manifest hashes, aggregate omissions, evidence source posture, accepted graph provenance, governance posture, resolved payloads, prompt rendering, and stable descriptor/parser registration.
- TDD coverage: Every production task starts with RED tests and a targeted failing command.
- Bounded-growth coverage: Tasks 2, 4, and 5 include unrelated-row growth tests with query counters; Task 3 includes bounded evidence output and source-posture checks.
- Runtime boundary: No task edits local-runtime, orchestrator, cockpit, browser UI, operational packs, PRR packs, specialist workflow prompt definitions, or handoff projections.
- Verification: Every task runs a targeted pass and full `npm run verify` before commit.
- Review gates: Every task ends with a fresh review request before the next task starts.
