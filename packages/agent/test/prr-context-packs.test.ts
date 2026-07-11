import { describe, expect, it } from "vitest";
import {
  buildResolvedContextPack,
  createContextPackRegistry,
  verifyResolvedContextPack,
  type ContextPackPayloadParser
} from "../src/context-packs.js";
import type { PrrRequestReadModel, PrrTimelineEntry } from "../../prr/src/projection.js";
import {
  buildJurisdictionPackSummaryContextPack,
  buildPrrReadModelContextPack,
  jurisdictionPackSummaryPayloadParser,
  prrReadModelPayloadParser,
  registerPrrContextPackBuilders,
  type BuildJurisdictionPackSummaryContextPackInput,
  type BuildPrrReadModelContextPackInput,
  type PrrContextGateSnapshot,
  type PrrContextPackRegistrationEntry
} from "../src/prr-context-packs.js";

const generatedAt = "2026-07-10T12:00:00.000Z";
const bodyHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const renderedBodyHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const evidenceHash = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;
const jurisdictionArtifactHash = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const;

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
    expect(verifyResolvedContextPack(resolved, prrReadModelPayloadParser).ref).toEqual(ref);
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
    expect(() => verifyResolvedContextPack(attackerResolved, prrReadModelPayloadParser))
      .toThrow(/payload-schema-mismatch|prr-read-model|payload|schema/i);
  });

  it("rejects forged matching-ref payload provenance outside the selected request stream and artifacts", () => {
    const resolved = buildPrrReadModelContextPack(basePrrInput());
    const payload = structuredClone(resolved.payload) as {
      diagnostics: { eventId: string }[];
      sourceRefs: {
        correspondence: { id: string; contentHash: string; sourceEventId: string }[];
        evidence: { id: string; contentHash: string; sourceEventId: string }[];
      };
      correspondence: {
        outbound: { bodyHash?: string; evidenceIds: string[]; attachmentEvidenceIds: string[] }[];
        inbound: { bodyHash?: string; evidenceIds: string[]; attachmentEvidenceIds: string[] }[];
      };
      production: {
        evidenceIds: string[];
        batches: { evidenceIds: string[] }[];
        escalation: { confirmedBy: string; rationale: string; citedRules: { label: string; citation: string; jurisdictionPack: { name: string; version: string } }[]; evidenceIds: string[] } | null;
      };
      gates: { checks: { sourceEventIds?: string[]; evidenceHashes?: string[] }[] }[];
    };

    payload.diagnostics[0]!.eventId = "evt_prr_unrelated";
    expect(() => verifyResolvedContextPack(forgeResolved(resolved, payload), prrReadModelPayloadParser))
      .toThrow(/payload-schema-mismatch|provenance|source/i);

    const forgedCorrespondence = structuredClone(resolved.payload) as typeof payload;
    forgedCorrespondence.sourceRefs.correspondence[0]!.sourceEventId = "evt_prr_unrelated";
    expect(() => verifyResolvedContextPack(forgeResolved(resolved, forgedCorrespondence), prrReadModelPayloadParser))
      .toThrow(/payload-schema-mismatch|provenance|source/i);

    const forgedCorrespondenceId = structuredClone(resolved.payload) as typeof payload;
    forgedCorrespondenceId.sourceRefs.correspondence[0]!.id = "corr_unrelated";
    expect(() => verifyResolvedContextPack(forgeResolved(resolved, forgedCorrespondenceId), prrReadModelPayloadParser))
      .toThrow(/payload-schema-mismatch|correspondence/i);

    const forgedEvidenceId = structuredClone(resolved.payload) as typeof payload;
    forgedEvidenceId.sourceRefs.evidence[0]!.id = "ev_unrelated";
    expect(() => verifyResolvedContextPack(forgeResolved(resolved, forgedEvidenceId), prrReadModelPayloadParser))
      .toThrow(/payload-schema-mismatch|evidence/i);

    const forgedArtifact = structuredClone(resolved.payload) as typeof payload;
    forgedArtifact.sourceRefs.evidence[0]!.contentHash = bodyHash;
    expect(() => verifyResolvedContextPack(forgeResolved(resolved, forgedArtifact), prrReadModelPayloadParser))
      .toThrow(/payload-schema-mismatch|artifact/i);

    const forgedGate = structuredClone(resolved.payload) as typeof payload;
    forgedGate.gates[0]!.checks[0]!.sourceEventIds = ["evt_prr_unrelated"];
    expect(() => verifyResolvedContextPack(forgeResolved(resolved, forgedGate), prrReadModelPayloadParser))
      .toThrow(/payload-schema-mismatch|provenance|source/i);
  });

  it("rejects forged correspondence hashes that lack a selected correspondence source ref", () => {
    const resolved = buildPrrReadModelContextPack(basePrrInput());
    const forged = structuredClone(resolved.payload) as {
      correspondence: { outbound: { bodyHash?: string }[] };
    };
    forged.correspondence.outbound[0]!.bodyHash = evidenceHash;

    expect(() => verifyResolvedContextPack(forgeResolved(resolved, forged), prrReadModelPayloadParser))
      .toThrow(/payload-schema-mismatch|correspondence|artifact/i);
  });

  it("rejects coordinated source-ref ID renames and rendered-hash swaps", () => {
    const resolved = buildPrrReadModelContextPack(basePrrInput());
    const forged = structuredClone(resolved.payload) as {
      sourceRefs: {
        correspondence: { id: string }[];
        evidence: { id: string }[];
      };
      correspondence: {
        outbound: { correspondenceId: string; bodyHash?: string; evidenceIds: string[]; attachmentEvidenceIds: string[] }[];
      };
    };

    forged.sourceRefs.evidence[0]!.id = "ev_unrelated";
    forged.correspondence.outbound[0]!.evidenceIds = ["ev_unrelated"];
    forged.correspondence.outbound[0]!.attachmentEvidenceIds = ["ev_unrelated"];
    expect(() => verifyResolvedContextPack(forgeResolved(resolved, forged), prrReadModelPayloadParser))
      .toThrow(/payload-schema-mismatch|provenance|source/i);

    const forgedCorrespondence = structuredClone(resolved.payload) as typeof forged;
    forgedCorrespondence.sourceRefs.correspondence.forEach((sourceRef) => {
      sourceRef.id = sourceRef.id.replace("corr_selected_followup", "corr_selected_followup_unrelated");
    });
    forgedCorrespondence.correspondence.outbound[0]!.correspondenceId = "corr_selected_followup_unrelated";
    expect(() => verifyResolvedContextPack(forgeResolved(resolved, forgedCorrespondence), prrReadModelPayloadParser))
      .toThrow(/payload-schema-mismatch|provenance|source/i);

    const forgedRenderedHash = structuredClone(resolved.payload) as typeof forged;
    forgedRenderedHash.correspondence.outbound[0]!.bodyHash = renderedBodyHash;
    expect(() => verifyResolvedContextPack(forgeResolved(resolved, forgedRenderedHash), prrReadModelPayloadParser))
      .toThrow(/payload-schema-mismatch|provenance|source/i);
  });

  it("rejects forged evidence IDs absent from selected evidence source refs", () => {
    const resolved = buildPrrReadModelContextPack(basePrrInput());
    const forged = structuredClone(resolved.payload) as {
      correspondence: { outbound: { evidenceIds: string[] }[] };
      production: {
        evidenceIds: string[];
        batches: { evidenceIds: string[] }[];
        escalation: { confirmedBy: string; rationale: string; citedRules: { label: string; citation: string; jurisdictionPack: { name: string; version: string } }[]; evidenceIds: string[] } | null;
      };
    };

    forged.correspondence.outbound[0]!.evidenceIds.push("ev_unrelated");
    expect(() => verifyResolvedContextPack(forgeResolved(resolved, forged), prrReadModelPayloadParser))
      .toThrow(/payload-schema-mismatch|evidence/i);

    const forgedProduction = structuredClone(resolved.payload) as typeof forged;
    forgedProduction.production.evidenceIds.push("ev_unrelated");
    expect(() => verifyResolvedContextPack(forgeResolved(resolved, forgedProduction), prrReadModelPayloadParser))
      .toThrow(/payload-schema-mismatch|evidence/i);

    const forgedEscalation = structuredClone(resolved.payload) as typeof forged;
    forgedEscalation.production.escalation = {
      confirmedBy: "actor_investigator",
      rationale: "Required",
      citedRules: [{ label: "20 working days", citation: "5 U.S.C. 552(a)(6)(A)(i)", jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" } }],
      evidenceIds: ["ev_unrelated"]
    };
    expect(() => verifyResolvedContextPack(forgeResolved(resolved, forgedEscalation), prrReadModelPayloadParser))
      .toThrow(/payload-schema-mismatch|evidence/i);
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

  it("requires selected-stream hash provenance and bound gate evidence", () => {
    expect(() => buildPrrReadModelContextPack(basePrrInput({
      correspondenceHashes: [{ id: "corr_selected_followup_body", contentHash: bodyHash } as never]
    }))).toThrow(/source.*event|provenance/i);

    expect(() => buildPrrReadModelContextPack(basePrrInput({
      gates: [{
        ...selectedGates()[0]!,
        checks: [{
          ...selectedGates()[0]!.checks[0]!,
          evidenceHashes: [bodyHash]
        }]
      }]
    }))).toThrow(/gate evidence|provenance/i);
  });

  it("fails closed when active deadline, exemption, or legal escalation citations are absent", () => {
    expect(() => buildPrrReadModelContextPack(basePrrInput({
      request: { ...selectedRequest(), activeDeadline: { ...selectedRequest().activeDeadline!, citedRules: [] } }
    }))).toThrow(/citation|payload-schema/i);

    expect(() => buildPrrReadModelContextPack(basePrrInput({
      request: { ...selectedRequest(), exemptions: [{ exemptionId: "ex_selected", claimedBy: "agency", citedRules: [] }] }
    }))).toThrow(/citation|payload-schema/i);

    expect(() => buildPrrReadModelContextPack(basePrrInput({
      request: { ...selectedRequest(), legalEscalation: { confirmedBy: "actor_investigator", rationale: "Required", citedRules: [], evidenceIds: ["ev_selected_attachment"] } }
    }))).toThrow(/citation|payload-schema/i);
  });
});

function forgeResolved(
  resolved: ReturnType<typeof buildPrrReadModelContextPack>,
  payload: unknown
) {
  return buildResolvedContextPack({
    contextPackId: resolved.ref.contextPackId,
    version: resolved.ref.version,
    generatedAt: resolved.ref.generatedAt,
    payload,
    safeSummary: resolved.ref.safeSummary,
    provenanceRefs: resolved.ref.provenanceRefs,
    ...(resolved.ref.sourceEventIds === undefined ? {} : { sourceEventIds: resolved.ref.sourceEventIds }),
    ...(resolved.ref.artifactHashes === undefined ? {} : { artifactHashes: resolved.ref.artifactHashes }),
    ...(resolved.ref.projectionHighWaterMark === undefined ? {} : { projectionHighWaterMark: resolved.ref.projectionHighWaterMark }),
    ...(resolved.ref.policyVersion === undefined ? {} : { policyVersion: resolved.ref.policyVersion }),
    ...(resolved.ref.scope === undefined ? {} : { scope: resolved.ref.scope }),
    ...(resolved.ref.sizeBudgetBytes === undefined ? {} : { sizeBudgetBytes: resolved.ref.sizeBudgetBytes }),
    ...(resolved.ref.stalenessInputs === undefined ? {} : { stalenessInputs: resolved.ref.stalenessInputs })
  });
}

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
    workspace: { totalPrrRequestCount: 1 },
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

describe("selected request jurisdiction pack summary context pack", () => {
  it("binds pack name, version, artifact hash, exact rule IDs, and advisory legal posture", () => {
    const resolved = buildJurisdictionPackSummaryContextPack(jurisdictionInput());
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
    expect(verifyResolvedContextPack(resolved, jurisdictionPackSummaryPayloadParser).ref).toEqual(ref);
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
            citations: []
          }]
        }
      })
    ).toThrow(/citation|rule/i);
  });

  it("records machine-readable omissions for missing rule categories", () => {
    const resolved = buildJurisdictionPackSummaryContextPack(jurisdictionInput());
    const payload = resolved.payload as { readonly omissions: readonly { readonly kind: string; readonly reason: string; readonly category: string }[] };

    expect(resolved.ref.safeSummary).toMatch(/advisory/i);
    expect(JSON.stringify(resolved.ref)).not.toMatch(/legal advice|definitive/i);
    expect(resolved.ref.sizeBytes).toBeGreaterThan(0);
    expect(payload.omissions).toEqual([
      { kind: "jurisdiction-rule-category", reason: "absent-from-selected-pack", category: "fee" },
      { kind: "jurisdiction-rule-category", reason: "absent-from-selected-pack", category: "exemption" },
      { kind: "jurisdiction-rule-category", reason: "absent-from-selected-pack", category: "appeal" },
      { kind: "jurisdiction-rule-category", reason: "absent-from-selected-pack", category: "enforcement" }
    ]);
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
    expect(() => verifyResolvedContextPack(attackerResolved, jurisdictionPackSummaryPayloadParser))
      .toThrow(/payload-schema-mismatch/);
  });

  it("rejects a hash-valid jurisdiction ref with extra conflicting staleness inputs", () => {
    const resolved = buildJurisdictionPackSummaryContextPack(jurisdictionInput());
    const attackerResolved = buildResolvedContextPack({
      contextPackId: resolved.ref.contextPackId,
      version: resolved.ref.version,
      generatedAt: resolved.ref.generatedAt,
      payload: resolved.payload,
      safeSummary: resolved.ref.safeSummary,
      provenanceRefs: resolved.ref.provenanceRefs,
      sizeBudgetBytes: 16_384,
      ...(resolved.ref.sourceEventIds === undefined ? {} : { sourceEventIds: resolved.ref.sourceEventIds }),
      ...(resolved.ref.artifactHashes === undefined ? {} : { artifactHashes: resolved.ref.artifactHashes }),
      ...(resolved.ref.projectionHighWaterMark === undefined ? {} : { projectionHighWaterMark: resolved.ref.projectionHighWaterMark }),
      ...(resolved.ref.policyVersion === undefined ? {} : { policyVersion: resolved.ref.policyVersion }),
      ...(resolved.ref.scope === undefined ? {} : { scope: resolved.ref.scope }),
      stalenessInputs: [
        { kind: "jurisdiction-pack-artifact-hash", ref: "us-federal-foia@0.1.0", value: jurisdictionArtifactHash },
        { kind: "selected-request-jurisdiction-pack", ref: "prr_req_selected", value: "us-federal-foia@0.1.0" },
        { kind: "jurisdiction-pack-artifact-hash", ref: "us-federal-foia@0.1.0", value: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" }
      ]
    });

    expect(() => verifyResolvedContextPack(attackerResolved, jurisdictionPackSummaryPayloadParser))
      .toThrow(/payload-schema-mismatch|staleness/i);
  });

  it("rejects a hash-valid payload that turns the advisory posture into legal advice", () => {
    const resolved = buildJurisdictionPackSummaryContextPack(jurisdictionInput());
    const payload = resolved.payload as Record<string, unknown>;
    const attackerResolved = buildResolvedContextPack({
      contextPackId: resolved.ref.contextPackId,
      version: resolved.ref.version,
      generatedAt: resolved.ref.generatedAt,
      payload: {
        ...payload,
        advisoryPosture: {
          ...(payload.advisoryPosture as Record<string, unknown>),
          note: "This is legal advice."
        }
      },
      safeSummary: resolved.ref.safeSummary,
      provenanceRefs: resolved.ref.provenanceRefs,
      sizeBudgetBytes: 16_384,
      ...(resolved.ref.sourceEventIds === undefined ? {} : { sourceEventIds: resolved.ref.sourceEventIds }),
      ...(resolved.ref.artifactHashes === undefined ? {} : { artifactHashes: resolved.ref.artifactHashes }),
      ...(resolved.ref.projectionHighWaterMark === undefined ? {} : { projectionHighWaterMark: resolved.ref.projectionHighWaterMark }),
      ...(resolved.ref.policyVersion === undefined ? {} : { policyVersion: resolved.ref.policyVersion }),
      ...(resolved.ref.scope === undefined ? {} : { scope: resolved.ref.scope }),
      ...(resolved.ref.stalenessInputs === undefined ? {} : { stalenessInputs: resolved.ref.stalenessInputs })
    });

    expect(() => verifyResolvedContextPack(attackerResolved, jurisdictionPackSummaryPayloadParser))
      .toThrow(/payload-schema-mismatch/);
  });
});

