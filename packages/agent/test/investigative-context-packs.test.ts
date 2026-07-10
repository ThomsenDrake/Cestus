import { describe, expect, it } from "vitest";
import {
  __testOnlyReadEvidenceSelectionProbe,
  __testOnlyResolveInvestigativeSelection,
  assertSelectionManifestHash,
  buildSelectionManifestHash,
  type EvidenceSourcePostureResult,
  investigativeContextPackDefaultLimits,
  investigativeContextPackDescriptors,
  investigativeContextPackPayloadParsers,
  InvestigativeContextPackError,
  type InvestigativeContextPackDependencies,
  type InvestigativeContextPackId,
  type InvestigativeContextPackScope,
  type InvestigativeEvidenceRow,
  type InvestigativeRegistrationIdentity,
  type InvestigativeSelectionCapability,
  type InvestigativeSelectionManifestBody,
  type InvestigativeSelectionWindow
} from "../src/investigative-context-packs.js";
import { hashAgentContextPack } from "../src/context-packs.js";

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

  it("declares configurable v1 default limits with descriptor identity", () => {
    expect(investigativeContextPackDefaultLimits).toEqual({
      limitsVersion: "investigative-context-pack-limits.v1",
      descriptorSchemaVersion: "investigative-context-pack-descriptor.v1",
      packBudgets: {
        "accepted-graph-projection.v1": 65_536,
        "evidence-summary.v1": 65_536,
        "governance-locks.v1": 32_768
      },
      selectionWindowLimit: 100,
      readerBatchSize: 50,
      omissionSampleLimit: 3
    });
  });

  it("computes manifestHash from the canonical manifest body without manifestHash", () => {
    const body = selectionBody();
    const hash = buildSelectionManifestHash(body);
    const manifest = { ...body, manifestHash: hash };

    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() => assertSelectionManifestHash(manifest)).not.toThrow();
  });

  it("hashes equivalent selection manifests identically despite caller-supplied array order", () => {
    const body = permutationSelectionBody();
    const reordered = {
      ...body,
      includedRefs: [...body.includedRefs].reverse().map((ref) => ({
        ...ref,
        sourceEventIds: [...ref.sourceEventIds].reverse()
      })),
      aggregateOmissions: [...body.aggregateOmissions].reverse().map((omission) => ({
        ...omission,
        ...(omission.sampleRefs === undefined ? {} : { sampleRefs: [...omission.sampleRefs].reverse() })
      }))
    } satisfies InvestigativeSelectionManifestBody;
    const hash = buildSelectionManifestHash(body);
    const reorderedHash = buildSelectionManifestHash(reordered);

    expect(reorderedHash).toBe(hash);
    expect(() => assertSelectionManifestHash({ ...body, manifestHash: hash })).not.toThrow();
    expect(() => assertSelectionManifestHash({ ...reordered, manifestHash: hash })).not.toThrow();
  });

  it("rejects a no-fixed-point manifest hash computed over manifestHash itself", () => {
    const body = selectionBody();
    const bodyHash = buildSelectionManifestHash(body);
    const selfIncludingHash = hashAgentContextPack({ ...body, manifestHash: bodyHash }) as `sha256:${string}`;

    expect(() => assertSelectionManifestHash({ ...body, manifestHash: selfIncludingHash })).toThrow(/selection-manifest-hash-mismatch/);
  });

  it("requires workspace scope to provide a deterministic window", async () => {
    const deps = createInvestigativeDeps({
      selection: {
        capabilityVersion: "investigative-selection.v1",
        select() {
          throw new Error("selection should not be called without a window");
        }
      }
    });

    await expect(__testOnlyResolveInvestigativeSelection({
      contextPackId: "evidence-summary.v1",
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

    await expect(__testOnlyResolveInvestigativeSelection({
      contextPackId: "evidence-summary.v1",
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

    const selection = await __testOnlyReadEvidenceSelectionProbe({
      deps,
      scope: { kind: "workspace", id: "ws_main" },
      window: windowFor("cursor_ws_main_0001", 0, 100)
    });

    expect(selection.rows).toHaveLength(1);
    expect(counters.evidenceReads).toBe(1);
    expect(counters.evidenceIdsRead).toEqual(["ev_contract_001"]);
    expect(counters.unrelatedRowsScanned).toBe(0);
    expect(JSON.stringify(selection.manifest).length).toBeLessThan(65_536);
  });

  it("batches selected evidence reads at the reader bound without changing row order", async () => {
    const counters = createReaderCounters();
    const evidenceRows = evidenceRowsForBatching(51);
    const deps = createInvestigativeDeps({ counters, evidenceRows, reverseEvidenceRows: true });

    const selection = await __testOnlyReadEvidenceSelectionProbe({
      deps,
      scope: { kind: "workspace", id: "ws_main" },
      window: windowFor("cursor_ws_main_0002", 0, 100)
    });

    expect(counters.evidenceReads).toBe(2);
    expect(counters.evidenceIdBatchSizes).toEqual([50, 1]);
    expect(counters.evidenceHashBatchSizes).toEqual([50, 1]);
    expect(counters.evidenceIdBatchSizes.every((size) => size <= investigativeContextPackDefaultLimits.readerBatchSize)).toBe(true);
    expect(counters.evidenceHashBatchSizes.every((size) => size <= investigativeContextPackDefaultLimits.readerBatchSize)).toBe(true);
    expect(selection.rows.map((row) => row.evidenceId)).toEqual(evidenceRows.map((row) => row.evidenceId));
  });
});

interface ReaderCounters {
  evidenceReads: number;
  graphReads: number;
  governanceReads: number;
  agentLockReads: number;
  eventReads: number;
  unrelatedRowsScanned: number;
  evidenceIdsRead: string[];
  evidenceIdBatchSizes: number[];
  evidenceHashBatchSizes: number[];
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
    evidenceIdBatchSizes: [],
    evidenceHashBatchSizes: [],
    assertionIdsRead: []
  };
}

function windowFor(cursor: string, offset: number, limit: number): InvestigativeSelectionWindow {
  return {
    cursor,
    offset,
    limit,
    stableSort: "ref-kind-ref-id-content-hash-v1"
  };
}

interface CreateInvestigativeDepsInput {
  readonly counters?: ReaderCounters;
  readonly selection?: InvestigativeSelectionCapability;
  readonly scope?: InvestigativeContextPackScope;
  readonly window?: InvestigativeSelectionWindow;
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
  readonly evidenceRows?: readonly InvestigativeEvidenceRow[];
  readonly reverseEvidenceRows?: boolean;
}

function createInvestigativeDeps(input: CreateInvestigativeDepsInput = {}): InvestigativeContextPackDependencies {
  const counters = input.counters ?? createReaderCounters();
  const body = {
    ...selectionBody(),
    scope: input.scope ?? { kind: "workspace", id: "ws_main" },
    ...(input.evidenceRows === undefined
      ? {}
      : {
          totalEligibleCount: input.evidenceRows.length,
          includedRefs: input.evidenceRows.map((row) => ({
            refKind: "evidence" as const,
            refId: row.evidenceId,
            sortKey: `evidence/${row.evidenceId}/${row.contentHash}`,
            contentHash: row.contentHash,
            sourceEventIds: [`evt_${row.evidenceId}`],
            mandatory: true
          }))
        })
  } satisfies InvestigativeSelectionManifestBody;
  const manifest = { ...body, manifestHash: buildSelectionManifestHash(body) };
  return createFakeInvestigativeDeps({
    counters,
    manifest,
    unrelatedEvidenceRows: input.unrelatedEvidenceRows ?? 0,
    unrelatedGraphRows: input.unrelatedGraphRows ?? 0,
    unrelatedGovernanceRows: input.unrelatedGovernanceRows ?? 0,
    acceptedAssertionWithoutEvidenceHash: input.acceptedAssertionWithoutEvidenceHash ?? false,
    relationshipProjectionUnavailable: input.relationshipProjectionUnavailable ?? false,
    ...(input.selection === undefined ? {} : { selection: input.selection }),
    ...(input.postureResult === undefined ? {} : { postureResult: input.postureResult }),
    ...(input.safeNarrative === undefined ? {} : { safeNarrative: input.safeNarrative }),
    ...(input.rawActionField === undefined ? {} : { rawActionField: input.rawActionField }),
    ...(input.graphSentinel === undefined ? {} : { graphSentinel: input.graphSentinel }),
    ...(input.budgets === undefined ? {} : { budgets: input.budgets }),
    ...(input.registrationIdentity === undefined ? {} : { registrationIdentity: input.registrationIdentity }),
    ...(input.evidenceRows === undefined ? {} : { evidenceRows: input.evidenceRows }),
    ...(input.reverseEvidenceRows === undefined ? {} : { reverseEvidenceRows: input.reverseEvidenceRows })
  });
}

function createFakeInvestigativeDeps(input: {
  readonly counters: ReaderCounters;
  readonly manifest: ReturnType<typeof selectionManifest>;
  readonly selection?: InvestigativeSelectionCapability;
  readonly unrelatedEvidenceRows: number;
  readonly unrelatedGraphRows: number;
  readonly unrelatedGovernanceRows: number;
  readonly postureResult?: EvidenceSourcePostureResult;
  readonly safeNarrative?: string;
  readonly rawActionField?: string;
  readonly acceptedAssertionWithoutEvidenceHash: boolean;
  readonly relationshipProjectionUnavailable: boolean;
  readonly graphSentinel?: string;
  readonly budgets?: Partial<Record<InvestigativeContextPackId, number>>;
  readonly registrationIdentity?: InvestigativeRegistrationIdentity;
  readonly evidenceRows?: readonly InvestigativeEvidenceRow[];
  readonly reverseEvidenceRows?: boolean;
}): InvestigativeContextPackDependencies {
  const defaultEvidenceRow: InvestigativeEvidenceRow = {
    evidenceId: "ev_contract_001",
    contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111"
  };
  const evidenceRows = input.evidenceRows ?? [defaultEvidenceRow];
  const evidenceRowsById = new Map(evidenceRows.map((row) => [row.evidenceId, row]));
  const unrelatedRows = Array.from({ length: input.unrelatedEvidenceRows }, (_, index) => ({
    evidenceId: `ev_unrelated_${index}`,
    contentHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222" as const
  }));

  return {
    selection: input.selection ?? {
      capabilityVersion: "investigative-selection.v1",
      select() {
        return input.manifest;
      }
    },
    evidenceReader: {
      readEvidenceByIds(request) {
        input.counters.evidenceReads += 1;
        input.counters.evidenceIdsRead.push(...request.evidenceIds);
        input.counters.evidenceIdBatchSizes.push(request.evidenceIds.length);
        input.counters.evidenceHashBatchSizes.push(request.contentHashes.length);
        if (request.evidenceIds.some((evidenceId) => !evidenceRowsById.has(evidenceId))) {
          input.counters.unrelatedRowsScanned += unrelatedRows.length;
        }
        const selectedRows = request.evidenceIds.flatMap((evidenceId) => {
          const row = evidenceRowsById.get(evidenceId);
          return row === undefined ? [] : [row];
        });
        return input.reverseEvidenceRows === true ? selectedRows.reverse() : selectedRows;
      }
    },
    ...(input.budgets === undefined ? {} : { budgets: input.budgets })
  };
}

function evidenceRowsForBatching(count: number): readonly InvestigativeEvidenceRow[] {
  return Array.from({ length: count }, (_, index) => ({
    evidenceId: `ev_batch_${String(index).padStart(3, "0")}`,
    contentHash: `sha256:${String(index + 1).padStart(64, "0")}` as `sha256:${string}`
  }));
}

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

function permutationSelectionBody(): InvestigativeSelectionManifestBody {
  const contentHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111" as const;
  const rowHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222" as const;

  return {
    ...selectionBody(),
    includedRefs: [
      {
        refKind: "relationship",
        refId: "rel_002",
        sortKey: "relationship/rel_002/sha256:2222222222222222222222222222222222222222222222222222222222222222",
        rowHash,
        sourceEventIds: ["evt_relationship_002", "evt_relationship_001"],
        mandatory: false
      },
      {
        refKind: "evidence",
        refId: "ev_001",
        sortKey: "evidence/ev_001/sha256:1111111111111111111111111111111111111111111111111111111111111111",
        contentHash,
        sourceEventIds: ["evt_evidence_002", "evt_evidence_001"],
        mandatory: true
      }
    ],
    aggregateOmissions: [
      {
        reasonCode: "size-budget",
        refKind: "evidence",
        aggregateKey: "evidence:budget",
        count: 2,
        sampleRefs: [
          { refKind: "evidence", refId: "ev_002", contentHash: rowHash },
          { refKind: "evidence", refId: "ev_001", contentHash }
        ]
      },
      {
        reasonCode: "out-of-scope",
        refKind: "relationship",
        aggregateKey: "relationship:scope",
        count: 1,
        sampleRefs: [
          { refKind: "relationship", refId: "rel_002", contentHash: rowHash },
          { refKind: "relationship", refId: "rel_001", contentHash }
        ]
      }
    ]
  };
}
