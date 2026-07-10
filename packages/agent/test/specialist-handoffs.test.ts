import { describe, expect, it } from "vitest";
import { buildContextPackRef } from "../src/context-packs.js";
import {
  hashSpecialistWorkflowHandoff,
  parseLegacySpecialistWorkflowHandoff,
  parseSpecialistWorkflowHandoff
} from "../src/specialist-handoffs.js";

const contextPack = buildContextPackRef({
  contextPackId: "evidence-summary.v1",
  version: 1,
  generatedAt: "2026-07-09T12:00:00.000Z",
  payload: { evidenceIds: ["ev_report_001"] },
  safeSummary: "One evidence summary.",
  provenanceRefs: ["ev_report_001"],
  sizeBudgetBytes: 16_384
});

describe("specialist workflow handoffs", () => {
  it("rejects missing durable handoff identity fields", () => {
    expect(() =>
      parseSpecialistWorkflowHandoff({
        schemaVersion: "agent-specialist-handoff.v1",
        runType: "evidence-triage",
        runId: "run_evidence_triage_001",
        residentAgentId: "agent_default",
        generatedAt: "2026-07-09T12:01:00.000Z",
        status: "ready-for-review",
        safeSummary: "Evidence triage dossier is ready for review.",
        contextPackRefs: [contextPack],
        outputArtifacts: [],
        toolRequestIds: [],
        approvalRequirements: [],
        nextSafeActions: []
      })
    ).toThrow(/handoffId|handoffRevision|required/i);
  });

  it("labels identity-less pre-durable workflow handoffs as legacy and non-durable", () => {
    const legacy = parseLegacySpecialistWorkflowHandoff({
      schemaVersion: "agent-specialist-handoff.v1",
      runType: "evidence-triage",
      runId: "run_evidence_triage_legacy",
      residentAgentId: "agent_default",
      generatedAt: "2026-07-09T12:01:00.000Z",
      status: "ready-for-review",
      safeSummary: "Legacy workflow handoff is display-only.",
      contextPackRefs: [contextPack],
      outputArtifacts: [],
      toolRequestIds: [],
      approvalRequirements: [],
      nextSafeActions: []
    });

    expect(legacy.durability).toBe("legacy-non-durable");
    expect("handoffId" in legacy).toBe(false);
    expect("handoffRevision" in legacy).toBe(false);
    expect(() =>
      parseLegacySpecialistWorkflowHandoff({
        ...legacy,
        handoffId: "handoff_run_evidence_triage_legacy_0123456789abcdef",
        handoffRevision: 1
      })
    ).toThrow(/unsupported|unrecognized/i);
  });

  it("parses and hashes a browser-safe handoff", () => {
    const handoff = parseSpecialistWorkflowHandoff({
      schemaVersion: "agent-specialist-handoff.v1",
      handoffId: "handoff_run_evidence_triage_001_0123456789abcdef",
      handoffRevision: 1,
      runType: "evidence-triage",
      runId: "run_evidence_triage_001",
      taskId: "task_evidence_triage_001",
      residentAgentId: "agent_default",
      generatedAt: "2026-07-09T12:01:00.000Z",
      status: "ready-for-review",
      safeSummary: "Evidence triage dossier is ready for review.",
      contextPackRefs: [contextPack],
      outputArtifacts: [{
        artifactId: "artifact_evidence_triage_dossier_001",
        artifactKind: "evidence-triage-dossier",
        schemaId: "evidence-triage-handoff.v1",
        artifactHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        safeSummary: "Triage dossier with one evidence item."
      }],
      toolRequestIds: ["toolreq_evidence_triage_governance_review"],
      approvalRequirements: [{
        approvalClass: "human-review",
        reason: "Governance review is required before classification is durable.",
        toolRequestId: "toolreq_evidence_triage_governance_review"
      }],
      nextSafeActions: [{
        actionId: "action_review_triage",
        label: "Review evidence triage dossier",
        kind: "review",
        effect: "none"
      }]
    });

    expect(handoff.runType).toBe("evidence-triage");
    expect(handoff.handoffId).toBe("handoff_run_evidence_triage_001_0123456789abcdef");
    expect(handoff.handoffRevision).toBe(1);
    expect(hashSpecialistWorkflowHandoff(handoff)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(handoff)).not.toMatch(/assertion\.accepted|entity\.resolved|relationship\.accepted/i);
    expect(Object.isFrozen(handoff)).toBe(true);
    expect(Object.isFrozen(handoff.contextPackRefs)).toBe(true);
    expect(Object.isFrozen(handoff.outputArtifacts)).toBe(true);
    expect(Object.isFrozen(handoff.approvalRequirements)).toBe(true);
    expect(Object.isFrozen(handoff.nextSafeActions)).toBe(true);
  });

  it("rejects unsafe fields, raw content keys, and secret-shaped text", () => {
    expect(() =>
      parseSpecialistWorkflowHandoff({
        schemaVersion: "agent-specialist-handoff.v1",
        handoffId: "handoff_run_report_builder_001_0123456789abcdef",
        handoffRevision: 1,
        runType: "report-builder",
        runId: "run_report_builder_001",
        residentAgentId: "agent_default",
        generatedAt: "2026-07-09T12:01:00.000Z",
        status: "ready-for-review",
        safeSummary: "api key sk-live-value",
        contextPackRefs: [contextPack],
        outputArtifacts: [],
        toolRequestIds: [],
        approvalRequirements: [],
        nextSafeActions: []
      })
    ).toThrow(/secret/i);

    expect(() =>
      parseSpecialistWorkflowHandoff({
        schemaVersion: "agent-specialist-handoff.v1",
        handoffId: "handoff_run_report_builder_001_0123456789abcdef",
        handoffRevision: 1,
        runType: "report-builder",
        runId: "run_report_builder_001",
        residentAgentId: "agent_default",
        generatedAt: "2026-07-09T12:01:00.000Z",
        status: "ready-for-review",
        safeSummary: "Report handoff.",
        contextPackRefs: [contextPack],
        outputArtifacts: [],
        toolRequestIds: [],
        approvalRequirements: [],
        nextSafeActions: [],
        rawProviderError: "provider body must not enter browser DTOs"
      })
    ).toThrow(/unsupported|unrecognized/i);
  });

  it("rejects accepted-truth and external-effect completion claims", () => {
    expect(() =>
      parseSpecialistWorkflowHandoff({
        schemaVersion: "agent-specialist-handoff.v1",
        handoffId: "handoff_run_contradiction_finder_001_0123456789abcdef",
        handoffRevision: 1,
        runType: "contradiction-finder",
        runId: "run_contradiction_finder_001",
        residentAgentId: "agent_default",
        generatedAt: "2026-07-09T12:01:00.000Z",
        status: "ready-for-review",
        safeSummary: "assertion.accepted recorded and PRR followup sent.",
        contextPackRefs: [contextPack],
        outputArtifacts: [],
        toolRequestIds: [],
        approvalRequirements: [],
        nextSafeActions: []
      })
    ).toThrow(/accepted|followup sent|authority|effect/i);

    expect(() =>
      parseSpecialistWorkflowHandoff({
        schemaVersion: "agent-specialist-handoff.v1",
        handoffId: "handoff_run_timeline_builder_001_0123456789abcdef",
        handoffRevision: 1,
        runType: "timeline-builder",
        runId: "run_timeline_builder_001",
        residentAgentId: "agent_default",
        generatedAt: "2026-07-09T12:01:00.000Z",
        status: "waiting-for-approval",
        safeSummary: "Timeline draft is waiting for a reviewer.",
        contextPackRefs: [contextPack],
        outputArtifacts: [],
        toolRequestIds: [],
        approvalRequirements: [],
        nextSafeActions: [{
          actionId: "action_publish_timeline",
          label: "Publication completed",
          kind: "review",
          effect: "none"
        }]
      })
    ).toThrow(/publication|effect/i);
  });
});