describe("PRR context pack registration", () => {
  it("registers builders with stable descriptor, parser, and registration identity", async () => {
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

  it("preserves the supplied builder receiver when the registry invokes build", async () => {
    const registry = createContextPackRegistry();
    const prrRegistration = prrRegistrationForTest();
    const builder = {
      descriptor: prrRegistration.descriptor,
      owner: "caller",
      build() {
        if (this.owner !== "caller") {
          throw new Error("builder receiver was not preserved");
        }
        return buildPrrReadModelContextPack(basePrrInput());
      }
    };

    registerPrrContextPackBuilders({
      registry,
      prrReadModel: { ...prrRegistration, builder },
      jurisdictionPackSummary: jurisdictionRegistrationForTest()
    });

    await expect(registry.buildResolved("prr-read-model.v1")).resolves.toMatchObject({
      ref: { contextPackId: "prr-read-model.v1" }
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

  it("conflicts on duplicate ID and version with a different registration identity", () => {
    const registry = createContextPackRegistry();

    registerPrrContextPackBuilders({
      registry,
      prrReadModel: prrRegistrationForTest(),
      jurisdictionPackSummary: jurisdictionRegistrationForTest()
    });

    expect(() =>
      registerPrrContextPackBuilders({
        registry,
        prrReadModel: prrRegistrationForTest({ registrationIdentity: "packages/agent/prr-context-packs:fork" }),
        jurisdictionPackSummary: jurisdictionRegistrationForTest()
      })
    ).toThrow(/registration|conflict|already registered/i);
  });

  it("conflicts when the registry already has the descriptor without this helper identity", () => {
    const registry = createContextPackRegistry();
    const registration = prrRegistrationForTest();
    registry.register({
      descriptor: registration.descriptor,
      parsePayload: registration.payloadParser,
      build: registration.builder.build
    });

    expect(() =>
      registerPrrContextPackBuilders({
        registry,
        prrReadModel: registration,
        jurisdictionPackSummary: jurisdictionRegistrationForTest()
      })
    ).toThrow(/conflict|already registered/i);
  });

  it("fails closed when the supplied registry does not expose buildResolved", () => {
    const registryWithoutBuildResolved = {
      ...createContextPackRegistry(),
      buildResolved: undefined
    } as never;

    expect(() =>
      registerPrrContextPackBuilders({
        registry: registryWithoutBuildResolved,
        prrReadModel: prrRegistrationForTest(),
        jurisdictionPackSummary: jurisdictionRegistrationForTest()
      })
    ).toThrow(/schema-conflict|buildResolved/i);
  });
});

function prrRegistrationForTest(
  overrides: {
    readonly parserId?: string;
    readonly maxBytes?: number;
    readonly registrationIdentity?: string;
  } = {}
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
  return {
    descriptor,
    payloadParser: parserWithId(prrReadModelPayloadParser, overrides.parserId),
    registrationIdentity: overrides.registrationIdentity ?? "packages/agent/prr-context-packs:prr-read-model.v1@1",
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
  const parserWithStableId: ContextPackPayloadParser = (payload, ref) => parser(payload, ref);
  Object.defineProperty(parserWithStableId, "cestusContextPackParserId", {
    value: parserId,
    enumerable: false,
    writable: false,
    configurable: false
  });
  return parserWithStableId;
}

function jurisdictionInput(): BuildJurisdictionPackSummaryContextPackInput {
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
