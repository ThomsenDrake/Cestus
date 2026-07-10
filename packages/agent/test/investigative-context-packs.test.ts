import { describe, expect, it } from "vitest";
import {
  assertSelectionManifestHash,
  buildSelectionManifestHash,
  investigativeContextPackDefaultLimits,
  investigativeContextPackDescriptors,
  investigativeContextPackPayloadParsers,
  type InvestigativeSelectionManifestBody
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
