import { describe, expect, it } from "vitest";
import {
  __testOnlyReadEvidenceSelectionProbe,
  __testOnlyResolveInvestigativeSelection,
  acceptedGraphProjectionPayloadParser,
  assertSelectionManifestHash,
  buildAcceptedGraphProjectionContextPack,
  buildEvidenceSummaryContextPack,
  buildSelectionManifestHash,
  evidenceSummaryPayloadParser,
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
    expect(safeResolved.payload.items[0]!.safeNarrative).toContain("collect-public-records.sh");

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

  it("binds injected policy, ontology, and pack versions into canonical payload provenance", async () => {
    const first = await buildEvidenceSummaryContextPack({
      deps: createInvestigativeDeps({
        metadata: {
          policyVersion: "policy.v1",
          ontologyCoreVersion: "ontology.v1",
          packVersions: { ingestion: "ingestion.v1" }
        }
      }),
      scope: { kind: "workspace", id: "ws_main" },
      window: windowFor("cursor_ws_main_0001", 0, 100)
    });
    const second = await buildEvidenceSummaryContextPack({
      deps: createInvestigativeDeps({
        metadata: {
          policyVersion: "policy.v2",
          ontologyCoreVersion: "ontology.v2",
          packVersions: { ingestion: "ingestion.v2" }
        }
      }),
      scope: { kind: "workspace", id: "ws_main" },
      window: windowFor("cursor_ws_main_0001", 0, 100)
    });

    expect(first.payload.packVersions).toEqual({ ingestion: "ingestion.v1" });
    expect(first.payload.ontologyCoreVersion).toBe("ontology.v1");
    expect(first.ref.policyVersion).toBe("policy.v1");
    expect(first.ref.contentHash).not.toBe(second.ref.contentHash);
  });

  it("rejects evidence rows whose ingestion event is not selected provenance", async () => {
    const row = evidenceRow("ev_contract_001", "evt_swapped_001");
    await expect(buildEvidenceSummaryContextPack({
      deps: createInvestigativeDeps({
        evidenceRows: [row],
        selection: fixedSelection({ ...selectionBody(), scope: { kind: "workspace", id: "ws_main" } })
      }),
      scope: { kind: "workspace", id: "ws_main" },
      window: windowFor("cursor_ws_main_0001", 0, 100)
    })).rejects.toMatchObject({ code: "selection-row-mismatch" });
  });

  it("rejects malformed nested evidence-summary sections", async () => {
    const resolved = await buildEvidenceSummaryContextPack({
      deps: createInvestigativeDeps(),
      scope: { kind: "workspace", id: "ws_main" },
      window: windowFor("cursor_ws_main_0001", 0, 100)
    });
    const invalidPayloads = [
      { ...resolved.payload, truthBoundary: { evidenceIsReadOnly: false, rawContentExcluded: true } },
      { ...resolved.payload, items: [{ evidenceId: "ev_bad" }] },
      { ...resolved.payload, omissions: [{ reasonCode: "budget-row-omitted" }] },
      { ...resolved.payload, stalenessInputs: [] },
      { ...resolved.payload, selectionManifest: { manifestVersion: "investigative-selection-manifest.v1" } },
      { ...resolved.payload, packVersions: {} },
      { ...resolved.payload, packVersions: { ingestion: 1 } }
    ];

    for (const payload of invalidPayloads) {
      expect(() => evidenceSummaryPayloadParser.parsePayload(payload)).toThrow(/evidence-summary payload/i);
    }
  });

  it("canonicalizes equivalent selected evidence ordering before deriving content hashes", async () => {
    const rows = [evidenceRow("ev_alpha_001", "evt_ev_alpha_001"), evidenceRow("ev_beta_001", "evt_ev_beta_001")];
    const body = {
      ...selectionBodyForRows(rows),
      scope: { kind: "workspace" as const, id: "ws_main" }
    } satisfies InvestigativeSelectionManifestBody;
    const reversed = {
      ...body,
      includedRefs: [...body.includedRefs].reverse().map((ref) => ({ ...ref, sourceEventIds: [...ref.sourceEventIds].reverse() })),
      aggregateOmissions: [...body.aggregateOmissions].reverse()
    } satisfies InvestigativeSelectionManifestBody;
    const first = await buildEvidenceSummaryContextPack({
      deps: createInvestigativeDeps({ evidenceRows: rows, selection: fixedSelection(body) }),
      scope: { kind: "workspace", id: "ws_main" },
      window: windowFor("cursor_ws_main_0001", 0, 100)
    });
    const second = await buildEvidenceSummaryContextPack({
      deps: createInvestigativeDeps({ evidenceRows: rows, selection: fixedSelection(reversed) }),
      scope: { kind: "workspace", id: "ws_main" },
      window: windowFor("cursor_ws_main_0001", 0, 100)
    });

    expect(first.payload).toEqual(second.payload);
    expect(first.ref.contentHash).toBe(second.ref.contentHash);
  });

  it("trims optional parse details into aggregate omissions before rejecting the context budget", async () => {
    const row = {
      ...evidenceRow("ev_contract_001", "evt_evidence_ingested_001"),
      parseJobs: Array.from({ length: 10 }, (_, index) => ({
        parseJobId: `parse_job_${index}`,
        lane: "extract",
        parserName: "parser",
        parserVersion: "v1",
        state: "complete",
        outputHash: `sha256:${"a".repeat(60)}${String(index).padStart(4, "0")}` as `sha256:${string}`
      }))
    } satisfies InvestigativeEvidenceRow;
    const full = await buildEvidenceSummaryContextPack({
      deps: createInvestigativeDeps({ evidenceRows: [row] }),
      scope: { kind: "workspace", id: "ws_main" },
      window: windowFor("cursor_ws_main_0001", 0, 100)
    });
    const trimmed = await buildEvidenceSummaryContextPack({
      deps: createInvestigativeDeps({ evidenceRows: [row] }),
      scope: { kind: "workspace", id: "ws_main" },
      window: windowFor("cursor_ws_main_0001", 0, 100),
      sizeBudgetBytes: full.ref.sizeBytes - 500
    });

    expect(trimmed.ref.sizeBytes).toBeLessThanOrEqual(full.ref.sizeBytes - 500);
    expect(trimmed.payload.items[0]!.parseJobs.length).toBeLessThan(row.parseJobs.length);
    expect(trimmed.payload.omissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ reasonCode: "budget-row-omitted", refKind: "parse-job", count: expect.any(Number) })
    ]));
  });

  it("canonicalizes nested evidence details before hashing and budget trimming", async () => {
    const canonical = nestedDetailEvidenceRow();
    const reversed = {
      ...canonical,
      occurrenceIds: [...canonical.occurrenceIds].reverse(),
      parseJobs: [...canonical.parseJobs].reverse(),
      governanceTags: [...canonical.governanceTags].reverse()
    } satisfies InvestigativeEvidenceRow;
    const full = await buildEvidenceSummaryContextPack({
      deps: createInvestigativeDeps({ evidenceRows: [canonical] }),
      scope: { kind: "workspace", id: "ws_main" },
      window: windowFor("cursor_ws_main_0001", 0, 100)
    });
    const reorderedFull = await buildEvidenceSummaryContextPack({
      deps: createInvestigativeDeps({ evidenceRows: [reversed] }),
      scope: { kind: "workspace", id: "ws_main" },
      window: windowFor("cursor_ws_main_0001", 0, 100)
    });
    const budget = full.ref.sizeBytes - 150;
    const trimmed = await buildEvidenceSummaryContextPack({
      deps: createInvestigativeDeps({ evidenceRows: [canonical] }),
      scope: { kind: "workspace", id: "ws_main" },
      window: windowFor("cursor_ws_main_0001", 0, 100),
      sizeBudgetBytes: budget
    });
    const reorderedTrimmed = await buildEvidenceSummaryContextPack({
      deps: createInvestigativeDeps({ evidenceRows: [reversed] }),
      scope: { kind: "workspace", id: "ws_main" },
      window: windowFor("cursor_ws_main_0001", 0, 100),
      sizeBudgetBytes: budget
    });

    expect(full.payload).toEqual(reorderedFull.payload);
    expect(full.ref.contentHash).toBe(reorderedFull.ref.contentHash);
    expect(trimmed.payload).toEqual(reorderedTrimmed.payload);
    expect(trimmed.ref.contentHash).toBe(reorderedTrimmed.ref.contentHash);
    expect(trimmed.payload.omissions).toEqual(reorderedTrimmed.payload.omissions);
  });

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

  it("rejects accepted graph rows missing row hash or selection provenance", async () => {
    await expect(buildAcceptedGraphProjectionContextPack({
      deps: createInvestigativeDeps({ graphRowHashMismatch: true }),
      scope: { kind: "task", id: "task_graph" },
      window: windowFor("cursor_task_graph_0001", 0, 100)
    })).rejects.toMatchObject({ code: "selection-row-mismatch" });

    await expect(buildAcceptedGraphProjectionContextPack({
      deps: createInvestigativeDeps({ graphMissingSelectedAcceptedEvent: true }),
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
    expect(() => acceptedGraphProjectionPayloadParser.parsePayload({
      ...resolved.payload,
      extra: "unexpected"
    })).toThrow(/accepted-graph payload/i);
  });

  it("canonicalizes accepted graph row ordering before deriving content hashes", async () => {
    const first = await buildAcceptedGraphProjectionContextPack({
      deps: createInvestigativeDeps(),
      scope: { kind: "task", id: "task_graph" },
      window: windowFor("cursor_task_graph_0001", 0, 100)
    });
    const second = await buildAcceptedGraphProjectionContextPack({
      deps: createInvestigativeDeps({ reverseGraphRows: true }),
      scope: { kind: "task", id: "task_graph" },
      window: windowFor("cursor_task_graph_0001", 0, 100)
    });

    expect(first.payload).toEqual(second.payload);
    expect(first.ref.contentHash).toBe(second.ref.contentHash);
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
  readonly graphRowHashMismatch?: boolean;
  readonly graphMissingSelectedAcceptedEvent?: boolean;
  readonly reverseGraphRows?: boolean;
  readonly graphSentinel?: string;
  readonly budgets?: Partial<Record<InvestigativeContextPackId, number>>;
  readonly registrationIdentity?: InvestigativeRegistrationIdentity;
  readonly evidenceRows?: readonly InvestigativeEvidenceRow[];
  readonly reverseEvidenceRows?: boolean;
  readonly metadata?: {
    readonly policyVersion: string;
    readonly ontologyCoreVersion: string;
    readonly packVersions: Readonly<Record<string, string>>;
  };
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
            sourceEventIds: [row.ingestionEventId],
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
    graphRowHashMismatch: input.graphRowHashMismatch ?? false,
    graphMissingSelectedAcceptedEvent: input.graphMissingSelectedAcceptedEvent ?? false,
    reverseGraphRows: input.reverseGraphRows ?? false,
    ...(input.selection === undefined ? {} : { selection: input.selection }),
    ...(input.postureResult === undefined ? {} : { postureResult: input.postureResult }),
    ...(input.safeNarrative === undefined ? {} : { safeNarrative: input.safeNarrative }),
    ...(input.rawActionField === undefined ? {} : { rawActionField: input.rawActionField }),
    ...(input.graphSentinel === undefined ? {} : { graphSentinel: input.graphSentinel }),
    ...(input.budgets === undefined ? {} : { budgets: input.budgets }),
    ...(input.registrationIdentity === undefined ? {} : { registrationIdentity: input.registrationIdentity }),
    ...(input.evidenceRows === undefined ? {} : { evidenceRows: input.evidenceRows }),
    ...(input.reverseEvidenceRows === undefined ? {} : { reverseEvidenceRows: input.reverseEvidenceRows }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata })
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
  readonly graphRowHashMismatch: boolean;
  readonly graphMissingSelectedAcceptedEvent: boolean;
  readonly reverseGraphRows: boolean;
  readonly graphSentinel?: string;
  readonly budgets?: Partial<Record<InvestigativeContextPackId, number>>;
  readonly registrationIdentity?: InvestigativeRegistrationIdentity;
  readonly evidenceRows?: readonly InvestigativeEvidenceRow[];
  readonly reverseEvidenceRows?: boolean;
  readonly metadata?: {
    readonly policyVersion: string;
    readonly ontologyCoreVersion: string;
    readonly packVersions: Readonly<Record<string, string>>;
  };
}): InvestigativeContextPackDependencies {
  const defaultEvidenceRow: InvestigativeEvidenceRow = {
    evidenceId: "ev_contract_001",
    ingestionEventId: "evt_evidence_ingested_001",
    contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    occurrenceIds: [],
    parseJobs: [],
    governanceTags: [],
    ...(input.safeNarrative === undefined ? {} : { safeNarrative: input.safeNarrative }),
    ...(input.rawActionField === undefined ? {} : { rawActionField: input.rawActionField })
  };
  const evidenceRows = input.evidenceRows ?? [defaultEvidenceRow];
  const evidenceRowsById = new Map(evidenceRows.map((row) => [row.evidenceId, row]));
  const unrelatedRows = Array.from({ length: input.unrelatedEvidenceRows }, (_, index) => ({
    evidenceId: `ev_unrelated_${index}`,
    contentHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222" as const
  }));
  const graph = graphRows({
    acceptedAssertionWithoutEvidenceHash: input.acceptedAssertionWithoutEvidenceHash,
    graphRowHashMismatch: input.graphRowHashMismatch,
    ...(input.graphSentinel === undefined ? {} : { graphSentinel: input.graphSentinel }),
    reverseGraphRows: input.reverseGraphRows
  });
  const graphManifest = selectionManifestForGraph({ missingAcceptedEvent: input.graphMissingSelectedAcceptedEvent });
  const graphAssertionsById = new Map(graph.assertions.map((row) => [row.assertionId, row]));
  const graphEntitiesById = new Map(graph.entities.map((row) => [row.entityId, row]));
  const graphRelationshipsById = new Map(graph.relationships.map((row) => [row.relationshipId, row]));
  const unrelatedGraphRows = Array.from({ length: input.unrelatedGraphRows }, (_, index) => ({
    assertionId: `assertion_unrelated_${index}`
  }));

  return {
    selection: input.selection ?? {
      capabilityVersion: "investigative-selection.v1",
      select(request) {
        if (request.contextPackId === "accepted-graph-projection.v1") {
          return {
            ...graphManifest,
            scope: request.scope,
            manifestHash: buildSelectionManifestHash({ ...graphManifest, scope: request.scope })
          };
        }
        return input.manifest;
      }
    },
    graphReader: {
      readAcceptedGraphByIds(request) {
        input.counters.graphReads += 1;
        input.counters.assertionIdsRead.push(...request.assertionIds);
        if (request.assertionIds.some((assertionId) => !graphAssertionsById.has(assertionId))) {
          input.counters.unrelatedRowsScanned += unrelatedGraphRows.length;
        }
        return {
          assertions: request.assertionIds.flatMap((assertionId) => {
            const row = graphAssertionsById.get(assertionId);
            return row === undefined ? [] : [row];
          }),
          entities: request.entityIds.flatMap((entityId) => {
            const row = graphEntitiesById.get(entityId);
            return row === undefined ? [] : [row];
          }),
          relationships: input.relationshipProjectionUnavailable
            ? []
            : request.relationshipIds.flatMap((relationshipId) => {
                const row = graphRelationshipsById.get(relationshipId);
                return row === undefined ? [] : [row];
              }),
          relationshipProjectionAvailable: !input.relationshipProjectionUnavailable
        };
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
    evidenceSourcePosture: {
      postureVersion: "ingestion-current-source-posture.v1",
      checkEvidence(row) {
        return input.postureResult ?? {
          ok: true,
          stalenessInputs: [{
            kind: "source-byte-current-hash",
            ref: row.evidenceId,
            value: row.contentHash
          }]
        };
      }
    },
    now() {
      return "2026-07-10T00:00:00.000Z";
    },
    metadata: input.metadata ?? {
      policyVersion: "policy.v1",
      ontologyCoreVersion: "ontology.v1",
      packVersions: { ingestion: "ingestion.v1" }
    },
    ...(input.budgets === undefined ? {} : { budgets: input.budgets })
  };
}

function evidenceRowsForBatching(count: number): readonly InvestigativeEvidenceRow[] {
  return Array.from({ length: count }, (_, index) => ({
    evidenceId: `ev_batch_${String(index).padStart(3, "0")}`,
    ingestionEventId: `evt_ev_batch_${String(index).padStart(3, "0")}`,
    contentHash: `sha256:${String(index + 1).padStart(64, "0")}` as `sha256:${string}`,
    occurrenceIds: [],
    parseJobs: [],
    governanceTags: []
  }));
}

function evidenceRow(evidenceId: string, ingestionEventId: string): InvestigativeEvidenceRow {
  return {
    evidenceId,
    ingestionEventId,
    contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    occurrenceIds: [],
    parseJobs: [],
    governanceTags: []
  };
}

function nestedDetailEvidenceRow(): InvestigativeEvidenceRow {
  return {
    ...evidenceRow("ev_contract_001", "evt_evidence_ingested_001"),
    occurrenceIds: ["occurrence_c", "occurrence_a", "occurrence_b"],
    parseJobs: [
      { parseJobId: "parse_job_c", lane: "extract", parserName: `parser_${"c".repeat(300)}`, parserVersion: "v1", state: "complete" },
      { parseJobId: "parse_job_a", lane: "extract", parserName: `parser_${"a".repeat(300)}`, parserVersion: "v1", state: "complete" },
      { parseJobId: "parse_job_b", lane: "extract", parserName: `parser_${"b".repeat(300)}`, parserVersion: "v1", state: "complete" }
    ],
    governanceTags: [
      { tag: "zeta", source: "human", state: "removed", eventId: "evt_tag_zeta" },
      { tag: "alpha", source: "ai", state: "removed", eventId: "evt_tag_alpha" },
      { tag: "active", source: "human", state: "active", eventId: "evt_tag_active" }
    ]
  };
}

function selectionBodyForRows(rows: readonly InvestigativeEvidenceRow[]): InvestigativeSelectionManifestBody {
  return {
    ...selectionBody(),
    totalEligibleCount: rows.length,
    includedRefs: rows.map((row) => ({
      refKind: "evidence" as const,
      refId: row.evidenceId,
      sortKey: `evidence/${row.evidenceId}/${row.contentHash}`,
      contentHash: row.contentHash,
      sourceEventIds: [row.ingestionEventId],
      mandatory: true
    }))
  };
}

function fixedSelection(body: InvestigativeSelectionManifestBody): InvestigativeSelectionCapability {
  const manifest = { ...body, manifestHash: buildSelectionManifestHash(body) };
  return {
    capabilityVersion: "investigative-selection.v1",
    select() {
      return manifest;
    }
  };
}

function selectionManifestForGraph(input: { readonly missingAcceptedEvent: boolean }): ReturnType<typeof selectionManifest> {
  const assertionRowHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
  const vendorEntityRowHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
  const agencyEntityRowHash = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;
  const relationshipRowHash = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const;
  const body: InvestigativeSelectionManifestBody = {
    manifestVersion: "investigative-selection-manifest.v1",
    scope: { kind: "task", id: "task_graph" },
    sourceProjectionHighWaterMarks: { graph: 42 },
    ordering: "ref-kind-ref-id-content-hash-v1",
    window: {
      cursor: "cursor_task_graph_0001",
      offset: 0,
      limit: 100,
      stableSort: "ref-kind-ref-id-content-hash-v1"
    },
    totalEligibleCount: 4,
    includedRefs: [
      {
        refKind: "assertion",
        refId: "assertion_contract_vendor_001",
        sortKey: `assertion/assertion_contract_vendor_001/${assertionRowHash}`,
        rowHash: assertionRowHash,
        sourceEventIds: input.missingAcceptedEvent
          ? ["evt_assertion_proposed_001"]
          : ["evt_assertion_proposed_001", "evt_assertion_accepted_001"],
        mandatory: true
      },
      {
        refKind: "entity",
        refId: "entity_agency_001",
        sortKey: `entity/entity_agency_001/${agencyEntityRowHash}`,
        rowHash: agencyEntityRowHash,
        sourceEventIds: ["evt_entity_resolved_001"],
        mandatory: true
      },
      {
        refKind: "entity",
        refId: "entity_vendor_001",
        sortKey: `entity/entity_vendor_001/${vendorEntityRowHash}`,
        rowHash: vendorEntityRowHash,
        sourceEventIds: ["evt_entity_resolved_002"],
        mandatory: true
      },
      {
        refKind: "relationship",
        refId: "relationship_contract_awarded_001",
        sortKey: `relationship/relationship_contract_awarded_001/${relationshipRowHash}`,
        rowHash: relationshipRowHash,
        sourceEventIds: ["evt_relationship_accepted_001"],
        mandatory: false
      }
    ],
    aggregateOmissions: []
  };
  return { ...body, manifestHash: buildSelectionManifestHash(body) };
}

function graphRows(input: {
  readonly acceptedAssertionWithoutEvidenceHash: boolean;
  readonly graphRowHashMismatch: boolean;
  readonly graphSentinel?: string;
  readonly reverseGraphRows: boolean;
}) {
  const assertion = {
    assertionId: "assertion_contract_vendor_001",
    evidenceId: "ev_contract_001",
    evidenceContentHash: (input.acceptedAssertionWithoutEvidenceHash
      ? ""
      : "sha256:1111111111111111111111111111111111111111111111111111111111111111") as `sha256:${string}`,
    proposedByEventId: "evt_assertion_proposed_001",
    acceptedByEventId: "evt_assertion_accepted_001",
    sourceEventIds: ["evt_assertion_accepted_001", "evt_assertion_proposed_001"],
    rowHash: (input.graphRowHashMismatch
      ? "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      : "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") as `sha256:${string}`,
    safeStatement: input.graphSentinel ?? "Agency awarded a reviewed contract to the vendor."
  };
  const entities = [
    {
      entityId: "entity_agency_001",
      rowHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as `sha256:${string}`,
      safeLabel: "City Agency",
      sourceEventIds: ["evt_entity_resolved_001"]
    },
    {
      entityId: "entity_vendor_001",
      rowHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `sha256:${string}`,
      safeLabel: "Vendor LLC",
      sourceEventIds: ["evt_entity_resolved_002"]
    }
  ];
  const relationships = [
    {
      relationshipId: "relationship_contract_awarded_001",
      acceptedByEventId: "evt_relationship_accepted_001",
      evidenceId: "ev_contract_001",
      evidenceContentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111" as `sha256:${string}`,
      sourceEventIds: ["evt_relationship_accepted_001"],
      rowHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as `sha256:${string}`,
      sourceEntityId: "entity_agency_001",
      targetEntityId: "entity_vendor_001",
      relationshipType: "awarded_contract_to"
    }
  ];
  return {
    assertions: [assertion],
    entities: input.reverseGraphRows ? [...entities].reverse() : entities,
    relationships: input.reverseGraphRows ? [...relationships].reverse() : relationships
  };
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
    aggregateOmissions: [{
      reasonCode: "budget-row-omitted",
      refKind: "parse-job",
      aggregateKey: "optional-parse-detail",
      count: 50,
      sampleRefs: [{
        refKind: "parse-job",
        refId: "parse_job_001"
      }]
    }]
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
